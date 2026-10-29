// Workspace kiểm duyệt AI: mọi đề xuất của Agent ở trạng thái PENDING_REVIEW cho tới khi con người xử lý.
// Đảm bảo tuân thủ nghiêm ngặt RBAC (ai.review) và phạm vi dữ liệu (canSee) - BUG-002, FR-98, HG1.
// Tách biệt việc gửi email ra ngoài transaction DB - BUG-005, FR-19.
import { all, get, run, tx } from "../db";
import { assert, BANT_KEYS, type BantKey } from "../domain";
import { email } from "../integrations";
import { can } from "../rbac";
import { recordVisible } from "./access";
import { actorUserId, addActivity, audit, type Actor } from "./core";
import { getLead } from "./leads";
import { scoreBant, disqualifyLeadWithReason } from "./qualification";
import { getOpportunity } from "./opportunities";

export type Suggestion = {
  id: number;
  run_id: number | null;
  agent: "QUALIFICATION" | "OPPORTUNITY";
  kind: "ENRICHMENT" | "BANT_SCORE" | "EMAIL_DRAFT" | "DISQUALIFY" | "CONVERSION";
  entity_type: string;
  entity_id: number;
  title: string;
  payload_json: string;
  edited_payload_json: string | null;
  evidence_json: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EDITED";
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  entity_label: string | null;
};

const SELECT = `SELECT s.*, u.name AS reviewed_by_name,
  CASE
    WHEN s.entity_type = 'lead' THEN (SELECT company_name || ' – ' || contact_name FROM leads WHERE id = s.entity_id)
    WHEN s.entity_type = 'opportunity' THEN (SELECT code || ' – ' || name FROM opportunities WHERE id = s.entity_id)
  END AS entity_label
  FROM ai_suggestions s LEFT JOIN users u ON u.id = s.reviewed_by`;

export type EmailToSend = { to: string; subject: string; body: string; messageId: number };

export function listRuns(filter: { entityType?: string; entityId?: number } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.entityType && filter.entityId) {
    where.push("r.entity_type = ? AND r.entity_id = ?");
    params.push(filter.entityType, filter.entityId);
  }
  return all<{
    id: number;
    agent: "QUALIFICATION" | "OPPORTUNITY";
    trigger: string;
    model: string;
    status: "RUNNING" | "SUCCEEDED" | "FAILED";
    summary: string | null;
    error: string | null;
    started_at: string;
    finished_at: string | null;
    tool_calls_json: string;
    triggered_by_name: string | null;
  }>(`
    SELECT r.*, u.name AS triggered_by_name
    FROM ai_runs r
    LEFT JOIN users u ON u.id = r.triggered_by
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY r.id DESC LIMIT 10
  `, ...params);
}

