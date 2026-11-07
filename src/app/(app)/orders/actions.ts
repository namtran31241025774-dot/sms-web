"use server";

import { act } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { assert } from "@/lib/domain";
import { userActor } from "@/lib/services/core";
import {
  createOrderFromQuote,
  createDirectOrder,
  setBillingMilestones,
  lockOrderPrice,
  updateFulfillmentProgress,
  createHandover,
  updateHandoverItem,
  completeOrderAndTransitionPostSales,
  type OrderStatus,
} from "@/lib/services/orders";

export async function createOrderFromQuoteAction(formData: FormData): Promise<never> {
  const quoteVersionId = Number(formData.get("quoteVersionId") || formData.get("quoteId"));
  assert(quoteVersionId, "Thiếu thông tin báo giá để tạo đơn hàng");

  return act(
    "/orders",
    async () => {
      const u = await requirePermission("order.create");
      const orderId = createOrderFromQuote(userActor(u), quoteVersionId);
      return { redirectTo: `/orders/${orderId}` };
    },
    "Đơn hàng đã được tạo thành công từ báo giá",
  );
}

export async function createDirectOrderAction(formData: FormData): Promise<never> {
  const accountId = Number(formData.get("accountId"));
  const opportunityId = formData.get("opportunityId") ? Number(formData.get("opportunityId")) : null;
  const paymentTerms = (formData.get("paymentTerms") as string)?.trim() || undefined;
  const deliveryTerms = (formData.get("deliveryTerms") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  const productId = Number(formData.get("productId"));
  const quantity = Number(formData.get("quantity") || 1);
  const unitPrice = Number(formData.get("unitPrice") || 0);
  const discountPct = Number(formData.get("discountPct") || 0);
  const taxPct = Number(formData.get("taxPct") || 10);

  assert(accountId, "Vui lòng chọn doanh nghiệp khách hàng");
  assert(productId && quantity > 0, "Thông tin sản phẩm không hợp lệ");

  return act(
    "/orders/new",
    async () => {
      const u = await requirePermission("order.create_direct");
      const orderId = createDirectOrder(userActor(u), {
        accountId,
        opportunityId,
        paymentTerms,
        deliveryTerms,
        notes,
        lines: [
          {
            productId,
            quantity,
            unitPrice,
            discountPct,
            taxPct,
          },
        ],
      });
      return { redirectTo: `/orders/${orderId}` };
    },
    "Đơn hàng trực tiếp đã được tạo thành công",
  );
}

export async function setBillingMilestonesAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const rawMilestones = formData.get("milestonesJson") as string;
  assert(orderId, "Thiếu mã đơn hàng");
  assert(rawMilestones, "Dữ liệu đợt thanh toán không hợp lệ");

  const milestones = JSON.parse(rawMilestones);

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("order.write");
      setBillingMilestones(userActor(u), orderId, milestones);
    },
    "Lịch thanh toán đã được thiết lập thành công",
  );
}

export async function lockOrderPriceAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  assert(orderId, "Thiếu mã đơn hàng");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("order.write");
      lockOrderPrice(userActor(u), orderId);
    },
    "Đã xác nhận và khóa giá đơn hàng",
  );
}

export async function updateFulfillmentProgressAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const status = (formData.get("status") as OrderStatus) || undefined;
  const pendingIssues = (formData.get("pendingIssues") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  assert(orderId, "Thiếu mã đơn hàng");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("fulfillment.update");
      updateFulfillmentProgress(userActor(u), orderId, { status, pendingIssues, notes });
    },
    "Đã cập nhật tiến độ triển khai",
  );
}

export async function createHandoverAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const title = (formData.get("title") as string)?.trim();
  const scopeSummary = (formData.get("scopeSummary") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  assert(orderId && title, "Tiêu đề biên bản bàn giao là bắt buộc");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("fulfillment.update");
      createHandover(userActor(u), orderId, { title, scopeSummary, notes });
    },
    "Đã tạo hồ sơ bàn giao kỹ thuật mới",
  );
}

export async function updateHandoverItemAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const handoverId = Number(formData.get("handoverId"));
  const itemId = Number(formData.get("itemId"));
  const status = formData.get("status") as "PENDING" | "IN_PROGRESS" | "ACCEPTED" | "REJECTED";
  const acceptanceNotes = (formData.get("acceptanceNotes") as string)?.trim() || null;

  assert(orderId && handoverId && itemId && status, "Thông tin hạng mục không hợp lệ");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("fulfillment.update");
      updateHandoverItem(userActor(u), handoverId, itemId, { status, acceptanceNotes });
    },
    "Đã cập nhật trạng thái nghiệm thu hạng mục bàn giao",
  );
}

export async function completeOrderAndTransitionPostSalesAction(formData: FormData): Promise<never> {
  const orderId = Number(formData.get("orderId"));
  const postSalesAssigneeId = formData.get("postSalesAssigneeId") ? Number(formData.get("postSalesAssigneeId")) : null;
  const postSalesContact = (formData.get("postSalesContact") as string)?.trim() || null;
  const pendingIssues = (formData.get("pendingIssues") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  assert(orderId, "Thiếu mã đơn hàng");

  return act(
    `/orders/${orderId}`,
    async () => {
      const u = await requirePermission("order.write");
      completeOrderAndTransitionPostSales(userActor(u), orderId, {
        postSalesAssigneeId,
        postSalesContact,
        pendingIssues,
        notes,
      });
    },
    "Đơn hàng đã hoàn thành và được chuyển tiếp sang bộ phận chăm sóc sau bán",
  );
}
