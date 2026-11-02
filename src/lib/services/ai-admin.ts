// Dịch vụ quản trị và giám sát tác nhân AI (WP-08, FR-88 -> FR-95, BR-16, BR-23 -> BR-27).
// Dành cho ADMIN và SALES_MANAGER.
import { all, get, run, tx } from "../db";
import { assert, DomainError } from "../domain";
import { can } from "../rbac";
import { actorUserId, audit, notifyRole, setting, settingNumber, type Actor } from "./core";

export type AgentConfig = {
  id: number;
  agent_id: "QUALIFICATION" | "OPPORTUNITY";
  version_no: number;
  instructions: string;
  model_reference: string;
  criteria_snapshot: string | null;
  schedule_rule: string | null;
  budget_limit: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  eval_report_ref: string | null;
  eval_passed: number;
  configured_by: number | null;
  configured_by_name: string | null;
  business_approved_by: number | null;
  business_approved_by_name: string | null;
  effective_at: string | null;
  created_at: string;
};

export type AiRunRecord = {
  id: number;
  agent: "QUALIFICATION" | "OPPORTUNITY";
  trigger: string;
  entity_type: string;
  entity_id: number;
  model: string;
  config_id: number | null;
  retry_of_run_id: number | null;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  summary: string | null;
  stop_reason: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  latency_ms: number;
  cost: number;
  triggered_by: number | null;
  triggered_by_name: string | null;
  started_at: string;
  finished_at: string | null;
};

export type ToolCallRecord = {
  id: number;
  run_id: number;
  tool_name: string;
  outcome: "OK" | "ERROR" | "DENIED";
  input_redacted: string | null;
  output_summary: string | null;
  duration_ms: number;
  created_at: string;
};

export type AiFeedbackRecord = {
  id: number;
  run_id: number | null;
  suggestion_id: number | null;
  research_id: number | null;
  user_id: number;
  user_name: string;
  rating: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  feedback_type: string | null;
  comment: string | null;
  created_at: string;
};

// ======================== 1. GIÁM SÁT & VẬN HÀNH (FR-90, BR-23) ========================

/**
 * Thống kê tổng quan giám sát cho ADMIN:
 * - Token tiêu thụ hôm nay vs ngân sách ngày (BR-16)
 * - Tỷ lệ lỗi 24h & cảnh báo nếu >= 20% (BR-23)
 * - Số tool call bị DENIED (BR-23)
 * - Tỷ lệ con người chỉnh sửa (BR-26)
 */
