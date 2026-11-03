// Thành phần hiển thị toàn bộ Tab "Nghiên cứu AI" cho Cơ hội bán hàng:
// - Bản mới nhất lên đầu, ghi rõ Agent lần 1 hay lần 2, thời điểm, người kích hoạt.
// - Khung quan sát Agent chuẩn 6 bước: Dữ liệu được cấp quyền → Agent & công cụ → Kiểm quy tắc → Lưu đề xuất → Người xác minh → Cập nhật nghiệp vụ.
// - Hiển thị đầy đủ các mục nhận định từ insights_json theo tên tiếng Việt trong bài:
//   Bối cảnh doanh nghiệp, Thông tin cơ hội, Kết quả BANT, Lịch sử tương tác, Nhu cầu và điểm chưa rõ,
//   Sản phẩm liên quan, Bên liên quan, Đối thủ, Rủi ro ngân sách, Thông tin còn thiếu, Tối đa 3 hành động.
//   Mục "Chưa có nhận định" hiển thị rõ lý do, không để trống.
// - Mỗi kết luận có dòng "Vì sao" (quy tắc, nguồn căn cứ).
// - Bảng 10 quy tắc thu gọn (bấm mới mở).
// - Các bản nghiên cứu cũ thu gọn thành 1 dòng (bấm mới mở).
// - Chịu được cả dữ liệu rỗng và nội dung dài từ OpenAI thật.
// TODO: Chuyển sang dùng researchView(researchId) khi Codex cung cấp theo mục 9 REBUILD-01.

import { formatDate, LEVEL } from "@/lib/domain";
import { runForWorkflow } from "@/lib/services/ai-review";
import type { StageGateStatus } from "@/lib/services/approvals";
import { TOOLS, type ToolName } from "@/lib/agents/tools";
import { Icon, type IconName } from "./icons";
import { StatusBadge, cx } from "./ui";
import { SubmitButton } from "./client";
import { RuleEvaluationTable } from "./rule-evaluation-table";
import type { ResearchView } from "@/lib/services/sales-flow";
import { AgentObservationFlow, type AgentObservationStep } from "./agent-observation-flow";

export interface ResearchRecord {
  id: number;
  run_id: number | null;
  importance: string;
  summary: string;
  risks_json: string;
  next_actions_json: string;
  sources_json: string;
  status: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  ruleset_version: string | null;
  ruleset_hash: string | null;
  confidence: number | null;
  confidence_band: string | null;
  llm_importance: string | null;
  gates_json: string | null;
  insights_json?: string;
  importance_reason?: string;
  research_phase?: string;
}

export interface RuleEvalRow {
  rule_id: string;
  br_ref: string;
  status: string;
  severity: string | null;
  raw_value: string | null;
  threshold: string | null;
  rationale: string;
  limitation: string | null;
  evidence_refs_json: string;
  required_action: string | null;
  human_gate: string | null;
}

type Action = (formData: FormData) => Promise<void>;

interface OpportunityResearchViewProps {
  opportunity: {
    id: number;
    name: string;
    amount: number;
    stage: string;
  };
  researchList: ResearchRecord[];
  getRuleEvals: (researchId: number) => RuleEvalRow[];
  getView: (researchId: number) => ResearchView;
  gateStatus?: StageGateStatus;
  canVerify: boolean;
  verifyAction: Action;
  ruleAction: Action;
}

// Biểu tượng cho 10 mục nhận định; tên mục lấy từ researchView (RESEARCH_SECTION_TITLES).
const SECTION_ICON: Record<string, IconName> = {
  account_overview: "account",
  opportunity_info: "opportunity",
  bant_result: "checkCircle",
  interaction_history: "history",
  pain_need: "sparkle",
  scope_summary: "info",
  product: "product",
  stakeholder: "people",
  competitor: "shield",
  budget_check: "money",
};

const RULE_ACTION_LABEL: Record<string, string> = {
  ACKNOWLEDGED: "Đã ghi nhận và cho qua",
  FLAGGED: "Đã gắn cờ",
  RISK: "Đã chuyển thành rủi ro",
  TASK: "Đã tạo việc cần làm",
};

