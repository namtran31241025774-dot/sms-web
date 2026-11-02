import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { DISQUALIFY_REASONS, formatDate, LEAD_SOURCE, LEAD_STATUS } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { listRuns, listSuggestions } from "@/lib/services/ai-review";
import { activitiesFor, auditTrail, settingNumber, users } from "@/lib/services/core";
import { conversionCandidates, findDuplicates, getLead, listTags } from "@/lib/services/leads";
import { SubmitButton } from "@/components/client";
import { AgentRuns, AuditTrail, SALES_STAGES, SuggestionSummary, Timeline } from "@/components/record";
import {
  Card, CommandAction, CommandBar, CommandLink, CommandSep, Flash, FormField, HeaderField, MessageBar, PageTitle, Persona, ProcessFlow, StatusBadge, Tabs, cx,
} from "@/components/ui";
import { RatingBadge } from "@/components/customers/rating-badge";
import { QualificationPanel } from "@/components/qualify";
import { BantQualificationView } from "@/components/bant-qualification-view";
import { get } from "@/lib/db";
import {
  addLeadActivityAction,
  approveMergeAction,
  bantAction,
  convertAction,
  disqualifyAction,
  reactivateAction,
  rejectMergeAction,
  requestMergeAction,
  restoreLeadAction,
  runQualificationAction,
  softDeleteLeadAction,
  updateLeadAction,
} from "../actions";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">): Promise<Metadata> {
  const lead = getLead(Number((await params).id), await requirePermission('lead.read'));
  return { title: lead?.company_name ?? "Lead" };
}

