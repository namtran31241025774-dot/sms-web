import { all, get, run } from "../db";
import type { Role } from "../domain";
import { SETTING_DEFAULTS } from "../settings-defaults";
import { emitEvent } from '../events';

// Ai đang thực hiện thao tác — dùng cho audit log và kiểm tra quyền ghi của AI.
export type Actor =
  | { type: "USER"; id: number; name: string; role: Role }
  | { type: "AI"; agent: "QUALIFICATION" | "OPPORTUNITY"; runId: number }
  | { type: "INTEGRATION"; name: string }
  | { type: "SYSTEM" };

export function userActor(u: { id: number; name: string; role: Role }): Actor {
  return { type: "USER", id: u.id, name: u.name, role: u.role };
}

function actorLabel(a: Actor): string {
  switch (a.type) {
    case "USER":
      return a.name || (a.id ? `User #${a.id}` : "Người dùng");
    case "AI":
      return a.agent === "QUALIFICATION" ? "Sales Qualification Agent" : "Sales Opportunity Agent";
    case "INTEGRATION":
      return `Tích hợp: ${a.name}`;
    case "SYSTEM":
      return "Hệ thống";
  }
}

export function actorUserId(a: Actor): number | null {
  return a.type === "USER" ? a.id : null;
}

export function audit(
  actor: Actor,
  entityType: string,
  entityId: number,
  action: string,
  opts: { from?: string | null; to?: string | null; reason?: string | null; details?: unknown } = {},
) {
  run(
    `INSERT INTO audit_log (entity_type, entity_id, action, from_status, to_status, actor_type, actor_id, actor_label, reason, details_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    entityType,
    entityId,
    action,
    opts.from ?? null,
    opts.to ?? null,
    actor.type,
    actor.type === "USER" ? (actor.id ?? null) : actor.type === "AI" ? (actor.runId ?? null) : null,
    actorLabel(actor),
    opts.reason ?? null,
    opts.details === undefined ? null : JSON.stringify(opts.details),
  );
  if(entityType==='opportunity' && ['UPDATE','DOCUMENT_UPLOAD','SOLUTION_CREATE','SOLUTION_UPDATE','STAKEHOLDER_ADD','STAKEHOLDER_REMOVE','COMPETITOR_ADD','COMPETITOR_REMOVE','ITEM_ADD','ITEM_UPDATE','ITEM_REMOVE','SCOPE_DOC_UPDATE'].includes(action)) emitEvent('opportunity.key_field_changed',{opportunityId:entityId,actorUserId:actorUserId(actor)});
  if(entityType==='lead' && action==='BANT_SCORE') emitEvent('lead.bant_updated',{leadId:entityId,actorUserId:actorUserId(actor)});
}

export function auditTrail(entityType: string, entityId: number) {
  return all<{
    id: number;
    action: string;
    from_status: string | null;
    to_status: string | null;
    actor_type: string;
    actor_label: string;
    reason: string | null;
    created_at: string;
  }>("SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC", entityType, entityId);
}

// ===== Settings (metadata: tiêu chí, ngưỡng, cờ ADR) =====
export { SETTING_DEFAULTS };

export function setting(key: string): string {
  const r = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return r?.value ?? SETTING_DEFAULTS[key]?.value ?? "";
}

export function settingNumber(key: string): number {
  return Number(setting(key));
}

export function settingBool(key: string): boolean {
  return setting(key) === "true";
}

export function notify(userId: number | null | undefined, message: string, link?: string) {
  if (!userId) return;
  run("INSERT INTO notifications (user_id, message, link) VALUES (?,?,?)", userId, message, link ?? null);
}

export function notifyRole(role: Role, message: string, link?: string) {
  for (const u of all<{ id: number }>("SELECT id FROM users WHERE role = ? AND active = 1", role)) {
    notify(u.id, message, link);
  }
}

export function addActivity(input: {
  entityType: string;
  entityId: number;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING";
  subject: string;
  body?: string | null;
  direction?: "IN" | "OUT" | null;
  occurredAt?: string | null;
  source?: "USER" | "AI" | "INTEGRATION";
  createdBy?: number | null;
}) {
  return run(
    `INSERT INTO activities (entity_type, entity_id, type, direction, subject, body, occurred_at, source, created_by)
     VALUES (?,?,?,?,?,?,COALESCE(?, datetime('now')),?,?)`,
    input.entityType,
    input.entityId,
    input.type,
    input.direction ?? null,
    input.subject,
    input.body ?? null,
    input.occurredAt ?? null,
    input.source ?? "USER",
    input.createdBy ?? null,
  ).id;
}

export function activitiesFor(entityType: string, entityId: number) {
  return all<{
    id: number;
    type: string;
    direction: string | null;
    subject: string;
    body: string | null;
    occurred_at: string;
    source: string;
    created_by_name: string | null;
  }>(
    `SELECT a.*, u.name AS created_by_name FROM activities a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.entity_type = ? AND a.entity_id = ? ORDER BY a.occurred_at DESC, a.id DESC`,
    entityType,
    entityId,
  );
}

export function users(role?: Role) {
  return role
    ? all<{ id: number; name: string; role: Role }>("SELECT id, name, role FROM users WHERE role = ? AND active = 1", role)
    : all<{ id: number; name: string; role: Role }>("SELECT id, name, role FROM users WHERE active = 1 ORDER BY id");
}