export function OpportunityResearchView({
  opportunity,
  researchList,
  getRuleEvals,
  getView,
  gateStatus,
  canVerify,
  verifyAction,
  ruleAction,
}: OpportunityResearchViewProps) {
  if (!researchList.length) {
    return (
      <div className="rounded-xl border border-stroke bg-surface p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon name="sparkle" size={24} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-ink">Chưa có bản nghiên cứu cơ hội nào</h3>
        <p className="mt-1 text-xs text-ink-3 max-w-md mx-auto">
          Nhân viên kinh doanh có thể bấm nút &quot;Chạy Opportunity Agent&quot; trên thanh lệnh để kích hoạt nghiên cứu bối cảnh ban đầu.
        </p>
      </div>
    );
  }

  const latest = researchList[0];
  const olderList = researchList.slice(1);

  return (
    <div className="space-y-6">
      {/* 1. BẢN NGHIÊN CỨU MỚI NHẤT (NỔI BẬT LÊN ĐẦU) */}
      <section className="rounded-xl border border-stroke bg-surface shadow-[var(--shadow-4)] overflow-hidden">
        <ResearchCard
          key={latest.id}
          isLatest={true}
          oppId={opportunity.id}
          oppAmount={opportunity.amount}
          research={latest}
          evals={getRuleEvals(latest.id)}
          view={getView(latest.id)}
          gateStatus={gateStatus}
          canVerify={canVerify}
          canAct={canVerify && opportunity.stage === "DEVELOP" && latest.status !== "DISMISSED"}
          verifyAction={verifyAction}
          ruleAction={ruleAction}
        />
      </section>

      {/* 2. CÁC BẢN NGHIÊN CỨU CŨ (THU GỌN THÀNH 1 DÒNG) */}
      {olderList.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider px-1">
            Lịch sử nghiên cứu trước đây ({olderList.length} bản cũ)
          </h3>
          <div className="space-y-2">
            {olderList.map((r) => (
              <details
                key={r.id}
                className="group rounded-lg border border-stroke bg-surface overflow-hidden transition-all"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-xs font-medium hover:bg-[#fafafa]">
                  <div className="flex items-center gap-2.5">
                    <Icon name="history" size={15} className="text-ink-3 group-open:text-brand" />
                    <span className="font-semibold text-ink">Bản nghiên cứu #{r.id}</span>
                    <span className="text-ink-3">· {formatDate(r.created_at, true)}</span>
                    <StatusBadge
                      status={r.status}
                      labels={{ PENDING_REVIEW: "Chờ xác minh", VERIFIED: "Đã xác minh", DISMISSED: "Bỏ qua" }}
                    />
                    <span className="text-ink-3">
                      · Mức quan trọng: <StatusBadge status={r.importance} labels={LEVEL} />
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-ink-3">
                    {r.reviewed_by_name && <span>Xác minh: {r.reviewed_by_name}</span>}
                    <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
                  </div>
                </summary>

                <div className="border-t border-[#f0f0f0] p-4 bg-[#fafafa]/50">
                  <ResearchCard
                    isLatest={false}
                    oppId={opportunity.id}
                    oppAmount={opportunity.amount}
                    research={r}
                    evals={getRuleEvals(r.id)}
                    view={getView(r.id)}
                    gateStatus={gateStatus}
                    canVerify={false}
                    canAct={canVerify && opportunity.stage === "DEVELOP" && r.status !== "DISMISSED"}
                    verifyAction={verifyAction}
                    ruleAction={ruleAction}
                  />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResearchCard({
  oppId,
  research,
  evals,
  view,
  gateStatus,
  canVerify,
  canAct,
  verifyAction,
  ruleAction,
}: {
  isLatest?: boolean;
  oppId: number;
  oppAmount?: number;
  research: ResearchRecord;
  evals: RuleEvalRow[];
  view: ResearchView;
  gateStatus?: StageGateStatus;
  canVerify: boolean;
  canAct: boolean;
  verifyAction: Action;
  ruleAction: Action;
}) {
  const verifyFormId = `verify-research-${research.id}`;
  const actionable = view.evaluations.filter((e) => e.status === "WARNING" || e.status === "HIT");
  const run = research.run_id ? runForWorkflow(research.run_id) : undefined;
  const calls = JSON.parse(run?.tool_calls_json ?? "[]") as { tool: string; ok: boolean; input?: unknown }[];
  const reads = calls.filter((c) => TOOLS[c.tool as ToolName]?.access === "READ" && c.tool !== "evaluate_opportunity_rules");
  const sources = JSON.parse(research.sources_json || "[]") as { ref: string; detail?: string; quote?: string }[];
  const rRisks = JSON.parse(research.risks_json || "[]") as { description: string; severity: string; rule_id?: string | null; unclassified?: boolean; rationale?: string; source?: string }[];
  const verified = research.status === "VERIFIED";
  const dismissed = research.status === "DISMISSED";
  const pending = research.status === "PENDING_REVIEW";
  const tokens = (run?.input_tokens ?? 0) + (run?.output_tokens ?? 0);

  const phaseTitle =
    view.phase === "INITIAL"
      ? `${view.phaseLabel}: Nghiên cứu bối cảnh ban đầu`
      : view.phase === "POST_SURVEY"
        ? `${view.phaseLabel}: Phân tích sau khảo sát và kiểm ngân sách`
        : view.phaseLabel;

  // Đếm quy tắc
  const hitCount = evals.filter((e) => e.status === "HIT").length;
  const warnCount = evals.filter((e) => e.status === "WARNING").length;
  const passCount = evals.filter((e) => e.status === "PASSED").length;
  const notEvalCount = evals.filter((e) => e.status === "NOT_EVALUABLE").length;

  // Xây dựng 6 bước cho khung quan sát Agent
  const observationSteps: AgentObservationStep[] = [
    {
      key: "data_access",
      title: "1. Dữ liệu được cấp quyền",
      owner: "SYSTEM",
      ownerLabel: "Bảo mật",
      status: "done",
      summary: `${sources.length} nguồn dữ liệu đã kiểm tra quyền và xác thực`,
      details: sources.slice(0, 3).map((s) => s.ref + (s.detail ? `: ${s.detail}` : "")),
      note: "Chỉ đọc dữ liệu thuộc phạm vi phụ trách",
    },
    {
      key: "tools_exec",
      title: "2. Agent và công cụ",
      owner: "LLM",
      ownerLabel: "Tác nhân",
      status: "done",
      summary: `${calls.length} lần gọi công cụ (${reads.length} công cụ đọc)`,
      details: calls.map((c) => `${c.tool}${c.ok ? " ✓" : " ✕"}`),
      note: run ? `${run.model} · ${tokens} tokens` : "Chế độ mô phỏng / Mock",
    },
    {
      key: "rules_check",
      title: "3. Kiểm quy tắc và căn cứ",
      owner: "RULES",
      ownerLabel: "Bộ quy tắc",
      status: evals.length ? "done" : "skipped",
      summary: evals.length
        ? `${passCount} đạt · ${hitCount} vi phạm · ${warnCount} cảnh báo`
        : "Không có đánh giá quy tắc",
      note: notEvalCount > 0 ? `${notEvalCount} quy tắc cần thêm dữ liệu` : "Đã đối chiếu 10 quy tắc quản trị",
    },
    {
      key: "save_proposal",
      title: "4. Lưu đề xuất",
      owner: "SYSTEM",
      ownerLabel: "Hệ thống",
      status: "done",
      summary: `Bản #${research.id} lưu ở trạng thái chờ duyệt`,
      note: "Agent KHÔNG tự động sửa dữ liệu kinh doanh",
    },
    {
      key: "human_verify",
      title: "5. Con người xác minh",
      owner: "HUMAN",
      ownerLabel: "NVKD",
      status: verified ? "done" : dismissed ? "skipped" : "active",
      summary: verified
        ? `Đã xác minh bởi ${research.reviewed_by_name ?? "NVKD"}`
        : dismissed
        ? "Đã bỏ qua bản nghiên cứu này"
        : "Đang chờ Nhân viên kinh doanh rà soát",
      note: verified && research.reviewed_at ? formatDate(research.reviewed_at, true) : undefined,
    },
    {
      key: "business_update",
      title: "6. Cập nhật nghiệp vụ",
      owner: "HUMAN",
      ownerLabel: "Nghiệp vụ",
      status: verified ? "done" : "upcoming",
      summary: verified
        ? "Đã áp dụng mức quan trọng và cập nhật danh mục rủi ro"
        : "Sẽ cập nhật sau khi xác minh",
      note: gateStatus?.required ? "Kèm cổng QLKD rà soát" : undefined,
    },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* A. HEADER BẢN NGHIÊN CỨU */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#5c2e91]/10 text-[#5c2e91]">
              <Icon name="sparkle" size={17} />
            </span>
            <h2 className="text-base font-semibold text-ink">
              {phaseTitle} <span className="text-ink-3 font-normal">· Bản #{research.id}</span>
            </h2>
            <StatusBadge
              status={research.status}
              labels={{ PENDING_REVIEW: "Chờ NVKD xác minh", VERIFIED: "Đã xác minh", DISMISSED: "Đã bỏ qua" }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Khởi tạo lúc {formatDate(research.created_at, true)}
            {run?.name && ` · bởi ${run.name}`}
            {run?.trigger && ` (${run.trigger})`}
            {research.reviewed_by_name && ` · Xác minh bởi ${research.reviewed_by_name}`}
          </p>
        </div>

        {/* Dòng kết luận mức quan trọng + Vì sao */}
        <div className="rounded-lg bg-surface border border-stroke px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5 text-xs">
            <span className="text-ink-3">Mức quan trọng theo quy tắc:</span>
            <StatusBadge status={research.importance} labels={LEVEL} />
          </div>
          {research.importance_reason && (
            <p className="mt-0.5 text-[11px] text-ink-2 max-w-sm text-right">
              <span className="font-semibold text-brand">Vì sao:</span> {research.importance_reason}
            </p>
          )}
          {research.confidence !== null && (
            <div className="mt-1 text-[10px] text-ink-3">
              Độ bao phủ dữ liệu {Math.round(research.confidence * 100)}% ({research.confidence_band === "LOW" ? "thấp" : research.confidence_band === "MEDIUM" ? "trung bình" : "cao"})
            </div>
          )}
        </div>
      </div>

      {/* B. KHUNG QUAN SÁT AGENT CHUẨN 6 BƯỚC */}
      <AgentObservationFlow
        agentName="Opportunity Agent"
        runId={research.run_id}
        trigger={run?.trigger}
        model={run?.model}
        tokens={tokens}
        steps={observationSteps}
      />

      {/* C. TÓM TẮT TỔNG QUAN TỪ AGENT */}
      {research.summary && (
        <div className="rounded-lg bg-brand-tint/30 border border-brand/20 p-3.5 text-sm">
          <div className="text-xs font-semibold text-brand uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Icon name="sparkle" size={13} /> Nhận định tổng quan của Agent
          </div>
          <p className="text-ink-1 whitespace-pre-line leading-relaxed">{research.summary}</p>
        </div>
      )}

      {/* D. CÁC MỤC NHẬN ĐỊNH THEO TÊN TIẾNG VIỆT TRONG BÀI (INSIGHTS_JSON) */}
      <div>
        <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2.5 flex items-center justify-between">
          <span>Chi tiết các mục nhận định nghiệp vụ</span>
          <span className="text-[11px] font-normal lowercase text-ink-3">
            (Có căn cứ và lý do cụ thể cho từng kết luận)
          </span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.sections.map((data) => {
            const sec = { key: data.key, label: data.title, icon: SECTION_ICON[data.key] ?? "info" };
            const hasText = data.status === "INSIGHT" && !!data.text;
            const reason = data.reason ?? "Chưa có thông tin hoặc tài liệu phục vụ mục này";

            return (
              <div
                key={sec.key}
                className={cx(
                  "rounded-lg border p-3 text-xs flex flex-col justify-between transition-all",
                  hasText ? "border-stroke bg-surface shadow-2xs" : "border-stroke/70 bg-[#fafafa]",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-semibold text-ink text-[13px] flex items-center gap-1.5">
                      <Icon name={sec.icon} size={14} className={hasText ? "text-brand" : "text-ink-3"} />
                      {sec.label}
                    </span>

                    <span
                      className={cx(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        hasText ? "bg-success-tint text-success" : "bg-[#f0f0f0] text-ink-3",
                      )}
                    >
                      {hasText ? "Có nhận định" : "Chưa có"}
                    </span>
                  </div>

                  {hasText ? (
                    <div className="space-y-2 mt-1">
                      <p className="text-ink-1 whitespace-pre-wrap leading-relaxed text-[12px]">{data.text}</p>
                      {data.sources && data.sources.length > 0 && (
                        <div className="rounded bg-[#f9f9f9] border border-[#f0f0f0] p-1.5 text-[11px] text-ink-3">
                          <span className="font-medium text-ink-2">Căn cứ:</span>{" "}
                          {data.sources.map((s) => s.ref).join("; ")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 text-ink-3 italic bg-surface/50 rounded p-2 border border-dashed border-[#e5e5e5]">
                      <span className="font-medium not-italic text-ink-2">Chưa có nhận định:</span> {reason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* D2. THÔNG TIN CÒN THIẾU ĐỂ NHÂN VIÊN KINH DOANH HỎI KHÁCH */}
      <div className="rounded-lg border border-stroke bg-surface p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
          <Icon name="info" size={14} className="text-brand" /> Thông tin còn thiếu cần hỏi khách ({view.missingInfo.length})
        </h3>
        {view.missingInfo.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-ink-1">
            {view.missingInfo.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        ) : (
          <p className="text-xs italic text-ink-3">Agent không ghi nhận thông tin còn thiếu.</p>
        )}
      </div>

      {/* E. RỦI RO PHÁT HIỆN KÈM DÒNG "VÌ SAO" */}
      <div className="rounded-lg border border-stroke bg-surface p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#f0f0f0] pb-2">
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
            <Icon name="dismissCircle" size={14} className="text-danger" /> Rủi ro phát hiện ({rRisks.length})
          </h3>
          <span className="text-[11px] text-ink-3">Kèm căn cứ và mã quy tắc tương ứng</span>
        </div>

        {rRisks.length ? (
          <ul className="space-y-2.5">
            {rRisks.map((x, i) => (
              <li
                key={i}
                className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 rounded-md border border-[#f0f0f0] bg-[#fafafa] p-2.5 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={x.severity} labels={LEVEL} />
                    {x.rule_id ? (
                      <code className="rounded bg-surface px-1 py-0.5 text-[11px] border border-stroke text-ink-2 font-mono">
                        {x.rule_id}
                      </code>
                    ) : x.unclassified ? (
                      <span className="rounded bg-[#f0f0f0] px-1 py-0.5 text-[10px] text-ink-3">Chưa phân loại (LLM)</span>
                    ) : null}
                    <span className="font-semibold text-ink">{x.description}</span>
                  </div>

                  {/* Dòng Vì sao */}
                  {(x.rationale || x.rule_id || x.source) && (
                    <div className="text-[11px] text-ink-2 pl-1 border-l-2 border-brand/40 ml-1">
                      <span className="font-semibold text-brand">Vì sao:</span>{" "}
                      {x.rationale ?? (x.rule_id ? `Phát hiện theo quy tắc ${x.rule_id}` : "Nhận diện từ dữ liệu cơ hội")}
                      {x.source && <span className="text-ink-3"> (Nguồn: {x.source})</span>}
                    </div>
                  )}
                </div>

                {pending && canVerify && (
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer pt-1 sm:pt-0">
                    <input type="checkbox" name="risk" value={i} defaultChecked form={verifyFormId} className="accent-[var(--brand)]" />
                    <span className="text-[11px] text-ink-2 font-medium">Áp dụng vào cơ hội</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3 italic">Không có rủi ro nào được phát hiện trong lần chạy này.</p>
        )}
      </div>

      {/* F. TỐI ĐA 3 HÀNH ĐỘNG ƯU TIÊN */}
      <div className="rounded-lg border border-stroke bg-surface p-4">
        <h3 className="text-xs font-semibold text-ink uppercase tracking-wider mb-2.5 flex items-center justify-between border-b border-[#f0f0f0] pb-2">
          <span>Tối đa 3 hành động ưu tiên đề xuất</span>
          <span className="text-[11px] font-normal text-ink-3 lowercase">có người phụ trách và lý do</span>
        </h3>
        {view.recommendations.length ? (
          <ol className="space-y-2.5 text-xs">
            {view.recommendations.slice(0, 3).map((a, i) => (
              <li key={i} className="rounded-md border border-[#f0f0f0] bg-[#fafafa] p-2.5">
                <div className="font-semibold text-ink">{i + 1}. {a.action}</div>
                <div className="mt-0.5 text-ink-3">
                  {a.owner_role && <>Người làm: {a.owner_role}</>}
                  {a.rule_id && <> · Quy tắc <code className="text-[11px]">{a.rule_id}</code></>}
                </div>
                {a.why && <div className="mt-1 text-ink-2"><span className="font-semibold text-brand">Vì sao:</span> {a.why}</div>}
                <div className="mt-1 text-ink-3">
                  <span className="font-medium text-ink-2">Căn cứ:</span>{" "}
                  {a.evidence_refs?.length ? a.evidence_refs.map((e) => e.ref).join("; ") : "Chưa có căn cứ riêng"}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-ink-3">Agent không đề xuất hành động nào.</p>
        )}
      </div>

      {/* F2. KẾT QUẢ QUY TẮC CẦN NGƯỜI XỬ LÝ: cảnh báo thì ghi nhận cho qua, vi phạm thì gắn cờ hoặc xử lý */}
      {actionable.length > 0 && (
        <div className="rounded-lg border border-stroke bg-surface p-4">
          <h3 className="mb-2.5 border-b border-[#f0f0f0] pb-2 text-xs font-semibold uppercase tracking-wider text-ink">
            Kết quả quy tắc cần xử lý ({actionable.length})
          </h3>
          <ul className="space-y-2.5 text-xs">
            {actionable.map((e) => {
              const hit = e.status === "HIT";
              const canStillAct = canAct && (!e.human_action || (e.human_action === "FLAGGED" && hit));
              return (
                <li key={e.id} className="rounded-md border border-[#f0f0f0] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", hit ? "bg-[#fde7e9] text-[#b10e1c]" : "bg-[#fff4ce] text-[#8a5300]")}>
                      {hit ? "Vi phạm" : "Cảnh báo"}
                    </span>
                    <code className="text-[11px]">{e.rule_id}</code>
                    <span className="text-ink-1">{e.rationale}</span>
                  </div>
                  <div className="mt-1 text-ink-3">
                    Căn cứ: {e.evidenceRefs.length ? e.evidenceRefs.join("; ") : "không có"}
                    {e.raw_value && <> · Quan sát: {e.raw_value}</>}
                    {e.threshold && <> · Ngưỡng: {e.threshold}</>}
                  </div>
                  {e.human_action && (
                    <div className="mt-1 text-ink-2">
                      <span className="font-semibold">{RULE_ACTION_LABEL[e.human_action] ?? e.human_action}</span>
                      {e.acted_at && ` lúc ${formatDate(e.acted_at, true)}`}{e.action_note && `: ${e.action_note}`}
                    </div>
                  )}
                  {canStillAct && (
                    <form action={ruleAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={oppId} />
                      <input type="hidden" name="evaluation_id" value={e.id} />
                      <input name="note" required className="input flex-1 !h-8 min-w-48" placeholder={hit ? "Lý do gắn cờ hoặc cách xử lý…" : "Ghi chú khi cho qua…"} />
                      {hit ? (
                        <>
                          {!e.human_action && <button name="action" value="FLAGGED" className="btn btn-sm">Gắn cờ</button>}
                          <button name="action" value="RISK" className="btn btn-sm">Chuyển thành rủi ro</button>
                          <button name="action" value="TASK" className="btn btn-sm">Tạo việc cần làm</button>
                        </>
                      ) : (
                        <button name="action" value="ACKNOWLEDGED" className="btn btn-sm">Ghi nhận và cho qua</button>
                      )}
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">Vi phạm đã gắn cờ sẽ hiện cho Quản lý kinh doanh khi rà soát chuyển giai đoạn.</p>
        </div>
      )}

      {/* G. BẢNG 10 QUY TẮC ĐẦY ĐỦ (THU GỌN, BẤM MỚI MỞ) */}
      <div className="rounded-lg border border-stroke overflow-hidden bg-surface">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-xs font-semibold hover:bg-[#fafafa]">
            <div className="flex items-center gap-2">
              <Icon name="check" size={14} className="text-success" />
              <span>Căn cứ bộ 10 quy tắc quản trị cơ hội ({evals.length} quy tắc)</span>
              <span className="font-normal text-ink-3">
                ({passCount} đạt · {hitCount} vi phạm · {warnCount} cảnh báo · {notEvalCount} thiếu dữ liệu)
              </span>
            </div>
            <span className="text-xs text-ink-3 group-open:rotate-180 transition-transform">▼ Bấm để mở</span>
          </summary>
          <div className="border-t border-[#f0f0f0] p-3">
            <RuleEvaluationTable rows={evals} />
          </div>
        </details>
      </div>

      {/* H. NGUỒN DẪN VÀ CHỨNG CỨ */}
      {sources.length > 0 && (
        <details className="group rounded-lg border border-stroke bg-surface text-xs">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 font-medium hover:bg-[#fafafa]">
            <span>Danh sách {sources.length} nguồn dẫn chứng cứ (Sources và Evidence)</span>
            <span className="text-xs text-ink-3 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <ul className="border-t border-[#f0f0f0] p-3 space-y-1.5 text-ink-2">
            {sources.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <code className="rounded bg-[#f5f5f5] px-1 py-0.5 text-[11px] font-mono text-ink-1 shrink-0">
                  {s.ref}
                </code>
                <span>
                  {s.detail}
                  {s.quote && <span className="text-ink-3 italic"> — &quot;{s.quote}&quot;</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* I. THAO TÁC XÁC MINH CỦA CON NGƯỜI (KHI CHỜ DUYỆT) */}
      {pending && canVerify && (
        <form id={verifyFormId} action={verifyAction} className="rounded-xl border border-brand/30 bg-brand-tint/20 p-4 space-y-3">
          <input type="hidden" name="id" value={oppId} />
          <input type="hidden" name="research_id" value={research.id} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-brand uppercase tracking-wider">
                Xác minh của Nhân viên kinh doanh
              </h4>
              <p className="text-xs text-ink-3">
                Agent chỉ đề xuất; người dùng xác nhận mới chính thức ghi nhận vào hồ sơ cơ hội.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer mr-2">
                <input type="checkbox" name="apply_importance" defaultChecked className="accent-[var(--brand)]" />
                <span className="font-medium">Áp dụng mức quan trọng ({LEVEL[research.importance as keyof typeof LEVEL] ?? research.importance})</span>
              </label>

              <SubmitButton variant="primary" icon="check">
                Xác minh và cập nhật hồ sơ
              </SubmitButton>

              <SubmitButton name="dismiss" value="1" icon="dismiss">
                Bỏ qua bản nghiên cứu
              </SubmitButton>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
