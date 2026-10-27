import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { LEAD_SOURCE, LEAD_STATUS } from "@/lib/domain";
import { settingNumber, users } from "@/lib/services/core";
import { listLeads, listTags } from "@/lib/services/leads";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, CommandBar, CommandLink, CommandSep, Empty, Flash, Grid, PageTitle, Persona, StatusBadge, cx } from "@/components/ui";
import { RatingBadge } from "@/components/customers/rating-badge";
import { TagList } from "@/components/customers/tags";
import { LeadFilterBar } from "@/components/customers/lead-filter-bar";
import { bulkConvertAction, restoreLeadAction } from "./actions";

export const metadata: Metadata = { title: "Leads" };

const VIEWS = [
  { key: "", label: "Lead đang mở" },
  { key: "all", label: "Tất cả Lead" },
  { key: "HOT", label: "Nóng 🔥" },
  { key: "WARM", label: "Ấm ⚡" },
  { key: "COLD", label: "Lạnh ❄️" },
  { key: "CONVERTED", label: "Đã chuyển đổi" },
  { key: "DISQUALIFIED", label: "Đã loại" },
  { key: "trash", label: "Thùng rác 🗑️" },
];

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const user = await requirePermission('lead.read');
  const sp = (await searchParams) as {
    view?: string;
    q?: string;
    source?: string;
    tag?: string;
    ok?: string;
    error?: string;
  };
  const view = sp.view ?? "";

  const isRatingView = view === "HOT" || view === "WARM" || view === "COLD";
  const rows = listLeads({
    user,
    view: view === "trash" ? "trash" : undefined,
    status: !isRatingView && view && view !== "all" && view !== "trash" ? view : undefined,
    rating: isRatingView ? view : undefined,
    source: sp.source,
    tag_id: sp.tag ? Number(sp.tag) : undefined,
    q: sp.q,
  }).filter((l) => (view === "" ? l.status === "OPEN" || l.status === "WORKING" : true));

  const threshold = settingNumber("bant_threshold") || 60;
  const aes = [...users("SALES"), ...users("SALES_MANAGER")];
  const allTags = listTags();

  return (
    <>
      <CommandBar>
        <CommandLink href="/leads/new" icon="add">Mới</CommandLink>
        <CommandLink href="/leads/import" icon="copy">Nhập từ CSV</CommandLink>
        <CommandLink href={`/leads?view=${view}`} icon="refresh">Làm mới</CommandLink>
        <CommandSep />
        {view !== "trash" && (
          <button type="submit" form="bulk" className="cmd">
            <Icon name="arrowRight" size={18} />
            Chuyển đổi hàng loạt
          </button>
        )}
      </CommandBar>
      <Flash sp={sp} />
      <PageTitle
        title={view === "trash" ? "Leads (Thùng rác)" : "Leads"}
        subtitle="Quản lý khách hàng tiềm năng · tạo, chuẩn hóa, phân loại, kiểm tra trùng"
        icon="lead"
      />

      <div className="px-6 pb-8">
        {/* Bộ lọc theo view */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/leads?view=${v.key}`}
              className={cx(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                view === v.key
                  ? "border-brand bg-brand-tint font-semibold text-brand"
                  : "border-stroke bg-surface hover:bg-[#f5f5f5]",
              )}
            >
              {v.label}
            </Link>
          ))}
          {sp.q && (
            <span className="text-sm text-ink-3">
              Kết quả cho “{sp.q}” · <Link className="link" href="/leads">Xóa tìm kiếm</Link>
            </span>
          )}
        </div>

        {/* Bộ lọc nâng cao: nguồn và tags */}
        <LeadFilterBar
          currentSource={sp.source ?? ""}
          currentTag={sp.tag ?? ""}
          sources={LEAD_SOURCE}
          tags={allTags}
        />

        <form id="bulk" action={bulkConvertAction} className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
          {view !== "trash" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2 text-sm">
              <span className="text-ink-3">Chuyển đổi Lead đã chọn (BANT ≥ {threshold}) cho AE:</span>
              <select name="owner_id" className="select !w-56">
                {aes.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <SubmitButton size="sm" icon="arrowRight">Chuyển đổi</SubmitButton>
              <span className="ml-auto text-xs text-ink-3">{rows.length} bản ghi</span>
            </div>
          )}

          {rows.length ? (
            <Grid>
              <thead>
                <tr>
                  {view !== "trash" && <th className="w-10"></th>}
                  <th>Công ty & Chủ đề</th>
                  <th>Người liên hệ</th>
                  <th>Phân loại</th>
                  <th>Nguồn</th>
                  <th>BANT</th>
                  <th>Trạng thái</th>
                  <th>Phụ trách</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    {view !== "trash" && (
                      <td>
                        {(l.status === "OPEN" || l.status === "WORKING") && (
                          <input type="checkbox" name="ids" value={l.id} aria-label={`Chọn ${l.company_name}`} />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="font-semibold">
                        <Link className="link" href={`/leads/${l.id}`}>{l.company_name}</Link>
                        {!!l.duplicate_flag && (
                          <span className="ml-2"><Badge tone="warning">Có thể trùng</Badge></span>
                        )}
                      </div>
                      {l.topic && <span className="block text-xs text-ink-3">{l.topic}</span>}
                      {l.tags && l.tags.length > 0 && (
                        <div className="mt-1"><TagList tags={l.tags} /></div>
                      )}
                    </td>
                    <td>
                      {l.contact_name}
                      <span className="block text-xs text-ink-3">{l.contact_title ?? l.email ?? ""}</span>
                    </td>
                    <td>
                      <RatingBadge rating={l.rating} />
                    </td>
                    <td>{LEAD_SOURCE[l.source] ?? l.source}</td>
                    <td>
                      <span className={cx("font-semibold tabular-nums", l.bant_score >= threshold ? "text-success" : "text-ink-2")}>
                        {l.bant_score}
                      </span>
                      <span className="text-ink-3">/100</span>
                    </td>
                    <td><StatusBadge status={l.status} labels={LEAD_STATUS} /></td>
                    <td><Persona name={l.owner_name} size={24} /></td>
                    <td>
                      {view === "trash" ? (
                        <form action={restoreLeadAction}>
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" className="text-xs text-brand hover:underline font-medium">
                            Khôi phục
                          </button>
                        </form>
                      ) : (
                        <Link className="text-xs text-brand hover:underline" href={`/leads/${l.id}`}>
                          Xem chi tiết
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Grid>
          ) : (
            <Empty icon="lead">Không có Lead nào trong dạng xem này</Empty>
          )}
        </form>
      </div>
    </>
  );
}
