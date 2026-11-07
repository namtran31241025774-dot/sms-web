// Module 6.0: Thanh toán, Phân bổ & Đối soát kế toán (FR-69, FR-70, FR-72)
// Tuân thủ kiến trúc 3 lớp, DEC-13, DEC-23.
import { all, get, run, tx } from "../db";
import { assert } from "../domain";
import { erp, paymentGateway } from "../integrations";
import { actorUserId, audit, notifyRole, type Actor } from "./core";
import { getInvoice } from "./invoices";

export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "GATEWAY";
export type ReconciliationStatus = "UNMATCHED" | "MATCHED" | "PARTIALLY_MATCHED";

export type Payment = {
  id: number;
  account_id: number;
  account_name: string;
  invoice_id: number | null;
  amount: number;
  currency: string;
  paid_at: string;
  method: string | null;
  reference: string | null;
  external_transaction_id: string | null;
  gateway_status: string | null;
  reconciliation_status: ReconciliationStatus;
  source: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
  allocated_amount: number;
};

export type PaymentAllocation = {
  id: number;
  payment_id: number;
  invoice_id: number;
  invoice_code: string;
  amount: number;
  allocated_at: string;
  created_by: number | null;
};

export type PaymentRequest = {
  id: number;
  code: string;
  invoice_id: number;
  invoice_code: string;
  amount: number;
  gateway_provider: string;
  gateway_url: string | null;
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "FAILED";
  created_at: string;
  completed_at: string | null;
};

const SELECT_PAY = `
  SELECT p.*,
    a.name AS account_name,
    u.name AS recorded_by_name,
    COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0) AS allocated_amount
  FROM payments p
  LEFT JOIN accounts a ON a.id = p.account_id
  LEFT JOIN users u ON u.id = p.recorded_by
`;