export function getAiMonitoringStats() {
  const dailyBudget = settingNumber("ai_daily_token_budget");
  const alertThresholdPct = settingNumber("ai_alert_failure_rate_pct");
  const minRunsForAlert = settingNumber("ai_alert_min_runs");

  // 1. Token tiêu thụ trong ngày hôm nay (cộng input + output)
  const tokenUsage = get<{ total_tokens: number; qual_tokens: number; opp_tokens: number }>(`
    SELECT
      COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
      COALESCE(SUM(CASE WHEN agent='QUALIFICATION' THEN input_tokens + output_tokens ELSE 0 END), 0) AS qual_tokens,
      COALESCE(SUM(CASE WHEN agent='OPPORTUNITY' THEN input_tokens + output_tokens ELSE 0 END), 0) AS opp_tokens
    FROM ai_runs
    WHERE date(started_at) = date('now')
  `) ?? { total_tokens: 0, qual_tokens: 0, opp_tokens: 0 };

  const tokenUsagePct = Math.min(100, Math.round((tokenUsage.total_tokens / dailyBudget) * 100));

  // 2. Thống kê 24h gần nhất
  const runs24h = get<{ total_runs: number; failed_runs: number; succeeded_runs: number }>(`
    SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed_runs,
      SUM(CASE WHEN status='SUCCEEDED' THEN 1 ELSE 0 END) AS succeeded_runs
    FROM ai_runs
    WHERE started_at >= datetime('now', '-24 hours')
  `) ?? { total_runs: 0, failed_runs: 0, succeeded_runs: 0 };

  const failureRatePct = runs24h.total_runs >= minRunsForAlert
    ? Math.round((runs24h.failed_runs / runs24h.total_runs) * 100)
    : 0;

  // 3. Số lượt gọi công cụ bị chặn vì quyền (DENIED) trong 24h
  const deniedCalls24h = get<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM tool_calls
    WHERE outcome = 'DENIED' AND created_at >= datetime('now', '-24 hours')
  `)?.count ?? 0;

  // 4. Trạng thái Kill Switch (FR-93)
  const aiStatus = setting("ai_status") || "ACTIVE";
  const isEmergencyPaused = aiStatus === "PAUSED" || setting("ai_emergency_kill") === "true";

  // 5. Thống kê phản hồi chất lượng (FR-90)
  const feedbackStats = get<{ positive: number; negative: number; neutral: number }>(`
    SELECT
      SUM(CASE WHEN rating='POSITIVE' THEN 1 ELSE 0 END) AS positive,
      SUM(CASE WHEN rating='NEGATIVE' THEN 1 ELSE 0 END) AS negative,
      SUM(CASE WHEN rating='NEUTRAL' THEN 1 ELSE 0 END) AS neutral
    FROM ai_feedback
  `) ?? { positive: 0, negative: 0, neutral: 0 };

  return {
    dailyBudget,
    tokenUsageToday: tokenUsage.total_tokens,
    tokenUsagePct,
    qualTokensToday: tokenUsage.qual_tokens,
    oppTokensToday: tokenUsage.opp_tokens,
    runs24h: runs24h.total_runs,
    failedRuns24h: runs24h.failed_runs,
    succeededRuns24h: runs24h.succeeded_runs,
    failureRatePct,
    isFailureRateAlert: failureRatePct >= alertThresholdPct,
    deniedCalls24h,
    aiStatus,
    isEmergencyPaused,
    feedbackStats,
  };
}

/**
 * Danh sách các lần chạy Agent có lọc theo điều kiện (FR-90)
 */
export function listAiRuns(filter: { agent?: string; status?: string; entityType?: string; limit?: number } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.agent) {
    where.push("r.agent = ?");
    params.push(filter.agent);
  }
  if (filter.status) {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  if (filter.entityType) {
    where.push("r.entity_type = ?");
    params.push(filter.entityType);
  }

  const limit = filter.limit ?? 50;
  return all<AiRunRecord>(`
    SELECT r.*, u.name AS triggered_by_name
    FROM ai_runs r
    LEFT JOIN users u ON u.id = r.triggered_by
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY r.id DESC
    LIMIT ?
  `, ...params, limit);
}

/**
 * Chi tiết một lần chạy: thông tin tổng thể, các lượt gọi công cụ và căn cứ (FR-90)
 */
export function getAiRunDetail(runId: number) {
  const runRecord = get<AiRunRecord>(`
    SELECT r.*, u.name AS triggered_by_name
    FROM ai_runs r
    LEFT JOIN users u ON u.id = r.triggered_by
    WHERE r.id = ?
  `, runId);

  if (!runRecord) return null;

  const toolCalls = all<ToolCallRecord>(`
    SELECT * FROM tool_calls WHERE run_id = ? ORDER BY id ASC
  `, runId);

  const suggestions = all<{ id: number; kind: string; title: string; status: string }>(`
    SELECT id, kind, title, status FROM ai_suggestions WHERE run_id = ?
  `, runId);

  const research = get<{ id: number; importance: string; status: string }>(`
    SELECT id, importance, status FROM opportunity_research WHERE run_id = ?
  `, runId);

  return {
    run: runRecord,
    toolCalls,
    suggestions,
    research,
  };
}

// ======================== 2. XỬ LÝ LỖI & TIMEOUT (FR-94, BR-23) ========================

/**
 * Job quét và dọn dẹp các lần chạy bị treo quá thời gian (ai_run_timeout_sec)
 * Chuyển trạng thái RUNNING -> FAILED với lỗi "Quá thời gian" (BR-23, FR-94)
 */
export function cleanTimedOutRuns() {
  const timeoutSec = settingNumber("ai_run_timeout_sec");

  const timedOut = all<{ id: number; agent: string }>(`
    SELECT id, agent FROM ai_runs
    WHERE status = 'RUNNING'
      AND (strftime('%s', 'now') - strftime('%s', started_at)) > ?
  `, timeoutSec);

  for (const r of timedOut) {
    run(`
      UPDATE ai_runs
      SET status = 'FAILED', error = 'Quá thời gian thực thi (timeout)', finished_at = datetime('now')
      WHERE id = ?
    `, r.id);

    notifyRole("ADMIN", `[Cảnh báo AI] Lần chạy ${r.agent} #${r.id} bị quá thời gian (${timeoutSec}s) và đã được huỷ`);
  }

  return { cleanedCount: timedOut.length };
}

/**
 * Chạy lại một lần chạy lỗi (FR-94)
 * Kiểm tra điều kiện: lần cũ phải là FAILED, lưu liên kết retry_of_run_id
 */
