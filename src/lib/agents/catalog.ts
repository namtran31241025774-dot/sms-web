// Hồ sơ mô tả 2 Agent cho trang Trung tâm AI Agent.
// Công cụ, quy tắc và giới hạn đọc từ registry/cấu hình thật (TOOLS, OPPORTUNITY_RULES, settings) nên trang không mô tả sai code.
import { all, get } from "../db";
import type { UserScope } from "../scope";
import { recordVisible } from "../services/access";
import { setting, settingBool, settingNumber } from "../services/core";
import { agentMode } from "./runtime";
import { PROMPT_VERSION } from "./prompts";
import { OPPORTUNITY_RULES, RULESET_VERSION } from "./rules";
import { TOOLS, toolsFor, type AgentName } from "./tools";

export type WorkflowOwner = "SYSTEM" | "LLM" | "RULES" | "HUMAN";
export type WorkflowStep = { key: string; title: string; owner: WorkflowOwner; detail: string };

export type AgentProfile = {
  name: AgentName;
  title: string;
  stage: string;
  mission: string;
  triggers: string[];
  reads: string[];
  rules: { id: string; source: string; title: string }[];
  forbidden: string[];
  gates: { code: string; title: string; who: string }[];
  outputs: string[];
  workflow: WorkflowStep[];
};

const QUALIFICATION_RULES = [
  { id: "BANT", source: "REBUILD-01 Q1 (BR-01 cần đồng bộ)", title: "Chấm 0/8/15/25; tổng do server tính; đạt chuẩn khi ≥ ngưỡng và Authority = 25 (đã xác định người quyết định)" },
  { id: "RATING", source: "BR-02", title: "Mức Nóng / Ấm / Lạnh chỉ thành chính thức khi NVKD xác nhận" },
  { id: "NEED_INFO", source: "BUG-010", title: "Confidence < 0,6 hoặc dữ liệu mâu thuẫn → ép NEED_INFO, chuyển người" },
  { id: "EVIDENCE", source: "BUG-006/007", title: "Mỗi đề xuất cần ≥ 1 căn cứ server xác thực được" },
  { id: "DEDUPE", source: "BR-21", title: "Chỉ cảnh báo trùng, không bao giờ tự gộp" },
];

