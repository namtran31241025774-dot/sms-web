import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Badge, Card, CommandBar, CommandLink, FormField, PageTitle } from "@/components/ui";
import { all } from "@/lib/db";
import {
  ORDER_STATUS,
  BILLING_MILESTONE_STATUS,
  HANDOVER_STATUS,
  HANDOVER_ITEM_CATEGORY,
  HANDOVER_ITEM_STATUS,
} from "@/lib/domain";
import {
  billingMilestones,
  getOrder,
  handoverItems,
  orderHandovers,
  orderLines,
} from "@/lib/services/orders";
import {
  completeOrderAndTransitionPostSalesAction,
  createHandoverAction,
  lockOrderPriceAction,
  setBillingMilestonesAction,
  updateFulfillmentProgressAction,
  updateHandoverItemAction,
} from "../actions";

export default async function OrderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const orderId = Number(params.id);
  const order = getOrder(orderId, await requirePermission('order.read'));

  if (!order) {
    notFound();
  }

  const lines = orderLines(orderId);
  const milestones = billingMilestones(orderId);
  const handovers = orderHandovers(orderId);
  const users = all<{ id: number; name: string; role: string }>(
    "SELECT id, name, role FROM users WHERE active = 1 ORDER BY name ASC",
  );

  // Tính toán tổng các mốc thanh toán
  const totalMilestones = milestones.reduce((sum, m) => sum + m.amount, 0);
  const grandTotal = order.grand_total || order.total;
  const isMilestoneBalanced = totalMilestones === grandTotal;

  // Lấy chi tiết các hạng mục bàn giao
  const handoversWithItems = handovers.map((h) => ({
    ...h,
    items: handoverItems(h.id),
  }));

  const orderStatusLabel = ORDER_STATUS[order.status] || order.status;

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/orders" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>

        <form action={lockOrderPriceAction} className="inline-block">
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="btn btn-ghost text-xs flex items-center gap-1.5">
            🔒 Xác nhận khóa giá
          </button>
        </form>

        <CommandLink href={`/invoices/new?orderId=${order.id}`} icon="invoice">
          Lập hóa đơn từ đơn hàng
        </CommandLink>

        {order.quote_id && (
          <CommandLink href={`/quotes/${order.quote_id}`} icon="quote">
            Xem Báo giá gốc {order.quote_code}
          </CommandLink>
        )}

        {order.opportunity_id && (
          <CommandLink href={`/opportunities/${order.opportunity_id}`} icon="opportunity">
            Xem Cơ hội bán hàng
          </CommandLink>
        )}
      </CommandBar>

      <PageTitle
        icon="order"
        title={`Đơn hàng ${order.code} — ${order.account_name}`}
        subtitle={`Trạng thái: ${orderStatusLabel} | Khóa giá: ${order.price_locked_at ? new Date(order.price_locked_at).toLocaleString("vi-VN") : "Chưa khóa"}`}
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CỘT TRÁI (2/3): Dòng sản phẩm, Lịch thanh toán, Bàn giao kỹ thuật */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Hạng mục sản phẩm trong đơn hàng */}
          <Card title="Hạng mục sản phẩm và Dịch vụ (Khóa giá)">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stroke bg-surface-subtle text-xs font-semibold text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2">Sản phẩm</th>
                    <th className="px-3 py-2 text-center">Loại</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-center">CK (%)</th>
                    <th className="px-3 py-2 text-center">VAT</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke">
                  {lines.map((l) => (
                    <tr key={l.id} className="hover:bg-surface-hover">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-ink">{l.product_name}</div>
                        <div className="text-xs text-ink-subtle">Mã: {l.product_code}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        <span className="rounded bg-surface-subtle px-1.5 py-0.5 border border-stroke text-ink-subtle">
                          {l.product_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {l.quantity} {l.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-subtle">
                        {l.unit_price.toLocaleString("vi-VN")} ₫
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        {l.discount_pct > 0 ? (
                          <span className="font-semibold text-amber-700">{l.discount_pct}%</span>
                        ) : (
                          "0%"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-ink-subtle">
                        {l.tax_pct}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">
                        {l.line_total.toLocaleString("vi-VN")} ₫
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Card 2: Thiết lập điều khoản thanh toán (FR-59, BR-11) */}
          <Card title="Lịch thanh toán các đợt">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stroke pb-3 text-xs">
                <div>
                  <span className="text-ink-subtle">Tổng các đợt: </span>
                  <span className="font-bold text-ink">{totalMilestones.toLocaleString("vi-VN")} ₫</span>
                  {" / "}
                  <span className="text-ink-subtle">Giá trị đơn: </span>
                  <span className="font-bold text-primary">{grandTotal.toLocaleString("vi-VN")} ₫</span>
                </div>
                <div>
                  {isMilestoneBalanced ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      ✓ Đã cân bằng
                    </span>
                  ) : (
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      ⚠ Lệch {(grandTotal - totalMilestones).toLocaleString("vi-VN")} ₫ (Cần điều chỉnh)
                    </span>
                  )}
                </div>
              </div>

              {milestones.length === 0 ? (
                <p className="text-sm text-ink-subtle">Chưa có đợt thanh toán nào được thiết lập.</p>
              ) : (
                <div className="space-y-2">
                  {milestones.map((m, idx) => {
                    const mStatus = BILLING_MILESTONE_STATUS[m.status] || m.status;
                    const mTone =
                      m.status === "PAID" ? "success" : m.status === "INVOICED" ? "brand" : "neutral";

                    return (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke p-3 bg-surface-subtle"
                      >
                        <div>
                          <div className="font-medium text-sm text-ink">
                            Đợt {idx + 1}: {m.name} ({m.percentage}%)
                          </div>
                          {m.conditions && (
                            <div className="text-xs text-ink-subtle">Điều kiện: {m.conditions}</div>
                          )}
                          {m.due_date && (
                            <div className="text-xs text-ink-subtle">Hạn thanh toán: {m.due_date}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-ink">
                            {m.amount.toLocaleString("vi-VN")} ₫
                          </span>
                          <Badge tone={mTone}>{mStatus}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Form thiết lập lại lịch thanh toán chuẩn BR-11 */}
              <div className="mt-4 rounded-lg border border-stroke p-4 bg-surface">
                <div className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-2">
                  Thiết lập nhanh lịch thanh toán (2 đợt 50% - 50%)
                </div>
                <form action={setBillingMilestonesAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input
                    type="hidden"
                    name="milestonesJson"
                    value={JSON.stringify([
                      {
                        name: "Tạm ứng đợt 1 (Xác nhận đơn)",
                        percentage: 50,
                        amount: Math.round(grandTotal / 2),
                        conditions: "Thanh toán trong 7 ngày sau ký kết",
                      },
                      {
                        name: "Thanh toán đợt 2 (Nghiệm thu bàn giao)",
                        percentage: 50,
                        amount: grandTotal - Math.round(grandTotal / 2),
                        conditions: "Sau khi hoàn tất nghiệm thu kỹ thuật",
                      },
                    ])}
                  />
                  <button type="submit" className="btn btn-secondary text-xs">
                    Đặt lại lịch 50% - 50% tự động cân bằng
                  </button>
                  <span className="text-xs text-ink-subtle">
 (bắt buộc tổng lịch thanh toán bằng đúng tổng giá trị đơn hàng)
                  </span>
                </form>
              </div>
            </div>
          </Card>

          {/* Card 3: Hồ sơ bàn giao kỹ thuật & Nghiệm thu (FR-61, FR-62, DEC-10) */}
          <Card title="Hồ sơ bàn giao kỹ thuật và Nghiệm thu">
            <div className="space-y-6">
              {handoversWithItems.length === 0 ? (
                <p className="text-sm text-ink-subtle">Chưa có hồ sơ bàn giao kỹ thuật nào.</p>
              ) : (
                handoversWithItems.map((h) => {
                  const hStatus = HANDOVER_STATUS[h.status] || h.status;
                  const hTone = h.status === "COMPLETED" ? "success" : "brand";

                  return (
                    <div key={h.id} className="rounded-lg border border-stroke p-4 bg-surface-subtle space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke pb-2">
                        <div>
                          <span className="font-semibold text-sm text-primary">[{h.code}]</span>{" "}
                          <span className="font-medium text-sm text-ink">{h.title}</span>
                          {h.scope_summary && (
                            <p className="text-xs text-ink-subtle mt-0.5">{h.scope_summary}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={hTone}>{hStatus}</Badge>
                          {h.completed_at && (
                            <span className="text-xs text-emerald-600">
                              ✓ Hoàn thành: {new Date(h.completed_at).toLocaleDateString("vi-VN")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Danh sách hạng mục bàn giao */}
                      <div className="space-y-2">
                        {h.items.map((item) => {
                          const catLabel = HANDOVER_ITEM_CATEGORY[item.category] || item.category;
                          const itStatus = HANDOVER_ITEM_STATUS[item.status] || item.status;
                          const itTone =
                            item.status === "ACCEPTED"
                              ? "success"
                              : item.status === "REJECTED"
                              ? "danger"
                              : "neutral";

                          return (
                            <div
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded border border-stroke bg-surface p-2.5 text-xs"
                            >
                              <div>
                                <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-ink-subtle border border-stroke mr-2">
                                  {catLabel}
                                </span>
                                <span className="font-medium text-ink">{item.item_name}</span>
                                {item.specification && (
                                  <span className="text-ink-subtle ml-2">({item.specification})</span>
                                )}
                                {item.acceptance_notes && (
                                  <div className="text-[11px] text-emerald-700 mt-0.5">
                                    Ghi chú nghiệm thu: {item.acceptance_notes}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge tone={itTone}>{itStatus}</Badge>
                                {item.status !== "ACCEPTED" && (
                                  <form action={updateHandoverItemAction} className="inline-block">
                                    <input type="hidden" name="orderId" value={order.id} />
                                    <input type="hidden" name="handoverId" value={h.id} />
                                    <input type="hidden" name="itemId" value={item.id} />
                                    <input type="hidden" name="status" value="ACCEPTED" />
                                    <input
                                      type="hidden"
                                      name="acceptanceNotes"
                                      value="Đã kiểm tra và nghiệm thu đạt yêu cầu"
                                    />
                                    <button
                                      type="submit"
                                      className="btn btn-secondary text-[11px] py-1 px-2"
                                    >
                                      ✓ Nghiệm thu
                                    </button>
                                  </form>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Thêm biên bản bàn giao mới */}
              <details className="rounded-lg border border-stroke p-3 bg-surface text-xs">
                <summary className="font-semibold text-ink cursor-pointer">
                  + Thêm biên bản bàn giao kỹ thuật mới
                </summary>
                <form action={createHandoverAction} className="mt-3 space-y-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <FormField label="Tiêu đề biên bản" required>
                    <input
                      type="text"
                      name="title"
                      placeholder="Ví dụ: Biên bản nghiệm thu triển khai đợt 2"
                      required
                      className="input text-xs"
                    />
                  </FormField>
                  <FormField label="Phạm vi bàn giao">
                    <input
                      type="text"
                      name="scopeSummary"
                      placeholder="Tài liệu API, cấu hình máy chủ, đào tạo..."
                      className="input text-xs"
                    />
                  </FormField>
                  <button type="submit" className="btn btn-primary text-xs">
                    Tạo biên bản bàn giao
                  </button>
                </form>
              </details>
            </div>
          </Card>
        </div>

        {/* CỘT PHẢI (1/3): Tài chính, Tiến độ triển khai, Chuyển tiếp sau bán */}
        <div className="space-y-6">
          {/* Card: Tổng hợp tài chính */}
          <Card title="Tổng quan tài chính và Khóa giá">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-subtle">Tổng tiền hàng:</span>
                <span className="font-medium text-ink">{order.subtotal.toLocaleString("vi-VN")} ₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">Chiết khấu:</span>
                <span className="font-medium text-amber-700">
                  -{order.discount_amount.toLocaleString("vi-VN")} ₫
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">Thuế VAT (10%):</span>
                <span className="font-medium text-ink">+{order.tax_amount.toLocaleString("vi-VN")} ₫</span>
              </div>
              <div className="border-t border-stroke pt-2 flex justify-between font-bold text-base">
                <span className="text-ink">Tổng giá trị đơn:</span>
                <span className="text-primary">{grandTotal.toLocaleString("vi-VN")} {order.currency}</span>
              </div>

              <div className="mt-4 rounded-md border border-stroke p-3 bg-surface-subtle text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Đã lập hóa đơn:</span>
                  <span className="font-semibold text-ink">{order.invoiced.toLocaleString("vi-VN")} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Đã thanh toán:</span>
                  <span className="font-semibold text-emerald-700">{order.paid.toLocaleString("vi-VN")} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Còn phải thu:</span>
                  <span className="font-semibold text-rose-700">
                    {Math.max(0, grandTotal - order.paid).toLocaleString("vi-VN")} ₫
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Card: Cập nhật tiến độ triển khai (FR-61) */}
          <Card title="Tiến độ triển khai">
            <form action={updateFulfillmentProgressAction} className="space-y-3 text-xs">
              <input type="hidden" name="orderId" value={order.id} />
              <FormField label="Trạng thái thực hiện">
                <select name="status" defaultValue={order.status} className="input text-xs">
                  <option value="ACTIVE">Đã tạo (ACTIVE)</option>
                  <option value="IN_FULFILLMENT">Đang thực hiện (IN_FULFILLMENT)</option>
                  <option value="FULFILLED">Hoàn tất bàn giao (FULFILLED)</option>
                </select>
              </FormField>

              <FormField label="Vướng mắc tồn đọng (nếu có)">
                <textarea
                  name="pendingIssues"
                  rows={2}
                  defaultValue={order.pending_issues || ""}
                  placeholder="Ghi nhận vướng mắc kỹ thuật từ bộ phận triển khai..."
                  className="input text-xs"
                />
              </FormField>

              <FormField label="Ghi chú tiến độ">
                <input
                  type="text"
                  name="notes"
                  defaultValue={order.notes || ""}
                  placeholder="Ghi chú thêm..."
                  className="input text-xs"
                />
              </FormField>

              <button type="submit" className="btn btn-secondary text-xs w-full">
                Cập nhật tiến độ
              </button>
            </form>
          </Card>

          {/* Card: Hoàn thành đơn hàng & Chuyển giao sau bán (FR-63) */}
          <Card title="Chuyển tiếp hồ sơ sau bán">
            <form action={completeOrderAndTransitionPostSalesAction} className="space-y-3 text-xs">
              <input type="hidden" name="orderId" value={order.id} />

              <FormField label="Đầu mối CSKH / Sau bán tiếp nhận" required>
                <select
                  name="postSalesAssigneeId"
                  defaultValue={order.post_sales_assignee_id || ""}
                  required
                  className="input text-xs"
                >
                  <option value="">-- Chọn nhân viên tiếp nhận --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Thông tin liên hệ sau bán">
                <input
                  type="text"
                  name="postSalesContact"
                  defaultValue={order.post_sales_contact || ""}
                  placeholder="Email, SĐT bộ phận chăm sóc..."
                  className="input text-xs"
                />
              </FormField>

              <FormField label="Vấn đề cần lưu ý khi chăm sóc">
                <textarea
                  name="pendingIssues"
                  rows={2}
                  defaultValue={order.pending_issues || ""}
                  placeholder="Lịch bảo trì, đào tạo bổ sung..."
                  className="input text-xs"
                />
              </FormField>

              <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-800 border border-amber-200">
                Lưu ý: Hoàn thành đơn hàng độc lập với tiến độ thu tiền; không tự động thay đổi trạng thái hóa đơn/thanh toán.
              </div>

              <button
                type="submit"
                className="btn btn-primary text-xs w-full"
                disabled={order.status === "FULFILLED"}
              >
                {order.status === "FULFILLED" ? "✓ Đã chuyển tiếp sau bán" : "Hoàn thành đơn và Chuyển sau bán"}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
