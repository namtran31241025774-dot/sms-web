import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { CommandBar, CommandLink, FormField, PageTitle } from "@/components/ui";
import { billingMilestones, getOrder, listOrders } from "@/lib/services/orders";
import { getDefaultDueDate, listInvoices } from "@/lib/services/invoices";
import { createInvoiceDraftAction } from "../actions";

export default async function NewInvoicePage(props: {
  searchParams: Promise<{ orderId?: string; milestoneId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requirePermission('invoice.create');
  const selectedOrderId = searchParams.orderId ? Number(searchParams.orderId) : undefined;
  const selectedMilestoneId = searchParams.milestoneId ? Number(searchParams.milestoneId) : undefined;

  const orders = listOrders({user});
  const currentOrder = selectedOrderId ? getOrder(selectedOrderId,user) : undefined;

  // Lấy các mốc thanh toán của đơn hàng nếu có
  const milestones = currentOrder ? billingMilestones(currentOrder.id) : [];
  const existingInvoices = currentOrder ? listInvoices({ orderId: currentOrder.id,user }) : [];

  const existingInvoicedTotal = existingInvoices
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + i.amount, 0);

  const orderGrandTotal = currentOrder ? (currentOrder.grand_total || currentOrder.total) : 0;
  const remainingBillable = Math.max(0, orderGrandTotal - existingInvoicedTotal);

  // Mốc được chọn mặc định
  const currentMilestone = milestones.find((m) => m.id === selectedMilestoneId);
  const defaultAmount = currentMilestone ? currentMilestone.amount : remainingBillable;
  const defaultDueDate = getDefaultDueDate(currentMilestone?.due_date);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/invoices" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
        {selectedOrderId && (
          <CommandLink href={`/orders/${selectedOrderId}`} icon="order">
            Xem Đơn hàng {currentOrder?.code}
          </CommandLink>
        )}
      </CommandBar>

      <PageTitle
        icon="invoice"
        title="Lập Hồ sơ Hóa đơn nháp từ Đơn hàng (FR-64)"
        subtitle="Hệ thống đối chiếu giá trị và mốc thanh toán từ đơn hàng để nhận diện sai lệch (BR-12, DEC-23)"
      />

      <div className="mx-auto w-full max-w-4xl p-6">
        <form action={createInvoiceDraftAction} className="space-y-6">
          <div className="rounded-lg border border-stroke bg-surface p-6 shadow-xs space-y-4">
            <h2 className="text-base font-semibold text-ink">1. Chọn Đơn hàng thực hiện</h2>

            <FormField label="Đơn hàng" required hint="Chọn đơn hàng đã ký kết cần xuất hóa đơn tài chính">
              <select
                name="orderId"
                defaultValue={selectedOrderId || ""}
                required
                className="input"
              >
                <option value="">-- Chọn Đơn hàng --</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} - {o.opportunity_name || o.code} ({o.account_name} - {(o.grand_total || o.total).toLocaleString("vi-VN")} đ)
                  </option>
                ))}
              </select>
            </FormField>

            {currentOrder && (
              <div className="mt-4 rounded-md border border-stroke bg-surface-subtle p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div>
                    <span className="text-ink-subtle">Khách hàng:</span>
                    <div className="font-semibold text-ink">{currentOrder.account_name}</div>
                  </div>
                  <div>
                    <span className="text-ink-subtle">Tổng giá trị đơn hàng:</span>
                    <div className="font-semibold text-ink">
                      {orderGrandTotal.toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                  <div>
                    <span className="text-ink-subtle">Đã lập hóa đơn:</span>
                    <div className="font-semibold text-ink">
                      {existingInvoicedTotal.toLocaleString("vi-VN")} đ / {orderGrandTotal.toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-ink-subtle">
                  Giá trị tối đa còn có thể xuất hóa đơn (BR-12):{" "}
                  <strong className="text-primary">{remainingBillable.toLocaleString("vi-VN")} đ</strong>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-stroke bg-surface p-6 shadow-xs space-y-4">
            <h2 className="text-base font-semibold text-ink">2. Thông tin kỳ & Mốc thanh toán (FR-65)</h2>

            {milestones.length > 0 && (
              <FormField
                label="Mốc thanh toán đã thỏa thuận trong đơn hàng"
                hint="Chọn mốc thanh toán đã chốt ở đơn hàng (BR-11) hoặc để trống nếu xuất theo giá trị tùy chỉnh"
              >
                <select
                  name="milestoneId"
                  defaultValue={selectedMilestoneId || ""}
                  className="input"
                >
                  <option value="">-- Xuất toàn bộ hoặc kỳ tùy chỉnh --</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.percentage}% - {m.amount.toLocaleString("vi-VN")} đ) {m.due_date ? `- Hạn: ${m.due_date}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Tên đợt / Nội dung mốc thanh toán" hint="VD: Đợt 1 - Tạm ứng 30% khi ký hợp đồng">
                <input
                  type="text"
                  name="milestoneName"
                  defaultValue={currentMilestone?.name || ""}
                  placeholder="Để trống sẽ tự động lấy theo mốc đã chọn"
                  className="input"
                />
              </FormField>

              <FormField
                label="Giá trị hóa đơn (gồm thuế VAT)"
                required
                hint="Tổng tiền hóa đơn không được vượt quá số dư còn lại của đơn hàng (BR-12)"
              >
                <input
                  type="number"
                  name="amount"
                  defaultValue={defaultAmount || ""}
                  min="1000"
                  max={remainingBillable > 0 ? remainingBillable : undefined}
                  required
                  placeholder="Nhập số tiền..."
                  className="input"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Hạn thanh toán (Due Date)"
                required
                hint="Thời hạn thanh toán trước khi kích hoạt quy trình cảnh báo công nợ (FR-71, BR-13)"
              >
                <input
                  type="date"
                  name="dueDate"
                  defaultValue={defaultDueDate}
                  required
                  className="input"
                />
              </FormField>

              <FormField label="Ghi chú hóa đơn" hint="Lưu ý dành cho bộ phận Kế toán hoặc khách hàng">
                <input
                  type="text"
                  name="notes"
                  placeholder="VD: Hóa đơn phí bản quyền quý 1..."
                  className="input"
                />
              </FormField>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Link href="/invoices" className="btn btn-ghost text-sm">
              Hủy bỏ
            </Link>
            <button type="submit" className="btn btn-primary text-sm">
              Lập hóa đơn nháp & Tiếp tục &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
