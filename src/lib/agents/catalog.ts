// Hồ sơ mô tả 2 Agent cho trang Trung tâm AI Agent.
// Công cụ, quy tắc và giới hạn đọc từ registry/cấu hình thật (TOOLS, OPPORTUNITY_RULES, settings) nên trang không mô tả sai code.
import { all, get } from "../db";
import { settingNumber } from "../services/core";
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
  { id: "BANT", source: "BR-01", title: "Chấm 4 tiêu chí 0–25; tổng do server tính; đạt chuẩn khi ≥ ngưỡng và Authority > 0" },
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

export function agentStats(agent: AgentName) {
  const runs = get<{ total: number; ok: number; last: string | null }>(
    "SELECT COUNT(*) total, COALESCE(SUM(status='SUCCEEDED'),0) ok, MAX(started_at) last FROM ai_runs WHERE agent=? AND started_at>=datetime('now','-7 days')",
    agent,
  )!;
  const pending = agent === "QUALIFICATION"
    ? get<{ n: number }>("SELECT COUNT(*) n FROM ai_suggestions WHERE status='PENDING_REVIEW' AND agent='QUALIFICATION'")?.n ?? 0
    : get<{ n: number }>("SELECT COUNT(*) n FROM opportunity_research WHERE status='PENDING_REVIEW'")?.n ?? 0;
  const denied = get<{ n: number }>("SELECT COUNT(*) n FROM tool_calls t JOIN ai_runs r ON r.id=t.run_id WHERE r.agent=? AND t.outcome='DENIED'", agent)?.n ?? 0;
  return { ...runs, pending, denied };
}

export function recentRuns(limit = 8) {
  return all<{ id: number; agent: string; trigger: string; status: string; entity_type: string; entity_id: number; model: string; started_at: string; summary: string | null; error: string | null }>(
    "SELECT id, agent, trigger, status, entity_type, entity_id, model, started_at, summary, error FROM ai_runs ORDER BY id DESC LIMIT ?",
    limit,
  );
}
