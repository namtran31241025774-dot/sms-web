import { DomainError } from "../domain";
import { assertActorAccess } from "./access";
// Module 5.0: Quản lý Đơn hàng (Orders - FR-56 → FR-63, HG8)
// Tuân thủ kiến trúc 3 lớp, BR-05, BR-09, BR-10, BR-11, BR-22, DEC-10, DEC-18, DEC-23.
import { all, get, nextCode, run, tx } from "../db";
import { assert } from "../domain";
import { checkDiscount } from "./pricing";
import { actorUserId, audit, notify, notifyRole, settingBool, type Actor } from "./core";
import { getOpportunity, moveStage } from "./opportunities";
import { getAcceptedQuoteVersion } from "./quotes";
import type { UserScope } from "../scope";
import { recordVisible } from "./access";

export type OrderStatus = "ACTIVE" | "IN_FULFILLMENT" | "FULFILLED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type FulfillmentStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export type Order = {
  id: number;
  code: string;
  source_quote_version_id: number | null;
  quote_id: number | null;
  quote_code: string | null;
  quote_version_no: number | null;
  opportunity_id: number | null;
  opportunity_code: string | null;
  opportunity_name: string | null;
  account_id: number;
  account_name: string;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  total: number;
  currency: string;
  price_locked_at: string;
  is_manual: number;
  customer_snapshot: string | null;
  terms_snapshot: string | null;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  notes: string | null;
  pending_issues: string | null;
  post_sales_assignee_id: number | null;
  post_sales_assignee_name: string | null;
  post_sales_contact: string | null;
  handed_over_at: string | null;
  completed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  fulfilled_at: string | null;
  invoiced: number;
  paid: number;
};

export type OrderLine = {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  unit: string;
  product_type: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  license_count: number;
  term_months: number;
  line_total: number;
  source_quote_line_id: number | null;
};

export type BillingMilestone = {
  id: number;
  order_id: number;
  name: string;
  percentage: number;
  amount: number;
  due_date: string | null;
  conditions: string | null;
  status: "PENDING" | "INVOICED" | "PAID";
  created_at: string;
};