export const AGENT_PROFILES: AgentProfile[] = [
  {
    name: "QUALIFICATION",
    title: "Sales Qualification Agent",
    stage: "Qualify",
    mission: "Sàng lọc Lead: chấm BANT có căn cứ, đề xuất làm giàu dữ liệu, loại hoặc chuyển đổi, soạn email hỏi phần còn thiếu.",
    triggers: ["Lead mới tạo hoặc nhập file", "Lead nhận email mới", "BANT được cập nhật", "SDR bấm chạy"],
    reads: ["Hồ sơ Lead", "Tương tác của Lead", "Tiêu chí TCP / BANT do Admin cấu hình", "Kết quả tìm web (dữ liệu không tin cậy)"],
    rules: QUALIFICATION_RULES,
    forbidden: ["Gửi email", "Loại Lead", "Chuyển đổi Lead thành cơ hội", "Gộp bản ghi trùng"],
    gates: [
      { code: "HG1", title: "Duyệt email do Agent soạn", who: "NVKD" },
      { code: "HG2", title: "Duyệt đề xuất loại Lead", who: "NVKD" },
      { code: "HG3", title: "Người kích hoạt chuyển đổi", who: "NVKD" },
    ],
    outputs: ["ai_suggestions (chờ duyệt)", "ai_evidence", "email nháp"],
    workflow: [
      { key: "trigger", title: "Kích hoạt", owner: "SYSTEM", detail: "Sự kiện Lead hoặc SDR bấm chạy" },
      { key: "guard", title: "Kiểm tra an toàn", owner: "SYSTEM", detail: "Agent bật, kill switch, ngân sách, Lead đang mở" },
      { key: "read", title: "Thu thập dữ liệu", owner: "LLM", detail: "Gọi công cụ đọc Lead, tương tác, tiêu chí, web" },
      { key: "rules", title: "Chấm theo quy tắc", owner: "RULES", detail: "Server tính tổng BANT, ép NEED_INFO khi chưa chắc" },
      { key: "propose", title: "Đề xuất", owner: "LLM", detail: "Làm giàu / BANT / loại / chuyển đổi / email hỏi thêm" },
      { key: "evidence", title: "Kiểm căn cứ & lưu", owner: "SYSTEM", detail: "Xác thực nguồn, lưu chờ duyệt" },
      { key: "human", title: "Con người duyệt", owner: "HUMAN", detail: "SDR duyệt HG1–HG3" },
    ],
  },
  {
    name: "OPPORTUNITY",
    title: "Sales Opportunity Agent",
    stage: "Develop · Propose",
    mission: "Nghiên cứu cơ hội: mức quan trọng, rủi ro, tối đa 3 hành động ưu tiên, kèm quy tắc, căn cứ và giới hạn kết luận.",
    triggers: ["Cơ hội vừa được chuyển đổi", "Trường trọng yếu thay đổi (BR-15)", `Làm mới định kỳ mỗi ${"{h}"} giờ`, "AE bấm chạy"],
    reads: ["Hồ sơ cơ hội, checklist, bên liên quan, đối thủ, rủi ro", "Email nhận trong cửa sổ BR-15", "Ghi chú cuộc họp", "Lịch sử thắng/thua", "Kết quả tìm web (dữ liệu không tin cậy)"],
    rules: OPPORTUNITY_RULES.map((r) => ({ id: r.id, source: r.br, title: r.title })),
    forbidden: ["Sửa doanh thu, ngày chốt, giai đoạn, giá", "Tick checklist", "Tự thêm đối thủ / rủi ro vào hồ sơ", "Tự đặt mức quan trọng", "Liên hệ khách hàng"],
    gates: [
      { code: "HG4", title: "Xác minh bản nghiên cứu", who: "AE" },
      { code: "HG5", title: "Xử lý / bỏ qua rủi ro có lý do", who: "AE" },
      { code: "HG6", title: "Rà soát trước khi chuyển giai đoạn", who: "QLKD" },
    ],
    outputs: ["opportunity_research (chờ xác minh)", "ai_rule_evaluations (10 dòng / lần)", "ai_evidence", "thông báo cho AE khi có rủi ro Cao"],
    workflow: [
      { key: "trigger", title: "Kích hoạt", owner: "SYSTEM", detail: "Sự kiện, lịch định kỳ hoặc AE bấm chạy" },
      { key: "guard", title: "Kiểm tra an toàn", owner: "SYSTEM", detail: "Agent bật, kill switch, ngân sách, đúng giai đoạn, không chạy trùng" },
      { key: "read", title: "Thu thập dữ liệu", owner: "LLM", detail: "Gọi công cụ đọc hồ sơ, email, ghi chú, web, lịch sử" },
      { key: "rules", title: "Áp bộ quy tắc", owner: "RULES", detail: "OPP-R01..R10: mức quan trọng, rủi ro, thứ tự hành động, cổng duyệt" },
      { key: "explain", title: "Diễn giải", owner: "LLM", detail: "Tóm tắt, insight 6 mục, rủi ro ngoài quy tắc (chưa phân loại)" },
      { key: "evidence", title: "Kiểm căn cứ & lưu", owner: "SYSTEM", detail: "Xác thực nguồn, khóa kết quả quy tắc, lưu chờ xác minh" },
      { key: "verify", title: "AE xác minh", owner: "HUMAN", detail: "Chọn rủi ro đưa vào hồ sơ (HG4)" },
      { key: "manager", title: "QLKD rà soát", owner: "HUMAN", detail: "Khi mức Cao hoặc còn rủi ro mở (HG6)" },
    ],
  },
];

export function agentTools(agent: AgentName) {
  return toolsFor(agent).map((name) => ({ name, access: TOOLS[name].access, description: TOOLS[name].description }));
}

export function agentLimits() {
  return [
    { label: "Ngân sách token / ngày / Agent", value: settingNumber("ai_daily_token_budget").toLocaleString("vi-VN"), source: "BR-16" },
    { label: "Vòng gọi công cụ tối đa / lần", value: String(settingNumber("ai_max_iterations")), source: "BR-16" },
    { label: "Token tối đa / lần chạy", value: settingNumber("ai_max_tokens_per_run").toLocaleString("vi-VN"), source: "BR-24" },
    { label: "Lượt tìm web tối đa / lần", value: String(settingNumber("ai_max_web_searches_per_run")), source: "BR-24" },
    { label: "Thời gian tối đa / lần", value: `${settingNumber("ai_run_timeout_sec")} giây`, source: "BR-23" },
    { label: "Độ bao phủ dữ liệu tối thiểu", value: String(settingNumber("ai_min_confidence")), source: "BR-28" },
  ];
}

export function agentRuntimeInfo() {
  return { mode: agentMode(), prompts: PROMPT_VERSION, ruleset: RULESET_VERSION, refreshHours: settingNumber("opp_refresh_hours") };
}

type Visible = { entity_type: "lead" | "opportunity"; entity_id: number };
const visibleTo = (user: UserScope) => <T extends Visible>(r: T) => recordVisible(user, r.entity_type, r.entity_id);

