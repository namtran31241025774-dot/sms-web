// Dòng thời gian tương tác: ghi chú, cuộc gọi, email, cuộc họp (FR-15).
import { all, run, tx } from "../db";
import { assert } from "../domain";
import { actorUserId, audit, type Actor } from "./core";

export type Interaction = {
  id: number;
  entity_type: string;
  entity_id: number;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING";
  direction: "IN" | "OUT" | null;
  subject: string;
  body: string | null;
  occurred_at: string;
  source: "USER" | "AI" | "INTEGRATION";
  created_by: number | null;
  creator_name?: string | null;
  created_by_name: string | null;
};

export type InteractionInput = {
  entityType?: string;
  entity_type?: string;
  entityId?: number;
  entity_id?: number;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING";
  direction?: "IN" | "OUT" | null;
  subject: string;
  body?: string | null;
  occurredAt?: string;
  occurred_at?: string;
};

/**
 * Lấy danh sách các hoạt động tương tác gắn với một thực thể.
 */
export function listInteractions(entityType: string, entityId: number): Interaction[] {
  return all<Interaction>(
    `SELECT a.*, u.name AS creator_name, u.name AS created_by_name FROM activities a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.entity_type = ? AND a.entity_id = ?
     ORDER BY a.occurred_at DESC, a.id DESC`,
    entityType,
    entityId,
  );
}

/**
 * Ghi nhận một tương tác mới (FR-15).
 */
export function addInteraction(actor: Actor, input: InteractionInput): number {
  assert(input.subject?.trim(), "Tiêu đề tương tác không được để trống");
  const entityType = input.entityType || input.entity_type;
  const entityId = input.entityId || input.entity_id;
  assert(entityType && entityId, "Phải xác định đối tượng liên kết tương tác (entityType, entityId)");

  const time = input.occurredAt || input.occurred_at || new Date().toISOString().slice(0, 19).replace("T", " ");

  return tx(() => {
    const { id } = run(
      `INSERT INTO activities (entity_type, entity_id, type, direction, subject, body, occurred_at, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entityType,
      entityId,
      input.type,
      input.direction ?? null,
      input.subject.trim(),
      input.body?.trim() || null,
      time,
      actor.type === "USER" ? "USER" : actor.type === "AI" ? "AI" : "INTEGRATION",
      actorUserId(actor),
    );

    audit(actor, entityType, entityId, "ACTIVITY_ADD", {
      details: { activityId: id, type: input.type, subject: input.subject },
    });

    return id;
  });
}
