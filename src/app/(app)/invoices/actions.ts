"use server";

import { act } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { assert } from "@/lib/domain";
import { userActor } from "@/lib/services/core";
import {
  createInvoiceDraftFromOrder,
  setupInvoiceSchedule,
  reviewInvoiceDraft,
  issueInvoice,
  sendPaymentReminder,
  requestInvoiceChange,
  processInvoiceChange,
} from "@/lib/services/invoices";
import {
  recordPayment,
  allocatePayment,
  requestOnlinePayment,
  syncAccountingData,
} from "@/lib/services/payments";

export async function createInvoiceDraftAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const milestoneId = formData.get("milestoneId") ? Number(formData.get("milestoneId")) : null;
  const milestoneName = (formData.get("milestoneName") as string)?.trim() || undefined;
  const amount = formData.get("amount") ? Number(formData.get("amount")) : undefined;
  const dueDate = (formData.get("dueDate") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  assert(orderId, "Thiếu mã đơn hàng");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("invoice.create");
      const invId = createInvoiceDraftFromOrder(userActor(u), orderId, {
        milestoneId,
        milestoneName,
        amount,
        dueDate,
        notes,
      });
      return { redirectTo: `/invoices/${invId}` };
    },
    "Hồ sơ hóa đơn nháp đã được khởi tạo thành công",
  );
}

export async function setupInvoiceScheduleAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const dueDate = (formData.get("dueDate") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  assert(invoiceId && dueDate, "Vui lòng nhập ngày đến hạn thanh toán");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("invoice.write");
      setupInvoiceSchedule(userActor(u), invoiceId, { dueDate, notes });
    },
    "Đã cập nhật lịch thanh toán hóa đơn",
  );
}

export async function reviewInvoiceDraftAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  assert(invoiceId, "Thiếu mã hóa đơn");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("invoice.write");
      reviewInvoiceDraft(userActor(u), invoiceId, notes);
    },
    "Đã xác nhận kiểm tra hóa đơn nháp (DEC-09)",
  );
}

export async function issueInvoiceAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const recipientEmail = (formData.get("recipientEmail") as string)?.trim() || undefined;
  assert(invoiceId, "Thiếu mã hóa đơn");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("invoice.finance");
      const { erpRef } = issueInvoice(userActor(u), invoiceId, { recipientEmail });
      return { message: `Đã phát hành hóa đơn chính thức qua ERP (${erpRef}) và gửi cho khách hàng (HG8)` };
    },
    "Hóa đơn đã được phát hành thành công",
  );
}

export async function recordPaymentAction(formData: FormData): Promise<never> {
  const accountId = Number(formData.get("accountId"));
  const invoiceId = formData.get("invoiceId") ? Number(formData.get("invoiceId")) : undefined;
  const amount = Number(formData.get("amount"));
  const paidAt = (formData.get("paidAt") as string)?.trim() || new Date().toISOString().slice(0, 10);
  const method = (formData.get("method") as string) || "BANK_TRANSFER";
  const reference = (formData.get("reference") as string)?.trim() || null;

  assert(accountId && amount > 0, "Thông tin thanh toán không hợp lệ");

  const returnPath = invoiceId ? `/invoices/${invoiceId}` : "/invoices";

  return act(
    returnPath,
    async () => {
      const u = await requirePermission("payment.write");
      const allocations = invoiceId ? [{ invoiceId, amount }] : undefined;
      recordPayment(userActor(u), {
        accountId,
        amount,
        paidAt,
        method,
        reference,
        invoiceAllocations: allocations,
      });
    },
    "Đã ghi nhận thanh toán và phân bổ thành công (DEC-23)",
  );
}

export async function allocatePaymentAction(formData: FormData): Promise<never> {
  const paymentId = Number(formData.get("paymentId"));
  const invoiceId = Number(formData.get("invoiceId"));
  const amount = Number(formData.get("amount"));

  assert(paymentId && invoiceId && amount > 0, "Thông tin phân bổ không hợp lệ");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("payment.write");
      allocatePayment(userActor(u), paymentId, [{ invoiceId, amount }]);
    },
    "Đã phân bổ khoản thanh toán vào hóa đơn",
  );
}

export async function requestOnlinePaymentAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  assert(invoiceId, "Thiếu mã hóa đơn");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("payment.write");
      const res = requestOnlinePayment(userActor(u), invoiceId);
      return { message: `Đã tạo liên kết thanh toán online qua cổng: ${res.checkoutUrl} (Mã: ${res.paymentCode})` };
    },
    "Đã tạo yêu cầu thanh toán trực tuyến",
  );
}

export async function sendPaymentReminderAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const note = (formData.get("note") as string)?.trim() || undefined;
  assert(invoiceId, "Thiếu mã hóa đơn");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("payment.write");
      const res = sendPaymentReminder(userActor(u), invoiceId, { note });
      return { message: `Đã gửi nhắc thanh toán tới ${res.recipientEmail} (BR-13)` };
    },
    "Đã gửi email nhắc thanh toán quá hạn",
  );
}

export async function requestInvoiceChangeAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const type = formData.get("type") as "ADJUSTMENT" | "CANCELLATION";
  const reason = (formData.get("reason") as string)?.trim();

  assert(invoiceId && type && reason, "Vui lòng nhập đầy đủ lý do yêu cầu");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("invoice.create");
      requestInvoiceChange(userActor(u), invoiceId, { type, reason });
    },
    "Yêu cầu điều chỉnh/hủy hóa đơn đã được gửi tới bộ phận Tài chính - Kế toán",
  );
}

export async function processInvoiceChangeAction(formData: FormData): Promise<never> {
  const invoiceId = Number(formData.get("invoiceId"));
  const requestId = Number(formData.get("requestId"));
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const reviewNotes = (formData.get("reviewNotes") as string)?.trim() || undefined;

  assert(requestId && decision, "Thông tin quyết định không hợp lệ");

  return act(
    `/invoices/${invoiceId}`,
    async () => {
      const u = await requirePermission("invoice.finance");
      processInvoiceChange(userActor(u), requestId, decision, reviewNotes);
    },
    decision === "APPROVED" ? "Đã phê duyệt yêu cầu điều chỉnh hóa đơn" : "Đã từ chối yêu cầu điều chỉnh",
  );
}

export async function syncAccountingDataAction(): Promise<never> {
  return act(
    "/invoices",
    async () => {
      const u = await requirePermission("invoice.finance");
      const res = syncAccountingData(userActor(u));
      return { message: `Đồng bộ hoàn tất: ${res.syncedCount} chứng từ thành công, ${res.errorsCount} lỗi.` };
    },
    "Đã đồng bộ dữ liệu với hệ thống Kế toán ERP",
  );
}