export function listPayments(filter: {
  accountId?: number;
  reconciliationStatus?: string;
} = {}): Payment[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.accountId) {
    clauses.push("p.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.reconciliationStatus) {
    clauses.push("p.reconciliation_status = ?");
    params.push(filter.reconciliationStatus);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return all<Payment>(`${SELECT_PAY}${where} ORDER BY p.id DESC`, ...params);
}

export function getPayment(id: number): Payment | undefined {
  return get<Payment>(`${SELECT_PAY} WHERE p.id = ?`, id);
}

export function listPaymentAllocations(paymentId: number): PaymentAllocation[] {
  return all<PaymentAllocation>(
    `SELECT pa.*, i.code AS invoice_code
     FROM payment_allocations pa
     JOIN invoices i ON i.id = pa.invoice_id
     WHERE pa.payment_id = ?
     ORDER BY pa.id ASC`,
    paymentId,
  );
}

export function invoicePaymentAllocations(invoiceId: number): Array<{
  id: number;
  paymentId: number;
  amount: number;
  paidAt: string;
  method: string | null;
  reference: string | null;
}> {
  return all(
    `SELECT pa.id, pa.payment_id AS paymentId, pa.amount, p.paid_at AS paidAt, p.method, p.reference
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = ?
     ORDER BY pa.allocated_at ASC`,
    invoiceId,
  );
}

/**
 * FR-69: Ghi nhận thanh toán và phân bổ vào hóa đơn (DEC-23)
 * Quy tắc:
 * - Thanh toán ghi nhận theo Doanh nghiệp (Account).
 * - Phân bổ vào từng hóa đơn qua `payment_allocations`.
 * - Tự động cập nhật `paid_amount` và trạng thái `PAID` / `PARTIALLY_PAID` của hóa đơn và đơn hàng.
 */
export function recordPayment(
  actor: Actor,
  input: {
    accountId: number;
    amount: number;
    currency?: string;
    paidAt: string;
    method?: PaymentMethod | string;
    reference?: string | null;
    externalTransactionId?: string | null;
    source?: "USER" | "ERP" | "GATEWAY";
    invoiceAllocations?: Array<{ invoiceId: number; amount: number }>;
  },
): number {
  assert(actor.type === "USER" || actor.type === "INTEGRATION", "Chỉ nhân viên hoặc hệ thống tích hợp được ghi nhận thanh toán");
  assert(Number.isInteger(input.amount) && input.amount > 0, "Số tiền thanh toán không hợp lệ");
  assert(input.accountId, "Thiếu thông tin doanh nghiệp thanh toán");

  // Kiểm tra trùng tham chiếu nếu có
  if (input.reference?.trim()) {
    const dup = get<{ id: number }>(
      "SELECT id FROM payments WHERE reference = ?",
      input.reference.trim(),
    );
    assert(!dup, `Mã tham chiếu thanh toán '${input.reference}' đã tồn tại trong hệ thống`);
  }

  return tx(() => {
    assert(get("SELECT id FROM accounts WHERE id=?",input.accountId), "Không tìm thấy doanh nghiệp");

    const paymentId = run(
      `INSERT INTO payments (
        account_id, invoice_id, amount, paid_at, method, reference,
        external_transaction_id, source, recorded_by, reconciliation_status, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)`,
      input.accountId,
      null,
      input.amount,
      input.paidAt,
      input.method || "BANK_TRANSFER",
      input.reference?.trim() || null,
      input.externalTransactionId || null,
      input.source || "USER",
      actorUserId(actor),
      input.currency || "VND",
    ).id;

    audit(actor, "payment", paymentId, "RECORD", {
      details: {
        accountId: input.accountId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
      },
    });

    // Nếu có chỉ định phân bổ trực tiếp cho các hóa đơn
    if (input.invoiceAllocations && input.invoiceAllocations.length > 0) {
      allocatePayment(actor, paymentId, input.invoiceAllocations);
    }

    return paymentId;
  });
}

/**
 * FR-69: Phân bổ khoản thanh toán vào một hoặc nhiều hóa đơn
 */
export function allocatePayment(
  actor: Actor,
  paymentId: number,
  allocations: Array<{ invoiceId: number; amount: number }>,
): void {
  assert((actor.type === "USER" && actor.role === "FINANCE") || (actor.type==='INTEGRATION' && actor.name==='ERP'), "Chỉ Tài chính – Kế toán hoặc kết quả đối soát ERP được xác nhận phân bổ");
  const p = getPayment(paymentId);
  assert(p, "Không tìm thấy khoản thanh toán");
  assert(allocations && allocations.length > 0, "Danh sách phân bổ không được rỗng");

  const unallocatedAmount = p.amount - p.allocated_amount;
  let totalRequestedAllocation = 0;

  const requestedByInvoice = new Map<number, number>();
  for (const alloc of allocations) {
    assert(alloc.amount > 0, "Số tiền phân bổ phải lớn hơn 0");
    totalRequestedAllocation += alloc.amount;

    const inv = getInvoice(alloc.invoiceId);
    assert(inv, `Không tìm thấy hóa đơn ID #${alloc.invoiceId}`);
    assert(inv.account_id === p.account_id, "Hóa đơn và thanh toán phải cùng doanh nghiệp");
    const currency = get<{currency:string}>("SELECT currency FROM orders WHERE id=?",inv.order_id)?.currency;
    assert(currency === p.currency, "Hóa đơn và thanh toán phải cùng loại tiền");
    const requested = (requestedByInvoice.get(inv.id) ?? 0) + alloc.amount;
    requestedByInvoice.set(inv.id, requested);
    assert(requested <= inv.amount - inv.paid_amount, "Tổng phân bổ lặp vượt số dư hóa đơn");
    assert(inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID", `Hóa đơn ${inv.code} chưa phát hành hoặc đã thanh toán đủ`);
    const unpaid = inv.amount - inv.paid_amount;
    assert(alloc.amount <= unpaid, `Số tiền phân bổ (${alloc.amount.toLocaleString("vi-VN")} ₫) vượt quá số dư còn phải thu của hóa đơn ${inv.code} (${unpaid.toLocaleString("vi-VN")} ₫)`);
  }

  assert(totalRequestedAllocation <= unallocatedAmount, `Tổng tiền phân bổ (${totalRequestedAllocation.toLocaleString("vi-VN")} ₫) vượt quá số tiền chưa phân bổ của khoản thanh toán (${unallocatedAmount.toLocaleString("vi-VN")} ₫)`);

  tx(() => {
    for (const alloc of allocations) {
      run(
        `INSERT INTO payment_allocations (
          payment_id, invoice_id, amount, created_by
        ) VALUES (?, ?, ?, ?)`,
        paymentId,
        alloc.invoiceId,
        alloc.amount,
        actorUserId(actor),
      );

      const inv = getInvoice(alloc.invoiceId)!;
      const newPaid = inv.paid_amount + alloc.amount;
      const nextStatus = newPaid >= inv.amount ? "PAID" : "PARTIALLY_PAID";

      run(
        "UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?",
        newPaid,
        nextStatus,
        alloc.invoiceId,
      );

      // Cập nhật trạng thái đợt thanh toán (billing_milestones) nếu có
      if (inv.milestone_id && nextStatus === "PAID") {
        run("UPDATE billing_milestones SET status = 'PAID' WHERE id = ?", inv.milestone_id);
      }

      // Cập nhật trạng thái thanh toán trên đơn hàng
      const orderInvoices = all<{ amount: number; paid_amount: number; status: string }>(
        "SELECT amount, paid_amount, status FROM invoices WHERE order_id = ? AND status != 'CANCELLED'",
        inv.order_id,
      );
      const orderRow = get<{ grand_total: number; total: number }>(
        "SELECT grand_total, total FROM orders WHERE id = ?",
        inv.order_id,
      );
      const orderTargetTotal = orderRow ? (orderRow.grand_total || orderRow.total) : 0;
      const totalPaidForOrder = orderInvoices.reduce((sum, i) => sum + i.paid_amount, 0);

      const nextOrderPayStatus =
        totalPaidForOrder >= orderTargetTotal ? "PAID" : totalPaidForOrder > 0 ? "PARTIALLY_PAID" : "UNPAID";

      run(
        "UPDATE orders SET payment_status = ? WHERE id = ?",
        nextOrderPayStatus,
        inv.order_id,
      );

      audit(actor, "invoice", alloc.invoiceId, "PAYMENT_ALLOCATED", {
        from: inv.status,
        to: nextStatus,
        details: {
          paymentId,
          allocatedAmount: alloc.amount,
          newPaidTotal: newPaid,
        },
      });
    }

    // Cập nhật trạng thái đối soát của payment
    const updatedPayment = getPayment(paymentId)!;
    const newAllocated = updatedPayment.allocated_amount;
    const newReconStatus: ReconciliationStatus =
      newAllocated >= updatedPayment.amount ? "MATCHED" : newAllocated > 0 ? "PARTIALLY_MATCHED" : "UNMATCHED";

    run(
      "UPDATE payments SET reconciliation_status = ? WHERE id = ?",
      newReconStatus,
      paymentId,
    );

    audit(actor, "payment", paymentId, "ALLOCATE", {
      details: {
        reconciliationStatus: newReconStatus,
        allocatedTotal: newAllocated,
      },
    });
  });
}

/**
 * FR-70: Yêu cầu thanh toán trực tuyến qua cổng (Tùy chọn, DEC-13)
 */
export function requestOnlinePayment(
  actor: Actor,
  invoiceId: number,
): { paymentCode: string; checkoutUrl: string; gatewayRef: string } {
  const inv = getInvoice(invoiceId);
  assert(inv, "Không tìm thấy hóa đơn");
  assert(inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID", "Chỉ tạo yêu cầu thanh toán cho hóa đơn đã phát hành và chưa tất toán");

  const unpaid = inv.amount - inv.paid_amount;
  assert(unpaid > 0, "Hóa đơn đã được thanh toán đầy đủ");

  const year = new Date().getFullYear();
  const maxReq = get<{ code: string }>(
    "SELECT code FROM payment_requests WHERE code LIKE ? ORDER BY id DESC LIMIT 1",
    `PR-${year}-%`,
  );
  const nextNum = maxReq ? Number(maxReq.code.split("-").pop()) + 1 : 1;
  const code = `PR-${year}-${String(nextNum).padStart(4, "0")}`;

  const { gatewayRef, checkoutUrl } = paymentGateway.createPaymentRequest({
    code,
    amount: unpaid,
    orderCode: inv.order_code,
  });

  tx(() => {
    run(
      `INSERT INTO payment_requests (
        code, invoice_id, amount, gateway_provider, gateway_url, status
      ) VALUES (?, ?, ?, 'MOCK_GATEWAY', ?, 'PENDING')`,
      code,
      invoiceId,
      unpaid,
      checkoutUrl,
    );

    audit(actor, "payment_request", invoiceId, "CREATE", {
      details: { code, gatewayRef, amount: unpaid, checkoutUrl },
    });
  });

  return { paymentCode: code, checkoutUrl, gatewayRef };
}

/**
 * FR-70: Giả lập tiếp nhận Webhook từ cổng thanh toán trực tuyến (DEC-13)
 */
export function handleOnlinePaymentCallback(
  code: string,
  status: "SUCCESS" | "FAILED",
): { success: boolean; message: string } {
  const req = get<{ id: number; invoice_id: number; amount: number; status: string }>(
    "SELECT * FROM payment_requests WHERE code = ?",
    code,
  );
  assert(req, `Không tìm thấy yêu cầu thanh toán với mã ${code}`);
  if (req.status === "SUCCESS") return { success: true, message: "Giao dịch đã được ghi nhận, chờ đối soát" };
  assert(req.status === "PENDING", "Yêu cầu thanh toán đã kết thúc");

  return tx(() => {
    paymentGateway.simulateCallback(code, status);

    run(
      `UPDATE payment_requests SET
        status = ?,
        completed_at = datetime('now')
       WHERE code = ?`,
      status,
      code,
    );

    if (status === "SUCCESS") {
      const inv = getInvoice(req.invoice_id)!;
      // Ghi nhận thanh toán và tự động phân bổ vào hóa đơn
      const mockSystemActor: Actor = { type: "INTEGRATION", name: "PAYMENT_GATEWAY" };
      const payId = recordPayment(mockSystemActor, {
        accountId: inv.account_id,
        amount: req.amount,
        paidAt: new Date().toISOString(),
        method: "GATEWAY",
        reference: `GATEWAY-${code}`,
        externalTransactionId: `TXN-${code}`,
        source: "GATEWAY",
        currency: get<{currency:string}>("SELECT currency FROM orders WHERE id=?",inv.order_id)?.currency,
      });
      run("UPDATE payments SET gateway_status='SUCCESS' WHERE id=?",payId);

      notifyRole("FINANCE", `Cổng thanh toán ghi nhận giao dịch cho hóa đơn ${inv.code}; cần đối soát trước khi phân bổ`, `/invoices/${inv.id}`);
      return { success: true, message: `Thanh toán thành công ${req.amount.toLocaleString("vi-VN")} VND (Mã GD: ${payId})` };
    }

    return { success: false, message: `Thanh toán ${code} thất bại hoặc bị hủy bởi khách hàng` };
  });
}

/**
 * FR-72: Đồng bộ dữ liệu với hệ thống Tài chính - Kế toán ERP
 */
export function syncAccountingData(
  actor: Actor,
): { syncedCount: number; errorsCount: number } {
  assert(actor.type === "USER", "Chỉ nhân viên được thực hiện đồng bộ");

  return tx(() => {
    // 1. Lấy các hóa đơn ISSUED chưa có sync event thành công
    const pendingInvoices = all<{ id: number; code: string; amount: number; order_code: string }>(
      `SELECT i.id, i.code, i.amount, o.code AS order_code
       FROM invoices i
       JOIN orders o ON o.id = i.order_id
       WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID')
         AND i.id NOT IN (
           SELECT entity_id FROM sync_events WHERE entity_type = 'INVOICE' AND status = 'SUCCESS'
         )
       LIMIT 10`,
    );

    let synced = 0;
    let errors = 0;

    for (const inv of pendingInvoices) {
      try {
        const res = erp.pushInvoice({ code: inv.code, amount: inv.amount, orderCode: inv.order_code });
        run(
          `INSERT INTO sync_events (
            entity_type, entity_id, direction, system, status, payload, response
          ) VALUES ('INVOICE', ?, 'OUTBOUND', 'ERP', 'SUCCESS', ?, ?)`,
          inv.id,
          JSON.stringify({ code: inv.code, amount: inv.amount }),
          JSON.stringify(res),
        );
        synced++;
      } catch (err: unknown) {
        run(
          `INSERT INTO sync_events (
            entity_type, entity_id, direction, system, status, error_message
          ) VALUES ('INVOICE', ?, 'OUTBOUND', 'ERP', 'ERROR', ?)`,
          inv.id,
          err instanceof Error ? err.message : String(err),
        );
        errors++;
      }
    }

    audit(actor, "sync", 0, "ERP_SYNC", {
      details: { syncedCount: synced, errorsCount: errors },
    });

    return { syncedCount: synced, errorsCount: errors };
  });
}
