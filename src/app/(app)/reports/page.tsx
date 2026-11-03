import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPipelineFunnelReport } from "@/lib/services/reports";
import { all } from "@/lib/db";
import { formatVnd } from "@/lib/domain";
import { Card, CommandBar, CommandLink, PageTitle, Flash } from "@/components/ui";

export const metadata: Metadata = { title: "Báo cáo cơ hội và Dự báo doanh số" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    team_id?: string;
    owner_id?: string;
    from_date?: string;
    to_date?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  // Quyền xem báo cáo: SALES_MANAGER, SALES, ADMIN (FR-99)
  const canView = can(user.role, "report.funnel") || user.role === "ADMIN";
  if (!canView) {
    redirect("/?error=" + encodeURIComponent("Bạn không có quyền truy cập báo cáo phễu cơ hội"));
  }

  const teamId = sp.team_id ? Number(sp.team_id) : undefined;
  const ownerId = sp.owner_id ? Number(sp.owner_id) : undefined;

  const report = getPipelineFunnelReport({
    team_id: teamId,
    owner_id: ownerId,
    from_date: sp.from_date,
    to_date: sp.to_date,
  });

  const teams = all<{ id: number; name: string; code: string }>(
    "SELECT id, name, code FROM teams WHERE active = 1 ORDER BY name ASC",
  );

  const owners = all<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE role IN ('SALES', 'SALES_MANAGER') AND active = 1 ORDER BY name ASC",
  );

  // Link xuất CSV
  const queryParams = new URLSearchParams();
  if (sp.team_id) queryParams.set("team_id", sp.team_id);
  if (sp.owner_id) queryParams.set("owner_id", sp.owner_id);
  if (sp.from_date) queryParams.set("from_date", sp.from_date);
  if (sp.to_date) queryParams.set("to_date", sp.to_date);
  const exportHref = `/api/reports/funnel/export?${queryParams.toString()}`;

  return (
    <>
      <CommandBar>
        <CommandLink href={exportHref} icon="invoice">
          Xuất báo cáo CSV
        </CommandLink>
        <CommandLink href="/admin?tab=rbac" icon="settings">
          Xem phân quyền RBAC
        </CommandLink>
        <CommandLink href="/reports" icon="refresh">
          Làm mới
        </CommandLink>
        {can(user.role, "report.cashflow") && (
          <CommandLink href="/reports/cashflow" icon="money">
            Dòng tiền dự tính
          </CommandLink>
        )}
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title="Báo cáo phễu cơ hội và Dự báo doanh thu"
        subtitle="Tổng hợp giá trị thương vụ theo giai đoạn · Dự báo có trọng số theo giai đoạn · Phân bổ theo Sale Pod"
        icon="opportunity"
      />

      <div className="px-6 pb-12 space-y-6">
        {/* Bộ lọc báo cáo */}
        <Card title="Bộ lọc phân tích phễu bán hàng">
          <form method="GET" action="/reports" className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="label">Sale Pod phụ trách</label>
              <select name="team_id" defaultValue={sp.team_id ?? ""} className="select">
                <option value="">-- Tất cả nhóm bán hàng --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Nhân viên phụ trách</label>
              <select name="owner_id" defaultValue={sp.owner_id ?? ""} className="select">
                <option value="">-- Tất cả nhân viên --</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Từ ngày</label>
              <input
                type="date"
                name="from_date"
                defaultValue={sp.from_date ?? ""}
                className="input"
              />
            </div>

            <div className="flex items-end gap-2">
              <button type="submit" className="btn-secondary w-full">
                Xem báo cáo
              </button>
              <Link href="/reports" className="btn-ghost text-xs">
                Đặt lại
              </Link>
            </div>
          </form>
        </Card>

        {/* 5 Thẻ KPI Tổng hợp */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 bg-white border border-stroke rounded-lg shadow-sm">
            <div className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">Tổng số thương vụ</div>
            <div className="mt-2 text-2xl font-bold text-ink">{report.totalOpportunities}</div>
            <div className="mt-1 text-xs text-ink-3">Đang mở: {report.openOpportunities}</div>
          </div>

          <div className="p-4 bg-white border border-stroke rounded-lg shadow-sm">
            <div className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">Tổng giá trị Pipeline</div>
            <div className="mt-2 text-xl font-bold text-blue-700">{formatVnd(report.totalPipelineValue)}</div>
            <div className="mt-1 text-xs text-ink-3">Toàn bộ deal đang mở</div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm">
            <div className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider">
              Dự báo doanh thu
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-700">
              {formatVnd(report.weightedForecastRevenue)}
            </div>
            <div className="mt-1 text-xs text-emerald-800">Doanh thu có trọng số</div>
          </div>

          <div className="p-4 bg-white border border-stroke rounded-lg shadow-sm">
            <div className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">Doanh thu đã chốt (Won)</div>
            <div className="mt-2 text-xl font-bold text-ink">{formatVnd(report.wonValue)}</div>
            <div className="mt-1 text-xs text-ink-3">Thất bại: {formatVnd(report.lostValue)}</div>
          </div>

          <div className="p-4 bg-white border border-stroke rounded-lg shadow-sm">
            <div className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">Tỷ lệ chốt thắng</div>
            <div className="mt-2 text-2xl font-bold text-ink">{report.winRatePct}%</div>
            <div className="mt-1 text-xs text-ink-3">Trên các cơ hội đã đóng</div>
          </div>
        </div>

        {/* BẢNG 1: CHI TIẾT THEO GIAI ĐOẠN PHỄU (BR-14) */}
        <Card title="Phân tích cơ hội theo giai đoạn và Trọng số dự báo">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#fcfcfc] border-b border-stroke text-ink-2 font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Giai đoạn bán hàng</th>
                  <th className="px-4 py-2.5 text-center">Số lượng</th>
                  <th className="px-4 py-2.5 text-right">Tổng giá trị (VND)</th>
                  <th className="px-4 py-2.5 text-center">Xác suất chuyển đổi</th>
                  <th className="px-4 py-2.5 text-right">Dự báo doanh thu có trọng số (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {report.stages.map((st) => (
                  <tr key={st.stage} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <div>{st.stageName}</div>
                      <span className="font-mono text-[10px] text-ink-3">{st.stage}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold text-ink">{st.count}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink">
                      {formatVnd(st.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {st.probabilityPct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                      {formatVnd(st.weightedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#f8f9fa] border-t-2 border-stroke font-bold text-xs">
                <tr>
                  <td className="px-4 py-2.5 text-ink">TỔNG PIPELINE ĐANG MỞ</td>
                  <td className="px-4 py-2.5 text-center text-ink">{report.openOpportunities}</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">
                    {formatVnd(report.totalPipelineValue)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-ink-3">—</td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">
                    {formatVnd(report.weightedForecastRevenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* BẢNG 2: PHÂN BỔ THEO SALE POD VÀ NHÂN VIÊN */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Doanh thu phễu theo Sale Pod">
            {report.byTeam.length === 0 ? (
              <div className="text-zinc-500 text-xs italic">Chưa có dữ liệu theo nhóm</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#fcfcfc] border-b border-stroke text-ink-2 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Sale Pod</th>
                      <th className="px-3 py-2 text-center">Số deal</th>
                      <th className="px-3 py-2 text-right">Pipeline</th>
                      <th className="px-3 py-2 text-right">Dự báo</th>
                      <th className="px-3 py-2 text-right">Đã thắng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke">
                    {report.byTeam.map((t) => (
                      <tr key={t.teamCode} className="hover:bg-[#fafafa]">
                        <td className="px-3 py-2 font-medium text-ink">
                          <div>{t.teamName}</div>
                          <span className="text-[10px] text-ink-3 font-mono">{t.teamCode}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold">{t.oppCount}</td>
                        <td className="px-3 py-2 text-right text-blue-700 font-medium">
                          {formatVnd(t.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-bold">
                          {formatVnd(t.weightedForecast)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
                          {formatVnd(t.wonAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Doanh thu phễu theo Nhân viên kinh doanh">
            {report.byOwner.length === 0 ? (
              <div className="text-zinc-500 text-xs italic">Chưa có dữ liệu nhân viên</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#fcfcfc] border-b border-stroke text-ink-2 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Nhân viên</th>
                      <th className="px-3 py-2 text-center">Số deal</th>
                      <th className="px-3 py-2 text-right">Pipeline</th>
                      <th className="px-3 py-2 text-right">Dự báo</th>
                      <th className="px-3 py-2 text-right">Đã thắng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke">
                    {report.byOwner.map((o) => (
                      <tr key={o.ownerId} className="hover:bg-[#fafafa]">
                        <td className="px-3 py-2 font-medium text-ink">
                          <div>{o.ownerName}</div>
                          <span className="text-[10px] text-ink-3 font-mono">{o.ownerEmail}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold">{o.oppCount}</td>
                        <td className="px-3 py-2 text-right text-blue-700 font-medium">
                          {formatVnd(o.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-bold">
                          {formatVnd(o.weightedForecast)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
                          {formatVnd(o.wonAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