/** Thống kê 7 ngày, chỉ tính hồ sơ người xem được phép thấy (FR-98). */
export function agentStats(agent: AgentName, user: UserScope) {
  const runs = all<Visible & { status: string; denied: number }>(
    `SELECT r.entity_type, r.entity_id, r.status,
       (SELECT COUNT(*) FROM tool_calls t WHERE t.run_id = r.id AND t.outcome = 'DENIED') AS denied
     FROM ai_runs r WHERE r.agent = ? AND r.started_at >= datetime('now','-7 days')`,
    agent,
  ).filter(visibleTo(user));
  const pending = (agent === "QUALIFICATION"
    ? all<Visible>("SELECT entity_type, entity_id FROM ai_suggestions WHERE status='PENDING_REVIEW' AND agent='QUALIFICATION'")
    : all<Visible>("SELECT 'opportunity' AS entity_type, opportunity_id AS entity_id FROM opportunity_research WHERE status='PENDING_REVIEW'")
  ).filter(visibleTo(user)).length;
  return {
    total: runs.length,
    ok: runs.filter((r) => r.status === "SUCCEEDED").length,
    pending,
    denied: runs.reduce((n, r) => n + r.denied, 0),
  };
}

export function recentRuns(user: UserScope, limit = 8) {
  return all<Visible & { id: number; agent: string; trigger: string; status: string; model: string; started_at: string; summary: string | null; error: string | null }>(
    "SELECT id, agent, trigger, status, entity_type, entity_id, model, started_at, summary, error FROM ai_runs ORDER BY id DESC LIMIT 200",
  ).filter(visibleTo(user)).slice(0, limit);
}

/** Số liệu 7 ngày cho từng lớp kiểm soát, chỉ trên hồ sơ người xem được thấy (FR-98). */
export function controlLayerStats(user: UserScope) {
  const runs = all<Visible & { status: string; denied: number; errors: number; evidence: number; hits: number; missing: number; overridden: number; research: string | null; suggestions: number; suggestions_pending: number }>(
    `SELECT r.entity_type, r.entity_id, r.status,
       (SELECT COUNT(*) FROM tool_calls t WHERE t.run_id = r.id AND t.outcome = 'DENIED') AS denied,
       (SELECT COUNT(*) FROM tool_calls t WHERE t.run_id = r.id AND t.outcome = 'ERROR') AS errors,
       (SELECT COUNT(*) FROM ai_evidence e WHERE e.run_id = r.id) AS evidence,
       (SELECT COUNT(*) FROM ai_rule_evaluations v WHERE v.run_id = r.id AND v.status = 'HIT') AS hits,
       (SELECT COUNT(*) FROM ai_rule_evaluations v WHERE v.run_id = r.id AND v.status = 'NOT_EVALUABLE') AS missing,
       (SELECT COUNT(*) FROM opportunity_research o WHERE o.run_id = r.id AND o.llm_importance IS NOT NULL AND o.llm_importance <> o.importance) AS overridden,
       (SELECT o.status FROM opportunity_research o WHERE o.run_id = r.id ORDER BY o.id DESC LIMIT 1) AS research,
       (SELECT COUNT(*) FROM ai_suggestions s WHERE s.run_id = r.id) AS suggestions,
       (SELECT COUNT(*) FROM ai_suggestions s WHERE s.run_id = r.id AND s.status = 'PENDING_REVIEW') AS suggestions_pending
     FROM ai_runs r WHERE r.started_at >= datetime('now','-7 days')`,
  ).filter(visibleTo(user));
  const sum = (k: keyof (typeof runs)[number]) => runs.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const results = runs.filter((r) => r.research).length + sum("suggestions");
  const pending = runs.filter((r) => r.research === "PENDING_REVIEW").length + sum("suggestions_pending");
  return {
    runs: runs.length,
    failed: runs.filter((r) => r.status === "FAILED").length,
    denied: sum("denied"),
    toolErrors: sum("errors"),
    evidence: sum("evidence"),
    hits: sum("hits"),
    missing: sum("missing"),
    overridden: sum("overridden"),
    pending,
    decided: results - pending,
  };
}

/** Trạng thái lớp kiểm tra trước khi chạy (chỉ đọc — không gọi checkPreRunConstraints vì hàm đó gửi cảnh báo ngân sách). */
export function preRunStatus(agent: AgentName) {
  const killed = setting("ai_status") === "PAUSED" || setting("ai_emergency_kill") === "true";
  const enabled = settingBool(agent === "QUALIFICATION" ? "agent_qualification_enabled" : "agent_opportunity_enabled");
  const budget = settingNumber("ai_daily_token_budget");
  const used = get<{ total: number }>("SELECT COALESCE(SUM(input_tokens + output_tokens),0) AS total FROM ai_runs WHERE agent=? AND date(started_at)=date('now')", agent)?.total ?? 0;
  return { killed, enabled, used, budget, ok: !killed && enabled && used < budget };
}