export function prepareRetryRun(actor: Actor, oldRunId: number) {
  assert(actor.type === "USER", "Chỉ nhân viên được yêu cầu chạy lại");
  assert(can(actor.role, "ai.run"), "Bạn không có quyền kích hoạt chạy lại Agent");

  const old = get<AiRunRecord>("SELECT * FROM ai_runs WHERE id = ?", oldRunId);
  assert(old, "Không tìm thấy lần chạy cần chạy lại");
  assert(old.status === "FAILED", "Chỉ được chạy lại lần chạy ở trạng thái FAILED");

  return {
    agent: old.agent,
    entityType: old.entity_type as "lead" | "opportunity",
    entityId: old.entity_id,
    trigger: `RETRY_OF_#${old.id}: ${old.trigger}`,
    retryOfRunId: old.id,
  };
}

// ======================== 3. QUẢN LÝ PHIÊN BẢN CẤU HÌNH (DEC-27, BR-25, FR-91) ========================

export function listAgentConfigs(agentId: "QUALIFICATION" | "OPPORTUNITY") {
  return all<AgentConfig>(`
    SELECT c.*, u1.name AS configured_by_name, u2.name AS business_approved_by_name
    FROM agent_configs c
    LEFT JOIN users u1 ON u1.id = c.configured_by
    LEFT JOIN users u2 ON u2.id = c.business_approved_by
    WHERE c.agent_id = ?
    ORDER BY c.version_no DESC
  `, agentId);
}

export function getActiveAgentConfig(agentId: "QUALIFICATION" | "OPPORTUNITY"): AgentConfig | null {
  return get<AgentConfig>(`
    SELECT c.*, u1.name AS configured_by_name, u2.name AS business_approved_by_name
    FROM agent_configs c
    LEFT JOIN users u1 ON u1.id = c.configured_by
    LEFT JOIN users u2 ON u2.id = c.business_approved_by
    WHERE c.agent_id = ? AND c.status = 'ACTIVE'
    ORDER BY c.version_no DESC LIMIT 1
  `, agentId) ?? null;
}

/**
 * Tạo bản nháp cấu hình mới (DRAFT) từ bản hiện hành (DEC-27)
 */
export function createConfigDraft(
  actor: Actor,
  input: {
    agentId: "QUALIFICATION" | "OPPORTUNITY";
    instructions: string;
    modelReference: string;
    criteriaSnapshot?: string;
    scheduleRule?: string;
    budgetLimit?: number;
  },
) {
  assert(actor.type === "USER", "Chỉ nhân viên được tạo cấu hình");
  assert(can(actor.role, "ai.config.write"), "Chỉ Người quản trị hệ thống được tạo cấu hình kỹ thuật Agent");

  // Kiểm tra model có trong danh sách được phép không (BR-25)
  const allowedModels = setting("llm_allowed_models")
    .split(",")
    .map((m) => m.trim());
  assert(allowedModels.includes(input.modelReference), `Model '${input.modelReference}' không nằm trong danh mục cho phép (BR-25)`);

  const lastVer = get<{ max_v: number }>(
    "SELECT COALESCE(MAX(version_no), 0) AS max_v FROM agent_configs WHERE agent_id = ?",
    input.agentId,
  )?.max_v ?? 0;

  const nextVersion = lastVer + 1;

  const { id } = run(`
    INSERT INTO agent_configs (
      agent_id, version_no, instructions, model_reference, criteria_snapshot,
      schedule_rule, budget_limit, status, eval_passed, configured_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, ?, datetime('now'))
  `,
    input.agentId,
    nextVersion,
    input.instructions,
    input.modelReference,
    input.criteriaSnapshot ?? null,
    input.scheduleRule ?? null,
    input.budgetLimit ?? 200000,
    actorUserId(actor),
  );

  audit(actor, "agent_config", id, "CREATE_DRAFT", { to: "DRAFT", details: { agentId: input.agentId, version: nextVersion } });
  return { configId: id, versionNo: nextVersion };
}

/**
 * Kích hoạt phiên bản cấu hình (BR-25, DEC-27)
 * Điều kiện: Bắt buộc đã qua kiểm thử đánh giá (eval_passed = 1) nếu ai_require_eval_before_activate = true
 */
