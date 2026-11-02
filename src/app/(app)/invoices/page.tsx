import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { recordVisible } from "@/lib/services/access";
import { CommandBar, CommandLink, PageTitle, StatusBadge } from "@/components/ui";
import { INVOICE_STATUS } from "@/lib/domain";
import { getDunningReport, isOverdueInvoice, listInvoices } from "@/lib/services/invoices";
import { syncAccountingDataAction } from "./actions";

export default async function InvoicesPage(props: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requirePermission('invoice.read');
  const q = searchParams.q?.trim() || "";
  const status = searchParams.status?.trim() || "";

  const invoices = listInvoices({
    user,
    search: q,
    status: status || undefined,
  });

  const dunningReports = getDunningReport().filter(r=>recordVisible(user,'invoice',r.invoice.id));

  const statusFilters = [
    { label: "Tất cả", value: "" },
    { label: "Bản nháp", value: "DRAFT" },
    { label: "Đã phát hành", value: "ISSUED" },
    { label: "Thanh toán một phần", value: "PARTIALLY_PAID" },
    { label: "Đã tất toán", value: "PAID" },
    { label: "Đã hủy", value: "CANCELLED" },
  ];

  // Thống kê nhanh
  const totalAmount = invoices.reduce((sum, inv) => sum + (inv.status !== "CANCELLED" ? inv.amount : 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const totalRemaining = Math.max(0, totalAmount - totalPaid);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/invoices/new" icon="add">
          Lập hóa đơn nháp
        </CommandLink>
        <CommandLink href="/orders" icon="order">
          Danh sách đơn hàng
        </CommandLink>
        <form action={syncAccountingDataAction} className="inline-block">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-subtle hover:bg-surface-hover rounded transition"
            title="Đồng bộ hóa đơn và trạng thái đối soát từ hệ thống kế toán ERP"
          >
            <span>🔄</span> Đồng bộ ERP
          </button>
        </form>
      </CommandBar>

      <PageTitle
        icon="invoice"
        title="Quản lý Hóa đơn và Thanh toán"
        subtitle="Theo dõi hóa đơn nháp, kiểm soát phát hành qua ERP, thanh toán trực tuyến và đối soát kế toán"
      />

      {/* Thống kê tài chính nhanh */}
      <div className="grid grid-cols-1 gap-4 border-b border-stroke bg-surface-subtle p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-stroke bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-ink-subtle">Tổng giá trị hóa đơn</div>
          <div className="mt-1 text-xl font-bold text-ink">
            {totalAmount.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-1 text-xs text-ink-subtle">{invoices.length} chứng từ</div>
        </div>

        <div className="rounded-lg border border-stroke bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-ink-subtle">Đã thực thu</div>
          <div className="mt-1 text-xl font-bold text-success">
            {totalPaid.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-1 text-xs text-ink-subtle">
            {totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0}% giá trị
          </div>
        </div>

        <div className="rounded-lg border border-stroke bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-ink-subtle">Công nợ còn phải thu</div>
          <div className="mt-1 text-xl font-bold text-primary">
            {totalRemaining.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-1 text-xs text-ink-subtle">Chờ thanh toán</div>
        </div>

        <div className="rounded-lg border border-stroke bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-ink-subtle">Hóa đơn quá hạn</div>
          <div className="mt-1 text-xl font-bold text-danger">
            {dunningReports.length}
          </div>
          <div className="mt-1 text-xs text-ink-subtle">Cần gửi nhắc nợ</div>
        </div>
      </div>

      {/* Cảnh báo nhắc nợ dunning nếu có */}
      {dunningReports.length > 0 && (
        <div className="border-b border-warning/30 bg-warning/10 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span className="text-xs font-semibold text-warning-contrast">
                Cảnh báo công nợ: Có {dunningReports.length} hóa đơn đã quá hạn thanh toán chưa hoàn tất.
              </span>
            </div>
            <span className="text-xs text-ink-subtle">
              Chu kỳ nhắc thanh toán: tối thiểu 7 ngày
            </span>
          </div>
        </div>
      )}

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke bg-surface-subtle px-6 py-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã hóa đơn, mã đơn, khách hàng, mã ERP..."
            className="input w-80 text-sm"
          />
          {status && <input type="hidden" name="status" value={status} />}
          <button type="submit" className="btn btn-secondary text-xs">
            Tìm kiếm
          </button>
          {q && (
            <Link href={`/invoices${status ? `?status=${status}` : ""}`} className="btn btn-ghost text-xs">
              Xóa tìm kiếm
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-1">
          {statusFilters.map((f) => (
            <Link
              key={f.value}
              href={`/invoices?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                status === f.value
                  ? "bg-primary text-primary-contrast"
                  : "bg-surface text-ink-subtle hover:bg-surface-hover"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Danh sách hóa đơn */}
      <div className="flex-1 overflow-auto p-6">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stroke p-12 text-center">
            <p className="text-sm text-ink-subtle">Không tìm thấy hóa đơn nào phù hợp.</p>
            <div className="mt-4 flex gap-2">
              <Link href="/orders" className="btn btn-primary text-xs">
                Chọn Đơn hàng để lập hóa đơn
              </Link>
              <Link href="/invoices/new" className="btn btn-secondary text-xs">
                Lập hóa đơn mới
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stroke bg-surface shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stroke bg-surface-subtle text-xs font-semibold text-ink-subtle">
                <tr>
                  <th className="px-4 py-3">Mã hóa đơn</th>
                  <th className="px-4 py-3">Khách hàng / Đơn hàng</th>
                  <th className="px-4 py-3">Kỳ / Mốc thanh toán</th>
                  <th className="px-4 py-3 text-right">Giá trị hóa đơn</th>
                  <th className="px-4 py-3 text-right">Đã thanh toán</th>
                  <th className="px-4 py-3">Hạn thanh toán</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3">Mã ERP</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {invoices.map((inv) => {
                  const isOverdue = isOverdueInvoice(inv);

                  return (
                    <tr key={inv.id} className="hover:bg-surface-subtle transition">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {inv.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{inv.account_name}</div>
                        <div className="text-xs text-ink-subtle">
                          Đơn hàng:{" "}
                          <Link
                            href={`/orders/${inv.order_id}`}
                            className="text-primary hover:underline"
                          >
                            {inv.order_code}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-ink">{inv.milestone || "Toàn bộ đơn hàng"}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink">
                        {inv.amount.toLocaleString("vi-VN")} đ
                        <div className="text-[11px] text-ink-subtle">
                          VAT: {inv.tax_amount.toLocaleString("vi-VN")} đ
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-medium ${
                            inv.paid_amount >= inv.amount
                              ? "text-success"
                              : inv.paid_amount > 0
                              ? "text-warning"
                              : "text-ink-subtle"
                          }`}
                        >
                          {inv.paid_amount.toLocaleString("vi-VN")} đ
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.due_date ? (
                          <div className={isOverdue ? "text-danger font-semibold text-xs" : "text-xs text-ink"}>
                            {inv.due_date}
                            {isOverdue && <div className="text-[10px]">⚠️ Quá hạn</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={inv.status} labels={INVOICE_STATUS} />
                          {inv.status === "DRAFT" && inv.reviewed_at && (
                            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                              ✓ Đã kiểm tra
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {inv.erp_ref ? (
                          <span className="font-mono text-xs font-semibold text-success">
                            {inv.erp_ref}
                          </span>
                        ) : (
                          <span className="text-ink-subtle italic">Chưa đẩy ERP</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="btn btn-ghost text-xs"
                        >
                          Chi tiết &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
