// Human gates: duyệt chiết khấu, Manager gate Develop→Propose, rà soát Legal.
import { all, get, run, tx } from "../db";
import { assert, type Role } from "../domain";
import { actorUserId, audit, notify, notifyRole, type Actor } from "./core";
import { advanceStage, gateFingerprint, getOpportunity } from "./opportunities";
import { applyDiscountDecision, getQuote } from "./quotes";
import {assertActorAccess} from './access';

export type ApprovalKind = "QUOTE_DISCOUNT" | "OPP_STAGE_GATE" | "LEGAL_REVIEW";

const DECIDER: Record<ApprovalKind, Role> = {
  QUOTE_DISCOUNT: "SALES_MANAGER",
  OPP_STAGE_GATE: "SALES_MANAGER",
  LEGAL_REVIEW: "LEGAL",
};

export function requestApproval(actor: Actor, input: { kind: ApprovalKind; entityType: string; entityId: number; reason: string }) {
  const { id } = run(
    "INSERT INTO approvals (kind, entity_type, entity_id, reason, requested_by) VALUES (?,?,?,?,?)",
    input.kind, input.entityType, input.entityId, input.reason, actorUserId(actor),
  );
  if(input.kind === 'OPP_STAGE_GATE') run('UPDATE approvals SET payload_json=? WHERE id=?',gateFingerprint(input.entityId),id);
  audit(actor, "approval", id, "REQUEST", { to: "PENDING", reason: input.reason, details: input });
  notifyRole(DECIDER[input.kind], `Yêu cầu mới: ${input.reason}`, "/approvals");
  return id;
}

export type ApprovalRow = {
  id: number;
  kind: ApprovalKind;
  entity_type: string;
  entity_id: number;
  status: string;
  reason: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  decision_comment: string | null;
  created_at: string;
  decided_at: string | null;
};

export function listApprovals(filter: { status?: string; kinds?: ApprovalKind[] } = {}) {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.status) {
    where.push("a.status = ?");
    params.push(filter.status);
  }
  if (filter.kinds?.length) {
    where.push(`a.kind IN (${filter.kinds.map(() => "?").join(",")})`);
    params.push(...filter.kinds);
  }
  return all<ApprovalRow>(
    `SELECT a.*, r.name AS requested_by_name, d.name AS decided_by_name FROM approvals a
     LEFT JOIN users r ON r.id = a.requested_by LEFT JOIN users d ON d.id = a.decided_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.status = 'PENDING' DESC, a.id DESC`,
    ...params,
  );
}

export function approvalsFor(entityType: string, entityId: number) {
  return all<ApprovalRow>(
    `SELECT a.*, r.name AS requested_by_name, d.name AS decided_by_name FROM approvals a
     LEFT JOIN users r ON r.id = a.requested_by LEFT JOIN users d ON d.id = a.decided_by
     WHERE a.entity_type = ? AND a.entity_id = ? ORDER BY a.id DESC`,
    entityType, entityId,
  );
}

export function decideApproval(actor: Actor, approvalId: number, approved: boolean, comment: string | null) {
  assert(actor.type === "USER", "Chỉ con người được phê duyệt");
  const a = get<{ id: number; kind: ApprovalKind; entity_id: number; status: string; requested_by: number | null }>(
    "SELECT * FROM approvals WHERE id = ?",
    approvalId,
  );
  assert(a, "Không tìm thấy yêu cầu");
  assert(a.status === "PENDING", "Yêu cầu đã được xử lý");
  if(a.kind==='OPP_STAGE_GATE') assertActorAccess(actor,'opportunity',a.entity_id);
  assert(actor.role === DECIDER[a.kind], "Vai trò của bạn không duyệt loại yêu cầu này");
  if (!approved) assert(comment?.trim(), "Từ chối cần ghi lý do");
  if(approved && a.kind === 'OPP_STAGE_GATE') {
    const saved=get<{payload_json:string|null}>('SELECT payload_json FROM approvals WHERE id=?',a.id)?.payload_json;
    assert(saved === gateFingerprint(a.entity_id),'Hồ sơ đã thay đổi, cần gửi rà soát lại');
  }

  tx(() => {
    const to = approved ? "APPROVED" : "REJECTED";
    run(
      "UPDATE approvals SET status=?, decided_by=?, decision_comment=?, decided_at=datetime('now') WHERE id=?",
      to, actor.id, comment, approvalId,
    );
    audit(actor, "approval", approvalId, "DECIDE", { from: "PENDING", to, reason: comment });

    if (a.kind === "QUOTE_DISCOUNT") {
      applyDiscountDecision(actor, a.entity_id, approved, comment);
      const q = getQuote(a.entity_id);
      notify(a.requested_by, `Báo giá ${q?.code} v${q?.revision}: ${approved ? "được duyệt" : "bị từ chối"}`, `/quotes/${a.entity_id}`);
    } else if (a.kind === "OPP_STAGE_GATE") {
      const o = getOpportunity(a.entity_id);
      if (approved && o?.stage === "DEVELOP") {
        advanceStage(actor, a.entity_id);
      }
      notify(o?.owner_id, `${o?.code}: Manager ${approved ? "đã duyệt chuyển Propose" : "yêu cầu xử lý thêm trước khi chuyển Propose"}`, `/opportunities/${a.entity_id}`);
    } else {
      const q = getQuote(a.entity_id);
      notify(a.requested_by, `Legal ${approved ? "đồng ý" : "có ý kiến"} về ${q?.code}: ${comment ?? ""}`, `/quotes/${a.entity_id}`);
    }
  });
}
