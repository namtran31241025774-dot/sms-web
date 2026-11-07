import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Badge, CommandBar, CommandLink, PageTitle } from "@/components/ui";
import { QUOTE_STATUS } from "@/lib/domain";
import { checkExpiredQuotes, listQuotes } from "@/lib/services/quotes";

export default async function QuotesPage(props: {
  searchParams: Promise<{ q?: string; status?: string; expiredOnly?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requirePermission('quote.read');
  const q = searchParams.q?.trim() || "";
  const status = searchParams.status?.trim() || "";
  const expiredOnly = searchParams.expiredOnly === "1";

  // Tự động kiểm tra và cập nhật trạng thái các báo giá đã hết hạn (FR-53)
  checkExpiredQuotes();

  const quotes = listQuotes({
    user,
    search: q,
    status: status || undefined,
    expiredOnly,
  });

  const statusFilters = [
    { label: "Tất cả", value: "" },
    { label: "Nháp", value: "DRAFT" },
    { label: "Chờ duyệt giá", value: "PENDING_APPROVAL" },
    { label: "Đã duyệt", value: "APPROVED" },
    { label: "Đã gửi khách", value: "SENT" },
    { label: "Khách chấp thuận", value: "ACCEPTED" },
    { label: "Khách từ chối", value: "REJECTED" },
    { label: "Đã thay thế", value: "SUPERSEDED" },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/quotes/new" icon="add">
          Tạo báo giá mới
        </CommandLink>
        <CommandLink href="/opportunities" icon="opportunity">
          Xem cơ hội bán hàng
        </CommandLink>
      </CommandBar>

      <PageTitle
        icon="quote"
        title="Danh sách Báo giá và Phiên bản"
        subtitle="Quản lý báo giá, kiểm soát chiết khấu, hiệu lực và phiên bản thương lượng"
      />

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke bg-surface-subtle px-6 py-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã, khách hàng, cơ hội..."
            className="input w-64 text-sm"
          />
          <button type="submit" className="btn btn-secondary text-xs">
            Tìm kiếm
          </button>
          {q && (
            <Link href="/quotes" className="text-xs text-ink-3 hover:underline">
              Xóa tìm kiếm
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-1">
          {statusFilters.map((sf) => {
            const active = (!status && !sf.value) || status === sf.value;
            return (
              <Link
                key={sf.value}
                href={`/quotes?status=${sf.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-brand text-white"
                    : "bg-surface text-ink-3 hover:bg-neutral-light hover:text-ink"
                }`}
              >
                {sf.label}
              </Link>
            );
          })}
          <Link
            href={`/quotes?expiredOnly=1${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              expiredOnly
                ? "bg-danger text-white"
                : "bg-surface text-ink-3 hover:bg-neutral-light hover:text-danger"
            }`}
          >
            Quá hạn hiệu lực
          </Link>
        </div>
      </div>

      {/* Bảng danh sách */}
      <div className="flex-1 p-6">
        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stroke py-16 text-center">
            <div className="text-base font-semibold text-ink">Chưa tìm thấy báo giá nào</div>
            <div className="mt-1 text-sm text-ink-3">
              Hãy chọn cơ hội ở giai đoạn &quot;Đề xuất giải pháp&quot; để lập báo giá mới hoặc điều chỉnh bộ lọc.
            </div>
            <div className="mt-4">
              <Link href="/quotes/new" className="btn btn-primary text-sm">
                + Lập báo giá mới
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-2)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stroke bg-surface-subtle text-xs font-semibold text-ink-3">
                <tr>
                  <th className="px-4 py-3">Mã báo giá</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Cơ hội</th>
                  <th className="px-4 py-3">Phiên bản</th>
                  <th className="px-4 py-3 text-right">Tổng tiền</th>
                  <th className="px-4 py-3 text-center">Chiết khấu max</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Hiệu lực đến</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {quotes.map((quote) => {
                  const isExpired = quote.valid_until && quote.valid_until < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={quote.id} className="hover:bg-neutral-light/50">
                      <td className="px-4 py-3 font-semibold text-brand">
                        <Link href={`/quotes/${quote.id}`} className="hover:underline">
                          {quote.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link href={`/accounts/${quote.account_id}`} className="hover:underline">
                          {quote.account_name || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-3">
                        <Link href={`/opportunities/${quote.opportunity_id}`} className="hover:underline">
                          {quote.opportunity_code || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand">
                          v{quote.revision}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {quote.total.toLocaleString("vi-VN")} {quote.currency}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {quote.max_discount_pct > 0 ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              quote.max_discount_pct > 10
                                ? "bg-warning/10 text-warning"
                                : "bg-neutral-light text-ink"
                            }`}
                          >
                            {quote.max_discount_pct}%
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">0%</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            quote.status === "APPROVED" || quote.status === "ACCEPTED"
                              ? "success"
                              : quote.status === "PENDING_APPROVAL"
                              ? "warning"
                              : quote.status === "SENT"
                              ? "brand"
                              : quote.status === "REJECTED"
                              ? "danger"
                              : "neutral"
                          }
                        >
                          {QUOTE_STATUS[quote.status] || quote.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {quote.valid_until ? (
                          <span className={isExpired && quote.status !== "ACCEPTED" ? "font-semibold text-danger" : "text-ink-3"}>
                            {quote.valid_until} {isExpired && quote.status !== "ACCEPTED" && "(Hết hạn)"}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="btn btn-secondary text-xs"
                        >
                          Xem chi tiết
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
