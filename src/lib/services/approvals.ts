// Human gates: duyệt chiết khấu, Manager gate Develop→Propose, rà soát Legal.
import { all, get, run, tx } from "../db";
import { assert, type Role } from "../domain";
import { actorUserId, audit, notify, type Actor } from "./core";
import { advanceStage, gateFingerprint, gateState, getOpportunity, type Opportunity } from "./opportunities";
import { applyDiscountDecision, getQuote } from "./quotes";
import {assertActorAccess, recordVisible, type RecordKind} from './access';
import type { UserScope } from "../scope";
import {rebuildPolicy} from '../rebuild-policy';

export type ApprovalKind = "QUOTE_DISCOUNT" | "OPP_STAGE_GATE" | "LEGAL_REVIEW";

const DECIDER: Record<ApprovalKind, Role> = {
  QUOTE_DISCOUNT: "SALES_MANAGER",
  OPP_STAGE_GATE: "SALES_MANAGER",
  LEGAL_REVIEW: "SALES_MANAGER",
};

/** Người giữ vai trò duyệt và thấy được hồ sơ (theo nhóm phụ trách). Không ai thấy thì trả cả vai trò để yêu cầu không bị bỏ sót. */
export function decidersOf(role: Role, entityType: string, entityId: number) {
  const users = all<{ id: number; name: string }>("SELECT id, name FROM users WHERE role = ? AND active = 1 ORDER BY id", role);
  const visible = users.filter((u) => {
    try {
      return recordVisible({ id: u.id, role }, entityType as RecordKind, entityId);
    } catch {
      return false;
    }
  });
  return visible.length ? visible : users;
}

export function notifyDeciders(role: Role, entityType: string, entityId: number, message: string, link?: string) {
  for (const u of decidersOf(role, entityType, entityId)) notify(u.id, message, link);
}

/** Tình trạng cổng QLKD rà soát Develop → Propose (HG6) để hiển thị cho người dùng. */
export function stageGateStatus(o: Opportunity) {
  const gate = gateState(o);
  const a = gate.approval
    ? get<{ status: string; decided_by_name: string | null; decision_comment: string | null }>(
        "SELECT a.status, u.name AS decided_by_name, a.decision_comment FROM approvals a LEFT JOIN users u ON u.id = a.decided_by WHERE a.id = ?",
        gate.approval.id,
      )
    : undefined;
  return {
    required: gate.required,
    passed: o.stage !== "DEVELOP",
    status: (a?.status ?? null) as "PENDING" | "APPROVED" | "REJECTED" | null,
    decidedBy: a?.decided_by_name ?? null,
    comment: a?.decision_comment ?? null,
    deciders: a?.status === "PENDING" ? decidersOf(DECIDER.OPP_STAGE_GATE, "opportunity", o.id).map((u) => u.name) : [],
  };
}
export type StageGateStatus = ReturnType<typeof stageGateStatus>;

export function requestApproval(actor: Actor, input: { kind: ApprovalKind; entityType: string; entityId: number; reason: string }) {
  const { id } = run(
    "INSERT INTO approvals (kind, entity_type, entity_id, reason, requested_by) VALUES (?,?,?,?,?)",
    input.kind, input.entityType, input.entityId, input.reason, actorUserId(actor),
  );
  if(input.kind === 'OPP_STAGE_GATE') run('UPDATE approvals SET payload_json=? WHERE id=?',gateFingerprint(input.entityId),id);
  audit(actor, "approval", id, "REQUEST", { to: "PENDING", reason: input.reason, details: input });
  notifyDeciders(DECIDER[input.kind], input.entityType, input.entityId, `Yêu cầu mới: ${input.reason}`, "/approvals");
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

/** Hồ sơ mà một yêu cầu phê duyệt trỏ tới, để người duyệt mở xem trước khi quyết định. */
export function approvalTarget(kind: string, entityId: number): { href: string; label: string } | null {
  if (kind === "OPP_STAGE_GATE") {
    const o = get<{ code: string; name: string }>("SELECT code, name FROM opportunities WHERE id = ?", entityId);
    return o ? { href: `/opportunities/${entityId}`, label: `${o.code} · ${o.name}` } : null;
  }
  if (kind === "QUOTE_DISCOUNT" || kind === "LEGAL_REVIEW") {
    // entity_id là phiên bản báo giá; dữ liệu mẫu cũ có thể lưu mã báo giá.
    const version = get<{ quote_id: number }>("SELECT quote_id FROM quote_versions WHERE id = ?", entityId);
    const quoteId = version?.quote_id ?? entityId;
    const q = get<{ code: string; account_name: string | null }>(
      `SELECT q.code, a.name AS account_name FROM quotes q
       LEFT JOIN opportunities o ON o.id = q.opportunity_id LEFT JOIN accounts a ON a.id = o.account_id
       WHERE q.id = ?`,
      quoteId,
    );
    if (!q) return null;
    return { href: version ? `/quotes/${quoteId}?v=${entityId}` : `/quotes/${quoteId}`, label: [q.code, q.account_name].filter(Boolean).join(" · ") };
  }
  return null;
}

export type ExpertReviewRow = { id: number; code: string; name: string; owner_name: string | null; updated_at: string };

/** Cơ hội đang chờ duyệt chuyên môn (FR-42) trong phạm vi của người duyệt. */
export function pendingExpertReviews(user: UserScope): ExpertReviewRow[] {
  return all<ExpertReviewRow>(
    `SELECT o.id, o.code, o.name, u.name AS owner_name, o.updated_at FROM opportunities o
     LEFT JOIN users u ON u.id = o.owner_id
     WHERE o.expert_review_status = 'PENDING' AND o.stage='DEVELOP' ORDER BY o.updated_at DESC`,
  ).filter((o) => recordVisible(user, "opportunity", o.id));
}

/** Quản lý kinh doanh quyết định cổng rà soát Develop → Propose (HG6, BR-06). Trả về giai đoạn sau khi quyết định. */
export function decideStageGate(actor: Actor, approvalId: number, approved: boolean, comment: string | null) {
  const a = get<{ kind: string; entity_id: number }>("SELECT kind, entity_id FROM approvals WHERE id = ?", approvalId);
  assert(a, "Không tìm thấy yêu cầu");
  assert(a.kind === "OPP_STAGE_GATE", "Yêu cầu này không phải cổng rà soát giai đoạn");
  decideApproval(actor, approvalId, approved, comment);
  return getOpportunity(a.entity_id)?.stage;
}

export function decideApproval(actor: Actor, approvalId: number, approved: boolean, comment: string | null) {
  assert(actor.type === "USER", "Chỉ con người được phê duyệt");
  const a = get<{ id: number; kind: ApprovalKind; entity_id: number; status: string; requested_by: number | null }>(
    "SELECT * FROM approvals WHERE id = ?",
    approvalId,
  );
  assert(a, "Không tìm thấy yêu cầu");
  assert(a.status === "PENDING", "Yêu cầu đã được xử lý");
  if(a.kind==='OPP_STAGE_GATE' && !rebuildPolicy().allowStageSelfApproval) assert(actor.id!==a.requested_by,'Cần quản lý khác duyệt yêu cầu do chính mình gửi');
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
