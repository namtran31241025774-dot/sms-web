import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, formatVnd, LEAD_STATUS, LEVEL, OPP_STAGE, ORDER_STATUS, ROLE_LABEL } from "@/lib/domain";
import { dashboard } from "@/lib/services/admin";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Card, CommandBar, CommandLink, CommandSep, Empty, Flash, Kpi, PageTitle, StatusBadge } from "@/components/ui";
import { Legend, SERIES, StackedColumns, TargetProgress } from "@/components/charts";
import { getForecastDashboard } from "@/lib/services/reports";
import { completeTaskAction, markReadAction } from "./actions";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  // Vai trò không làm việc với cơ hội vào thẳng màn hình công việc của mình, không thấy số liệu pipeline.
  if (user.role === "DELIVERY") redirect("/orders");
  if (user.role === "FINANCE") redirect("/invoices");
  if (user.role === "ADMIN") redirect("/admin");
  const sp = (await searchParams) as { ok?: string; error?: string };
  const d = dashboard(user.id);
  const stage = (s: string) => d.pipeline.find((p) => p.stage === s) ?? { n: 0, amount: 0 };
  const openStages = ["DEVELOP", "PROPOSE", "CLOSE"];
  const openAmount = openStages.reduce((s, k) => s + stage(k).amount, 0);
  const maxAmount = Math.max(1, ...openStages.map((k) => stage(k).amount), stage("WON").amount);
  const leadCount = (s: string) => d.leads.find((l) => l.status === s)?.n ?? 0;
  // Dự báo theo phạm vi: nhân viên kinh doanh xem cơ hội của mình, quản lý xem toàn bộ; vai trò khác không hiện.
  const forecast = user.role === "SALES_MANAGER" ? getForecastDashboard() : user.role === "SALES" ? getForecastDashboard({ owner_id: user.id }) : null;

  return (
    <>
      <CommandBar>
        {can(user.role, "lead.write") && <CommandLink href="/leads/new" icon="add">Lead mới</CommandLink>}
        <CommandLink href="/opportunities" icon="opportunity">Pipeline</CommandLink>
        <CommandSep />
        {can(user.role, "ai.review") && <CommandLink href="/ai-review" icon="sparkle">Kiểm duyệt AI</CommandLink>}
        {can(user.role, "approval.manager") && <CommandLink href="/approvals" icon="approval">Phê duyệt</CommandLink>}
      </CommandBar>
      <Flash sp={sp} />
      <PageTitle title={`Xin chào, ${user.name.split(" ").pop()}`} subtitle={`${ROLE_LABEL[user.role]} · Tổng quan hoạt động Sales`} icon="home" />

      <div className="grid gap-4 px-6 pb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon="opportunity" label="Pipeline đang mở" value={formatVnd(openAmount)} sub={`${openStages.reduce((s, k) => s + stage(k).n, 0)} opportunities`} href="/opportunities" />
          <Kpi icon="lead" label="Lead đang đánh giá" value={leadCount("OPEN") + leadCount("WORKING")} sub={`${leadCount("CONVERTED")} đã chuyển đổi · ${leadCount("DISQUALIFIED")} đã loại`} href="/leads" />
          <Kpi icon="sparkle" label="Đề xuất AI chờ duyệt" value={d.pendingAi} sub="Agent chỉ đề xuất, người quyết định" href="/ai-review" />
          <Kpi icon="invoice" label="Đã thu / đã phát hành" value={formatVnd(d.ar.paid)} sub={`trên ${formatVnd(d.ar.issued)}`} href="/invoices" />
        </div>

        {forecast && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title={`Tiến độ chỉ tiêu ${forecast.quarter.replace("-Q", " · Quý ")}`}>
              {forecast.target ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[34px] font-extrabold leading-10 text-brand-ink">
                        {Math.round(((forecast.wonInQuarter + forecast.weightedInQuarter) / forecast.target) * 100)}%
                      </div>
                      <div className="text-xs text-ink-3">dự kiến đạt so với {forecast.targetSource.toLowerCase()}</div>
                    </div>
                    <div className="text-right text-xs text-ink-3">Chỉ tiêu<br /><b className="text-sm text-ink">{formatVnd(forecast.target)}</b></div>
                  </div>
                  <div className="mt-4">
                    <TargetProgress a={forecast.wonInQuarter} b={forecast.weightedInQuarter} target={forecast.target} aLabel="Đã thắng" bLabel="Dự báo có trọng số" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-surface-2 p-3"><div className="flex items-center gap-1.5 text-xs text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.a }} />Đã thắng</div><b className="tabular-nums">{formatVnd(forecast.wonInQuarter)}</b></div>
                    <div className="rounded-xl bg-surface-2 p-3"><div className="flex items-center gap-1.5 text-xs text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.b }} />Dự báo có trọng số</div><b className="tabular-nums">{formatVnd(forecast.weightedInQuarter)}</b></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-3">Chưa đặt chỉ tiêu cho quý này.</p>
              )}
            </Card>
            <Card title="Doanh thu theo tháng chốt dự kiến" className="xl:col-span-2" actions={<Link href="/reports" className="link text-xs">Xem báo cáo</Link>}>
              <Legend items={[{ color: SERIES.a, label: "Đã thắng" }, { color: SERIES.b, label: "Dự báo có trọng số" }]} />
              <div className="mt-6">
                <StackedColumns
                  data={forecast.months.map((m) => ({ label: `${m.month.slice(5)}/${m.month.slice(2, 4)}`, a: m.won, b: m.weighted, note: `${m.count} cơ hội` }))}
                  aLabel="Đã thắng"
                  bLabel="Dự báo có trọng số"
                />
              </div>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Pipeline theo giai đoạn" className="xl:col-span-2">
            <div className="space-y-3">
              {[...openStages, "WON"].map((s) => {
                const v = stage(s);
                return (
                  <Link key={s} href={`/opportunities?stage=${s}`} className="grid grid-cols-[110px_1fr_150px] items-center gap-3 text-sm hover:opacity-80">
                    <span className="text-ink-2">{OPP_STAGE[s]}</span>
                    <span className="h-3 rounded-full bg-[#eef1f5]">
                      <span
                        className="block h-3 rounded-full"
                        style={{ width: `${Math.max(2, (v.amount / maxAmount) * 100)}%`, background: s === "WON" ? SERIES.b : SERIES.a }}
                      />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{formatVnd(v.amount)}</span>
                      <span className="ml-1 text-ink-3">({v.n})</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#f0f0f0] pt-3 text-xs text-ink-3">
              Đơn hàng:
              {d.orders.map((o) => (
                <span key={o.status}>
                  {ORDER_STATUS[o.status]} <b className="text-ink">{o.n}</b>
                </span>
              ))}
              <span className="ml-auto">Won ≠ Đã bàn giao ≠ Đã thanh toán — theo dõi riêng từng trạng thái</span>
            </div>
          </Card>

          <Card
            title="Thông báo"
            actions={
              d.notifications.some((n) => !n.is_read) && (
                <form action={markReadAction}>
                  <SubmitButton variant="subtle" size="sm">Đánh dấu đã đọc</SubmitButton>
                </form>
              )
            }
            pad={false}
          >
            {d.notifications.length ? (
              <ul>
                {d.notifications.map((n) => (
                  <li key={n.id} className="border-b border-[#f5f5f5] last:border-0">
                    <Link href={n.link ?? "/"} className="flex gap-2 px-4 py-2.5 text-sm hover:bg-[#f5f5f5]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`} />
                      <span className="min-w-0">
                        <span className={n.is_read ? "text-ink-2" : "font-semibold"}>{n.message}</span>
                        <span className="block text-xs text-ink-3">{formatDate(n.created_at, true)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="bell">Không có thông báo</Empty>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Cơ hội cần chú ý" className="xl:col-span-2" pad={false}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Opportunity</th>
                  <th>Account</th>
                  <th>Giai đoạn</th>
                  <th>Mức quan trọng</th>
                  <th>Rủi ro mở</th>
                </tr>
              </thead>
              <tbody>
                {d.atRisk.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="link" href={`/opportunities/${o.id}`}>{o.name}</Link>
                    </td>
                    <td>{o.account_name}</td>
                    <td><StatusBadge status={o.stage} labels={OPP_STAGE} /></td>
                    <td><StatusBadge status={o.importance} labels={LEVEL} /></td>
                    <td>{o.open_risks ? <Badge tone="danger">{o.open_risks}</Badge> : <span className="text-ink-3">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Việc của tôi" pad={false}>
            {d.tasks.length ? (
              <ul>
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 border-b border-[#f5f5f5] px-4 py-2 text-sm last:border-0">
                    <Icon name={t.source === "AI" ? "sparkle" : "task"} size={16} className="shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      {t.entity_type && t.entity_id ? (
                        <Link className="link" href={`/${t.entity_type === "opportunity" ? "opportunities" : `${t.entity_type}s`}/${t.entity_id}`}>{t.title}</Link>
                      ) : (
                        t.title
                      )}
                      <span className="block text-xs text-ink-3">Hạn {formatDate(t.due_date)}{t.source === "AI" && " · tạo bởi Agent"}</span>
                    </span>
                    <form action={completeTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton variant="subtle" size="sm" icon="check">Xong</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="task">Không có việc đang mở</Empty>
            )}
          </Card>
        </div>
        <p className="text-xs text-ink-3">
          Lead: {Object.entries(LEAD_STATUS).map(([k, v]) => `${v} ${leadCount(k)}`).join(" · ")}
        </p>
      </div>
    </>
  );
}
