import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Badge, CommandBar, CommandLink, PageTitle, StatusBadge } from "@/components/ui";
import { all } from "@/lib/db";
import { INVOICE_STATUS } from "@/lib/domain";
import { getInvoice, getInvoiceHistory, getInvoiceLines, isOverdueInvoice } from "@/lib/services/invoices";
import { invoicePaymentAllocations } from "@/lib/services/payments";
import {
  issueInvoiceAction,
  processInvoiceChangeAction,
  recordPaymentAction,
  requestInvoiceChangeAction,
  requestOnlinePaymentAction,
  reviewInvoiceDraftAction,
  sendPaymentReminderAction,
  setupInvoiceScheduleAction,
} from "../actions";

export default async function InvoiceDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const invoiceId = Number(params.id);
  const invoice = getInvoice(invoiceId, await requirePermission('invoice.read'));

  if (!invoice) {
    notFound();
  }

  const lines = getInvoiceLines(invoiceId);
  const allocations = invoicePaymentAllocations(invoiceId);
  const history = getInvoiceHistory(invoiceId);

  // Lấy các yêu cầu thanh toán online qua cổng
  const paymentRequests = all<{
    id: number;
    code: string;
    amount: number;
    gateway_provider: string;
    gateway_url: string | null;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>("SELECT * FROM payment_requests WHERE invoice_id = ? ORDER BY id DESC", invoiceId);

  // Phân tích snapshot khách hàng nếu có
  let customerInfo: {
    accountName?: string;
    taxCode?: string;
    address?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  } = {};
  if (invoice.customer_snapshot) {
    try {
      customerInfo = JSON.parse(invoice.customer_snapshot);
    } catch {
      customerInfo = {};
    }
  }

  const isDraft = invoice.status === "DRAFT";
  const isReviewed = Boolean(invoice.reviewed_at);
  const isIssued = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";
  const isOverdue = isOverdueInvoice(invoice);
  const unpaidBalance = Math.max(0, invoice.amount - invoice.paid_amount);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/invoices" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
        <CommandLink href={`/orders/${invoice.order_id}`} icon="order">
          Xem Đơn hàng {invoice.order_code}
        </CommandLink>

        {/* Nút Kiểm tra nháp (DEC-09) */}
        {isDraft && !isReviewed && (
          <form action={reviewInvoiceDraftAction} className="inline-block">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded transition"
            >
              <span>✓</span> Xác nhận kiểm tra nháp (DEC-09)
            </button>
          </form>
        )}

        {/* Nút Phát hành hóa đơn chính thức qua ERP (HG8 / DEC-08) */}
        {isDraft && (
          <form action={issueInvoiceAction} className="inline-block">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <span>🚀</span> Phát hành qua ERP & Gửi khách (HG8)
            </button>
          </form>
        )}

        {/* Nút Tạo link thanh toán trực tuyến (FR-70) */}
        {isIssued && unpaidBalance > 0 && (
          <form action={requestOnlinePaymentAction} className="inline-block">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <span>💳</span> Tạo liên kết thanh toán online (FR-70)
            </button>
          </form>
        )}

        {/* Nút Nhắc nợ (FR-71, BR-13) */}
        {isOverdue && (
          <form action={sendPaymentReminderAction} className="inline-block">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="btn btn-ghost text-xs text-danger font-medium flex items-center gap-1.5 hover:bg-danger/10"
              title="Gửi email thông báo nhắc nợ tới khách hàng (áp dụng cửa sổ 7 ngày theo BR-13)"
            >
              <span>📩</span> Gửi nhắc nợ thanh toán (BR-13)
            </button>
          </form>
        )}
      </CommandBar>

      <PageTitle
        icon="invoice"
        title={`Hóa đơn ${invoice.code}`}
        subtitle={`Đơn hàng liên kết: ${invoice.order_code} • Khách hàng: ${invoice.account_name} • Kế toán: ${invoice.external_system}`}
      />

      {/* Cảnh báo trạng thái nổi bật */}
      {isOverdue && (
        <div className="border-b border-danger/30 bg-danger/10 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span className="text-xs font-semibold text-danger">
                Hóa đơn này đã quá hạn thanh toán từ ngày {invoice.due_date}! Còn thiếu{" "}
                {unpaidBalance.toLocaleString("vi-VN")} đ.
              </span>
            </div>
            <span className="text-xs text-ink-subtle">Quy tắc dunning nhắc nợ: cách nhau 7 ngày (BR-13)</span>
          </div>
        </div>
      )}

      {/* Nội dung chi tiết */}
      <div className="flex-1 space-y-6 overflow-auto p-6">
        {/* Hàng 1: Tổng quan tài chính & Trạng thái kiểm soát */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột 1: Thông tin tài chính */}
          <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stroke pb-3">
              <h3 className="font-semibold text-ink">Tổng quan giá trị</h3>
              <StatusBadge status={invoice.status} labels={INVOICE_STATUS} />
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-subtle">Tiền trước thuế:</span>
                <span className="font-medium text-ink">{invoice.subtotal.toLocaleString("vi-VN")} đ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">Tiền thuế VAT (10%):</span>
                <span className="font-medium text-ink">{invoice.tax_amount.toLocaleString("vi-VN")} đ</span>
              </div>
              <div className="flex justify-between border-t border-stroke pt-2 text-base font-bold">
                <span className="text-ink">Tổng giá trị hóa đơn:</span>
                <span className="text-primary">{invoice.amount.toLocaleString("vi-VN")} đ</span>
              </div>
              <div className="flex justify-between border-t border-stroke pt-2 text-sm">
                <span className="text-ink-subtle">Đã thanh toán (DEC-23):</span>
                <span className="font-semibold text-success">
                  {invoice.paid_amount.toLocaleString("vi-VN")} đ
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-subtle">Còn phải thu:</span>
                <span className={`font-semibold ${unpaidBalance > 0 ? "text-danger" : "text-ink-subtle"}`}>
                  {unpaidBalance.toLocaleString("vi-VN")} đ
                </span>
              </div>
            </div>
          </div>

          {/* Cột 2: Cổng kiểm soát & Phát hành */}
          <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
            <h3 className="font-semibold text-ink border-b border-stroke pb-3">Cổng kiểm soát & Phát hành</h3>

            <div className="space-y-3 text-xs">
              <div className="rounded-md border border-stroke bg-surface-subtle p-3">
                <div className="font-semibold text-ink flex items-center justify-between">
                  <span>Kiểm tra bản nháp (DEC-09)</span>
                  {invoice.reviewed_at ? (
                    <Badge tone="success">Đã kiểm tra</Badge>
                  ) : (
                    <Badge tone="warning">Chưa kiểm tra</Badge>
                  )}
                </div>
                {invoice.reviewed_at ? (
                  <div className="mt-1.5 text-ink-subtle">
                    Người kiểm tra: <strong>{invoice.reviewed_by_name || "Nhân viên KT"}</strong>
                    <br />
                    Thời gian: {invoice.reviewed_at}
                  </div>
                ) : (
                  <p className="mt-1 text-ink-subtle">
                    Nhân viên Tài chính cần kiểm tra lại thông tin khách hàng, thuế và kỳ thanh toán trước khi đẩy sang ERP.
                  </p>
                )}
              </div>

              <div className="rounded-md border border-stroke bg-surface-subtle p-3">
                <div className="font-semibold text-ink flex items-center justify-between">
                  <span>Cổng HG8: Hóa đơn chính thức</span>
                  {invoice.erp_ref ? (
                    <Badge tone="brand">Đã cấp số ERP</Badge>
                  ) : (
                    <Badge tone="neutral">Chưa có số</Badge>
                  )}
                </div>
                {invoice.erp_ref ? (
                  <div className="mt-1.5 text-ink-subtle">
                    Số hóa đơn chính thức:{" "}
                    <strong className="font-mono text-primary">{invoice.erp_ref}</strong>
                    <br />
                    Hệ thống: {invoice.external_system} • Phát hành lúc: {invoice.issued_at}
                  </div>
                ) : (
                  <p className="mt-1 text-ink-subtle">
                    Hóa đơn nháp chưa được gửi cho khách hàng. Chỉ khi tiếp nhận số chính thức từ ERP mới gửi email cho khách (DEC-08).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cột 3: Lịch & Thông tin khách hàng */}
          <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
            <h3 className="font-semibold text-ink border-b border-stroke pb-3">Kỳ hạn & Khách hàng</h3>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-ink-subtle">Mốc thanh toán:</span>
                <div className="font-medium text-ink">{invoice.milestone || "Toàn bộ đơn hàng"}</div>
              </div>
              <div>
                <span className="text-ink-subtle">Khách hàng:</span>
                <div className="font-medium text-ink">{invoice.account_name}</div>
                {customerInfo.taxCode && (
                  <div className="text-ink-subtle">MST: {customerInfo.taxCode}</div>
                )}
                {customerInfo.address && (
                  <div className="text-ink-subtle truncate" title={customerInfo.address}>
                    Đ/c: {customerInfo.address}
                  </div>
                )}
              </div>
              <div>
                <span className="text-ink-subtle">Hạn thanh toán hiện tại:</span>
                <div className="font-semibold text-ink">{invoice.due_date || "Chưa thiết lập"}</div>
              </div>

              {/* Form cập nhật lịch lập hóa đơn / hạn thanh toán (FR-65) */}
              <form action={setupInvoiceScheduleAction} className="mt-3 space-y-2 border-t border-stroke pt-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="flex gap-2">
                  <input
                    type="date"
                    name="dueDate"
                    defaultValue={invoice.due_date || ""}
                    required
                    className="input text-xs py-1 flex-1"
                  />
                  <button type="submit" className="btn btn-secondary text-xs px-2.5 py-1">
                    Cập nhật hạn
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Hàng 2: Chi tiết các dòng hàng hóa đơn (FR-64) */}
        <div className="rounded-lg border border-stroke bg-surface shadow-xs">
          <div className="border-b border-stroke px-6 py-4">
            <h3 className="font-semibold text-ink">Chi tiết sản phẩm & Dịch vụ trong hóa đơn (FR-64)</h3>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stroke bg-surface-subtle text-xs font-semibold text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Nội dung sản phẩm / Dịch vụ</th>
                  <th className="px-4 py-2.5 text-center">Số lượng</th>
                  <th className="px-4 py-2.5 text-right">Đơn giá</th>
                  <th className="px-4 py-2.5 text-center">Thuế VAT</th>
                  <th className="px-4 py-2.5 text-right">Thành tiền (gồm thuế)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {lines.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 font-medium text-ink">{l.description}</td>
                    <td className="px-4 py-3 text-center">{l.quantity}</td>
                    <td className="px-4 py-3 text-right">{l.unit_price.toLocaleString("vi-VN")} đ</td>
                    <td className="px-4 py-3 text-center">{l.tax_pct}%</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      {l.line_total.toLocaleString("vi-VN")} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hàng 3: Lịch sử thanh toán & Cổng thanh toán trực tuyến (FR-69, FR-70, DEC-23) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Lịch sử thanh toán đã phân bổ */}
          <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stroke pb-3">
              <h3 className="font-semibold text-ink">Lịch sử thanh toán phân bổ (FR-69, DEC-23)</h3>
              <span className="text-xs text-ink-subtle">{allocations.length} lượt giao dịch</span>
            </div>

            {allocations.length === 0 ? (
              <p className="text-xs text-ink-subtle italic">Chưa có giao dịch thanh toán nào được ghi nhận cho hóa đơn này.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stroke text-ink-subtle">
                    <tr>
                      <th className="py-2">Ngày</th>
                      <th className="py-2">Phương thức</th>
                      <th className="py-2">Mã tham chiếu</th>
                      <th className="py-2 text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke">
                    {allocations.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 text-ink">{a.paidAt}</td>
                        <td className="py-2 font-medium">{a.method || "Chuyển khoản"}</td>
                        <td className="py-2 font-mono text-ink-subtle">{a.reference || "—"}</td>
                        <td className="py-2 text-right font-bold text-success">
                          {a.amount.toLocaleString("vi-VN")} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Form ghi nhận thanh toán nhanh nếu còn nợ */}
            {unpaidBalance > 0 && (
              <div className="border-t border-stroke pt-4">
                <h4 className="text-xs font-semibold text-ink mb-2">Ghi nhận thanh toán bổ sung</h4>
                <form action={recordPaymentAction} className="space-y-3">
                  <input type="hidden" name="accountId" value={invoice.account_id} />
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-ink-subtle">Số tiền thu</label>
                      <input
                        type="number"
                        name="amount"
                        defaultValue={unpaidBalance}
                        max={unpaidBalance}
                        min="1000"
                        required
                        className="input text-xs py-1"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-subtle">Phương thức</label>
                      <select name="method" className="input text-xs py-1">
                        <option value="BANK_TRANSFER">Chuyển khoản NH</option>
                        <option value="CASH">Tiền mặt</option>
                        <option value="GATEWAY">Cổng trực tuyến</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="reference"
                      placeholder="Mã giao dịch ngân hàng / hóa đơn ủy nhiệm chi..."
                      className="input text-xs py-1 flex-1"
                    />
                    <button type="submit" className="btn btn-primary text-xs px-3 py-1">
                      Ghi nhận (DEC-23)
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Cổng thanh toán trực tuyến (FR-70, DEC-13) */}
          <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stroke pb-3">
              <h3 className="font-semibold text-ink">Cổng thanh toán trực tuyến (FR-70)</h3>
              <span className="text-xs text-ink-subtle">Tích hợp Payment Gateway</span>
            </div>

            {paymentRequests.length === 0 ? (
              <div className="text-xs text-ink-subtle">
                <p>Chưa có yêu cầu thanh toán trực tuyến nào được khởi tạo cho hóa đơn này.</p>
                {isIssued && unpaidBalance > 0 && (
                  <form action={requestOnlinePaymentAction} className="mt-3">
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <button type="submit" className="btn btn-secondary text-xs">
                      Khởi tạo link thanh toán ngay
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {paymentRequests.map((pr) => (
                  <div key={pr.id} className="rounded border border-stroke bg-surface-subtle p-3 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-ink">{pr.code}</span>
                      <Badge tone={pr.status === "SUCCESS" ? "success" : "warning"}>
                        {pr.status === "SUCCESS" ? "Đã thanh toán" : "Đang chờ thanh toán"}
                      </Badge>
                    </div>
                    <div className="text-ink-subtle">
                      Số tiền: <strong>{pr.amount.toLocaleString("vi-VN")} đ</strong> • Tạo lúc: {pr.created_at}
                    </div>
                    {pr.gateway_url && (
                      <div className="mt-2 pt-2 border-t border-stroke flex items-center justify-between">
                        <a
                          href={pr.gateway_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline font-medium flex items-center gap-1"
                        >
                          🔗 Mở trang thanh toán cổng ({pr.gateway_provider})
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hàng 4: Yêu cầu điều chỉnh / hủy hóa đơn (FR-73) */}
        <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stroke pb-3">
            <h3 className="font-semibold text-ink">Đề nghị & Xử lý điều chỉnh / Hủy hóa đơn (FR-73)</h3>
            <span className="text-xs text-ink-subtle">Kiểm soát phân quyền theo vai trò</span>
          </div>

          {/* Danh sách các yêu cầu điều chỉnh */}
          {history.changeRequests.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-ink">Các đề nghị đã gửi:</h4>
              {history.changeRequests.map((cr) => (
                <div key={cr.id} className="rounded-md border border-stroke bg-surface-subtle p-3 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-ink">
                      {cr.type === "CANCELLATION" ? "🔴 Đề nghị HỦY hóa đơn" : "🟡 Đề nghị ĐIỀU CHỈNH nội dung"}
                    </span>
                    <Badge tone={cr.status === "APPROVED" ? "success" : cr.status === "REJECTED" ? "danger" : "warning"}>
                      {cr.status === "APPROVED" ? "Đã phê duyệt" : cr.status === "REJECTED" ? "Đã từ chối" : "Đang chờ duyệt"}
                    </Badge>
                  </div>
                  <div className="text-ink-subtle">
                    Lý do: <span className="text-ink font-medium">{cr.reason}</span>
                    <br />
                    Người yêu cầu: {cr.requested_by_name} • Ngày gửi: {cr.created_at}
                  </div>

                  {/* Nút phê duyệt dành cho kế toán nếu đang PENDING */}
                  {cr.status === "PENDING" && (
                    <div className="flex gap-2 pt-2 border-t border-stroke">
                      <form action={processInvoiceChangeAction} className="inline-block">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="requestId" value={cr.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button type="submit" className="btn btn-primary text-xs px-2.5 py-1">
                          ✓ Phê duyệt yêu cầu
                        </button>
                      </form>
                      <form action={processInvoiceChangeAction} className="inline-block">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="requestId" value={cr.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <button type="submit" className="btn btn-ghost text-xs text-danger px-2.5 py-1">
                          ✕ Từ chối
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Form gửi đề nghị mới */}
          {invoice.status !== "CANCELLED" && (
            <div className="border-t border-stroke pt-4">
              <h4 className="text-xs font-semibold text-ink mb-2">Gửi đề nghị điều chỉnh hoặc hủy hóa đơn</h4>
              <form action={requestInvoiceChangeAction} className="space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] text-ink-subtle">Loại đề nghị</label>
                    <select name="type" className="input text-xs py-1" required>
                      <option value="ADJUSTMENT">Điều chỉnh nội dung</option>
                      <option value="CANCELLATION">Hủy bỏ chứng từ</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] text-ink-subtle">Lý do sai sót / Căn cứ điều chỉnh</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="reason"
                        required
                        placeholder="Ghi rõ lý do sai sót thông tin hoặc thỏa thuận thay đổi với khách..."
                        className="input text-xs py-1 flex-1"
                      />
                      <button type="submit" className="btn btn-secondary text-xs px-3 py-1">
                        Gửi đề nghị
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Hàng 5: Lịch sử thay đổi & Sự kiện đồng bộ ERP (FR-74, FR-72) */}
        <div className="rounded-lg border border-stroke bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stroke pb-3">
            <h3 className="font-semibold text-ink">Lịch sử chứng từ & Sự kiện Kế toán (FR-74, FR-72)</h3>
            <span className="text-xs text-ink-subtle">{history.audits.length} bản ghi nhật ký</span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 text-xs">
            {/* Nhật ký Audit Log */}
            <div>
              <h4 className="font-semibold text-ink mb-2">Nhật ký tác vụ (Audit Trail):</h4>
              {history.audits.length === 0 ? (
                <p className="text-ink-subtle italic">Chưa có nhật ký.</p>
              ) : (
                <div className="space-y-2">
                  {history.audits.slice(0, 10).map((a) => (
                    <div key={a.id} className="rounded border border-stroke p-2 bg-surface-subtle">
                      <div className="flex justify-between font-medium text-ink">
                        <span>{a.action}</span>
                        <span className="text-[11px] text-ink-subtle">{a.created_at}</span>
                      </div>
                      <div className="text-[11px] text-ink-subtle mt-0.5">
                        Thực hiện bởi: {a.actor_name || `Người dùng #${a.actor_id}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sự kiện đồng bộ ERP */}
            <div>
              <h4 className="font-semibold text-ink mb-2">Sự kiện trao đổi dữ liệu ERP (FR-72):</h4>
              {history.syncEvents.length === 0 ? (
                <p className="text-ink-subtle italic">Chưa có sự kiện trao đổi với ERP.</p>
              ) : (
                <div className="space-y-2">
                  {history.syncEvents.slice(0, 10).map((se) => (
                    <div key={se.id} className="rounded border border-stroke p-2 bg-surface-subtle">
                      <div className="flex justify-between font-medium">
                        <span className="text-ink">{se.sync_type} ({se.direction})</span>
                        <Badge tone={se.status === "SUCCESS" ? "success" : "danger"}>
                          {se.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-ink-subtle mt-1 font-mono">
                        ERP: {se.external_system} • Lúc: {se.created_at}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
