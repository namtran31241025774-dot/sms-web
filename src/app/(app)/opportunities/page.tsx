import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatVnd, LEVEL, OPP_STAGE } from "@/lib/domain";
import { listOpportunities } from "@/lib/services/opportunities";
import { Icon } from "@/components/icons";
import { CommandBar, CommandLink, CommandSep, Empty, Flash, Grid, PageTitle, Persona, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Cơ hội bán hàng (Opportunities)" };

const COLUMNS = ["DEVELOP", "PROPOSE", "CLOSE", "WON", "LOST"] as const;
// Mỗi giai đoạn một tông nhạt cùng bộ màu với hệ thống; chấm màu và chữ cho biết giai đoạn, không chỉ dựa vào màu nền.
const STAGE_COLOR: Record<string, { bg: string; border: string; ink: string; dot: string }> = {
  DEVELOP: { bg: "#eef5fd", border: "#d3e5f8", ink: "#0f5aa3", dot: "#0f6cbd" },
  PROPOSE: { bg: "#f2f2fd", border: "#dcdcf7", ink: "#3f4fc7", dot: "#4f6bed" },
  CLOSE: { bg: "#fff7ec", border: "#f6dfbd", ink: "#9a5b06", dot: "#c97d0e" },
  WON: { bg: "#eefaf0", border: "#cde9d1", ink: "#0e700e", dot: "#107c10" },
  LOST: { bg: "#f5f7fa", border: "#e1e8f3", ink: "#667085", dot: "#a4acb9" },
};

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const user = await requirePermission('opp.read');
  const sp = (await searchParams) as { view?: string; stage?: string; ok?: string; error?: string };
  const view = sp.stage ? "list" : (sp.view ?? "board");
  const rows = listOpportunities({ stage: sp.stage, user });

  return (
    <>
      <CommandBar>
        <CommandLink href="/leads" icon="lead">Tạo từ Lead</CommandLink>
        <CommandSep />
        <CommandLink href="/opportunities?view=board" icon="waffle">Dạng bảng Kanban</CommandLink>
        <CommandLink href="/opportunities?view=list" icon="filter">Dạng danh sách</CommandLink>
        <CommandSep />
        <CommandLink href="/opportunities?view=list&stage=DEVELOP" icon="opportunity">Phát triển</CommandLink>
        <CommandLink href="/opportunities?view=list&stage=PROPOSE" icon="quote">Đề xuất</CommandLink>
        <CommandLink href="/opportunities?view=list&stage=CLOSE" icon="order">Tạo đơn</CommandLink>
        <CommandLink href="/opportunities?view=list&stage=WON" icon="checkCircle">Thành công</CommandLink>
        <CommandLink href="/opportunities?view=list&stage=LOST" icon="dismissCircle">Thất bại</CommandLink>
      </CommandBar>
      <Flash sp={sp} />
      <PageTitle
        title="Cơ hội bán hàng (Opportunities)"
        subtitle={
          sp.stage
            ? `Lọc theo giai đoạn: ${OPP_STAGE[sp.stage] ?? sp.stage} · ${rows.length} bản ghi`
            : "Quy trình phễu: Phát triển cơ hội → Đề xuất giải pháp → Tạo đơn hàng → Thành công / Thất bại"
        }
        icon="opportunity"
      />

      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto px-6 pb-8">
          {COLUMNS.map((stage) => {
            const items = rows.filter((o) => o.stage === stage);
            const total = items.reduce((s, o) => s + o.amount, 0);
            const c = STAGE_COLOR[stage] ?? STAGE_COLOR.LOST;
            return (
              <section key={stage} className="flex w-[264px] shrink-0 flex-col rounded-2xl border p-2 xl:w-auto xl:min-w-[230px] xl:flex-1" style={{ background: c.bg, borderColor: c.border }}>
                <header className="mb-2 rounded-xl bg-white/70 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: c.ink }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.dot }} />
                    <span className="truncate">{OPP_STAGE[stage]}</span>
                    <span className="ml-auto rounded-full bg-white px-1.5 text-[11px] font-semibold text-ink-2">{items.length}</span>
                  </div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums text-brand-ink">{formatVnd(total)}</div>
                </header>
                <div className="space-y-2 flex-1 overflow-y-auto max-h-[70vh]">
                  {items.map((o) => (
                    <Link
                      key={o.id}
                      href={`/opportunities/${o.id}`}
                      className="block rounded-md bg-surface p-3 shadow-[var(--shadow-2)] hover:shadow-[var(--shadow-16)] transition-all"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-semibold text-brand text-sm line-clamp-1">{o.name}</span>
                        {o.importance && <StatusBadge status={o.importance} labels={LEVEL} />}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-2 line-clamp-1">{o.account_name}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-bold tabular-nums text-ink-1">{formatVnd(o.amount)}</span>
                        <span className="flex items-center gap-1 text-[11px] text-ink-3">
                          <Icon name="calendar" size={12} /> {formatDate(o.close_date)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-[#f0f0f0] pt-2 text-[11px]">
                        <Persona name={o.owner_name} size={18} />
                        {stage === "DEVELOP" && (
                          <span className="text-ink-3 font-medium">
                            Checklist {[o.need_confirmed, o.solution_confirmed, o.stakeholders_confirmed, o.competitors_confirmed].filter(Boolean).length}/4
                          </span>
                        )}
                        {stage === "LOST" && o.lost_reason_code && (
                          <span className="text-danger font-medium line-clamp-1">{o.lost_reason_code}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {!items.length && <div className="px-2 py-6 text-center text-xs text-ink-3">Không có cơ hội</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="px-6 pb-8">
          <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
            {rows.length ? (
              <Grid>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên cơ hội</th>
                    <th>Doanh nghiệp (Account)</th>
                    <th>Giai đoạn</th>
                    <th className="text-right">Giá trị (₫)</th>
                    <th className="text-right">Ngân sách (₫)</th>
                    <th>Ngày chốt dự kiến</th>
                    <th>Mức quan trọng</th>
                    <th>Người phụ trách (AE)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td className="font-mono text-xs">{o.code}</td>
                      <td>
                        <Link className="link font-semibold" href={`/opportunities/${o.id}`}>
                          {o.name}
                        </Link>
                      </td>
                      <td>{o.account_name}</td>
                      <td>
                        <StatusBadge status={o.stage} labels={OPP_STAGE} />
                      </td>
                      <td className="text-right font-medium tabular-nums">{formatVnd(o.amount)}</td>
                      <td className="text-right tabular-nums text-ink-2">{formatVnd(o.budget)}</td>
                      <td>{formatDate(o.close_date)}</td>
                      <td>
                        {o.importance ? <StatusBadge status={o.importance} labels={LEVEL} /> : "—"}
                      </td>
                      <td>
                        <Persona name={o.owner_name} size={20} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Grid>
            ) : (
              <Empty icon="opportunity">Không có Cơ hội nào phù hợp</Empty>
            )}
          </div>
        </div>
      )}
    </>
  );
}
