import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { cashflowForecast } from "@/lib/services/cashflow";
import { Card, CommandBar, CommandLink, Empty, Grid, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Dòng tiền dự tính" };

const KIND = { INVOICE: "Hóa đơn chưa thu", BILLING_SCHEDULE: "Lịch lập hóa đơn", UNBILLED_ORDER: "Đơn hàng chưa lập hóa đơn" } as const;

export default async function CashflowPage() {
  const user = await requireUser();
  // Vai trò được xem do nhóm chốt (C3), cấu hình qua SMS_CASHFLOW_ROLES; mặc định không ai xem được.
  if (!can(user.role, "report.cashflow")) redirect("/reports");
  const f = cashflowForecast(user);
  const peak = Math.max(1, ...f.months.map((m) => m.total));

  return (
    <>
      <CommandBar>
        <CommandLink href="/reports" icon="arrowLeft">Báo cáo và Dự báo</CommandLink>
      </CommandBar>
      <PageTitle icon="money" title="Dòng tiền dự tính" subtitle="Tiền dự kiến thu theo tháng từ hóa đơn, lịch lập hóa đơn và đơn hàng chưa lập hóa đơn" />
      <div className="space-y-4 px-6 py-4 pb-10">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card><div className="text-xs text-ink-3">Tổng dự kiến thu</div><div className="mt-1 text-xl font-semibold tabular-nums">{formatVnd(f.total)}</div></Card>
          <Card><div className="text-xs text-ink-3">Số tháng có khoản thu</div><div className="mt-1 text-xl font-semibold tabular-nums">{f.months.length}</div></Card>
          <Card><div className="text-xs text-ink-3">Khoản chưa có ngày thu</div><div className="mt-1 text-xl font-semibold tabular-nums">{formatVnd(f.undated.reduce((s, e) => s + e.amount, 0))}</div></Card>
        </div>

        <Card title="Theo tháng" pad={false}>
          {f.months.length ? (
            <ul className="divide-y divide-[#f0f0f0]">
              {f.months.map((m) => (
                <li key={m.month} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="w-20 font-semibold tabular-nums">{m.month.slice(5)}/{m.month.slice(0, 4)}</span>
                    <div className="h-2 flex-1 rounded bg-[#f0f0f0]"><div className="h-2 rounded bg-brand" style={{ width: `${(m.total / peak) * 100}%` }} /></div>
                    <span className="w-40 text-right font-semibold tabular-nums">{formatVnd(m.total)}</span>
                  </div>
                  <div className="mt-1 pl-20 text-xs text-ink-3">
                    {m.entries.map((e) => `${KIND[e.kind]} ${e.code}: ${formatVnd(e.amount)}`).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="money">Chưa có khoản thu nào có ngày dự kiến</Empty>
          )}
        </Card>

        {f.undated.length > 0 && (
          <Card title="Chưa có ngày thu" pad={false}>
            <Grid>
              <thead><tr><th>Loại</th><th>Mã</th><th className="text-right">Số tiền</th></tr></thead>
              <tbody>
                {f.undated.map((e) => (
                  <tr key={`${e.kind}-${e.id}`}><td>{KIND[e.kind]}</td><td>{e.code}</td><td className="text-right tabular-nums">{formatVnd(e.amount)}</td></tr>
                ))}
              </tbody>
            </Grid>
          </Card>
        )}

        <p className="text-xs text-ink-3">
          {f.limitation}
          {f.excludedCurrencies.length > 0 && ` Ngoại tệ không cộng vào tổng: ${f.excludedCurrencies.join(", ")}.`}
          {" "}Chưa tính các cơ hội đang trong phễu bán hàng.
        </p>
      </div>
    </>
  );
}