export function activateConfig(actor: Actor, configId: number) {
  assert(actor.type === "USER", "Chỉ nhân viên được kích hoạt cấu hình");
  assert(can(actor.role, "ai.config.manage"), "Bạn không có quyền quản lý kích hoạt cấu hình");

  const config = get<AgentConfig>("SELECT * FROM agent_configs WHERE id = ?", configId);
  assert(config, "Không tìm thấy cấu hình");
  assert(config.status === "DRAFT" || config.status === "RETIRED", "Cấu hình đã ở trạng thái ACTIVE");

  const requireEval = setting("ai_require_eval_before_activate") !== "false";
  if (requireEval && !config.eval_passed) {
    throw new DomainError(`Cấu hình v${config.version_no} chưa vượt qua bài đánh giá độ chính xác (BR-25)`);
  }

  tx(() => {
    // 1. Chuyển bản ACTIVE hiện tại sang RETIRED
    run("UPDATE agent_configs SET status = 'RETIRED' WHERE agent_id = ? AND status = 'ACTIVE'", config.agent_id);
    // 2. Chuyển bản được chọn sang ACTIVE
    run("UPDATE agent_configs SET status = 'ACTIVE', effective_at = datetime('now') WHERE id = ?", configId);
  });

  audit(actor, "agent_config", configId, "ACTIVATE", { from: config.status, to: "ACTIVE" });
  return `Đã kích hoạt cấu hình v${config.version_no} cho ${config.agent_id}`;
}

/**
 * Rollback về một phiên bản cấu hình trước đó (NFR-08, DEC-27)
 */
export function rollbackConfig(actor: Actor, agentId: "QUALIFICATION" | "OPPORTUNITY", targetVersionNo: number) {
  assert(actor.type === "USER", "Chỉ nhân viên được rollback cấu hình");
  assert(can(actor.role, "ai.config.manage"), "Bạn không có quyền quản lý cấu hình");

  const target = get<AgentConfig>(
    "SELECT * FROM agent_configs WHERE agent_id = ? AND version_no = ?",
    agentId, targetVersionNo,
  );
  assert(target, `Không tìm thấy phiên bản v${targetVersionNo} của ${agentId}`);

  tx(() => {
    run("UPDATE agent_configs SET status = 'RETIRED' WHERE agent_id = ? AND status = 'ACTIVE'", agentId);
    run("UPDATE agent_configs SET status = 'ACTIVE', effective_at = datetime('now') WHERE id = ?", target.id);
  });

  audit(actor, "agent_config", target.id, "ROLLBACK", { to: "ACTIVE", details: { targetVersion: targetVersionNo } });
  return `Đã khôi phục (rollback) về cấu hình v${targetVersionNo} cho ${agentId}`;
}

// ======================== 4. KILL SWITCH & KIỂM TRA NGÂN SÁCH (FR-93, BR-16) ========================

/**
 * Đặt trạng thái khẩn cấp cho AI Agent (FR-93 Kill switch)
 */
export function setAiEmergencyStatus(actor: Actor, status: "ACTIVE" | "PAUSED") {
  assert(actor.type === "USER", "Chỉ nhân viên được đổi trạng thái AI");
  assert(can(actor.role, "ai.admin.security") || can(actor.role, "ai.config.manage"), "Chỉ Người quản trị hệ thống được chuyển công tắc khẩn cấp");

  run("INSERT INTO settings (key, value) VALUES ('ai_status', ?) ON CONFLICT(key) DO UPDATE SET value = ?", status, status);
  audit(actor, "system_setting", 0, "AI_STATUS_CHANGE", { to: status });

  if (status === "PAUSED") {
    notifyRole("ADMIN", "Công tắc khẩn cấp: TẤT CẢ TÁC NHÂN AI ĐÃ BỊ TẠM DỪNG!");
    notifyRole("SALES_MANAGER", "Tất cả tác nhân AI đã bị tạm dừng hoạt động khẩn cấp.");
  }

  return `Hệ thống AI hiện ở trạng thái: ${status}`;
}

/**
 * Kiểm tra trước khi chạy Agent:
 * - Kill switch có đang bật không (FR-93)
 * - Ngân sách token ngày còn không (BR-16)
 * - Cảnh báo khi đạt 80% hoặc 100% (BR-23)
 */
export function checkPreRunConstraints(agent: "QUALIFICATION" | "OPPORTUNITY"): { ok: boolean; reason?: string } {
  const warnOnce = (threshold: string) => {
    const message = `[Cảnh báo AI] ${agent} chạm ${threshold}% ngân sách ngày`;
    if (!get("SELECT id FROM notifications WHERE message=? AND date(created_at)=date('now')",message)) notifyRole("ADMIN",message);
  };
  // 1. Kiểm tra Kill switch
  const aiStatus = setting("ai_status");
  if (aiStatus === "PAUSED" || setting("ai_emergency_kill") === "true") {
    return { ok: false, reason: "Tác nhân AI đang bị tạm dừng khẩn cấp (PAUSED)" };
  }

  // 2. Kiểm tra ngân sách token trong ngày
  const dailyBudget = settingNumber("ai_daily_token_budget");
  const warnPct = settingNumber("ai_budget_warn_pct");

  const usage = get<{ total: number }>(`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
    FROM ai_runs
    WHERE agent = ? AND date(started_at) = date('now')
  `, agent)?.total ?? 0;

  if (usage >= dailyBudget) {
    // Đã đạt 100%: chặn lần chạy mới
    warnOnce("100");
    return { ok: false, reason: `Đã hết ngân sách token hàng ngày của ${agent} (${usage}/${dailyBudget} tokens)` };
  }

  if (usage >= (dailyBudget * warnPct) / 100) {
    // Đạt 80%: cảnh báo nhưng vẫn cho chạy
    warnOnce(String(warnPct));
  }

  return { ok: true };
}