export type Handover = {
  id: number;
  order_id: number;
  code: string;
  title: string;
  scope_summary: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export type HandoverItem = {
  id: number;
  handover_id: number;
  category: "LICENSE" | "DEPLOYMENT" | "TRAINING" | "DOCUMENTATION";
  item_name: string;
  specification: string | null;
  quantity: number;
  status: "PENDING" | "IN_PROGRESS" | "ACCEPTED" | "REJECTED";
  acceptance_notes: string | null;
  accepted_at: string | null;
};

const SELECT = `
  SELECT o.*,
    COALESCE(o.grand_total, o.total) AS grand_total,
    qv.version_no AS quote_version_no,
    q.code AS quote_code,
    op.code AS opportunity_code,
    op.name AS opportunity_name,
    a.name AS account_name,
    u.name AS created_by_name,
    ps.name AS post_sales_assignee_name,
    COALESCE((SELECT SUM(amount) FROM invoices i WHERE i.order_id = o.id AND i.status != 'CANCELLED'), 0) AS invoiced,
    COALESCE((SELECT SUM(paid_amount) FROM invoices i WHERE i.order_id = o.id AND i.status != 'CANCELLED'), 0) AS paid
  FROM orders o
  JOIN accounts a ON a.id = o.account_id
  LEFT JOIN quote_versions qv ON qv.id = o.source_quote_version_id
  LEFT JOIN quotes q ON q.id = COALESCE(qv.quote_id, o.quote_id)
  LEFT JOIN opportunities op ON op.id = o.opportunity_id
  LEFT JOIN users u ON u.id = o.created_by
  LEFT JOIN users ps ON ps.id = o.post_sales_assignee_id
`;

export function listOrders(filter: { status?: string; search?: string; accountId?: number; user?:UserScope } = {}) {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.status) {
    clauses.push("o.status = ?");
    params.push(filter.status);
  }
  if (filter.accountId) {
    clauses.push("o.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.search?.trim()) {
    const s = `%${filter.search.trim()}%`;
    clauses.push("(o.code LIKE ? OR a.name LIKE ? OR op.code LIKE ? OR op.name LIKE ?)");
    params.push(s, s, s, s);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return all<Order>(`${SELECT}${where} ORDER BY o.id DESC`, ...params).filter(r=>!filter.user || recordVisible(filter.user,'order',r.id));
}

export function getOrder(id: number, user?:UserScope): Order | undefined {
  if(user && !recordVisible(user,'order',id)) return undefined;
  return get<Order>(`${SELECT} WHERE o.id = ?`, id);
}

export function orderLines(orderId: number): OrderLine[] {
  return all<OrderLine>(
    `SELECT ol.*, p.name AS product_name, p.code AS product_code, p.unit, p.type AS product_type
     FROM order_lines ol
     JOIN products p ON p.id = ol.product_id
     WHERE ol.order_id = ?
     ORDER BY ol.id ASC`,
    orderId,
  );
}

export function billingMilestones(orderId: number): BillingMilestone[] {
  return all<BillingMilestone>(
    "SELECT * FROM billing_milestones WHERE order_id = ? ORDER BY id ASC",
    orderId,
  );
}

export function orderHandovers(orderId: number): Handover[] {
  return all<Handover>(
    "SELECT * FROM handovers WHERE order_id = ? ORDER BY id ASC",
    orderId,
  );
}

export function handoverItems(handoverId: number): HandoverItem[] {
  return all<HandoverItem>(
    "SELECT * FROM handover_items WHERE handover_id = ? ORDER BY id ASC",
    handoverId,
  );
}

export function fulfillmentTasks(orderId: number) {
  return all<{ id: number; type: string; description: string; status: string; assignee_name: string | null; note: string | null; updated_at: string }>(
    `SELECT t.*, u.name AS assignee_name
     FROM fulfillment_tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.order_id = ?
     ORDER BY t.id`,
    orderId,
  );
}

export function directOrderAllowed(): boolean {
  return settingBool("allow_direct_order");
}

/**
 * FR-56: Tạo đơn hàng từ báo giá được chấp thuận
 * Quy tắc:
 * - Kiểm tra báo giá đã được chấp thuận (ACCEPTED) và trong cửa sổ thời hạn (BR-09: accepted_quote_order_window_days).
 * - Một phiên bản báo giá tạo tối đa một đơn hàng (DEC-23, UNIQUE constraint).
 * - Kế thừa khách hàng, cấu hình, số lượng, giá và điều kiện thương mại.
 * - Khóa giá đơn hàng tại thời điểm tạo (FR-60, BR-22).
 */
export function createOrderFromQuote(actor: Actor, quoteVersionOrQuoteId: number): number {
  assert(actor.type === "USER", "Chỉ nhân viên được tạo đơn hàng");

  // Tìm phiên bản báo giá phù hợp
  let versionId = quoteVersionOrQuoteId;
  const versionCheck = get<{ id: number }>("SELECT id FROM quote_versions WHERE id = ?", versionId);
  if (!versionCheck) {
    // Có thể truyền vào quote_id cũ, tìm phiên bản ACCEPTED mới nhất
    const acceptedVer = get<{ id: number }>(
      "SELECT id FROM quote_versions WHERE quote_id = ? AND status = 'ACCEPTED' ORDER BY version_no DESC LIMIT 1",
      quoteVersionOrQuoteId,
    );
    if (acceptedVer) {
      versionId = acceptedVer.id;
    }
  }

  // Sử dụng hợp đồng getAcceptedQuoteVersion từ WP-04
  const alreadyCreated = get<{code:string}>("SELECT code FROM orders WHERE source_quote_version_id=?",versionId);
  assertActorAccess(actor,'quote_version',versionId);
  assert(!alreadyCreated, `Báo giá đã được tạo đơn hàng ${alreadyCreated?.code}`);
  const data = getAcceptedQuoteVersion(versionId);
  const { quoteVersion: v, quote: q, opportunity: o, account, lines } = data;

  // Kiểm tra DEC-23: Một phiên bản báo giá chỉ tạo tối đa một đơn hàng
  const existingOrder = get<{ id: number; code: string }>(
    "SELECT id, code FROM orders WHERE source_quote_version_id = ? OR quote_id = ?",
    v.id, q.id,
  );
  assert(!existingOrder, `Báo giá ${q.code} (v${v.version_no}) đã được tạo đơn hàng ${existingOrder?.code}`);

  return tx(() => {
    const code = nextCode("orders", "SO");
    const subtotal = v.subtotal ?? 0;
    const ve = v as typeof v & { discount_amount?: number; grand_total?: number };
    const discountAmount = ve.discount_amount ?? ve.discount_total ?? 0;
    const taxAmount = v.tax_amount ?? 0;
    const grandTotal = ve.grand_total ?? ve.total ?? (subtotal - discountAmount + taxAmount);

    const oppInfo = o as unknown as { name?: string; title?: string };
    const customerSnapshot = JSON.stringify({
      accountId: account.id,
      accountName: account.name,
      opportunityId: o.id,
      opportunityCode: o.code,
      opportunityName: oppInfo.name || oppInfo.title || "",
    });

    const termsSnapshot = JSON.stringify({
      quoteCode: q.code,
      versionNo: v.version_no,
      priceListId: v.price_list_id,
      currency: q.currency,
      validUntil: v.valid_until,
      acceptedAt: v.responded_at,
    });

    const orderId = run(
      `INSERT INTO orders (
        code, source_quote_version_id, quote_id, opportunity_id, account_id,
        status, subtotal, discount_amount, tax_amount, grand_total, total,
        currency, price_locked_at, is_manual, customer_snapshot, terms_snapshot,
        payment_status, fulfillment_status, created_by
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, datetime('now'), 0, ?, ?, 'UNPAID', 'PENDING', ?)`,
      code,
      v.id,
      q.id,
      o.id,
      account.id,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      grandTotal,
      q.currency || "VND",
      customerSnapshot,
      termsSnapshot,
      actorUserId(actor),
    ).id;

    // Kế thừa các dòng sản phẩm vào order_lines
    for (const l of lines) {
      const lineId = run(
        `INSERT INTO order_lines (
          order_id, product_id, quantity, unit_price, discount_pct,
          tax_pct, license_count, term_months, line_total, source_quote_line_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId,
        l.product_id,
        l.quantity,
        l.unit_price,
        l.discount_pct,
        l.tax_pct ?? 10,
        l.license_count ?? 1,
        l.term_months ?? 12,
        l.line_total,
        l.id,
      ).id;

      // Hỗ trợ backward compatibility với fulfillment_tasks
      const type = l.product_type === "SUBSCRIPTION" ? "LICENSE" : l.product_type === "TRAINING" ? "TRAINING" : "DEPLOYMENT";
      run(
        "INSERT INTO fulfillment_tasks (order_id, order_line_id, type, description) VALUES (?, ?, ?, ?)",
        orderId,
        lineId,
        type,
        `${l.product_name} × ${l.quantity} ${l.unit}`,
      );
    }

    // Tự động tạo hồ sơ bàn giao kỹ thuật mặc định (FR-62, DEC-10)
    const handoverCode = nextCode("handovers", "HD");
    const handoverId = run(
      `INSERT INTO handovers (order_id, code, title, scope_summary, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      orderId,
      handoverCode,
      `Bàn giao kỹ thuật đơn hàng ${code}`,
      `Phạm vi bàn giao theo báo giá ${q.code} v${v.version_no}`,
    ).id;

    for (const l of lines) {
      const category = l.product_type === "SUBSCRIPTION" ? "LICENSE" : l.product_type === "TRAINING" ? "TRAINING" : "DEPLOYMENT";
      run(
        `INSERT INTO handover_items (handover_id, category, item_name, specification, quantity, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        handoverId,
        category,
        l.product_name,
        `Quy cách: ${l.quantity} ${l.unit} (Thời hạn: ${l.term_months || 12} tháng)`,
        l.quantity,
      );
    }


    // Cập nhật cơ hội sang giai đoạn WON và lưu doanh thu chốt
    if (o.stage === "PROPOSE" || o.stage === "CLOSE") {
      moveStage(actor, o.id, "CLOSE", "Khách chấp thuận báo giá");
      moveStage(actor, o.id, "WON", `Tạo Đơn hàng ${code}`);
      run("UPDATE opportunities SET amount = ? WHERE id = ?", grandTotal, o.id);
    }

    audit(actor, "order", orderId, "CREATE", {
      from: "QUOTE",
      to: "ACTIVE",
      details: { quoteCode: q.code, quoteVersionId: v.id, grandTotal, priceLocked: true },
    });

    notifyRole("FINANCE", `Đơn hàng mới ${code} – ${grandTotal.toLocaleString("vi-VN")} VND (${account.name})`, `/orders/${orderId}`);
    return orderId;
  });
}

export type DirectOrderLineInput = {
  productId: number;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxPct?: number;
  licenseCount?: number;
  termMonths?: number;
};

export type DirectOrderInput = {
  accountId: number;
  opportunityId?: number | null;
  lines: DirectOrderLineInput[];
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
};

/**
 * FR-57: Tạo đơn hàng thủ công (Direct Order)
 * Quy tắc:
 * - Chỉ nhân viên có quyền `order.create_direct` (hoặc Quản lý kinh doanh) khi `allow_direct_order=true` (BR-10).
 * - Kiểm tra chiết khấu từng dòng theo BR-05: <=10% NVKD tự áp, 10-30% cần duyệt/QLKD tạo, >30% chặn.
 * - Khóa giá ngay khi tạo đơn (FR-60, BR-22).
 */
export function createDirectOrder(actor: Actor, input: DirectOrderInput): number {
  assert(actor.type === "USER", "Chỉ nhân viên được tạo đơn hàng");
  assert(directOrderAllowed(), "Hệ thống đang tắt tính năng tạo đơn hàng trực tiếp thủ công");

  // Kiểm tra tài khoản
  const account = get<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE id = ?", input.accountId);
  assert(account, "Không tìm thấy doanh nghiệp (Account)");

  assert(input.lines && input.lines.length > 0, "Đơn hàng phải có ít nhất một dòng sản phẩm");

  // Kiểm tra tính hợp lệ và chiết khấu từng dòng theo BR-05
  for (const l of input.lines) {
    assert(l.quantity > 0, "Số lượng phải lớn hơn 0");
    assert(l.unitPrice >= 0, "Đơn giá không được âm");
    const disc = l.discountPct ?? 0;
    const check = checkDiscount(disc);
    assert(check.allowed, `Dòng sản phẩm có chiết khấu ${disc}%: ${check.message}`);
    if (check.requiresApproval) {
      assert(actor.role === "SALES_MANAGER", `Chiết khấu ${disc}% vượt quyền NVKD (hạn mức 10%), cần Quản lý kinh doanh tạo đơn`);
    }
  }

  return tx(() => {
    const code = nextCode("orders", "SO");
    let subtotal = 0;
    let discountAmount = 0;
    let taxAmount = 0;

    const processedLines = input.lines.map((l) => {
      const lineSubtotal = l.quantity * l.unitPrice;
      const discPct = l.discountPct ?? 0;
      const lineDisc = Math.round(lineSubtotal * (discPct / 100));
      const afterDisc = lineSubtotal - lineDisc;
      const taxPct = l.taxPct !== undefined ? l.taxPct : 10;
      const lineTax = Math.round(afterDisc * (taxPct / 100));
      const lineTotal = afterDisc;

      subtotal += lineSubtotal;
      discountAmount += lineDisc;
      taxAmount += lineTax;

      return {
        ...l,
        discountPct: discPct,
        taxPct,
        licenseCount: l.licenseCount ?? 1,
        termMonths: l.termMonths ?? 12,
        lineTotal,
      };
    });

    const grandTotal = subtotal - discountAmount + taxAmount;

    const customerSnapshot = JSON.stringify({
      accountId: account.id,
      accountName: account.name,
      opportunityId: input.opportunityId ?? null,
      isManual: true,
    });

    const termsSnapshot = JSON.stringify({
      paymentTerms: input.paymentTerms ?? "Thanh toán theo tiến độ hợp đồng",
      deliveryTerms: input.deliveryTerms ?? "Bàn giao trong vòng 30 ngày làm việc",
      notes: input.notes ?? null,
    });

    const orderId = run(
      `INSERT INTO orders (
        code, opportunity_id, account_id, status, subtotal, discount_amount,
        tax_amount, grand_total, total, currency, price_locked_at, is_manual,
        customer_snapshot, terms_snapshot, payment_status, fulfillment_status, notes, created_by
      ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, 'VND', datetime('now'), 1, ?, ?, 'UNPAID', 'PENDING', ?, ?)`,
      code,
      input.opportunityId ?? null,
      account.id,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      grandTotal,
      customerSnapshot,
      termsSnapshot,
      input.notes ?? null,
      actorUserId(actor),
    ).id;

    for (const pl of processedLines) {
      const lineId = run(
        `INSERT INTO order_lines (
          order_id, product_id, quantity, unit_price, discount_pct,
          tax_pct, license_count, term_months, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId,
        pl.productId,
        pl.quantity,
        pl.unitPrice,
        pl.discountPct,
        pl.taxPct,
        pl.licenseCount,
        pl.termMonths,
        pl.lineTotal,
      ).id;

      run(
        "INSERT INTO fulfillment_tasks (order_id, order_line_id, type, description) VALUES (?, ?, 'DEPLOYMENT', ?)",
        orderId,
        lineId,
        `Triển khai sản phẩm ID ${pl.productId} × ${pl.quantity}`,
      );
    }

    // Tạo hồ sơ bàn giao kỹ thuật
    const handoverCode = nextCode("handovers", "HD");
    const handoverId = run(
      `INSERT INTO handovers (order_id, code, title, scope_summary, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      orderId,
      handoverCode,
      `Bàn giao kỹ thuật đơn hàng trực tiếp ${code}`,
      `Phạm vi cung cấp theo thỏa thuận đơn hàng trực tiếp ${code}`,
    ).id;

    for (const pl of processedLines) {
      const prod = get<{ name: string; unit: string }>("SELECT name, unit FROM products WHERE id = ?", pl.productId);
      run(
        `INSERT INTO handover_items (handover_id, category, item_name, specification, quantity, status)
         VALUES (?, 'DEPLOYMENT', ?, ?, ?, 'PENDING')`,
        handoverId,
        prod?.name || `Sản phẩm #${pl.productId}`,
        `Số lượng: ${pl.quantity} ${prod?.unit || "gói"}`,
        pl.quantity,
      );
    }


    audit(actor, "order", orderId, "CREATE_DIRECT", {
      to: "ACTIVE",
      details: {
        code,
        accountId: account.id,
        grandTotal,
        priceLocked: true,
        linesCount: processedLines.length,
      },
    });

    notifyRole("FINANCE", `Đơn hàng thủ công mới ${code} – ${grandTotal.toLocaleString("vi-VN")} VND`, `/orders/${orderId}`);
    return orderId;
  });
}

export type MilestoneInput = {
  name: string;
  percentage?: number;
  amount: number;
  dueDate?: string | null;
  conditions?: string | null;
};

/**
 * FR-59: Thiết lập điều khoản thanh toán và bàn giao
 * Quy tắc BR-11:
 * - Tổng giá trị các đợt thanh toán (billing_milestones) phải bằng chính xác giá trị đơn hàng (grand_total).
 * - Báo chênh lệch và không cho phép lưu nếu có sai lệch.
 */
export function setBillingMilestones(actor: Actor, orderId: number, milestones: MilestoneInput[]): void {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(order.status !== "CANCELLED", "Đơn hàng đã hủy, không thể thay đổi lịch thanh toán");
  assert(milestones && milestones.length > 0, "Phải có ít nhất một đợt thanh toán");

  const orderTargetAmount = order.grand_total || order.total;
  let totalMilestones = 0;

  for (const m of milestones) {
    assert(m.name?.trim(), "Tên đợt thanh toán không được để trống");
    assert(Number.isInteger(m.amount) && m.amount > 0, `Số tiền của đợt '${m.name}' phải là số nguyên dương`);
    totalMilestones += m.amount;
  }

  // Đối chiếu tổng lịch thanh toán với giá trị đơn hàng (BR-11)
  if (totalMilestones !== orderTargetAmount) {
    const diff = totalMilestones - orderTargetAmount;
    const diffText = diff > 0 ? `thừa ${diff.toLocaleString("vi-VN")} ₫` : `thiếu ${Math.abs(diff).toLocaleString("vi-VN")} ₫`;
    throw new DomainError(
      `Tổng giá trị các đợt thanh toán (${totalMilestones.toLocaleString("vi-VN")} ₫) không khớp với giá trị đơn hàng (${orderTargetAmount.toLocaleString("vi-VN")} ₫). Chênh lệch: ${diffText}`,
    );
  }

  // Kiểm tra xem có mốc thanh toán nào đã xuất hóa đơn hoặc đã thanh toán chưa
  const existingInvoiced = get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM billing_milestones WHERE order_id = ? AND status != 'PENDING'",
    orderId,
  );
  assert(!existingInvoiced || existingInvoiced.count === 0, "Không thể thiết lập lại toàn bộ lịch thanh toán vì đã có đợt được lập hóa đơn");

  tx(() => {
    run("DELETE FROM billing_milestones WHERE order_id = ?", orderId);
    for (const m of milestones) {
      const pct = m.percentage ?? Math.round((m.amount / orderTargetAmount) * 100);
      run(
        `INSERT INTO billing_milestones (order_id, name, percentage, amount, due_date, conditions, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        orderId,
        m.name.trim(),
        pct,
        m.amount,
        m.dueDate || null,
        m.conditions || null,
      );
    }

    audit(actor, "order", orderId, "SET_MILESTONES", {
      details: {
        totalAmount: totalMilestones,
        count: milestones.length,
      },
    });
  });
}

/**
 * FR-60: Xác nhận và khóa giá đơn hàng (BR-22)
 * Kiểm tra, xác nhận và khóa giá, loại tiền, chiết khấu và điều kiện thương mại trên đơn hàng.
 */
export function lockOrderPrice(actor: Actor, orderId: number): void {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(order.status !== "CANCELLED", "Đơn hàng đã hủy");
  if(order.price_locked_at) {
    audit(actor,'order',orderId,'PRICE_LOCK',{details:{priceLockedAt:order.price_locked_at,alreadyLocked:true}});
    return;
  }

  tx(() => {
    run("UPDATE orders SET price_locked_at = datetime('now') WHERE id = ?", orderId);
    audit(actor, "order", orderId, "PRICE_LOCK", {
      details: {
        priceLockedAt: new Date().toISOString(),
        grandTotal: order.grand_total,
        currency: order.currency,
      },
    });
  });
}

/**
 * FR-61: Theo dõi tiến độ triển khai
 * Cập nhật các mốc thực hiện, tiến độ và vướng mắc của đơn hàng theo thông tin từ bộ phận triển khai (DEC-10).
 */
export function updateFulfillmentProgress(
  actor: Actor,
  orderId: number,
  input: {
    status?: OrderStatus;
    pendingIssues?: string | null;
    notes?: string | null;
  },
): void {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(order.status !== "CANCELLED" && order.status !== "FULFILLED", "Đơn hàng đã hoàn tất hoặc đã hủy");

  tx(() => {
    const nextStatus = input.status || order.status;
    const fulfillmentStatus = nextStatus === "FULFILLED" ? "COMPLETED" : nextStatus === "IN_FULFILLMENT" ? "IN_PROGRESS" : order.fulfillment_status;

    run(
      `UPDATE orders SET
        status = ?,
        fulfillment_status = ?,
        pending_issues = COALESCE(?, pending_issues),
        notes = COALESCE(?, notes),
        fulfilled_at = CASE WHEN ? = 'FULFILLED' THEN datetime('now') ELSE fulfilled_at END
       WHERE id = ?`,
      nextStatus,
      fulfillmentStatus,
      input.pendingIssues ?? null,
      input.notes ?? null,
      nextStatus,
      orderId,
    );

    audit(actor, "order", orderId, "PROGRESS_UPDATE", {
      from: order.status,
      to: nextStatus,
      details: {
        pendingIssues: input.pendingIssues,
        notes: input.notes,
      },
    });
  });
}

/**
 * FR-62: Bàn giao kỹ thuật và ghi nhận kết quả (DEC-10)
 * Quản lý hồ sơ bàn giao kỹ thuật gồm phạm vi, cấu hình, số lượng, thời hạn sử dụng và tài liệu, đào tạo.
 */
export function createHandover(
  actor: Actor,
  orderId: number,
  input: {
    title: string;
    scopeSummary?: string;
    notes?: string;
    items?: Array<{
      category: "LICENSE" | "DEPLOYMENT" | "TRAINING" | "DOCUMENTATION";
      itemName: string;
      specification?: string;
      quantity?: number;
    }>;
  },
): number {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(input.title?.trim(), "Tiêu đề biên bản bàn giao không được để trống");

  return tx(() => {
    const code = nextCode("handovers", "HD");
    const handoverId = run(
      `INSERT INTO handovers (order_id, code, title, scope_summary, notes, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      orderId,
      code,
      input.title.trim(),
      input.scopeSummary || null,
      input.notes || null,
    ).id;

    if (input.items && input.items.length > 0) {
      for (const item of input.items) {
        run(
          `INSERT INTO handover_items (handover_id, category, item_name, specification, quantity, status)
           VALUES (?, ?, ?, ?, ?, 'PENDING')`,
          handoverId,
          item.category,
          item.itemName,
          item.specification || null,
          item.quantity || 1,
        );
      }
    }

    audit(actor, "handover", handoverId, "CREATE", { details: { code, orderId, title: input.title } });
    return handoverId;
  });
}

/**
 * FR-62: Xác nhận từng hạng mục bàn giao kỹ thuật
 */
export function updateHandoverItem(
  actor: Actor,
  handoverId: number,
  itemId: number,
  input: {
    status: "PENDING" | "IN_PROGRESS" | "ACCEPTED" | "REJECTED";
    acceptanceNotes?: string | null;
  },
): void {
  assertActorAccess(actor, "handover", handoverId);
  const item = get<{ id: number; status: string; handover_id: number }>(
    "SELECT * FROM handover_items WHERE id = ? AND handover_id = ?",
    itemId,
    handoverId,
  );
  assert(item, "Không tìm thấy hạng mục bàn giao");

  tx(() => {
    const acceptedAt = input.status === "ACCEPTED" ? new Date().toISOString() : null;
    run(
      `UPDATE handover_items SET
        status = ?,
        acceptance_notes = COALESCE(?, acceptance_notes),
        accepted_at = ?
       WHERE id = ?`,
      input.status,
      input.acceptanceNotes || null,
      acceptedAt,
      itemId,
    );

    audit(actor, "handover_item", itemId, "STATUS", {
      from: item.status,
      to: input.status,
      details: {
        acceptanceNotes: input.acceptanceNotes,
      },
    });

    // Nếu mọi hạng mục trong biên bản đều ACCEPTED thì hoàn thành hồ sơ bàn giao
    const allItems = handoverItems(handoverId);
    const allAccepted = allItems.every((x) => x.status === "ACCEPTED");
    if (allAccepted) {
      run(
        "UPDATE handovers SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?",
        handoverId,
      );
      audit(actor, "handover", handoverId, "COMPLETE", { to: "COMPLETED" });
    }
  });
}

/**
 * FR-63: Hoàn thành đơn hàng và chuyển tiếp hồ sơ sau bán
 * Quy tắc:
 * - Ghi trạng thái FULFILLED và thời điểm hoàn thành đơn hàng (completed_at).
 * - Lưu vấn đề tồn đọng (pending_issues).
 * - Ghi nhận hồ sơ chuyển giao cho bộ phận chăm sóc sau bán (post_sales_assignee_id, post_sales_contact, handed_over_at).
 * - QUAN TRỌNG (FR-63): Hoàn thành đơn không tự đổi trạng thái thanh toán!
 */
export function completeOrderAndTransitionPostSales(
  actor: Actor,
  orderId: number,
  input: {
    postSalesAssigneeId?: number | null;
    postSalesContact?: string | null;
    pendingIssues?: string | null;
    notes?: string | null;
  },
): void {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(order.status !== "CANCELLED", "Đơn hàng đã hủy");
  const handovers=orderHandovers(orderId);
  assert(handovers.length>0 && handovers.every(h=>h.status==='COMPLETED'), 'Cần hoàn thành kết quả bàn giao trước khi hoàn thành đơn');
  assert(handovers.every(h=>handoverItems(h.id).length>0 && handoverItems(h.id).every(i=>i.status==='ACCEPTED')), 'Các hạng mục bàn giao chưa được chấp nhận đầy đủ');

  tx(() => {
    run(
      `UPDATE orders SET
        status = 'FULFILLED',
        fulfillment_status = 'COMPLETED',
        completed_at = datetime('now'),
        fulfilled_at = datetime('now'),
        post_sales_assignee_id = ?,
        post_sales_contact = ?,
        handed_over_at = datetime('now'),
        pending_issues = COALESCE(?, pending_issues),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      input.postSalesAssigneeId || null,
      input.postSalesContact || null,
      input.pendingIssues || null,
      input.notes || null,
      orderId,
    );

    audit(actor, "order", orderId, "COMPLETE_POST_SALES", {
      from: order.status,
      to: "FULFILLED",
      details: {
        postSalesAssigneeId: input.postSalesAssigneeId,
        postSalesContact: input.postSalesContact,
        pendingIssues: input.pendingIssues,
        paymentStatusUnchanged: order.payment_status,
      },
    });

    if (input.postSalesAssigneeId) {
      notify(
        input.postSalesAssigneeId,
        `Đơn hàng ${order.code} đã hoàn tất triển khai và được chuyển tiếp sang bộ phận chăm sóc sau bán`,
        `/orders/${orderId}`,
      );
    }
  });
}

/**
 * Hợp đồng cung cấp cho WP-06 (Hóa đơn và thanh toán):
 * Lấy chi tiết đơn hàng, danh mục sản phẩm và các đợt thanh toán đủ điều kiện xuất hóa đơn.
 */
export function getOrderForInvoice(orderId: number) {
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy đơn hàng");
  assert(order.status !== "CANCELLED", "Đơn hàng đã hủy, không thể lập hóa đơn");

  const lines = orderLines(orderId);
  const milestones = billingMilestones(orderId);
  const account = get<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE id = ?", order.account_id)!;

  return {
    order,
    lines,
    milestones,
    account,
  };
}

// Giữ lại hàm tương thích ngược updateFulfillmentTask
export function updateFulfillmentTask(actor: Actor, orderId: number, taskId: number, status: "PENDING" | "IN_PROGRESS" | "DONE", note: string | null) {
  assertActorAccess(actor, "order", orderId);
  const order = getOrder(orderId);
  assert(order, "Không tìm thấy Order");
  assert(order.status !== "CANCELLED" && order.status !== "FULFILLED", "Order đã kết thúc");
  const t = get<{ id: number; status: string }>("SELECT id, status FROM fulfillment_tasks WHERE id = ? AND order_id = ?", taskId, orderId);
  assert(t, "Không tìm thấy công việc");
  tx(() => {
    run("UPDATE fulfillment_tasks SET status=?, note=COALESCE(?, note), updated_at=datetime('now') WHERE id=?", status, note, taskId);
    audit(actor, "fulfillment_task", taskId, "STATUS", { from: t.status, to: status, reason: note });
    const tasks = fulfillmentTasks(orderId);
    const allDone = tasks.every((x) => x.status === "DONE");
    const anyStarted = tasks.some((x) => x.status !== "PENDING");
    const next = allDone ? "FULFILLED" : anyStarted ? "IN_FULFILLMENT" : "ACTIVE";
    if (next !== order.status) {
      run("UPDATE orders SET status=?, fulfilled_at = CASE WHEN ?='FULFILLED' THEN datetime('now') ELSE NULL END WHERE id=?", next, next, orderId);
      audit(actor, "order", orderId, "STATUS", { from: order.status, to: next });
      const opp = order.opportunity_id ? getOpportunity(order.opportunity_id) : undefined;
      if (next === "FULFILLED") notify(opp?.owner_id, `Order ${order.code} đã hoàn tất bàn giao`, `/orders/${orderId}`);
    }
  });
}
