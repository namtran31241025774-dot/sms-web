import { DomainError } from "../domain";
import { assertActorAccess } from "./access";
// Module 6.0: Hóa đơn và Lịch thanh toán (FR-64 → FR-68, FR-71, FR-73, FR-74, HG8)
// Tuân thủ kiến trúc 3 lớp, BR-12, BR-13, DEC-08, DEC-09, DEC-23.
import { all, get, nextCode, run, tx } from "../db";
import { assert } from "../domain";
import { email, erp } from "../integrations";
import { actorUserId, audit, notifyRole, settingBool, settingNumber, type Actor } from "./core";
import { getOrderForInvoice, orderLines } from "./orders";
import type { UserScope } from "../scope";
import { recordVisible } from "./access";

export type InvoiceStatus = "DRAFT" | "REVIEWED" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export type Invoice = {
  id: number;
  code: string;
  order_id: number;
  order_code: string;
  account_id: number;
  account_name: string;
  milestone_id: number | null;
  milestone: string;
  subtotal: number;
  tax_amount: number;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: InvoiceStatus;
  erp_ref: string | null;
  external_system: string;
  customer_snapshot: string | null;
  notes: string | null;
  created_by: number | null;
  created_by_name: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  issued_by: number | null;
  issued_by_name: string | null;
  issued_at: string | null;
  created_at: string;
};

export type InvoiceLine = {
  id: number;
  invoice_id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
  line_total: number;
};