// ======================== 5. PHẢN HỒI CHẤT LƯỢNG (FR-90, FR-95, BR-27) ========================

export function submitAiFeedback(
  actor: Actor,
  input: {
    runId?: number;
    suggestionId?: number;
    researchId?: number;
    rating: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    feedbackType?: string;
    comment?: string;
  },
) {
  assert(actor.type === "USER", "Chỉ nhân viên được gửi phản hồi chất lượng");
  assert(can(actor.role, "ai.feedback"), "Bạn không có quyền gửi phản hồi AI");

  const validRunId = input.runId && get<{ id: number }>("SELECT id FROM ai_runs WHERE id = ?", input.runId)
    ? input.runId
    : null;

  const { id } = run(`
    INSERT INTO ai_feedback (run_id, suggestion_id, research_id, user_id, rating, feedback_type, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    validRunId,
    input.suggestionId ?? null,
    input.researchId ?? null,
    actorUserId(actor),
    input.rating,
    input.feedbackType ?? null,
    input.comment ?? null,
  );

  audit(actor, "ai_feedback", id, "SUBMIT", { details: { rating: input.rating, type: input.feedbackType } });
  return { feedbackId: id };
}

/**
 * Báo cáo hiệu quả tác nhân và tỷ lệ con người sửa (FR-95, BR-26, BR-27)
 */
export function getAiEffectivenessReport() {
  // 1. Tỷ lệ sửa email nháp (BR-26): số email bị sửa trước khi gửi / tổng email đã duyệt
  const emailStats = get<{ total_approved: number; edited_by_human: number }>(`
    SELECT
      COUNT(*) AS total_approved,
      SUM(CASE WHEN edited_by_human = 1 THEN 1 ELSE 0 END) AS edited_by_human
    FROM email_messages
    WHERE suggestion_id IS NOT NULL AND status IN ('APPROVED','SENT','FAILED')
      AND date(approved_at)>=date('now','weekday 0','-6 days')
  `) ?? { total_approved: 0, edited_by_human: 0 };

  const emailEditRate = emailStats.total_approved > 0
    ? Math.round((emailStats.edited_by_human / emailStats.total_approved) * 100)
    : 0;

  // 2. Tỷ lệ đề xuất bị từ chối theo loại (BR-26)
  const suggestionStats = all<{ kind: string; total: number; rejected: number }>(`
    SELECT
      kind,
      COUNT(*) AS total,
      SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected
    FROM ai_suggestions
    WHERE status IN ('APPROVED','EDITED','REJECTED') AND date(reviewed_at)>=date('now','weekday 0','-6 days')
    GROUP BY kind
  `);

  // 3. Tỷ lệ "Bàn giao sai chuẩn từ bước đánh giá" (BR-27, FR-95)
  const misclassifiedLost = get<{ count: number; total_lost: number }>(`
    SELECT
      SUM(CASE WHEN lost_reason LIKE '%Bàn giao sai chuẩn%' OR lost_reason_code = 'MISQUALIFIED' THEN 1 ELSE 0 END) AS count,
      COUNT(*) AS total_lost
    FROM opportunities
    WHERE stage = 'LOST'
  `) ?? { count: 0, total_lost: 0 };

  const misclassificationRate = misclassifiedLost.total_lost > 0
    ? Math.round((misclassifiedLost.count / misclassifiedLost.total_lost) * 100)
    : 0;

  return {
    email: {
      totalApproved: emailStats.total_approved,
      editedCount: emailStats.edited_by_human,
      editRatePct: emailEditRate,
    },
    suggestions: suggestionStats.map((s) => ({
      kind: s.kind,
      total: s.total,
      rejected: s.rejected,
      rejectRatePct: s.total > 0 ? Math.round((s.rejected / s.total) * 100) : 0,
    })),
    misclassification: {
      misclassifiedCount: misclassifiedLost.count,
      totalLost: misclassifiedLost.total_lost,
      ratePct: misclassificationRate,
    },
  };
}
