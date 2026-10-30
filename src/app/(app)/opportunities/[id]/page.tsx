import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { get } from "@/lib/db";
import { formatDate, formatVnd, LEVEL, LOST_REASONS_BR27, OPP_STAGE, QUOTE_STATUS, RISK_STATUS, STAKEHOLDER_ROLE } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { listRuns } from "@/lib/services/ai-review";
import { approvalsFor } from "@/lib/services/approvals";
import { activitiesFor, auditTrail, settingNumber, users } from "@/lib/services/core";
import { ImportanceScale } from "@/components/agent-controls";
import { contactsOf, listCompetitors, listPriceLists, listProducts } from "@/lib/services/master";
import {
  checklistStatus,
  competitorsOf,
  gateState,
  getOpportunity,
  getScopeDocument,
  isExpertReviewRequired,
  listOpportunityItems,
  listSolutions,
  researchOf,
  risksOf,
  ruleEvaluationsOf,
  stageHistoryOf,
  stakeholdersOf,
} from "@/lib/services/opportunities";
import { quotesOf } from "@/lib/services/quotes";
import { SubmitButton } from "@/components/client";
import { RuleEvaluationTable } from "@/components/rule-evaluation-table";
import { ResearchFlow } from "@/components/research-flow";
import { Icon } from "@/components/icons";
import { AgentRuns, AuditTrail, SALES_STAGES, Timeline } from "@/components/record";
import { OpportunityNextActions } from "@/components/opportunity-next-actions";
import {
  Badge, Card, CommandAction, CommandBar, CommandLink, CommandSep, Empty, Flash, FormField, Grid, HeaderField, MessageBar, PageTitle, Persona, ProcessFlow, StatusBadge, Tabs,
} from "@/components/ui";
import {
  addOppActivityAction,
  advanceAction,
  checklistAction,
  competitorAction,
  createQuoteAction,
  expertReviewDecisionAction,
  lostAction,
  oppItemAction,
  reopenAction,
  riskAction,
  runOppAgentAction,
  scopeDocAction,
  solutionAction,
  stakeholderAction,
  submitExpertReviewAction,
  updateOppAction,
  verifyResearchAction,
} from "../actions";

export async function generateMetadata({ params }: PageProps<"/opportunities/[id]">): Promise<Metadata> {
  return { title: getOpportunity(Number((await params).id), await requirePermission('opp.read'))?.name ?? "Opportunity" };
}