export function listSuggestions(filter: { status?: string; kind?: string; entityType?: string; entityId?: number } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status && filter.status !== "ALL") {
    where.push("s.status = ?");
    params.push(filter.status);
  }
  if (filter.kind) {
    where.push("s.kind = ?");
    params.push(filter.kind);
  }
  if (filter.entityType && filter.entityId) {
    where.push("s.entity_type = ? AND s.entity_id = ?");
    params.push(filter.entityType, filter.entityId);
  }
  return all<Suggestion>(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.id DESC`, ...params);
}

export function getSuggestion(id: number): Suggestion | null {
  return get<Suggestion>(`${SELECT} WHERE s.id = ?`, id) ?? null;
}

export function createSuggestion(input: {
  runId?: number | null;
  agent: Suggestion["agent"];
  kind: Suggestion["kind"];
  entityType: string;
  entityId: number;
  title: string;
  payload: unknown;
  evidence: unknown[];
}) {
  const validRunId = input.runId && get<{ id: number }>("SELECT id FROM ai_runs WHERE id = ?", input.runId)
    ? input.runId
    : null;

  // Không tạo đề xuất trùng loại khi đề xuất cũ chưa được xử lý — thay bằng bản mới nhất.
  run(
    "UPDATE ai_suggestions SET status='REJECTED', review_note='Được thay bằng đề xuất mới hơn', reviewed_at=datetime('now') WHERE entity_type=? AND entity_id=? AND kind=? AND status='PENDING_REVIEW'",
    input.entityType, input.entityId, input.kind,
  );
  return run(
    `INSERT INTO ai_suggestions (run_id, agent, kind, entity_type, entity_id, title, payload_json, evidence_json) VALUES (?,?,?,?,?,?,?,?)`,
    validRunId, input.agent, input.kind, input.entityType, input.entityId, input.title,
    JSON.stringify(input.payload), JSON.stringify(input.evidence),
  ).id;
}

const ENRICHABLE = ["industry", "address", "contact_title", "notes"] as const;
type EnrichmentPayload = { fields: Partial<Record<"industry" | "address" | "contact_title" | "notes", string>> };
type BantPayload = { scores: Record<BantKey, number>; rationale: string };
type EmailPayload = { to: string; subject: string; body: string };
type DisqualifyPayload = { reason: string };

/**
 * Kiểm tra quyền hạn và phạm vi dữ liệu trước khi thao tác trên đề xuất AI (BUG-002, FR-98)
 */
function assertReviewPermissionAndScope(actor: Actor, s: Suggestion) {
  assert(actor.type === "USER", "Chỉ nhân viên được duyệt đề xuất AI");
  assert(can(actor.role, "ai.review"), "Bạn không có quyền duyệt đề xuất AI (ai.review)");

  if (s.entity_type === "lead") {
    const lead = getLead(s.entity_id);
    assert(lead, "Không tìm thấy Lead");
    const allowed = recordVisible(actor,'lead',lead.id);
    assert(allowed, "Bạn không có quyền thao tác trên Lead ngoài phạm vi quản lý");
  } else if (s.entity_type === "opportunity") {
    const opp = getOpportunity(s.entity_id);
    assert(opp, "Không tìm thấy cơ hội");
    const allowed = recordVisible(actor,'opportunity',opp.id);
    assert(allowed, "Bạn không có quyền thao tác trên cơ hội ngoài phạm vi quản lý");
  }
}

/**
 * Duyệt một đề xuất. Người duyệt có thể chỉnh nội dung (edits) trước khi áp dụng.
 * Tách rời gửi email ra ngoài transaction để tránh inconsistency (BUG-005, HG1).
 */
export function approveSuggestion(actor: Actor, id: number, edits: Record<string, string> = {}, note: string | null = null) {
  const s = get<Suggestion>(`${SELECT} WHERE s.id = ?`, id);
  assert(s, "Không tìm thấy đề xuất");
  assert(s.status === "PENDING_REVIEW", "Đề xuất đã được xử lý");

  // BUG-002: Kiểm tra RBAC và Scope (canSee)
  assertReviewPermissionAndScope(actor, s);

  const payload = JSON.parse(s.payload_json);
  let result = "";
  const editable=s.kind==='EMAIL_DRAFT' ? ['to','subject','body'] : s.kind==='BANT_SCORE' ? ['bant_budget','bant_authority','bant_need','bant_timeline','rationale'] : s.kind==='DISQUALIFY' ? ['reason','note'] : [];
  const isEdited = Object.entries(edits).some(([key,value])=>{
    if(!editable.includes(key)) return false;
    if(key.startsWith('bant_')) return Number(value)!==Number(payload.scores?.[key.slice(5)]);
    return value!==String(payload[key] ?? '');
  });
  const emailHolder: { current: EmailToSend | null } = { current: null };

  tx(() => {
    switch (s.kind) {
      case "ENRICHMENT": {
        const lead = getLead(s.entity_id);
        assert(lead && lead.status !== "CONVERTED", "Lead không còn mở");
        const fields = (payload as EnrichmentPayload).fields;
        const applied: string[] = [];
        const skipped: string[] = [];
        for (const [k, v] of Object.entries(fields)) {
          if (!ENRICHABLE.includes(k as (typeof ENRICHABLE)[number])) continue;
          const current = lead[k as keyof typeof lead];
          if (current === null || current === "" || current === undefined) {
            run(`UPDATE leads SET ${k} = ?, updated_at = datetime('now') WHERE id = ?`, String(v), lead.id);
            applied.push(k);
          } else {
            skipped.push(k);
          }
        }
        result = `Đã điền ${applied.length} trường${skipped.length ? `, giữ nguyên ${skipped.length} trường đã nhập tay` : ""}`;
        audit(actor, "lead", lead.id, "AI_ENRICHMENT_APPLIED", { details: { applied, skipped, suggestionId: id } });
        break;
      }
      case "BANT_SCORE": {
        const p = payload as BantPayload;
        const scores = Object.fromEntries(
          BANT_KEYS.map((k) => [k, edits[`bant_${k}`] !== undefined ? Number(edits[`bant_${k}`]) : p.scores[k]]),
        ) as Record<BantKey, number>;
        const {totalScore:total} = scoreBant(actor,s.entity_id,{...scores,notes:edits.rationale ?? p.rationale});
        result = `Đã cập nhật BANT = ${total}/100`;
        break;
      }
      case "EMAIL_DRAFT": {
        const p = payload as EmailPayload;
        const msg = { to: edits.to ?? p.to, subject: edits.subject ?? p.subject, body: edits.body ?? p.body };
        assert(msg.to && msg.subject && msg.body, "Email thiếu thông tin");

        // BUG-005: Ghi nhận bản ghi email_messages ở trạng thái APPROVED trong transaction trước
        const { id: msgId } = run(
          `INSERT INTO email_messages (entity_type, entity_id, to_email, subject, body, suggestion_id, approved_by, approved_at, status, content_snapshot, edited_by_human)
           VALUES (?,?,?,?,?,?,?, datetime('now'), 'APPROVED', ?, ?)`,
          s.entity_type, s.entity_id, msg.to, msg.subject, msg.body, id, actorUserId(actor), msg.body, isEdited ? 1 : 0,
        );
        emailHolder.current = { to: msg.to, subject: msg.subject, body: msg.body, messageId: msgId };
        result = `Đã duyệt email gửi tới ${msg.to}`;
        break;
      }
      case "DISQUALIFY": {
        disqualifyLeadWithReason(actor, s.entity_id, edits.reason ?? (payload as DisqualifyPayload).reason,edits.note);
        result = "Đã loại Lead theo đề xuất";
        break;
      }
      case "CONVERSION": {
        result = "Đã ghi nhận — thực hiện chuyển đổi trên trang Lead";
        break;
      }
    }

    const finalStatus = isEdited ? "EDITED" : "APPROVED";
    run(
      "UPDATE ai_suggestions SET status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=?, edited_payload_json=? WHERE id=?",
      finalStatus,
      actorUserId(actor),
      note ?? (isEdited ? "Đã chỉnh sửa trước khi duyệt" : "Đã duyệt nguyên bản"),
      isEdited ? JSON.stringify(edits) : null,
      id,
    );
    audit(actor, "ai_suggestion", id, "APPROVE", { from: "PENDING_REVIEW", to: finalStatus, details: { edits: Object.keys(edits), result } });
  });

  // BUG-005: Gửi email ngoài transaction sau khi commit DB thành công
  if (emailHolder.current) {
    const targetEmail = emailHolder.current;
    try {
      const { providerRef } = email.send({ to: targetEmail.to, subject: targetEmail.subject, body: targetEmail.body });
      run("UPDATE email_messages SET status='SENT', provider_ref=? WHERE id=?", providerRef, targetEmail.messageId);
      addActivity({
        entityType: s.entity_type,
        entityId: s.entity_id,
        type: "EMAIL",
        direction: "OUT",
        subject: targetEmail.subject,
        body: targetEmail.body,
        createdBy: actorUserId(actor),
      });
      result = `Đã gửi email tới ${targetEmail.to} thành công`;
    } catch (e) {
      run("UPDATE email_messages SET status='FAILED' WHERE id=?", targetEmail.messageId);
      console.error("[Email send error after approval]", e);
      result = `Đã duyệt email nhưng gửi qua cổng mail thất bại`;
    }
  }

  return result;
}

export function rejectSuggestion(actor: Actor, id: number, note: string | null) {
  assert(actor.type === "USER", "Chỉ nhân viên được xử lý đề xuất AI");
  const s = get<Suggestion>(`${SELECT} WHERE s.id = ?`, id);
  assert(s, "Không tìm thấy đề xuất");
  assert(s.status === "PENDING_REVIEW", "Đề xuất đã được xử lý");

  // BUG-002: Kiểm tra RBAC và Scope (canSee)
  assertReviewPermissionAndScope(actor, s);
  assert(note && note.trim().length > 0, "Bắt buộc có lý do từ chối");

  run("UPDATE ai_suggestions SET status='REJECTED', reviewed_by=?, reviewed_at=datetime('now'), review_note=? WHERE id=?", actorUserId(actor), note, id);
  audit(actor, "ai_suggestion", id, "REJECT", { from: "PENDING_REVIEW", to: "REJECTED", reason: note });
  return "Đã từ chối đề xuất";
}

/**
 * Cho phép chỉnh sửa nội dung bản nháp đề xuất trước khi quyết định duyệt
 */
export function editSuggestion(actor: Actor, id: number, payloadUpdates: Record<string, unknown>, note: string | null = null) {
  const s = get<Suggestion>(`${SELECT} WHERE s.id = ?`, id);
  assert(s, "Không tìm thấy đề xuất");
  assert(s.status === "PENDING_REVIEW", "Đề xuất đã được xử lý");

  assertReviewPermissionAndScope(actor, s);

  run(
    "UPDATE ai_suggestions SET edited_payload_json=?, edited_by=?, review_note=? WHERE id=?",
    JSON.stringify(payloadUpdates),
    actorUserId(actor),
    note,
    id,
  );
  audit(actor, "ai_suggestion", id, "EDIT", { details: { fields: Object.keys(payloadUpdates) } });
  return "Đã lưu chỉnh sửa đề xuất";
}

/** Thông tin một lần chạy để dựng workflow trên thẻ nghiên cứu (component không gọi thẳng db). */
export function runForWorkflow(runId: number) {
  return get<{ trigger: string; model: string; status: string; tool_calls_json: string | null; input_tokens: number | null; output_tokens: number | null; name: string | null }>(
    "SELECT r.trigger, r.model, r.status, r.tool_calls_json, r.input_tokens, r.output_tokens, u.name FROM ai_runs r LEFT JOIN users u ON u.id = r.triggered_by WHERE r.id = ?",
    runId,
  );
}
