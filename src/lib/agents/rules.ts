// Rule engine của Sales Opportunity Agent (deterministic).
// Backend sở hữu ngưỡng, trạng thái, mức độ và cổng phê duyệt; LLM chỉ diễn giải kết quả đã khóa.
// Mỗi kết quả trả lời đủ: quy tắc nào → dữ liệu quan sát → so với ngưỡng nào → giới hạn kết luận → việc cần làm.
import { createHash } from "node:crypto";
import { all, get } from "../db";
import { setting, settingBool, settingNumber } from "../services/core";
import { competitorsOf, getOpportunity, risksOf, stakeholdersOf } from "../services/opportunities";

export const RULESET_VERSION = "opp-rules-v1";

export type RuleStatus = "PASSED" | "WARNING" | "HIT" | "NOT_EVALUABLE" | "NOT_APPLICABLE";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type HumanGate = "AE_VERIFY" | "MANAGER_REVIEW" | "EXPERT_REVIEW";
export type RiskCategory = "MISSING_DECISION_MAKER" | "DISENGAGED_STAKEHOLDER" | "COMPETITOR" | "TIMELINE" | "OVER_BUDGET" | "MISSING_BUDGET" | "OTHER";

export type RuleEvaluation = {
  rule_id: string;
  br: string;
  title: string;
  status: RuleStatus;
  severity: Severity | null;
  raw_value: string | number | null;
  threshold: string | number | null;
  rationale: string;
  limitation: string | null;
  evidence_refs: string[];
  required_action: { action: string; owner_role: string } | null;
  risk_category: RiskCategory | null;
  human_gate: HumanGate | null;
};

export type RuleOutcome = {
  ruleset_version: string;
  ruleset_hash: string;
  evaluations: RuleEvaluation[];
  importance: Severity;
  importance_reason: string;
  risks: { rule_id: string; category: RiskCategory; severity: Severity; description: string; sources: { ref: string }[] }[];
  next_actions: { action: string; owner_role: string; why: string; rule_id: string }[];
  additional_actions: { action: string; owner_role: string; why: string; rule_id: string }[];
  gates: HumanGate[];
  confidence: number;
  confidence_band: "HIGH" | "MEDIUM" | "LOW";
};

// Danh mục quy tắc: nguồn nghiệp vụ (BR) và tham số cấu hình đọc từ settings — không hard-code ngưỡng.
export const OPPORTUNITY_RULES = [
  { id: "OPP-R01", br: "BR-08", title: "Mức quan trọng của cơ hội", settings: ["importance_high_amount", "importance_medium_amount", "segment_enterprise_min_employees"] },
  { id: "OPP-R02", br: "BR-01 (Authority)", title: "Đã ghi nhận người quyết định", settings: [] },
  { id: "OPP-R03", br: "FR-37", title: "Đã ghi nhận và xác nhận nhu cầu khách hàng", settings: [] },
  { id: "OPP-R04", br: "FR-40", title: "Đối thủ cạnh tranh trong thương vụ", settings: [] },
  { id: "OPP-R05", br: "BR-15", title: "Tương tác email trong cửa sổ theo dõi", settings: ["email_window_days"] },
  { id: "OPP-R06", br: "BR-15", title: "Áp lực ngày chốt so với giai đoạn", settings: ["opp_close_warning_days"] },
  { id: "OPP-R07", br: "FR-35", title: "Doanh thu dự kiến so với ngân sách khách", settings: [] },
  { id: "OPP-R08", br: "FR-41", title: "Giải pháp đã được xác nhận", settings: [] },
  { id: "OPP-R09", br: "BR-06", title: "Cổng rà soát của QLKD", settings: ["manager_gate_mode"] },
  { id: "OPP-R10", br: "BR-07", title: "Cổng rà soát chuyên môn", settings: ["expert_review_enabled", "expert_review_min_amount"] },
] as const;

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

/** Hash của bộ quy tắc + giá trị tham số tại thời điểm chạy, để truy vết lần chạy dùng bộ quy tắc nào. */
export function rulesetHash(): string {
  const snapshot = OPPORTUNITY_RULES.map((r) => ({ ...r, values: r.settings.map((k) => [k, setting(k)]) }));
  return createHash("sha256").update(JSON.stringify({ v: RULESET_VERSION, snapshot })).digest("hex").slice(0, 16);
}