export default async function OpportunityPage({ params, searchParams }: PageProps<"/opportunities/[id]">) {
  const user = await requirePermission('opp.read');
  const oppId = Number((await params).id);
  const sp = (await searchParams) as { tab?: string; ok?: string; error?: string };
  const o = getOpportunity(oppId, user);
  if (!o) notFound();

  const tab = sp.tab ?? "summary";
  const open = o.stage !== "WON" && o.stage !== "LOST";
  const canWrite = can(user.role, "opp.write") && open;
  const canSolution = can(user.role, "opp.solution") && open;
  const canReopen = can(user.role, "opp.reopen") && !open;
  const canExpertReview = can(user.role, "opp.expert_review");

  const checklist = checklistStatus(o);
  const gate = gateState(o);
  const stakeholders = stakeholdersOf(o.id);
  const competitors = competitorsOf(o.id);
  const risks = risksOf(o.id);
  const research = researchOf(o.id);
  const quotes = quotesOf(o.id);
  const activities = activitiesFor("opportunity", o.id);
  const scopeDoc = getScopeDocument(o.id);
  const items = listOpportunityItems(o.id);
  const solutions = listSolutions(o.id);
  const stageHistory = stageHistoryOf(o.id);
  const expCheck = isExpertReviewRequired(o);
  const allProducts = listProducts();

  const order = get<{ id: number; code: string; status: string }>(
    "SELECT id, code, status FROM orders WHERE opportunity_id = ? ORDER BY id DESC LIMIT 1",
    o.id,
  );
  const base = `/opportunities/${o.id}`;
  const bpfStage = o.stage === "WON" ? "FULFILL" : o.stage === "LOST" ? "CLOSE" : o.stage;
  const pendingResearch = research.find((r) => r.status === "PENDING_REVIEW");

  return (
    <>
      <CommandBar>
        {canWrite && <button type="submit" form="opp-form" className="cmd">Lưu</button>}
        <CommandLink href="/opportunities" icon="arrowLeft">Pipeline</CommandLink>
        <CommandSep />
        {open && can(user.role, "ai.run") && (
          <CommandAction action={runOppAgentAction} fields={{ id: o.id }} icon="sparkle">Chạy Opportunity Agent</CommandAction>
        )}
        {open && (o.stage === "DEVELOP" || o.stage === "PROPOSE") && can(user.role, "opp.stage") && (
          <CommandAction action={advanceAction} fields={{ id: o.id }} icon="arrowRight">
            Giai đoạn kế tiếp
          </CommandAction>
        )}
        {o.stage === "PROPOSE" && can(user.role, "quote.write") && (
          <CommandAction action={createQuoteAction} fields={{ id: o.id }} icon="quote">Báo giá mới</CommandAction>
        )}
        {open && can(user.role, "opp.stage") && <CommandLink href={`${base}?tab=summary#lost`} icon="dismissCircle">Đóng: Lost</CommandLink>}
        {order && <CommandLink href={`/orders/${order.id}`} icon="order">Mở Order {order.code}</CommandLink>}
      </CommandBar>
      <Flash sp={sp} />
      <PageTitle
        icon="opportunity"
        title={o.name}
        subtitle={
          <>
            Opportunity · {o.code} · <Link className="link" href={`/accounts/${o.account_id}`}>{o.account_name}</Link>
            {o.lead_id && <> · từ <Link className="link" href={`/leads/${o.lead_id}`}>Lead #{o.lead_id}</Link></>}
          </>
        }
        right={
          <>
            <HeaderField label="Giá trị dự kiến">{formatVnd(o.amount)}</HeaderField>
            <HeaderField label="Ngân sách khách hàng">{formatVnd(o.budget)}</HeaderField>
            <HeaderField label="Ngày chốt">{formatDate(o.close_date)}</HeaderField>
            <HeaderField label="Giai đoạn"><StatusBadge status={o.stage} labels={OPP_STAGE} /></HeaderField>
            <HeaderField label="AE"><Persona name={o.owner_name} size={24} /></HeaderField>
          </>
        }
      />
      <ProcessFlow stages={SALES_STAGES} current={bpfStage} lost={o.stage === "LOST"} />

      <div className="space-y-2 px-6">
        {o.stage === "LOST" && (
          <MessageBar intent="warning" title={`Cơ hội đã đóng thất bại (LOST): ${o.lost_reason_code ?? ""}`}>
            {o.lost_reason}
          </MessageBar>
        )}
        {o.reopened_at && (
          <MessageBar intent="info" title="Cơ hội đã được mở lại theo quy tắc BR-17:">
            Mở lại lúc {formatDate(o.reopened_at, true)} — Lý do: {o.reopen_reason}
          </MessageBar>
        )}
        {o.stage === "DEVELOP" && expCheck.required && (
          <MessageBar
            intent={o.expert_review_status === "APPROVED" ? "success" : o.expert_review_status === "PENDING" ? "warning" : "error"}
            title="Cổng duyệt chuyên môn Presales (FR-42, BR-07):"
          >
            {expCheck.reason} — Trạng thái:{" "}
            {o.expert_review_status === "APPROVED"
              ? "Đã được Quản lý tư vấn giải pháp phê duyệt."
              : o.expert_review_status === "PENDING"
              ? "Đang chờ Quản lý duyệt."
              : "Bắt buộc duyệt trước khi chuyển sang Đề xuất giải pháp (Propose)."}
          </MessageBar>
        )}
        {o.stage === "DEVELOP" && gate.required && (
          <MessageBar intent={gate.approval?.status === "APPROVED" ? "success" : "warning"} title="Cổng Quản lý kinh doanh rà soát (BR-06):">
            {gate.reasons.join("; ")} —{" "}
            {gate.approval?.status === "APPROVED"
              ? "Đã được Sales Manager duyệt."
              : gate.approval?.status === "PENDING"
              ? "Đang chờ Sales Manager rà soát."
              : "Cần Sales Manager rà soát khi chuyển sang Propose."}
          </MessageBar>
        )}
        {pendingResearch && (
          <MessageBar intent="info" title="Opportunity Agent có nghiên cứu mới chờ AE xác minh." action={<Link className="link whitespace-nowrap text-sm" href={`${base}?tab=research`}>Xem nghiên cứu</Link>} />
        )}
      </div>

      <Tabs
        base={base}
        current={tab}
        tabs={[
          { key: "summary", label: "Tóm tắt" },
          { key: "scope", label: "Phạm vi triển khai", count: scopeDoc ? 1 : 0 },
          { key: "items", label: "Sản phẩm & Giải pháp", count: items.length },
          { key: "solution", label: "Hồ sơ kỹ thuật Presales", count: solutions.length },
          { key: "stakeholders", label: "Stakeholders & Đối thủ", count: stakeholders.length + competitors.length },
          { key: "risks", label: "Quản lý rủi ro", count: risks.filter((r) => r.status === "OPEN").length },
          { key: "research", label: "Nghiên cứu AI", count: research.length },
          { key: "quotes", label: "Báo giá", count: quotes.length },
          { key: "activities", label: "Hoạt động", count: activities.length },
          { key: "audit", label: "Nhật ký" },
        ]}
      />

      <div className="px-6 py-4 pb-10">
        {/* TAB 1: SUMMARY */}
        {tab === "summary" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <Card title="Thông tin Cơ hội (FR-35)">
                <form id="opp-form" action={updateOppAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input type="hidden" name="id" value={o.id} />
                  <fieldset disabled={!canWrite} className="contents">
                    <FormField label="Tên cơ hội" required className="md:col-span-2">
                      <input name="name" defaultValue={o.name} className="input" required />
                    </FormField>
                    <FormField label="Giá trị dự kiến (₫)" hint="Tự động tính từ cấu hình sản phẩm hoặc chỉnh tay">
                      <input name="amount" defaultValue={o.amount} inputMode="numeric" className="input" />
                    </FormField>
                    <FormField label="Ngân sách khách hàng (₫)">
                      <input name="budget" defaultValue={o.budget} inputMode="numeric" className="input" />
                    </FormField>
                    <FormField label="Ngày chốt dự kiến">
                      <input name="close_date" type="date" defaultValue={o.close_date ?? ""} className="input" />
                    </FormField>
                    <FormField label="Liên hệ chính">
                      <select name="primary_contact_id" defaultValue={o.primary_contact_id ?? ""} className="select">
                        <option value="">— Chọn liên hệ —</option>
                        {contactsOf(o.account_id).map((c) => (
                          <option key={c.id} value={c.id}>{c.full_name}{c.title ? ` – ${c.title}` : ""}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Bảng giá" hint={o.stage !== "DEVELOP" ? "Chỉ đổi ở giai đoạn Phát triển cơ hội" : undefined}>
                      <select name="price_list_id" defaultValue={o.price_list_id ?? ""} className="select">
                        <option value="">— Chọn bảng giá —</option>
                        {listPriceLists().map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Presales phụ trách">
                      <select name="presales_id" defaultValue={o.presales_id ?? ""} className="select">
                        <option value="">— Chưa phân công —</option>
                        {users("PRESALES").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Mức quan trọng" hint="Cao (HIGH) / Trung bình / Thấp">
                      <select name="importance" defaultValue={o.importance ?? "MEDIUM"} className="select">
                        <option value="LOW">Thấp (LOW)</option>
                        <option value="MEDIUM">Trung bình (MEDIUM)</option>
                        <option value="HIGH">Cao (HIGH)</option>
                      </select>
                    </FormField>
                    <FormField label="Nhu cầu khách hàng (Customer Need)" className="md:col-span-2">
                      <textarea name="customer_need" defaultValue={o.customer_need ?? ""} className="textarea" placeholder="Mô tả nhu cầu sơ bộ hoặc chi tiết..." />
                    </FormField>
                  </fieldset>
                  {canWrite && <div className="md:col-span-2"><SubmitButton icon="save">Lưu thông tin</SubmitButton></div>}
                </form>
              </Card>

              {/* Mở lại cơ hội theo BR-17 */}
              {!open && canReopen && (
                <Card title="Mở lại Cơ hội đã đóng (BR-17)">
                  <form action={reopenAction} className="space-y-3">
                    <input type="hidden" name="id" value={o.id} />
                    <p className="text-sm text-ink-2">
                      Quy tắc BR-17: Chỉ Quản lý kinh doanh (SALES_MANAGER) được mở lại cơ hội trong vòng 90 ngày kể từ ngày đóng, bắt buộc ghi rõ lý do.
                    </p>
                    <FormField label="Lý do mở lại cơ hội" required>
                      <input name="reason" required placeholder="VD: Khách hàng tái khởi động ngân sách quý 4..." className="input" />
                    </FormField>
                    <SubmitButton variant="primary" icon="refresh">Mở lại cơ hội (chuyển về Develop)</SubmitButton>
                  </form>
                </Card>
              )}

              {/* Đóng cơ hội thất bại theo BR-27 */}
              {open && can(user.role, "opp.stage") && (
                <Card title="Đóng Cơ hội: Thất bại (FR-47, BR-27)">
                  <div id="lost" />
                  <form action={lostAction} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <input type="hidden" name="id" value={o.id} />
                    <FormField label="Lý do thất bại (BR-27)" required>
                      <select name="reason" required className="select" defaultValue="">
                        <option value="" disabled>Chọn lý do theo chuẩn BR-27…</option>
                        {LOST_REASONS_BR27.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Ghi chú chi tiết (Bắt buộc nếu chọn 'Khác')">
                      <input name="reason_note" placeholder="Chi tiết lý do..." className="input" />
                    </FormField>
                    <SubmitButton variant="danger" icon="dismissCircle">Đóng: Lost</SubmitButton>
                  </form>
                </Card>
              )}

              {/* Lịch sử chuyển giai đoạn */}
              <Card title="Lịch sử chuyển giai đoạn (Stage History)" pad={false}>
                {stageHistory.length ? (
                  <ul>
                    {stageHistory.map((h) => (
                      <li key={h.id} className="border-b border-[#f0f0f0] px-4 py-2.5 text-sm last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{OPP_STAGE[h.from_stage] ?? h.from_stage} → {OPP_STAGE[h.to_stage] ?? h.to_stage}</span>
                          <span className="text-xs text-ink-3">{formatDate(h.moved_at, true)}</span>
                        </div>
                        <div className="text-xs text-ink-2 mt-0.5">
                          Bởi: {h.moved_by_name ?? "Hệ thống"}{h.reason ? ` · Lý do: ${h.reason}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon="history">Chưa có lịch sử chuyển giai đoạn</Empty>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="Checklist Develop (4 mục kiểm soát - FR-46)">
                <ul className="space-y-1">
                  {checklist.map((c) => {
                    const allowed = c.key === "solution_confirmed" ? canSolution : canWrite;
                    return (
                      <li key={c.key}>
                        <form action={checklistAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="key" value={c.key} />
                          <input type="hidden" name="value" value={c.done ? "0" : "1"} />
                          <button
                            disabled={!allowed || o.stage !== "DEVELOP"}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${allowed && o.stage === "DEVELOP" ? "hover:bg-[#f5f5f5]" : "cursor-default"}`}
                            title={allowed ? "Bấm để đổi trạng thái" : undefined}
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border ${c.done ? "border-brand bg-brand text-white" : "border-[var(--stroke-accessible)]"}`}>
                              {c.done && <Icon name="check" size={14} strokeWidth={2.5} />}
                            </span>
                            <span className={c.done ? "font-medium" : "text-ink-2"}>{c.label}</span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-ink-3">
                  Cổng kiểm soát: Bắt buộc hoàn tất cả 4 mục kiểm soát + chọn bảng giá để chuyển sang giai đoạn Đề xuất giải pháp (Propose).
                </p>
              </Card>

              <Card title="Phê duyệt liên quan" pad={false}>
                {approvalsFor("opportunity", o.id).length ? (
                  <ul>
                    {approvalsFor("opportunity", o.id).map((a) => (
                      <li key={a.id} className="border-b border-[#f0f0f0] px-4 py-2 text-sm last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <span>{a.kind === "OPP_STAGE_GATE" ? "Manager gate" : a.kind}</span>
                          <StatusBadge status={a.status} labels={{ PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối" }} />
                        </div>
                        <div className="text-xs text-ink-3">{a.reason}{a.decision_comment && ` · ${a.decided_by_name}: ${a.decision_comment}`}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon="approval">Chưa có yêu cầu phê duyệt</Empty>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: SCOPE DOCUMENT (FR-37) */}
        {tab === "scope" && (
          <div className="space-y-4 max-w-4xl">
            <Card title="Biên bản phạm vi triển khai & Nhu cầu chi tiết (FR-37)">
              <form action={scopeDocAction} className="space-y-4">
                <input type="hidden" name="id" value={o.id} />
                {scopeDoc && <input type="hidden" name="doc_id" value={scopeDoc.id} />}

                {scopeDoc && (
                  <div className="flex items-center justify-between p-3 rounded bg-[#f5f5f5] text-sm">
                    <div>
                      Trạng thái biên bản:{" "}
                      <StatusBadge
                        status={scopeDoc.status}
                        labels={{ DRAFT: "Bản nháp", SENT: "Đã gửi khách", CONFIRMED: "Khách đã xác nhận" }}
                      />
                      {scopeDoc.confirmed_at && (
                        <span className="text-xs text-ink-3 ml-2">
                          (Xác nhận lúc {formatDate(scopeDoc.confirmed_at, true)} bởi {scopeDoc.confirmer_name ?? "Người dùng"})
                        </span>
                      )}
                    </div>
                    {scopeDoc.status !== "CONFIRMED" && canWrite && (
                      <button type="submit" name="op" value="confirm" className="btn btn-sm btn-primary">
                        Xác nhận biên bản (Đạt tiêu chí Nhu cầu)
                      </button>
                    )}
                  </div>
                )}

                <FormField label="Tiêu đề biên bản" required>
                  <input
                    name="title"
                    required
                    defaultValue={scopeDoc?.title ?? `Biên bản phạm vi triển khai – ${o.name}`}
                    className="input font-semibold"
                    disabled={!canWrite}
                  />
                </FormField>

                <FormField label="Nhu cầu chi tiết & Phạm vi hệ thống">
                  <textarea
                    name="content"
                    defaultValue={scopeDoc?.content ?? o.customer_need ?? ""}
                    className="textarea !min-h-32"
                    placeholder="Mô tả phạm vi các phân hệ cần triển khai, yêu cầu tích hợp, quy trình nghiệp vụ..."
                    disabled={!canWrite}
                  />
                </FormField>

                <FormField label="Sản phẩm bàn giao (Deliverables)">
                  <textarea
                    name="deliverables"
                    defaultValue={scopeDoc?.deliverables ?? ""}
                    className="textarea !min-h-24"
                    placeholder="Danh sách sản phẩm bàn giao: tài liệu thiết kế, source code, tài liệu hướng dẫn, chứng nhận hoàn thành..."
                    disabled={!canWrite}
                  />
                </FormField>

                {canWrite && (
                  <div className="flex justify-end gap-2 pt-2">
                    <SubmitButton icon="save">Lưu biên bản phạm vi</SubmitButton>
                  </div>
                )}
              </form>
            </Card>
          </div>
        )}

        {/* TAB 3: ITEMS (FR-38) */}
        {tab === "items" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <Card title="Danh sách sản phẩm, dịch vụ & Gói giải pháp (FR-38)" pad={false}>
              {items.length ? (
                <Grid>
                  <thead>
                    <tr>
                      <th>Mã SP</th>
                      <th>Tên sản phẩm</th>
                      <th>Đơn vị</th>
                      <th className="text-right">Số lượng</th>
                      <th className="text-right">Đơn giá</th>
                      <th className="text-right">Chiết khấu</th>
                      <th className="text-right">Thành tiền</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="font-mono text-xs">{it.product_code}</td>
                        <td className="font-semibold">{it.product_name}</td>
                        <td>{it.product_unit}</td>
                        <td className="text-right tabular-nums">{it.quantity}</td>
                        <td className="text-right tabular-nums">{formatVnd(it.unit_price)}</td>
                        <td className="text-right tabular-nums">{it.discount_pct}%</td>
                        <td className="text-right tabular-nums font-semibold">{formatVnd(it.amount)}</td>
                        <td>
                          {canWrite && (
                            <form action={oppItemAction}>
                              <input type="hidden" name="id" value={o.id} />
                              <button name="remove" value={it.id} className="btn btn-subtle btn-sm" aria-label="Xóa">
                                <Icon name="delete" size={14} />
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold bg-[#fafafa]">
                      <td colSpan={6} className="text-right">Tổng giá trị cơ hội:</td>
                      <td className="text-right tabular-nums text-brand">{formatVnd(o.amount)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </Grid>
              ) : (
                <Empty icon="product">Chưa có sản phẩm hoặc dịch vụ nào được cấu hình cho cơ hội này</Empty>
              )}
            </Card>

            {canWrite && (
              <Card title="Thêm sản phẩm / gói dịch vụ">
                <form action={oppItemAction} className="space-y-3">
                  <input type="hidden" name="id" value={o.id} />
                  <FormField label="Sản phẩm / Dịch vụ" required>
                    <select name="product_id" required className="select">
                      <option value="" disabled>— Chọn sản phẩm —</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} – {p.name} ({p.unit})</option>
                      ))}
                    </select>
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Số lượng" required>
                      <input name="quantity" type="number" min={1} defaultValue={1} className="input" required />
                    </FormField>
                    <FormField label="Đơn giá (₫)" hint="Để trống để lấy từ bảng giá">
                      <input name="unit_price" type="number" min={0} placeholder="Từ bảng giá" className="input" />
                    </FormField>
                  </div>
                  <FormField label="Chiết khấu (%)">
                    <input name="discount_pct" type="number" min={0} max={100} defaultValue={0} className="input" />
                  </FormField>
                  <FormField label="Ghi chú cấu hình">
                    <input name="notes" placeholder="VD: Gói chuẩn 12 tháng..." className="input" />
                  </FormField>
                  <SubmitButton icon="add">Thêm vào cơ hội</SubmitButton>
                </form>
              </Card>
            )}
          </div>
        )}

        {/* TAB 4: SOLUTIONS & PRESALES EXPERT REVIEW (FR-41, FR-42, BR-07) */}
        {tab === "solution" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card title="Hồ sơ giải pháp Presales & Phương án kỹ thuật (FR-41)" pad={false}>
                {solutions.length ? (
                  <div className="divide-y divide-[#f0f0f0]">
                    {solutions.map((sol) => (
                      <div key={sol.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-brand text-base">{sol.title}</h4>
                          <span className="text-xs text-ink-3">Tạo lúc: {formatDate(sol.created_at, true)} bởi {sol.creator_name ?? "Presales"}</span>
                        </div>
                        {sol.technical_approach && (
                          <div>
                            <span className="text-xs font-semibold text-ink-2">Phương án kỹ thuật:</span>
                            <p className="text-sm text-ink-1 whitespace-pre-wrap">{sol.technical_approach}</p>
                          </div>
                        )}
                        {sol.architecture && (
                          <div>
                            <span className="text-xs font-semibold text-ink-2">Kiến trúc hệ thống:</span>
                            <p className="text-sm text-ink-1 whitespace-pre-wrap">{sol.architecture}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs text-ink-2 pt-1 border-t border-[#f5f5f5]">
                          <span>Ước tính công sức: <strong className="text-ink-1">{sol.estimated_effort_mandays} mandays</strong></span>
                          <span>Yêu cầu tích hợp: <strong className={sol.integration_required ? "text-brand" : "text-ink-3"}>{sol.integration_required ? "Có tích hợp hệ thống ngoài" : "Không"}</strong></span>
                          {sol.risks && <span>Rủi ro kỹ thuật: {sol.risks}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon="lightbulb">Chưa có hồ sơ giải pháp kỹ thuật Presales</Empty>
                )}
              </Card>

              {/* Cổng Duyệt chuyên môn FR-42 & BR-07 */}
              <Card title="Cổng Duyệt chuyên môn giải pháp (FR-42, BR-07)">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold">Trạng thái duyệt chuyên môn: </span>
                      <StatusBadge
                        status={o.expert_review_status}
                        labels={{ NONE: "Chưa gửi duyệt", PENDING: "Chờ phê duyệt", APPROVED: "Đã phê duyệt", REJECTED: "Bị từ chối" }}
                      />
                    </div>
                    {expCheck.required && o.expert_review_status !== "APPROVED" && canSolution && (
                      <form action={submitExpertReviewAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <SubmitButton variant="primary" icon="send">Gửi duyệt chuyên môn</SubmitButton>
                      </form>
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    Điều kiện áp dụng (BR-07): Có yêu cầu tích hợp với hệ thống khác, hoặc doanh thu ước tính ≥ 500,000,000 VND (hoặc công sức ≥ 30 mandays).
                  </p>

                  {/* Quyền duyệt của PRESALES_MANAGER */}
                  {canExpertReview && o.expert_review_status === "PENDING" && (
                    <div className="rounded border border-brand/20 bg-brand/5 p-3 space-y-2">
                      <span className="font-semibold text-sm text-brand">Dành cho Quản lý tư vấn giải pháp (PRESALES_MANAGER):</span>
                      <form action={expertReviewDecisionAction} className="flex gap-2">
                        <input type="hidden" name="id" value={o.id} />
                        <input name="note" placeholder="Ý kiến phê duyệt hoặc lý do từ chối..." className="input flex-1" />
                        <button name="decision" value="APPROVED" className="btn btn-primary btn-sm">Phê duyệt</button>
                        <button name="decision" value="REJECTED" className="btn btn-danger btn-sm">Từ chối</button>
                      </form>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {canSolution && (
              <Card title="Lập phương án giải pháp mới">
                <form action={solutionAction} className="space-y-3">
                  <input type="hidden" name="id" value={o.id} />
                  <FormField label="Tiêu đề phương án" required>
                    <input name="title" required placeholder="VD: Triển khai SMS CRM + Tích hợp ERP" className="input" />
                  </FormField>
                  <FormField label="Phương án kỹ thuật">
                    <textarea name="technical_approach" className="textarea !min-h-20" placeholder="Mô tả hướng tiếp cận kỹ thuật..." />
                  </FormField>
                  <FormField label="Kiến trúc đề xuất">
                    <textarea name="architecture" className="textarea !min-h-16" placeholder="Mô hình triển khai Cloud, On-Premise, API Gateway..." />
                  </FormField>
                  <FormField label="Công sức ước tính (mandays)">
                    <input name="estimated_effort_mandays" type="number" min={0} defaultValue={10} className="input" />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                    <input type="checkbox" name="integration_required" value="1" className="accent-[var(--brand)]" />
                    Có yêu cầu tích hợp với hệ thống ngoài (Kích hoạt BR-07)
                  </label>
                  <FormField label="Rủi ro kỹ thuật">
                    <input name="risks" placeholder="Rủi ro về dữ liệu cũ, API độ trễ..." className="input" />
                  </FormField>
                  <SubmitButton icon="add">Lưu hồ sơ giải pháp</SubmitButton>
                </form>
              </Card>
            )}
          </div>
        )}

        {/* TAB 5: STAKEHOLDERS & COMPETITORS (FR-39, FR-40, BR-19) */}
        {tab === "stakeholders" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Bản đồ các bên liên quan (FR-39, BR-19)" pad={false}>
              <div className="p-3 bg-[#fafafa] border-b text-xs text-ink-3">
                BR-19: Hỗ trợ 1 người liên hệ giữ nhiều vai trò trong cùng một cơ hội (VD: Người quyết định + Người dùng).
              </div>
              <ul>
                {stakeholders.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5 text-sm last:border-0">
                    <Persona name={s.name} sub={STAKEHOLDER_ROLE[s.role] ?? s.role} size={28} />
                    {s.notes && <span className="text-xs text-ink-3">({s.notes})</span>}
                    {canWrite && (
                      <form action={stakeholderAction} className="ml-auto">
                        <input type="hidden" name="id" value={o.id} />
                        <button name="remove" value={s.id} className="btn btn-subtle btn-sm" aria-label="Xóa"><Icon name="delete" size={14} /></button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {canWrite && (
                <form action={stakeholderAction} className="space-y-2 p-4 border-t">
                  <input type="hidden" name="id" value={o.id} />
                  <input name="name" required placeholder="Họ tên / Chức vụ" className="input" />
                  <select name="role" className="select">
                    {Object.entries(STAKEHOLDER_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input name="notes" placeholder="Ghi chú thêm về vai trò / ảnh hưởng" className="input" />
                  <SubmitButton icon="add" size="sm">Thêm bên liên quan</SubmitButton>
                </form>
              )}
            </Card>

            <Card title="Đối thủ cạnh tranh (FR-40)" pad={false}>
              <ul>
                {competitors.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 border-b border-[#f0f0f0] px-4 py-2.5 text-sm last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{c.name}</span>
                      <span className="block text-xs text-ink-3">Mạnh: {c.strengths ?? "—"} · Yếu: {c.weaknesses ?? "—"}{c.notes && ` · ${c.notes}`}</span>
                    </span>
                    {canWrite && (
                      <form action={competitorAction} className="ml-auto">
                        <input type="hidden" name="id" value={o.id} />
                        <button name="remove" value={c.id} className="btn btn-subtle btn-sm" aria-label="Xóa"><Icon name="delete" size={14} /></button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {canWrite && (
                <form action={competitorAction} className="space-y-2 p-4 border-t">
                  <input type="hidden" name="id" value={o.id} />
                  <select name="competitor_id" className="select">
                    {listCompetitors().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input name="notes" placeholder="Chiến thuật cạnh tranh..." className="input" />
                  <SubmitButton icon="add" size="sm">Thêm đối thủ</SubmitButton>
                </form>
              )}
            </Card>
          </div>
        )}

        {/* TAB 6: RISKS (FR-43, HG5) */}
        {tab === "risks" && (
          <div className="space-y-4 max-w-4xl">
            <Card title="Quản lý rủi ro cơ hội (FR-43, Cổng HG5)" pad={false}>
              <div className="p-3 bg-[#fafafa] border-b text-xs text-ink-3">
                Cổng HG5: Bốn trạng thái OPEN, MITIGATED, RESOLVED, DISMISSED. Bỏ qua rủi ro (DISMISSED) bắt buộc phải có lý do giải trình.
              </div>
              <ul>
                {risks.map((r) => (
                  <li key={r.id} className="border-b border-[#f0f0f0] px-4 py-3 text-sm last:border-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.severity} labels={LEVEL} />
                      <span className="font-semibold flex-1">{r.description}</span>
                      <StatusBadge status={r.status} labels={RISK_STATUS} />
                      {r.source === "AI" && <Badge tone="purple">AI</Badge>}
                    </div>

                    {r.status === "RESOLVED" && (
                      <div className="text-xs text-success pl-2 border-l-2 border-success">
                        Giải pháp: {r.resolution} {r.resolved_at && `(${formatDate(r.resolved_at, true)})`}
                      </div>
                    )}

                    {r.status === "DISMISSED" && (
                      <div className="text-xs text-ink-3 pl-2 border-l-2 border-ink-3">
                        Lý do bỏ qua (HG5): {r.dismiss_reason} {r.resolved_at && `(${formatDate(r.resolved_at, true)})`}
                      </div>
                    )}

                    {canWrite && r.status === "OPEN" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-[#f5f5f5]">
                        <form action={riskAction} className="flex gap-1">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="risk_id" value={r.id} />
                          <input type="hidden" name="op" value="RESOLVED" />
                          <input name="resolution" placeholder="Cách giải quyết..." className="input !min-h-7 !py-0.5 text-xs flex-1" required />
                          <button className="btn btn-sm btn-primary">Giải quyết</button>
                        </form>
                        <form action={riskAction} className="flex gap-1">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="risk_id" value={r.id} />
                          <input type="hidden" name="op" value="DISMISSED" />
                          <input name="dismiss_reason" placeholder="Lý do bỏ qua (bắt buộc)..." className="input !min-h-7 !py-0.5 text-xs flex-1" required />
                          <button className="btn btn-sm btn-subtle text-danger">Bỏ qua</button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {canWrite && (
                <form action={riskAction} className="space-y-2 p-4 border-t">
                  <input type="hidden" name="id" value={o.id} />
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 items-center">
                    <input name="description" required placeholder="Mô tả rủi ro phát hiện..." className="input" />
                    <select name="severity" className="select" defaultValue="MEDIUM">
                      <option value="LOW">Mức thấp</option>
                      <option value="MEDIUM">Trung bình</option>
                      <option value="HIGH">Mức cao</option>
                    </select>
                    <SubmitButton icon="add" size="sm">Thêm rủi ro</SubmitButton>
                  </div>
                </form>
              )}
            </Card>
          </div>
        )}

        {/* TAB 7: AI RESEARCH */}
        {tab === "research" && (
          <div className="space-y-4">
            {research.length ? (
              research.map((r) => {
                const rRisks = JSON.parse(r.risks_json) as { description: string; severity: string; rule_id?: string | null; unclassified?: boolean }[];
                const sources = JSON.parse(r.sources_json) as { ref: string; detail: string }[];
                const evals = ruleEvaluationsOf(r.id);
                return (
                  <Card
                    key={r.id}
                    title={
                      <span className="flex items-center gap-2">
                        <Icon name="sparkle" size={16} className="text-[#5c2e91]" /> Opportunity Research #{r.id}
                        <StatusBadge status={r.status} labels={{ PENDING_REVIEW: "Chờ AE xác minh", VERIFIED: "Đã xác minh", DISMISSED: "Bỏ qua" }} />
                      </span>
                    }
                    actions={<span className="text-xs text-ink-3">{formatDate(r.created_at, true)}{r.reviewed_by_name && ` · ${r.reviewed_by_name}`}</span>}
                  >
                    <form action={verifyResearchAction} className="space-y-3 text-sm">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="research_id" value={r.id} />
                      <div className="flex flex-wrap items-center gap-2">
                        Mức quan trọng (theo quy tắc): <StatusBadge status={r.importance} labels={LEVEL} />
                        {r.llm_importance && r.llm_importance !== r.importance && <span className="text-xs text-ink-3">LLM đề xuất {LEVEL[r.llm_importance as keyof typeof LEVEL] ?? r.llm_importance}, đã thay bằng kết quả quy tắc</span>}
                        {r.confidence !== null && <span className="text-xs text-ink-3">· Độ bao phủ dữ liệu {Math.round(r.confidence * 100)}% ({r.confidence_band === "LOW" ? "thấp – cần bổ sung dữ liệu" : r.confidence_band === "MEDIUM" ? "trung bình" : "cao"})</span>}
                        {r.ruleset_hash && <code className="text-[11px] text-ink-3">{r.ruleset_version}#{r.ruleset_hash}</code>}
                      </div>
                      <ResearchFlow research={r} evals={evals} />
                      {r.ruleset_version && (
                        <div className="max-w-xl">
                          <ImportanceScale medium={settingNumber("importance_medium_amount")} high={settingNumber("importance_high_amount")} amount={o.amount} />
                        </div>
                      )}
                      <p className="text-ink-2">{r.summary}</p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <div className="label">Rủi ro</div>
                          <ul className="space-y-1">
                            {rRisks.map((x, i) => (
                              <li key={i} className="flex items-start gap-2">
                                {r.status === "PENDING_REVIEW" && <input type="checkbox" name="risk" value={i} defaultChecked className="mt-0.5" />}
                                <span><StatusBadge status={x.severity} labels={LEVEL} /> {x.rule_id ? <code className="text-[11px]">{x.rule_id}</code> : x.unclassified ? <span className="text-[11px] text-ink-3">Chưa phân loại (LLM)</span> : null} {x.description}</span>
                              </li>
                            ))}
                            {!rRisks.length && <li className="text-ink-3">Không có</li>}
                          </ul>
                        </div>
                        <div>
                          <div className="label">Tối đa 3 hành động ưu tiên</div>
                          <OpportunityNextActions serialized={r.next_actions_json} />
                        </div>
                        <div>
                          <div className="label">Nguồn dẫn</div>
                          <ul className="space-y-1 text-xs text-ink-2">
                            {sources.map((s, i) => <li key={i}><code className="text-[11px]">{s.ref}</code> — {s.detail}</li>)}
                            {!sources.length && <li className="text-ink-3">Không có</li>}
                          </ul>
                        </div>
                      </div>
                      <RuleEvaluationTable rows={evals} />
                      {r.status === "PENDING_REVIEW" && can(user.role, "ai.review") && (
                        <div className="flex flex-wrap items-center gap-3 border-t border-[#f0f0f0] pt-3">
                          <label className="flex items-center gap-2"><input type="checkbox" name="apply_importance" defaultChecked /> Áp dụng mức quan trọng vào hồ sơ</label>
                          <SubmitButton variant="primary" icon="check">Xác minh & cập nhật hồ sơ</SubmitButton>
                          <SubmitButton name="dismiss" value="1" icon="dismiss">Bỏ qua</SubmitButton>
                          <span className="text-xs text-ink-3">Rủi ro được chọn sẽ thêm vào danh sách rủi ro mở.</span>
                        </div>
                      )}
                    </form>
                  </Card>
                );
              })
            ) : (
              <Card><Empty icon="sparkle">Chưa có nghiên cứu. Bấm “Chạy Opportunity Agent” trên thanh lệnh.</Empty></Card>
            )}
            <AgentRuns runs={listRuns({ entityType: "opportunity", entityId: o.id })} />
          </div>
        )}

        {/* TAB 8: QUOTES */}
        {tab === "quotes" && (
          <Card title="Báo giá" pad={false} actions={o.stage === "PROPOSE" && can(user.role, "quote.write") && (
            <form action={createQuoteAction}><input type="hidden" name="id" value={o.id} /><SubmitButton size="sm" icon="add">Báo giá mới</SubmitButton></form>
          )}>
            {quotes.length ? (
              <Grid>
                <thead><tr><th>Mã</th><th>Phiên bản</th><th>Trạng thái</th><th className="text-right">Tổng</th><th>Chiết khấu tối đa</th><th>Hiệu lực đến</th></tr></thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td><Link className="link font-semibold" href={`/quotes/${q.id}`}>{q.code}</Link></td>
                      <td>v{q.revision}</td>
                      <td><StatusBadge status={q.status} labels={QUOTE_STATUS} /></td>
                      <td className="text-right tabular-nums">{formatVnd(q.total)}</td>
                      <td>{q.max_discount_pct}%</td>
                      <td>{formatDate(q.valid_until)}</td>
                    </tr>
                  ))}
                </tbody>
              </Grid>
            ) : (
              <Empty icon="quote">{o.stage === "DEVELOP" ? "Báo giá được lập ở giai đoạn Propose" : "Chưa có báo giá"}</Empty>
            )}
          </Card>
        )}

        {/* TAB 9: ACTIVITIES */}
        {tab === "activities" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Ghi nhận hoạt động">
              <form action={addOppActivityAction} className="space-y-3">
                <input type="hidden" name="id" value={o.id} />
                <FormField label="Loại">
                  <select name="type" className="select">
                    <option value="MEETING">Cuộc họp</option>
                    <option value="CALL">Cuộc gọi</option>
                    <option value="EMAIL">Email</option>
                    <option value="NOTE">Ghi chú</option>
                  </select>
                </FormField>
                <FormField label="Chiều email">
                  <select name="direction" className="select"><option value="IN">Khách gửi đến</option><option value="OUT">Gửi khách</option></select>
                </FormField>
                <FormField label="Tiêu đề" required><input name="subject" required className="input" /></FormField>
                <FormField label="Nội dung"><textarea name="body" className="textarea" /></FormField>
                {canWrite && <SubmitButton variant="primary" icon="add">Thêm</SubmitButton>}
              </form>
            </Card>
            <Card title="Dòng thời gian" className="xl:col-span-2"><Timeline items={activities} /></Card>
          </div>
        )}

        {/* TAB 10: AUDIT */}
        {tab === "audit" && <AuditTrail rows={auditTrail("opportunity", o.id)} />}
      </div>
    </>
  );
}