export default async function LeadPage({ params, searchParams }: PageProps<"/leads/[id]">) {
  const user = await requirePermission('lead.read');
  const leadId = Number((await params).id);
  const sp = (await searchParams) as { tab?: string; ok?: string; error?: string };
  const lead = getLead(leadId, user);
  if (!lead) notFound();

  const tab = sp.tab ?? "summary";
  const open = (lead.status === "OPEN" || lead.status === "WORKING") && !lead.deleted_at;
  const canWrite = can(user.role, "lead.write");
  const threshold = settingNumber("bant_threshold") || 60;
  const dups = findDuplicates(lead, lead.id);
  const duplicateLeads = dups.filter((d) => d.kind === "LEAD");
  const suggestions = listSuggestions({ entityType: "lead", entityId: lead.id });
  const pending = suggestions.filter((s) => s.status === "PENDING_REVIEW");
  const pendingMerge = get<{
    id: number;
    reason: string;
    payload_json: string;
    requested_by_name: string;
    created_at: string;
  }>(
    `SELECT a.id, a.reason, a.payload_json, u.name as requested_by_name, a.created_at
     FROM approvals a
     LEFT JOIN users u ON u.id = a.requested_by
     WHERE a.kind = 'MERGE' AND a.status = 'PENDING' AND a.entity_id = ?`,
    lead.id,
  );
  const owners = [...users("SALES"), ...users("SALES_MANAGER")];
  const cand = conversionCandidates(lead);
  const activities = activitiesFor("lead", lead.id);
  const allTags = listTags();
  const leadTagIds = new Set((lead.tags || []).map((t) => t.id));
  const base = `/leads/${lead.id}`;

  return (
    <>
      <CommandBar>
        {open && canWrite && (
          <button type="submit" form="lead-form" className="cmd">
            Lưu
          </button>
        )}
        <CommandLink href="/leads" icon="arrowLeft">Danh sách</CommandLink>
        <CommandSep />
        {open && can(user.role, "ai.run") && (
          <CommandAction action={runQualificationAction} fields={{ id: lead.id }} icon="sparkle">
            Chạy Qualification Agent
          </CommandAction>
        )}
        {open && canWrite && <CommandLink href={`${base}?tab=summary#qualify`} icon="arrowRight">Chuyển đổi / Loại</CommandLink>}
        {lead.status === "DISQUALIFIED" && canWrite && (
          <CommandAction action={reactivateAction} fields={{ id: lead.id }} icon="refresh">Tái kích hoạt</CommandAction>
        )}
        {lead.deleted_at && canWrite && (
          <CommandAction action={restoreLeadAction} fields={{ id: lead.id }} icon="refresh">Khôi phục Lead</CommandAction>
        )}
        {!lead.deleted_at && canWrite && (
          <CommandAction action={softDeleteLeadAction} fields={{ id: lead.id }} icon="delete">Chuyển vào thùng rác</CommandAction>
        )}
        {lead.converted_opportunity_id && (
          <CommandLink href={`/opportunities/${lead.converted_opportunity_id}`} icon="opportunity">Mở Opportunity</CommandLink>
        )}
      </CommandBar>
      <Flash sp={sp} />

      {lead.deleted_at && (
        <div className="mx-6 mt-3">
          <MessageBar intent="warning">
            Lead này đang nằm trong thùng rác (đã xóa mềm lúc {formatDate(lead.deleted_at, true)}). Hãy bấm &quot;Khôi phục Lead&quot; trên thanh lệnh để kích hoạt lại.
          </MessageBar>
        </div>
      )}

      {lead.merged_into_lead_id && (
        <div className="mx-6 mt-3">
          <MessageBar intent="info">
            Lead này đã được hợp nhất vào <Link className="link font-bold" href={`/leads/${lead.merged_into_lead_id}`}>Lead #{lead.merged_into_lead_id}</Link>.
          </MessageBar>
        </div>
      )}

      <PageTitle
        icon="lead"
        title={lead.company_name}
        subtitle={`Lead · ${lead.contact_name}${lead.contact_title ? ` – ${lead.contact_title}` : ""}`}
        right={
          <>
            <HeaderField label="Phân loại">
              <RatingBadge rating={lead.rating} />
            </HeaderField>
            <HeaderField label="Điểm BANT">
              <span className={lead.bant_score >= threshold ? "text-success" : ""}>{lead.bant_score}</span>
              <span className="text-sm font-normal text-ink-3">/100</span>
            </HeaderField>
            <HeaderField label="Trạng thái"><StatusBadge status={lead.status} labels={LEAD_STATUS} /></HeaderField>
            <HeaderField label="Nguồn">{LEAD_SOURCE[lead.source] ?? lead.source}</HeaderField>
            <HeaderField label="Phụ trách"><Persona name={lead.owner_name} size={24} /></HeaderField>
          </>
        }
      />
      <ProcessFlow stages={SALES_STAGES} current={lead.status === "CONVERTED" ? "DEVELOP" : "QUALIFY"} lost={lead.status === "DISQUALIFIED"} />

      <div className="space-y-2 px-6">
        {pendingMerge && (
          <MessageBar intent="info" title="Có yêu cầu hợp nhất đang chờ Quản lý kinh doanh duyệt:">
            <div className="flex flex-col gap-2">
              <div className="text-xs">
                {pendingMerge.reason} (Người yêu cầu: {pendingMerge.requested_by_name || "Nhân viên kinh doanh"})
              </div>
              {can(user.role, "lead.merge.approve") && (
                <div className="flex items-center gap-2 pt-1">
                  <form action={approveMergeAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={pendingMerge.id} />
                    <input name="comment" placeholder="Ý kiến duyệt..." className="input !h-7 !py-0 text-xs" />
                    <SubmitButton size="sm" variant="primary">Duyệt hợp nhất</SubmitButton>
                  </form>
                  <form action={rejectMergeAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={pendingMerge.id} />
                    <input name="comment" placeholder="Lý do từ chối..." required className="input !h-7 !py-0 text-xs" />
                    <SubmitButton size="sm" variant="danger">Từ chối</SubmitButton>
                  </form>
                </div>
              )}
            </div>
          </MessageBar>
        )}
        {dups.length > 0 && (
          <MessageBar intent="warning" title="Phát hiện trùng lặp:">
            <div>
              {dups.map((d, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  {d.kind === "LEAD" ? <Link className="link" href={`/leads/${d.id}`}>{d.label}</Link> : d.kind === "ACCOUNT" ? <Link className="link" href={`/accounts/${d.id}`}>{d.label}</Link> : d.label} ({d.reason})
                </span>
              ))}
              . Hệ thống không tự gộp — hãy kiểm tra và đề nghị hợp nhất nếu cần.
            </div>

            {duplicateLeads.length > 0 && open && canWrite && (
              <form action={requestMergeAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2">
                <input type="hidden" name="id" value={lead.id} />
                <span className="text-xs font-semibold">Đề nghị hợp nhất vào Lead:</span>
                <select name="target_id" className="select !h-7 !py-0 text-xs" required defaultValue={duplicateLeads[0].id}>
                  {duplicateLeads.map((dl) => (
                    <option key={dl.id} value={dl.id}>#{dl.id} - {dl.label}</option>
                  ))}
                </select>
                <input name="reason" placeholder="Lý do hợp nhất..." className="input !h-7 !py-0 text-xs" defaultValue="Trùng lặp thông tin khách hàng" />
                <SubmitButton size="sm" variant="primary">Gửi duyệt hợp nhất</SubmitButton>
              </form>
            )}
          </MessageBar>
        )}
        {pending.length > 0 && (
          <MessageBar intent="info" title={`${pending.length} đề xuất từ Agent đang chờ duyệt.`} action={<Link className="link whitespace-nowrap text-sm" href="/ai-review">Mở Kiểm duyệt AI</Link>}>
            {pending.map((p) => p.title).join(" · ")}
          </MessageBar>
        )}
        {lead.status === "DISQUALIFIED" && <MessageBar intent="warning" title="Lead đã bị loại:">{lead.disqualify_reason}</MessageBar>}
      </div>

      <Tabs
        base={base}
        current={tab}
        tabs={[
          { key: "summary", label: "Tóm tắt" },
          { key: "activities", label: "Hoạt động", count: activities.length },
          { key: "agent", label: "Agent và nhật ký", count: suggestions.length },
        ]}
      />

      <div className="px-6 py-4 pb-10">
        {tab === "summary" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Thông tin Lead">
              <form id="lead-form" action={updateLeadAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={lead.id} />
                <fieldset disabled={!open || !canWrite} className="contents">
                  <FormField label="Tên công ty" required>
                    <input name="company_name" defaultValue={lead.company_name} className="input" required />
                  </FormField>
                  <FormField label="Ngành">
                    <input name="industry" defaultValue={lead.industry ?? ""} className="input" />
                  </FormField>
                  <FormField label="Chủ đề / Nhu cầu" className="md:col-span-2">
                    <input name="topic" defaultValue={lead.topic ?? ""} className="input" placeholder="Nhu cầu chính..." />
                  </FormField>
                  <FormField label="Người liên hệ" required>
                    <input name="contact_name" defaultValue={lead.contact_name} className="input" required />
                  </FormField>
                  <FormField label="Chức danh">
                    <input name="contact_title" defaultValue={lead.contact_title ?? ""} className="input" />
                  </FormField>
                  <FormField label="Email">
                    <input name="email" type="email" defaultValue={lead.email ?? ""} className="input" />
                  </FormField>
                  <FormField label="Điện thoại">
                    <input name="phone" defaultValue={lead.phone ?? ""} className="input" />
                  </FormField>
                  <FormField label="Địa chỉ" className="md:col-span-2" hint={lead.address_normalized && lead.address_normalized !== lead.address ? `Chuẩn hóa: ${lead.address_normalized}` : undefined}>
                    <input name="address" defaultValue={lead.address ?? ""} className="input" />
                  </FormField>
                  <FormField label="Người phụ trách">
                    <select name="owner_id" defaultValue={lead.owner_id ?? ""} className="select">
                      {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Tạo lúc">
                    <input disabled value={formatDate(lead.created_at, true)} className="input" />
                  </FormField>

                  {/* FR-07: Tags */}
                  {allTags.length > 0 && (
                    <FormField label="Nhãn (Tags)" className="md:col-span-2">
                      <div className="flex flex-wrap gap-2 pt-1">
                        {allTags.map((t) => (
                          <label key={t.id} className="inline-flex items-center gap-1.5 rounded border border-stroke px-2 py-0.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              name="tag_ids"
                              value={t.id}
                              defaultChecked={leadTagIds.has(t.id)}
                              className="accent-[var(--brand)]"
                            />
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </FormField>
                  )}

                  <FormField label="Ghi chú" className="md:col-span-2">
                    <textarea name="notes" defaultValue={lead.notes ?? ""} className="textarea" />
                  </FormField>
                </fieldset>
                {open && canWrite && (
                  <div className="md:col-span-2">
                    <SubmitButton icon="save">Lưu thông tin</SubmitButton>
                  </div>
                )}
              </form>
            </Card>

            <div className="space-y-4">
              {/* Slot bàn giao cho WP-03 */}
              <QualificationPanel leadId={lead.id} />

              {/* Đánh giá chuẩn BANT 4 tiêu chí và Khung quan sát Qualification Agent */}
              <BantQualificationView
                lead={lead}
                threshold={threshold}
                suggestions={suggestions}
                runs={listRuns({ entityType: "lead", entityId: lead.id })}
                canWrite={open && canWrite}
                canReviewAi={can(user.role, "ai.review")}
                bantAction={bantAction}
              />

              {open && can(user.role, "lead.convert") && (
                <Card title="Chuyển đổi (Qualify → Develop)">
                  <div id="qualify" />
                  {lead.bant_score < threshold && (
                    <div className="mb-3">
                      <MessageBar intent="warning">BANT {lead.bant_score}/100 chưa đạt ngưỡng {threshold} — chưa thể chuyển đổi.</MessageBar>
                    </div>
                  )}
                  <form action={convertAction} className="space-y-3">
                    <input type="hidden" name="id" value={lead.id} />
                    <fieldset className="space-y-1.5">
                      <legend className="label">Account</legend>
                      {cand.accounts.map((a, i) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm">
                          <input type="radio" name="account" value={a.id} defaultChecked={i === 0} className="accent-[var(--brand)]" />
                          Dùng lại <Link className="link" href={`/accounts/${a.id}`}>{a.name}</Link> <span className="text-xs text-ink-3">({a.reason})</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="account" value="new" defaultChecked={!cand.accounts.length} className="accent-[var(--brand)]" />
                        Tạo Account mới “{lead.company_name}”
                      </label>
                    </fieldset>
                    <fieldset className="space-y-1.5">
                      <legend className="label">Contact</legend>
                      {cand.contacts.map((c, i) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <input type="radio" name="contact" value={c.id} defaultChecked={i === 0} className="accent-[var(--brand)]" />
                          Dùng lại {c.full_name} <span className="text-xs text-ink-3">({c.account_name})</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="contact" value="new" defaultChecked={!cand.contacts.length} className="accent-[var(--brand)]" />
                        Tạo Contact mới “{lead.contact_name}”
                      </label>
                    </fieldset>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <FormField label="Tên Opportunity" className="md:col-span-2">
                        <input name="opportunity_name" defaultValue={`${lead.company_name} – Sales Cloud`} className="input" />
                      </FormField>
                      <FormField label="AE nhận Opportunity" required>
                        <select name="owner_id" className="select" defaultValue={owners.find((o) => o.id !== lead.owner_id)?.id}>
                          {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Giá trị dự kiến (₫)"><input name="amount" inputMode="numeric" className="input" placeholder="0" /></FormField>
                      <FormField label="Ngày dự kiến chốt"><input name="close_date" type="date" className="input" /></FormField>
                    </div>
                    <SubmitButton variant="primary" icon="arrowRight">Chuyển đổi</SubmitButton>
                  </form>
                </Card>
              )}

              {open && can(user.role, "lead.disqualify") && (
                <Card title="Loại Lead (Disqualify)">
                  <form action={disqualifyAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <FormField label="Lý do" required>
                      <select name="reason" required className="select" defaultValue="">
                        <option value="" disabled>Chọn lý do…</option>
                        {DISQUALIFY_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Diễn giải"><input name="reason_note" className="input" /></FormField>
                    <div className="md:col-span-2">
                      <SubmitButton variant="danger" icon="dismissCircle">Loại Lead</SubmitButton>
                      <span className="ml-3 text-xs text-ink-3">Lịch sử được giữ nguyên; có thể tái kích hoạt.</span>
                    </div>
                  </form>
                </Card>
              )}
            </div>
          </div>
        )}

        {tab === "activities" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Ghi nhận hoạt động">
              <form action={addLeadActivityAction} className="space-y-3">
                <input type="hidden" name="id" value={lead.id} />
                <FormField label="Loại">
                  <select name="type" className="select">
                    <option value="NOTE">Ghi chú</option>
                    <option value="CALL">Cuộc gọi</option>
                    <option value="EMAIL">Email phản hồi từ khách</option>
                    <option value="MEETING">Cuộc họp</option>
                  </select>
                </FormField>
                <FormField label="Tiêu đề" required><input name="subject" required className="input" /></FormField>
                <FormField label="Nội dung"><textarea name="body" className="textarea" /></FormField>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="run_agent" defaultChecked /> Nếu là email phản hồi: kích hoạt Agent đánh giá lại
                </label>
                <SubmitButton variant="primary" icon="add" className={cx(!canWrite && "hidden")}>Thêm</SubmitButton>
              </form>
            </Card>
            <Card title="Dòng thời gian" className="xl:col-span-2">
              <Timeline items={activities} />
            </Card>
          </div>
        )}

        {tab === "agent" && (
          <div className="space-y-4">
            <Card title="Đề xuất của Sales Qualification Agent" pad={false}>
              <SuggestionSummary items={suggestions} />
            </Card>
            <AgentRuns runs={listRuns({ entityType: "lead", entityId: lead.id })} />
            <AuditTrail rows={auditTrail("lead", lead.id)} />
          </div>
        )}
      </div>
    </>
  );
}