function firstNumber(text: string | null | undefined): number | null {
  const m = String(text ?? "").replace(/[.,](?=\d{3})/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

function base(id: string): Pick<RuleEvaluation, "rule_id" | "br" | "title"> {
  const def = OPPORTUNITY_RULES.find((r) => r.id === id)!;
  return { rule_id: def.id, br: def.br, title: def.title };
}

const empty = { severity: null, limitation: null, required_action: null, risk_category: null, human_gate: null } as const;

export function evaluateOpportunityRules(opportunityId: number): RuleOutcome {
  const o = getOpportunity(opportunityId);
  if (!o) throw new Error("Không tìm thấy Opportunity");
  const stakeholders = stakeholdersOf(o.id);
  const competitors = competitorsOf(o.id);
  const openRisks = risksOf(o.id).filter((r) => r.status === "OPEN");
  const account = get<{ employee_size: string | null }>("SELECT employee_size FROM accounts WHERE id=?", o.account_id);
  const ev: RuleEvaluation[] = [];

  // OPP-R01 — BR-08
  const high = settingNumber("importance_high_amount");
  const medium = settingNumber("importance_medium_amount");
  const employees = firstNumber(account?.employee_size);
  const enterprise = employees !== null && employees >= settingNumber("segment_enterprise_min_employees");
  const importance: Severity = o.amount >= high || enterprise ? "HIGH" : o.amount >= medium ? "MEDIUM" : "LOW";
  const importanceReason = enterprise && o.amount < high
    ? `Khách nhóm Enterprise (${account?.employee_size} nhân sự) → mức Cao theo BR-08`
    : `Doanh thu ước tính ${vnd(o.amount)}; ngưỡng Trung bình ${vnd(medium)}, Cao ${vnd(high)} (BR-08)`;
  ev.push({
    ...base("OPP-R01"), ...empty, status: "PASSED", raw_value: o.amount, threshold: `${medium} / ${high}`,
    rationale: importanceReason,
    limitation: employees === null ? "Chưa có quy mô nhân sự của khách nên chưa xét điều kiện Enterprise" : null,
    evidence_refs: ["opportunity.amount", ...(account?.employee_size ? ["account.employee_size"] : [])],
    human_gate: "AE_VERIFY",
  });

  // OPP-R02 — người quyết định
  const dm = stakeholders.filter((s) => s.role === "DECISION_MAKER").length;
  ev.push(dm > 0
    ? { ...base("OPP-R02"), ...empty, status: "PASSED", raw_value: dm, threshold: "≥ 1", rationale: `Có ${dm} bên liên quan mang vai trò Người quyết định`, evidence_refs: ["opportunity.stakeholders"] }
    : { ...base("OPP-R02"), ...empty, status: "HIT", severity: "HIGH", raw_value: 0, threshold: "≥ 1",
        rationale: "Danh sách bên liên quan chưa có vai trò Người quyết định",
        limitation: "Hồ sơ chưa ghi nhận người quyết định; chưa đủ căn cứ khẳng định doanh nghiệp chưa tiếp cận được người đó",
        evidence_refs: ["opportunity.stakeholders"], risk_category: "MISSING_DECISION_MAKER",
        required_action: { action: "Xác minh người quyết định và cập nhật vai trò trong Bên liên quan", owner_role: "AE" } });

  // OPP-R03 — nhu cầu
  if (!o.customer_need?.trim()) ev.push({ ...base("OPP-R03"), ...empty, status: "HIT", severity: "HIGH", raw_value: null, threshold: "Có nội dung",
    rationale: "Chưa ghi nhận nhu cầu khách hàng", evidence_refs: ["opportunity.customer_need"], risk_category: "OTHER",
    required_action: { action: "Tổ chức khảo sát nhu cầu và ghi vào hồ sơ", owner_role: "AE" } });
  else if (!o.need_confirmed) ev.push({ ...base("OPP-R03"), ...empty, status: "WARNING", severity: "LOW", raw_value: "Chưa xác nhận", threshold: "Đã xác nhận",
    rationale: "Đã có nhu cầu nhưng mục kiểm soát Nhu cầu chưa được xác nhận", evidence_refs: ["opportunity.customer_need"],
    required_action: { action: "Xác nhận nhu cầu với khách và đánh dấu mục kiểm soát", owner_role: "AE" } });
  else ev.push({ ...base("OPP-R03"), ...empty, status: "PASSED", raw_value: "Đã xác nhận", threshold: "Đã xác nhận", rationale: "Nhu cầu đã được ghi nhận và xác nhận", evidence_refs: ["opportunity.customer_need"] });

  // OPP-R04 — đối thủ
  if (competitors.length) ev.push({ ...base("OPP-R04"), ...empty, status: "WARNING", severity: "MEDIUM", raw_value: competitors.map((c) => c.name).join(", "), threshold: "0 đối thủ",
    rationale: `Thương vụ đang được so sánh với ${competitors.length} phương án`, evidence_refs: ["opportunity.competitors"], risk_category: "COMPETITOR",
    limitation: "Danh sách lấy từ hồ sơ nhân viên đã ghi; Agent không tự thêm đối thủ",
    required_action: { action: `Chuẩn bị bảng so sánh với ${competitors[0].name}`, owner_role: "AE" } });
  else if (o.competitors_confirmed) ev.push({ ...base("OPP-R04"), ...empty, status: "PASSED", raw_value: 0, threshold: "0 đối thủ", rationale: "Đã xác nhận không có đối thủ", evidence_refs: ["opportunity.competitors_confirmed"] });
  else ev.push({ ...base("OPP-R04"), ...empty, status: "NOT_EVALUABLE", raw_value: null, threshold: null, rationale: "Chưa ghi đối thủ và chưa xác nhận là không có đối thủ",
    limitation: "Không có dữ liệu thì không kết luận là không có cạnh tranh", evidence_refs: ["opportunity.competitors"],
    required_action: { action: "Hỏi khách đang so sánh với phương án nào (kể cả Excel)", owner_role: "AE" } });

  // OPP-R05 — tương tác email (BR-15)
  const days = settingNumber("email_window_days");
  const anyEmail = get<{ n: number }>("SELECT COUNT(*) n FROM activities WHERE type='EMAIL' AND ((entity_type='opportunity' AND entity_id=?) OR (entity_type='lead' AND entity_id=?))", o.id, o.lead_id ?? 0)!.n;
  const recentIn = get<{ n: number }>("SELECT COUNT(*) n FROM activities WHERE type='EMAIL' AND direction='IN' AND ((entity_type='opportunity' AND entity_id=?) OR (entity_type='lead' AND entity_id=?)) AND occurred_at>=datetime('now',?)", o.id, o.lead_id ?? 0, `-${days} days`)!.n;
  if (!anyEmail) ev.push({ ...base("OPP-R05"), ...empty, status: "NOT_EVALUABLE", raw_value: null, threshold: `≥ 1 email nhận trong ${days} ngày`,
    rationale: "Hồ sơ chưa có email nào được đồng bộ", limitation: "Không có email không chứng minh khách im lặng; có thể chưa đồng bộ", evidence_refs: ["activities.email"] });
  else if (!recentIn) ev.push({ ...base("OPP-R05"), ...empty, status: "HIT", severity: "MEDIUM", raw_value: 0, threshold: `≥ 1 email nhận trong ${days} ngày`,
    rationale: `Có lịch sử email nhưng không có email nhận trong ${days} ngày gần nhất`, limitation: "Chỉ tính email đã đồng bộ vào hệ thống",
    evidence_refs: ["activities.email"], risk_category: "DISENGAGED_STAKEHOLDER",
    required_action: { action: "Gửi follow-up tóm tắt buổi trao đổi gần nhất và đề xuất bước tiếp theo", owner_role: "AE" } });
  else ev.push({ ...base("OPP-R05"), ...empty, status: "PASSED", raw_value: recentIn, threshold: `≥ 1 email nhận trong ${days} ngày`, rationale: `${recentIn} email nhận trong cửa sổ theo dõi`, evidence_refs: ["activities.email"] });

  // OPP-R06 — ngày chốt
  const warnDays = settingNumber("opp_close_warning_days");
  if (!o.close_date) ev.push({ ...base("OPP-R06"), ...empty, status: "NOT_EVALUABLE", raw_value: null, threshold: `< ${warnDays} ngày`, rationale: "Chưa có ngày chốt dự kiến", evidence_refs: ["opportunity.close_date"],
    required_action: { action: "Thống nhất ngày chốt dự kiến với khách", owner_role: "AE" } });
  else {
    const left = Math.ceil((new Date(o.close_date).getTime() - Date.now()) / 86400000);
    const hit = left < warnDays && o.stage === "DEVELOP";
    ev.push(hit
      ? { ...base("OPP-R06"), ...empty, status: "HIT", severity: "HIGH", raw_value: left, threshold: `< ${warnDays} ngày khi còn ở Develop`,
          rationale: `Còn ${left} ngày tới ngày chốt nhưng vẫn ở giai đoạn Phát triển`, evidence_refs: ["opportunity.close_date", "opportunity.stage"], risk_category: "TIMELINE",
          required_action: { action: "Rà lại kế hoạch chốt hoặc cập nhật ngày chốt thực tế", owner_role: "AE" } }
      : { ...base("OPP-R06"), ...empty, status: "PASSED", raw_value: left, threshold: `< ${warnDays} ngày khi còn ở Develop`, rationale: `Còn ${left} ngày tới ngày chốt`, evidence_refs: ["opportunity.close_date"] });
  }

  // OPP-R07 — ngân sách
  if (!o.budget) ev.push({ ...base("OPP-R07"), ...empty, status: "NOT_EVALUABLE", severity: "LOW", raw_value: o.amount, threshold: "Ngân sách khách", rationale: "Chưa có ngân sách của khách để so sánh",
    evidence_refs: ["opportunity.amount"], risk_category: "MISSING_BUDGET", required_action: { action: "Hỏi khoảng ngân sách dự kiến của khách", owner_role: "AE" } });
  else if (o.amount > o.budget) ev.push({ ...base("OPP-R07"), ...empty, status: "HIT", severity: "MEDIUM", raw_value: o.amount, threshold: o.budget,
    rationale: `Doanh thu dự kiến ${vnd(o.amount)} vượt ngân sách khách ${vnd(o.budget)}`, evidence_refs: ["opportunity.amount", "opportunity.budget"], risk_category: "OVER_BUDGET",
    required_action: { action: "Rà lại phạm vi hoặc chia giai đoạn để khớp ngân sách", owner_role: "AE" } });
  else ev.push({ ...base("OPP-R07"), ...empty, status: "PASSED", raw_value: o.amount, threshold: o.budget, rationale: `Doanh thu dự kiến ${vnd(o.amount)} nằm trong ngân sách ${vnd(o.budget)}`, evidence_refs: ["opportunity.amount", "opportunity.budget"] });

  // OPP-R08 — giải pháp
  ev.push(o.solution_confirmed
    ? { ...base("OPP-R08"), ...empty, status: "PASSED", raw_value: "Đã xác nhận", threshold: "Đã xác nhận", rationale: "Giải pháp đã được xác nhận", evidence_refs: ["opportunity.solution_confirmed"] }
    : { ...base("OPP-R08"), ...empty, status: "WARNING", severity: "MEDIUM", raw_value: "Chưa xác nhận", threshold: "Đã xác nhận", rationale: "Mục kiểm soát Giải pháp chưa được xác nhận",
        evidence_refs: ["opportunity.solution_confirmed"], required_action: { action: "Phối hợp Presales hoàn thiện và xác nhận giải pháp", owner_role: "PRESALES" } });

  // OPP-R09 — BR-06: Cao hoặc còn rủi ro mở (rủi ro mở gồm rủi ro đã ghi + rủi ro rule vừa phát hiện)
  const ruleRiskCount = ev.filter((e) => e.status === "HIT").length;
  const mode = setting("manager_gate_mode");
  const needManager = mode === "ALWAYS" || (mode !== "NEVER" && (importance === "HIGH" || openRisks.length > 0 || ruleRiskCount > 0));
  ev.push({ ...base("OPP-R09"), ...empty, status: needManager ? "WARNING" : "PASSED", raw_value: `${importance}; ${openRisks.length} rủi ro mở; ${ruleRiskCount} rủi ro mới`, threshold: "Cao hoặc ≥ 1 rủi ro mở",
    rationale: needManager ? "Thuộc diện QLKD rà soát trước khi chuyển giai đoạn" : "Không thuộc diện QLKD rà soát", evidence_refs: ["opportunity.importance", "opportunity.risks"],
    human_gate: needManager ? "MANAGER_REVIEW" : null });

  // OPP-R10 — BR-07
  if (!settingBool("expert_review_enabled")) ev.push({ ...base("OPP-R10"), ...empty, status: "NOT_APPLICABLE", raw_value: null, threshold: null, rationale: "Cổng rà soát chuyên môn đang tắt", evidence_refs: [] });
  else {
    const integ = all<{ integration_required: number }>("SELECT integration_required FROM solutions WHERE opportunity_id=? ORDER BY id DESC LIMIT 1", o.id)[0]?.integration_required;
    const min = settingNumber("expert_review_min_amount");
    const need = !!integ || o.amount >= min;
    ev.push({ ...base("OPP-R10"), ...empty, status: need ? "WARNING" : "PASSED", raw_value: `${integ ? "Có" : "Không"} tích hợp; ${vnd(o.amount)}`, threshold: `Tích hợp hoặc ≥ ${vnd(min)}`,
      rationale: need ? "Hồ sơ giải pháp cần rà soát chuyên môn" : "Không cần rà soát chuyên môn", evidence_refs: ["solution.integration_required", "opportunity.amount"],
      human_gate: need ? "EXPERT_REVIEW" : null });
  }

  return derive(ev, importance, importanceReason);
}

function derive(ev: RuleEvaluation[], importance: Severity, importanceReason: string): RuleOutcome {
  const risks = ev.filter((e) => e.status === "HIT" && e.risk_category && e.severity).map((e) => ({
    rule_id: e.rule_id, category: e.risk_category!, severity: e.severity!, description: e.limitation ? `${e.rationale}. ${e.limitation}` : e.rationale,
    sources: e.evidence_refs.map((ref) => ({ ref })),
  }));
  // Ưu tiên: HIT trước WARNING/NOT_EVALUABLE, rồi theo mức độ — không lấy "3 câu đầu theo thứ tự code".
  const rank = (e: RuleEvaluation) => (e.status === "HIT" ? 0 : e.status === "WARNING" ? 10 : 20) + SEVERITY_ORDER[e.severity ?? "LOW"];
  const actions = ev.filter((e) => e.required_action).sort((a, b) => rank(a) - rank(b))
    .map((e) => ({ ...e.required_action!, why: `${e.rule_id}: ${e.rationale}`, rule_id: e.rule_id }));
  const applicable = ev.filter((e) => e.status !== "NOT_APPLICABLE");
  const evaluable = applicable.filter((e) => e.status !== "NOT_EVALUABLE").length;
  // Độ chắc chắn = mức bao phủ dữ liệu của các quy tắc, không phải xác suất "AI nói đúng".
  const confidence = applicable.length ? Math.round((evaluable / applicable.length) * 100) / 100 : 0;
  return {
    ruleset_version: RULESET_VERSION,
    ruleset_hash: rulesetHash(),
    evaluations: ev,
    importance,
    importance_reason: importanceReason,
    risks,
    next_actions: actions.slice(0, 3),
    additional_actions: actions.slice(3),
    gates: [...new Set(ev.map((e) => e.human_gate).filter((g): g is HumanGate => !!g))],
    confidence,
    confidence_band: confidence >= 0.8 ? "HIGH" : confidence >= settingNumber("ai_min_confidence") ? "MEDIUM" : "LOW",
  };
}
