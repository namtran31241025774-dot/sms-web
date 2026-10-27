import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { CommandBar, CommandLink, PageTitle, StatusBadge } from "@/components/ui";
import { ORDER_STATUS } from "@/lib/domain";
import { listOrders } from "@/lib/services/orders";

export default async function OrdersPage(props: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requirePermission('order.read');
  const q = searchParams.q?.trim() || "";
  const status = searchParams.status?.trim() || "";

  const orders = listOrders({
    user,
    search: q,
    status: status || undefined,
  });

  const statusFilters = [
    { label: "Tất cả", value: "" },
    { label: "Đã tạo", value: "ACTIVE" },
    { label: "Đang thực hiện", value: "IN_FULFILLMENT" },
    { label: "Hoàn tất bàn giao", value: "FULFILLED" },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/orders/new" icon="add">
          Tạo đơn hàng trực tiếp
        </CommandLink>
        <CommandLink href="/quotes" icon="quote">
          Báo giá được chấp thuận
        </CommandLink>
        <CommandLink href="/invoices" icon="invoice">
          Theo dõi hóa đơn
        </CommandLink>
      </CommandBar>

      <PageTitle
        icon="order"
        title="Quản lý Đơn hàng (FR-56 → FR-63)"
        subtitle="Theo dõi đơn hàng, khóa giá thương mại (BR-22), tiến độ triển khai (DEC-10), và lịch thanh toán (BR-11)"
      />

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke bg-surface-subtle px-6 py-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã đơn, khách hàng, cơ hội..."
            className="input w-64 text-sm"
          />
          {status && <input type="hidden" name="status" value={status} />}
          <button type="submit" className="btn btn-secondary text-xs">
            Tìm kiếm
          </button>
          {q && (
            <Link href={`/orders${status ? `?status=${status}` : ""}`} className="btn btn-ghost text-xs">
              Xóa tìm kiếm
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-1">
          {statusFilters.map((f) => (
            <Link
              key={f.value}
              href={`/orders?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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

      {/* Danh sách đơn hàng */}
      <div className="flex-1 overflow-auto p-6">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stroke p-12 text-center">
            <p className="text-sm text-ink-subtle">Không tìm thấy đơn hàng nào phù hợp điều kiện lọc.</p>
            <div className="mt-4 flex gap-2">
              <Link href="/quotes" className="btn btn-primary text-xs">
                Xem Báo giá được chấp thuận để tạo đơn
              </Link>
              <Link href="/orders/new" className="btn btn-secondary text-xs">
                Tạo đơn hàng trực tiếp
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stroke bg-surface shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stroke bg-surface-subtle text-xs font-semibold text-ink-subtle">
                <tr>
                  <th className="px-4 py-3">Mã đơn hàng</th>
                  <th className="px-4 py-3">Khách hàng / Doanh nghiệp</th>
                  <th className="px-4 py-3">Nguồn báo giá / Cơ hội</th>
                  <th className="px-4 py-3 text-right">Tổng giá trị</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-center">Khóa giá</th>
                  <th className="px-4 py-3 text-center">Đã lập HĐ / Đã thu</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {orders.map((o) => {
                  const totalVal = o.grand_total || o.total;

                  return (
                    <tr key={o.id} className="hover:bg-surface-hover transition">
                      <td className="px-4 py-3 font-semibold text-primary">
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.code}
                        </Link>
                        {o.is_manual === 1 && (
                          <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">
                            Thủ công
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {o.account_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-subtle">
                        {o.quote_code ? (
                          <div>Báo giá: {o.quote_code} {o.quote_version_no ? `(v${o.quote_version_no})` : ""}</div>
                        ) : (
                          <div>Đơn trực tiếp</div>
                        )}
                        {o.opportunity_code && (
                          <div>Cơ hội: {o.opportunity_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {totalVal.toLocaleString("vi-VN")} {o.currency}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={o.status} labels={ORDER_STATUS} />
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {o.price_locked_at ? (
                          <span className="text-emerald-600 font-medium">✓ Đã khóa giá</span>
                        ) : (
                          <span className="text-ink-subtle">Chưa khóa</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-ink-subtle">
                        <div>HĐ: {o.invoiced.toLocaleString("vi-VN")} ₫</div>
                        <div className={o.paid >= totalVal ? "text-emerald-600 font-semibold" : ""}>
                          Thu: {o.paid.toLocaleString("vi-VN")} ₫
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-subtle">
                        {new Date(o.created_at).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/orders/${o.id}`}
                          className="btn btn-secondary text-xs"
                        >
                          Chi tiết
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