export type InvoiceChangeRequest = {
  id: number;
  invoice_id: number;
  invoice_code: string;
  type: "ADJUSTMENT" | "CANCELLATION";
  reason: string;
  requested_by: number;
  requested_by_name: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type DunningRecord = {
  invoice: Invoice;
  unpaidBalance: number;
  overdueDays: number;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
};

const SELECT = `
  SELECT i.*,
    o.code AS order_code,
    a.name AS account_name,
    u_c.name AS created_by_name,
    u_r.name AS reviewed_by_name,
    u_i.name AS issued_by_name
  FROM invoices i
  JOIN orders o ON o.id = i.order_id
  JOIN accounts a ON a.id = COALESCE(i.account_id, o.account_id)
  LEFT JOIN users u_c ON u_c.id = i.created_by
  LEFT JOIN users u_r ON u_r.id = i.reviewed_by
  LEFT JOIN users u_i ON u_i.id = i.issued_by
`;

export function listInvoices(filter: {
  status?: string;
  orderId?: number;
  accountId?: number;
  search?: string;
  user?:UserScope;
} = {}): Invoice[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.status) {
    clauses.push("i.status = ?");
    params.push(filter.status);
  }
  if (filter.orderId) {
    clauses.push("i.order_id = ?");
    params.push(filter.orderId);
  }
  if (filter.accountId) {
    clauses.push("COALESCE(i.account_id, o.account_id) = ?");
    params.push(filter.accountId);
  }
  if (filter.search?.trim()) {
    const s = `%${filter.search.trim()}%`;
    clauses.push("(i.code LIKE ? OR a.name LIKE ? OR o.code LIKE ? OR i.erp_ref LIKE ?)");
    params.push(s, s, s, s);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return all<Invoice>(`${SELECT}${where} ORDER BY i.id DESC`, ...params).filter(r=>!filter.user || recordVisible(filter.user,'invoice',r.id));
}

export function getInvoice(id: number, user?:UserScope): Invoice | undefined {
  if(user && !recordVisible(user,'invoice',id)) return undefined;
  return get<Invoice>(`${SELECT} WHERE i.id = ?`, id);
}

export function getInvoiceLines(invoiceId: number): InvoiceLine[] {
  return all<InvoiceLine>(
    "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id ASC",
    invoiceId,
  );
}

/**
 * FR-64: Lập hồ sơ hóa đơn nháp từ đơn hàng (BR-12)
 * Quy tắc:
 * - Lấy thông tin khách hàng, sản phẩm, giá trị, thuế và kỳ thanh toán từ đơn hàng.
 * - Quy tắc BR-12: Tổng các hóa đơn (không tính hóa đơn đã hủy CANCELLED) không được vượt giá trị đơn hàng!
 * - Cập nhật trạng thái của đợt thanh toán (billing_milestone) thành INVOICED nếu có liên kết.
 */
export function createInvoiceDraftFromOrder(
  actor: Actor,
  orderId: number,
  input: {
    milestoneId?: number | null;
    milestoneName?: string;
    amount?: number;
    dueDate?: string | null;
    notes?: string | null;
  },
): number {
  assertActorAccess(actor, "order", orderId);
  assert(actor.type === "USER", "Chỉ nhân viên được lập hóa đơn");

  const contract = getOrderForInvoice(orderId);
  const { order, milestones, account } = contract;
  assert(order.status !== "CANCELLED", "Đơn hàng đã hủy, không thể lập hóa đơn");

  const orderTargetAmount = order.grand_total || order.total;

  // Tính tổng các hóa đơn hiện có (không tính đã hủy)
  const existingInvoiced = get<{ sum: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS sum FROM invoices WHERE order_id = ? AND status != 'CANCELLED'",
    orderId,
  )?.sum ?? 0;

  const remainingAvailable = orderTargetAmount - existingInvoiced;

  // Xác định số tiền và tên mốc
  let amount = input.amount;
  let milestoneName = input.milestoneName?.trim() || "";
  let dueDate = input.dueDate || null;

  if (input.milestoneId) {
    const targetMilestone = milestones.find((m) => m.id === input.milestoneId);
    assert(targetMilestone, "Không tìm thấy đợt thanh toán tương ứng trong đơn hàng");
    if (!amount) amount = targetMilestone.amount;
    if (!milestoneName) milestoneName = targetMilestone.name;
    if (!dueDate) dueDate = targetMilestone.due_date;
  }

  assert(amount && amount > 0, "Số tiền hóa đơn phải lớn hơn 0");
  assert(milestoneName, "Thiếu tên mốc hoặc nội dung kỳ thanh toán");

  // Kiểm tra BR-12: Không vượt giá trị đơn hàng
  if (existingInvoiced + amount > orderTargetAmount) {
    throw new DomainError(
      `Tổng giá trị các hóa đơn vượt quá giá trị đơn hàng (còn có thể lập tối đa ${remainingAvailable.toLocaleString("vi-VN")} ₫, yêu cầu lập: ${amount.toLocaleString("vi-VN")} ₫)`,
    );
  }

  const sourceLines=orderLines(orderId);
  const weights=sourceLines.map(l=>l.line_total*(1+(l.tax_pct ?? settingNumber('default_vat_pct'))/100));
  const weightTotal=weights.reduce((a,b)=>a+b,0);
  let allocated=0;
  const invoiceItems=sourceLines.length ? sourceLines.map((l,index)=>{
    assert(weightTotal>0,'Giá trị dòng đơn hàng không hợp lệ');
    const gross=index===sourceLines.length-1 ? amount-allocated : Math.round(amount*weights[index]/weightTotal);
    allocated+=gross;
    const taxPct=l.tax_pct ?? settingNumber('default_vat_pct');
    const base=Math.round(gross/(1+taxPct/100));
    return {productId:l.product_id,description:l.product_name,quantity:l.quantity,unitPrice:base/l.quantity,taxPct,base};
  }) : [{productId:null,description:milestoneName,quantity:1,unitPrice:Math.round(amount/(1+settingNumber('default_vat_pct')/100)),taxPct:settingNumber('default_vat_pct'),base:Math.round(amount/(1+settingNumber('default_vat_pct')/100))}];
  return tx(() => {
    const code = nextCode("invoices", "INV");
    const subtotal = invoiceItems.reduce((sum,l)=>sum+l.base,0);
    const taxAmount = amount - subtotal;

    const customerSnapshot = JSON.stringify({
      accountId: account.id,
      accountName: account.name,
      orderCode: order.code,
    });

    const invoiceId = run(
      `INSERT INTO invoices (
        code, order_id, account_id, milestone_id, milestone,
        subtotal, tax_amount, amount, paid_amount, due_date,
        status, customer_snapshot, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, ?)`,
      code,
      orderId,
      account.id,
      input.milestoneId || null,
      milestoneName,
      subtotal,
      taxAmount,
      amount,
      dueDate,
      customerSnapshot,
      input.notes || null,
      actorUserId(actor),
    ).id;

    for(const item of invoiceItems) run(
      'INSERT INTO invoice_lines(invoice_id,product_id,description,quantity,unit_price,tax_pct,line_total) VALUES (?,?,?,?,?,?,?)',
      invoiceId,item.productId,item.description,item.quantity,item.unitPrice,item.taxPct,item.base,
    );

    // Cập nhật trạng thái mốc thanh toán nếu có
    if (input.milestoneId) {
      run(
        "UPDATE billing_milestones SET status = 'INVOICED' WHERE id = ?",
        input.milestoneId,
      );
    }

    audit(actor, "invoice", invoiceId, "CREATE_DRAFT", {
      to: "DRAFT",
      details: {
        code,
        orderId,
        orderCode: order.code,
        amount,
        milestoneId: input.milestoneId,
      },
    });

    notifyRole("FINANCE", `Hồ sơ hóa đơn nháp mới ${code} cho đơn hàng ${order.code} cần kiểm tra`, `/invoices/${invoiceId}`);
    return invoiceId;
  });
}

/**
 * FR-65: Thiết lập lịch lập hóa đơn theo mốc/chu kỳ thuê bao
 */
export function setupInvoiceSchedule(
  actor: Actor,
  invoiceId: number,
  input: { dueDate: string; notes?: string },
): void {
  assertActorAccess(actor, "invoice", invoiceId);
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(inv.status === "DRAFT" || inv.status === "REVIEWED", "Hóa đơn đã phát hành, không thể đổi lịch");
  assert(input.dueDate, "Ngày đến hạn thanh toán là bắt buộc");

  tx(() => {
    run(
      "UPDATE invoices SET due_date = ?, notes = COALESCE(?, notes) WHERE id = ?",
      input.dueDate,
      input.notes || null,
      invoiceId,
    );

    audit(actor, "invoice", invoiceId, "SCHEDULE_UPDATE", {
      details: { dueDate: input.dueDate, notes: input.notes },
    });
  });
}

/**
 * FR-66: Kiểm tra hóa đơn nháp (DEC-09)
 * Kiểm tra thông tin khách hàng, thuế, số tiền và kỳ thanh toán; chuyển trạng thái REVIEWED.
 */
export function reviewInvoiceDraft(
  actor: Actor,
  invoiceId: number,
  notes?: string,
): void {
  assertActorAccess(actor, "invoice", invoiceId);
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(inv.status === "DRAFT", "Chỉ có thể kiểm tra hóa đơn ở trạng thái Nháp (DRAFT)");
  assert(actor.type === "USER" && actor.role === "FINANCE", "Chỉ kế toán được kiểm tra hóa đơn");
  assert(!settingBool("invoice_independent_review") || inv.created_by !== actor.id, "Kiểm tra độc lập: người kiểm tra phải khác người lập");

  tx(() => {
    run(
      `UPDATE invoices SET
        status = 'REVIEWED',
        reviewed_by = ?,
        reviewed_at = datetime('now'),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      actorUserId(actor),
      notes || null,
      invoiceId,
    );

    audit(actor, "invoice", invoiceId, "REVIEW", {
      from: "DRAFT",
      to: "REVIEWED",
      details: { reviewedBy: actorUserId(actor), notes },
    });
  });
}

/**
 * FR-67 & HG8: Phát hành và gửi hóa đơn theo thẩm quyền (DEC-08)
 * Quy tắc:
 * - Hệ thống Kế toán (ERP) phát hành hóa đơn chính thức và trả về mã số hóa đơn (erp_ref).
 * - SMS tiếp nhận, chuyển trạng thái sang ISSUED, và gửi email hóa đơn cho khách hàng.
 * - Cổng kiểm soát HG8: Kiểm soát phát hành hóa đơn chính thức.
 */
export function issueInvoice(
  actor: Actor,
  invoiceId: number,
  options: { recipientEmail?: string; sendEmail?: boolean } = {},
): { erpRef: string; mailRef: string } {
  assertActorAccess(actor, "invoice", invoiceId);
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(
    inv.status === "DRAFT" || inv.status === "REVIEWED",
    "Chỉ có thể phát hành hóa đơn ở trạng thái Nháp hoặc Đã kiểm tra",
  );
  assert(actor.type === "USER" && actor.role === "FINANCE", "Chỉ kế toán được phát hành hóa đơn");
  if (settingBool("invoice_independent_review")) {
    assert(inv.status === "REVIEWED" && inv.reviewed_by !== null && inv.reviewed_by !== inv.created_by, "Hóa đơn cần được kiểm tra độc lập trước khi phát hành");
  }
  const emailTarget = options.recipientEmail?.trim() || get<{email:string}>(
    `SELECT c.email FROM contacts c JOIN opportunities op ON op.primary_contact_id=c.id
     JOIN orders o ON o.opportunity_id=op.id WHERE o.id=? AND c.email IS NOT NULL LIMIT 1`, inv.order_id,
  )?.email?.trim();
  assert(options.sendEmail === false || (emailTarget && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTarget)), "Thiếu email hợp lệ của người nhận hóa đơn");

  // External issuance is not reversible; commit its reference before attempting email delivery.
  const { erpRef } = erp.pushInvoice({code:inv.code, amount:inv.amount, orderCode:inv.order_code});
  assert(erpRef, "ERP chưa trả số hóa đơn chính thức");

  tx(() => {
    // 1. Đẩy sang hệ thống kế toán ERP để phát hành hóa đơn chính thức (DEC-08)

    // 2. Gửi hóa đơn qua email adapter cho khách hàng (FR-67)

    // 3. Cập nhật trạng thái hóa đơn ISSUED trong SMS
    run(
      `UPDATE invoices SET
        status = 'ISSUED',
        erp_ref = ?,
        issued_by = ?,
        issued_at = datetime('now')
       WHERE id = ?`,
      erpRef,
      actorUserId(actor),
      invoiceId,
    );

    // 4. Ghi nhận sự kiện đồng bộ với ERP (FR-72)
    run(
      `INSERT INTO sync_events (
        entity_type, entity_id, direction, system, status, payload, response
      ) VALUES ('INVOICE', ?, 'OUTBOUND', 'ERP', 'SUCCESS', ?, ?)`,
      invoiceId,
      JSON.stringify({ invoiceCode: inv.code, amount: inv.amount, orderCode: inv.order_code }),
      JSON.stringify({ erpRef, issuedAt: new Date().toISOString() }),
    );

    audit(actor, "invoice", invoiceId, "ISSUE_HG8", {
      from: inv.status,
      to: "ISSUED",
      details: { erpRef, recipientEmail: emailTarget },
    });

  });
  if (options.sendEmail === false) return { erpRef, mailRef: "" };
  try {
    const {providerRef:mailRef} = email.send({to:emailTarget!, subject:`Hóa đơn điện tử ${erpRef} (${inv.code}) – Đơn hàng ${inv.order_code}`, body:`Hóa đơn ${erpRef}, đợt ${inv.milestone}, số tiền ${inv.amount}. Hạn thanh toán: ${inv.due_date || 'Theo thỏa thuận'}.`});
    audit(actor,"invoice",invoiceId,"EMAIL_SENT",{details:{mailRef}});
    return {erpRef,mailRef};
  } catch(e) {
    audit(actor,"invoice",invoiceId,"EMAIL_FAILED",{reason:e instanceof Error ? e.message : 'Gửi email thất bại'});
    throw e;
  }
}

/**
 * FR-71: Báo cáo công nợ & Quá hạn thanh toán (BR-13)
 * Quy tắc:
 * - Quá hạn khi due_date < ngày hiện tại và chưa thanh toán đủ (`paid_amount < amount`).
 */
export function getDunningReport(): DunningRecord[] {
  const overdueInvoices = all<Invoice>(
    `${SELECT}
     WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID')
       AND i.due_date IS NOT NULL
       AND date(i.due_date) < date('now')
       AND i.paid_amount < i.amount
     ORDER BY date(i.due_date) ASC`,
  );

  return overdueInvoices.map((inv) => {
    const dueTime = new Date(inv.due_date!).getTime();
    const nowTime = Date.now();
    const overdueDays = Math.max(1, Math.floor((nowTime - dueTime) / 86400000));
    const unpaidBalance = inv.amount - inv.paid_amount;

    const contact = get<{ full_name: string; email: string; phone: string }>(
      `SELECT c.full_name, c.email, c.phone FROM contacts c
       JOIN opportunities op ON op.primary_contact_id = c.id
       JOIN orders o ON o.opportunity_id = op.id
       WHERE o.id = ? LIMIT 1`,
      inv.order_id,
    );

    return {
      invoice: inv,
      unpaidBalance,
      overdueDays,
      primaryContactName: contact?.full_name || null,
      primaryContactEmail: contact?.email || null,
      primaryContactPhone: contact?.phone || null,
    };
  });
}

/**
 * FR-71: Gửi nhắc thanh toán quá hạn (BR-13)
 * Quy tắc:
 * - Nhắc lại sau mỗi 7 ngày (`payment_reminder_days = 7`).
 */
export function sendPaymentReminder(
  actor: Actor,
  invoiceId: number,
  input: { note?: string } = {},
): { remindedAt: string; recipientEmail: string } {
  assertActorAccess(actor, "invoice", invoiceId);
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID", "Chỉ gửi nhắc thanh toán cho hóa đơn đã phát hành và chưa tất toán");

  // Kiểm tra hạn nhắc thanh toán theo BR-13
  const reminderWindowDays = settingNumber("payment_reminder_days");
  const lastReminder = get<{ created_at: string }>(
    `SELECT created_at FROM audit_log
     WHERE entity_type = 'invoice' AND entity_id = ? AND action = 'PAYMENT_REMINDER'
     ORDER BY id DESC LIMIT 1`,
    invoiceId,
  );

  if (lastReminder) {
    const lastTime = new Date(lastReminder.created_at).getTime();
    const nextAllowedTime = lastTime + reminderWindowDays * 86400000;
    if (Date.now() < nextAllowedTime) {
      const waitDays = Math.ceil((nextAllowedTime - Date.now()) / 86400000);
      throw new DomainError(`Đã gửi nhắc thanh toán gần đây; vui lòng đợi ${waitDays} ngày nữa theo quy định giãn cách nhắc nợ (${reminderWindowDays} ngày/lần)`);
    }
  }

  const recipientEmail =
    get<{ email: string }>(
      `SELECT c.email FROM contacts c
       JOIN opportunities op ON op.primary_contact_id = c.id
       JOIN orders o ON o.opportunity_id = op.id
       WHERE o.id = ? AND c.email IS NOT NULL LIMIT 1`,
      inv.order_id,
    )?.email || "ke-toan@khachhang.vn";

  const unpaid = inv.amount - inv.paid_amount;
  email.send({
    to: recipientEmail,
    subject: `[Nhắc thanh toán quá hạn] Hóa đơn ${inv.erp_ref || inv.code} – Đơn hàng ${inv.order_code}`,
    body: `Kính gửi Quý khách,\n\nHóa đơn số ${inv.erp_ref || inv.code} của Quý khách đã quá hạn thanh toán (${inv.due_date}).\nSố tiền còn phải thanh toán: ${unpaid.toLocaleString("vi-VN")} VND.\n\nKính đề nghị Quý khách sắp xếp thanh toán sớm.\n${input.note ? `Ghi chú: ${input.note}\n` : ""}\nTrân trọng.`,
  });

  const remindedAt = new Date().toISOString();
  audit(actor, "invoice", invoiceId, "PAYMENT_REMINDER", {
    details: {
      recipientEmail,
      unpaidBalance: unpaid,
      note: input.note,
      remindedAt,
    },
  });

  return { remindedAt, recipientEmail };
}

/**
 * FR-73: Đề nghị điều chỉnh hoặc hủy hóa đơn
 */
export function requestInvoiceChange(
  actor: Actor,
  invoiceId: number,
  input: { type: "ADJUSTMENT" | "CANCELLATION"; reason: string },
): number {
  assertActorAccess(actor, "invoice", invoiceId);
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(input.reason?.trim(), "Vui lòng nhập lý do đề nghị điều chỉnh / hủy hóa đơn");

  return tx(() => {
    const reqId = run(
      `INSERT INTO invoice_change_requests (
        invoice_id, type, reason, requested_by, status
      ) VALUES (?, ?, ?, ?, 'PENDING')`,
      invoiceId,
      input.type,
      input.reason.trim(),
      actorUserId(actor),
    ).id;

    audit(actor, "invoice_change_request", reqId, "CREATE", {
      details: { invoiceId, invoiceCode: inv.code, type: input.type, reason: input.reason },
    });

    notifyRole("FINANCE", `Yêu cầu ${input.type === "CANCELLATION" ? "hủy" : "điều chỉnh"} hóa đơn ${inv.code}`, `/invoices/${invoiceId}`);
    return reqId;
  });
}

/**
 * FR-73: Xử lý đề nghị điều chỉnh / hủy hóa đơn (Bộ phận Tài chính - Kế toán)
 */
export function processInvoiceChange(
  actor: Actor,
  requestId: number,
  decision: "APPROVED" | "REJECTED",
  reviewNotes?: string,
): void {
  const req = get<{ id: number; invoice_id: number; type: string; status: string }>(
    "SELECT * FROM invoice_change_requests WHERE id = ?",
    requestId,
  );
  assert(req, "Không tìm thấy yêu cầu điều chỉnh hóa đơn");
  assert(req.status === "PENDING", "Yêu cầu đã được xử lý trước đó");

  const inv = getInvoice(req.invoice_id);
  assert(inv, "Không tìm thấy hóa đơn liên quan");

  tx(() => {
    const resolvedStatus = decision === "APPROVED" ? "COMPLETED" : "REJECTED";
    run(
      `UPDATE invoice_change_requests SET
        status = ?,
        reviewed_by = ?,
        review_notes = ?,
        resolved_at = datetime('now')
       WHERE id = ?`,
      resolvedStatus,
      actorUserId(actor),
      reviewNotes || null,
      requestId,
    );

    // Nếu phê duyệt hủy và chưa có thanh toán -> chuyển hóa đơn sang CANCELLED
    if (decision === "APPROVED" && req.type === "CANCELLATION") {
      assert(inv.paid_amount === 0, "Hóa đơn đã ghi nhận thanh toán, không thể hủy");
      run("UPDATE invoices SET status = 'CANCELLED' WHERE id = ?", inv.id);
      audit(actor, "invoice", inv.id, "CANCEL", {
        from: inv.status,
        to: "CANCELLED",
        details: { requestId, reviewNotes },
      });
    }

    audit(actor, "invoice_change_request", requestId, "PROCESS", {
      details: { decision, reviewNotes, invoiceId: inv.id },
    });
  });
}

/**
 * FR-74: Lưu và tra cứu lịch sử hóa đơn
 */
export function getInvoiceHistory(invoiceId: number) {
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");

  const audits = all<{ id: number; action: string; created_at: string; actor_name?: string; actor_id?: number }>(
    "SELECT * FROM audit_log WHERE entity_type = 'invoice' AND entity_id = ? ORDER BY id DESC",
    invoiceId,
  );

  const changeRequests = all<InvoiceChangeRequest>(
    `SELECT cr.*, i.code AS invoice_code, u_req.name AS requested_by_name, u_rev.name AS reviewed_by_name
     FROM invoice_change_requests cr
     JOIN invoices i ON i.id = cr.invoice_id
     JOIN users u_req ON u_req.id = cr.requested_by
     LEFT JOIN users u_rev ON u_rev.id = cr.reviewed_by
     WHERE cr.invoice_id = ?
     ORDER BY cr.id DESC`,
    invoiceId,
  );

  const syncEvents = all<{ id: number; sync_type: string; direction: string; status: string; external_system: string; created_at: string }>(
    "SELECT * FROM sync_events WHERE entity_type = 'INVOICE' AND entity_id = ? ORDER BY id DESC",
    invoiceId,
  );

  return {
    invoice: inv,
    audits,
    changeRequests,
    syncEvents,
  };
}

export function isOverdueInvoice(inv: {
  due_date: string | null;
  amount: number;
  paid_amount: number;
  status: string;
}): boolean {
  if (!inv.due_date || inv.status === "CANCELLED" || inv.paid_amount >= inv.amount) {
    return false;
  }
  return new Date(inv.due_date).getTime() < Date.now();
}

export function getDefaultDueDate(milestoneDueDate?: string | null): string {
  if (milestoneDueDate) return milestoneDueDate;
  return new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
}
