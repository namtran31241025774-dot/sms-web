import { assertActorAccess } from "./access";
// Giai đoạn DEVELOP (và chuyển stage đến PROPOSE/CLOSE, WON, LOST).
import { all, db, get, run, tx } from "../db";
import { assert, DEVELOP_CHECKLIST, type ChecklistKey } from "../domain";
import type { UserScope } from "../scope";
import { recordVisible } from "./access";
import { notifyDeciders, requestApproval } from "./approvals";
import { actorUserId, audit, notify, setting, type Actor } from "./core";
import { listRisks, findMatchingRisk, type OpportunityRisk } from "./risks";
import {rebuildPolicy} from '../rebuild-policy';

export * from "./risks";

export type Opportunity = {
  id: number;
  code: string;
  name: string;
  account_id: number;
  account_name: string;
  primary_contact_id: number | null;
  contact_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  presales_id: number | null;
  presales_name: string | null;
  lead_id: number | null;
  stage: "DEVELOP" | "PROPOSE" | "CLOSE" | "WON" | "LOST";
  amount: number;
  budget: number;
  close_date: string | null;
  price_list_id: number | null;
  price_list_name: string | null;
  customer_need: string | null;
  need_confirmed: number;
  proposed_solution: string | null;
  solution_confirmed: number;
  stakeholders_confirmed: number;
  competitors_confirmed: number;
  importance: "LOW" | "MEDIUM" | "HIGH" | null;
  lost_reason: string | null;
  lost_reason_code: string | null;
  reopened_at: string | null;
  reopened_by: number | null;
  reopen_reason: string | null;
  expert_review_status: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type ScopeDocument = {
  id: number;
  opportunity_id: number;
  title: string;
  content: string | null;
  deliverables: string | null;
  status: "DRAFT" | "SENT" | "CONFIRMED";
  created_by: number | null;
  confirmed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
  confirmer_name?: string | null;
};

export type OpportunityItem = {
  id: number;
  opportunity_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_unit: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type SolutionRecord = {
  id: number;
  opportunity_id: number;
  title: string;
  technical_approach: string | null;
  architecture: string | null;
  estimated_effort_mandays: number;
  integration_required: number;
  risks: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  created_by: number | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
};

export type StageHistoryRecord = {
  id: number;
  opportunity_id: number;
  from_stage: string;
  to_stage: string;
  moved_by: number | null;
  moved_by_name?: string | null;
  reason: string | null;
  moved_at: string;
};

const SELECT = `SELECT o.*, a.name AS account_name, c.full_name AS contact_name, u.name AS owner_name,
  p.name AS presales_name, pl.name AS price_list_name
  FROM opportunities o JOIN accounts a ON a.id = o.account_id
  LEFT JOIN contacts c ON c.id = o.primary_contact_id
  LEFT JOIN users u ON u.id = o.owner_id
  LEFT JOIN users p ON p.id = o.presales_id
  LEFT JOIN price_lists pl ON pl.id = o.price_list_id`;

export function listOpportunities(filter: { stage?: string; ownerId?: number; accountId?: number; user?:UserScope } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.stage) {
    where.push("o.stage = ?");
    params.push(filter.stage);
  }
  if (filter.ownerId) {
    where.push("o.owner_id = ?");
    params.push(filter.ownerId);
  }
  if (filter.accountId) {
    where.push("o.account_id = ?");
    params.push(filter.accountId);
  }
  return all<Opportunity>(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.updated_at DESC`, ...params).filter(r=>!filter.user || recordVisible(filter.user,'opportunity',r.id));
}

export function getOpportunity(id: number, user?:UserScope) {
  if(user && !recordVisible(user,'opportunity',id)) return undefined;
  return get<Opportunity>(`${SELECT} WHERE o.id = ?`, id);
}

function mustOpen(id: number) {
  const o = getOpportunity(id);
  assert(o, "Không tìm thấy Cơ hội");
  assert(o.stage !== "WON" && o.stage !== "LOST", "Cơ hội đã đóng (WON hoặc LOST)");
  return o;
}

// ===== Quản lý thông tin chung cơ hội (FR-35) =====
export function updateOpportunity(
  actor: Actor,
  id: number,
  input: {
    name?: string;
    amount?: number;
    budget?: number;
    close_date?: string | null;
    customer_need?: string | null;
    price_list_id?: number | null;
    primary_contact_id?: number | null;
    presales_id?: number | null;
    importance?: "LOW" | "MEDIUM" | "HIGH" | null;
  },
) {
  assertActorAccess(actor, "opportunity", id);
  assert(actor.type === "USER", "Chỉ nhân viên được cập nhật hồ sơ Cơ hội");
  const o = mustOpen(id);
  const keys = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) as (keyof typeof input)[];
  if (!keys.length) return;
  if (input.amount !== undefined) assert(input.amount >= 0, "Giá trị dự kiến không hợp lệ");
  if (input.budget !== undefined) assert(input.budget >= 0, "Ngân sách không hợp lệ");
  if (input.price_list_id !== undefined && input.price_list_id !== o.price_list_id) {
    assert(o.stage === "DEVELOP", "Chỉ đổi bảng giá ở giai đoạn Phát triển cơ hội (DEVELOP)");
  }
  tx(() => {
    run(
      `UPDATE opportunities SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...keys.map((k) => (input[k] ?? null) as string | number | null),
      id,
    );
    // Nhu cầu thay đổi thì phải xác nhận lại.
    if (input.customer_need !== undefined && input.customer_need !== o.customer_need) {
      run("UPDATE opportunities SET need_confirmed = 0 WHERE id = ?", id);
    }
    audit(actor, "opportunity", id, "UPDATE", { details: input });
  });
}

// ===== Biên bản phạm vi & Nhu cầu chi tiết (FR-37) =====
export function getScopeDocument(opportunityId: number): ScopeDocument | undefined {
  return get<ScopeDocument>(
    `SELECT s.*, u1.name AS creator_name, u2.name AS confirmer_name
     FROM scope_documents s
     LEFT JOIN users u1 ON u1.id = s.created_by
     LEFT JOIN users u2 ON u2.id = s.confirmed_by
     WHERE s.opportunity_id = ?
     ORDER BY s.id DESC LIMIT 1`,
    opportunityId,
  );
}

export function createScopeDocument(
  actor: Actor,
  opportunityId: number,
  input: { title: string; content?: string; deliverables?: string },
): { id: number } {
  assertActorAccess(actor, "opportunity", opportunityId);
  mustOpen(opportunityId);
  assert(input.title?.trim(), "Tiêu đề biên bản phạm vi không được để trống");
  const { id } = run(
    `INSERT INTO scope_documents (opportunity_id, title, content, deliverables, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'DRAFT', ?, datetime('now'), datetime('now'))`,
    opportunityId,
    input.title.trim(),
    input.content?.trim() ?? null,
    input.deliverables?.trim() ?? null,
    actorUserId(actor),
  );
  audit(actor, "opportunity", opportunityId, "SCOPE_DOC_CREATE", { details: input });
  return { id };
}

export function updateScopeDocument(
  actor: Actor,
  docId: number,
  input: { title?: string; content?: string; deliverables?: string; status?: "DRAFT" | "SENT" | "CONFIRMED" },
) {
  assertActorAccess(actor, "scope_document", docId);
  const doc = get<ScopeDocument>("SELECT * FROM scope_documents WHERE id = ?", docId);
  assert(doc, "Không tìm thấy biên bản phạm vi");
  mustOpen(doc.opportunity_id);

  const keys = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) as (keyof typeof input)[];
  if (!keys.length) return;

  tx(() => {
    run(
      `UPDATE scope_documents SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...keys.map((k) => (input[k] ?? null) as string | number | null),
      docId,
    );
    const changed=['title','content','deliverables'].some(k=>input[k as keyof typeof input]!==undefined && input[k as keyof typeof input]!==doc[k as keyof ScopeDocument]);
    if(changed) {
      run("UPDATE scope_documents SET status='DRAFT',confirmed_by=NULL,confirmed_at=NULL WHERE id=?",docId);
      run("UPDATE opportunities SET need_confirmed=0,updated_at=datetime('now') WHERE id=?",doc.opportunity_id);
    }
    if (input.status === "CONFIRMED" && !changed) {
      run("UPDATE scope_documents SET confirmed_by = ?, confirmed_at = datetime('now') WHERE id = ?", actorUserId(actor), docId);
      run("UPDATE opportunities SET need_confirmed = 1, updated_at = datetime('now') WHERE id = ?", doc.opportunity_id);
    }
    audit(actor, "opportunity", doc.opportunity_id, "SCOPE_DOC_UPDATE", { details: input });
  });
}

export function confirmScopeDocument(actor: Actor, docId: number) {
  assertActorAccess(actor, "scope_document", docId);
  updateScopeDocument(actor, docId, { status: "CONFIRMED" });
}

// ===== Cấu hình sản phẩm, dịch vụ & Gói giải pháp (FR-38) =====
export function listOpportunityItems(opportunityId: number): OpportunityItem[] {
  return all<OpportunityItem>(
    `SELECT oi.*, p.code AS product_code, p.name AS product_name, p.unit AS product_unit
     FROM opportunity_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.opportunity_id = ?
     ORDER BY oi.id`,
    opportunityId,
  );
}

export function recalculateOpportunityRevenue(opportunityId: number): number {
  const row = get<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM opportunity_items WHERE opportunity_id = ?",
    opportunityId,
  );
  const total = row?.total ?? 0;
  run("UPDATE opportunities SET amount = ?, updated_at = datetime('now') WHERE id = ?", total, opportunityId);
  return total;
}

export function addOpportunityItem(
  actor: Actor,
  opportunityId: number,
  input: { product_id: number; quantity: number; unit_price?: number; discount_pct?: number; notes?: string },
) {
  assertActorAccess(actor, "opportunity", opportunityId);
  assert(actor.type === "USER", "Chỉ nhân viên được cấu hình sản phẩm cho cơ hội");
  const o = mustOpen(opportunityId);
  if(o.stage==='DEVELOP') assert(!input.discount_pct,'Cấu hình dự kiến ở Develop không áp chiết khấu; lập báo giá tại Propose');
  assert(input.quantity > 0, "Số lượng sản phẩm phải lớn hơn 0");

  let unitPrice = input.unit_price;
  if (unitPrice === undefined) {
    // Lấy đơn giá từ bảng giá đang chọn của cơ hội
    if (o.price_list_id) {
      const pli = get<{ unit_price: number }>(
        "SELECT unit_price FROM price_list_items WHERE price_list_id = ? AND product_id = ?",
        o.price_list_id,
        input.product_id,
      );
      unitPrice = pli?.unit_price ?? 0;
    } else {
      unitPrice = 0;
    }
  }

  const discountPct = Math.max(0, Math.min(100, input.discount_pct ?? 0));
  const amount = Math.round(input.quantity * unitPrice * (1 - discountPct / 100));

  tx(() => {
    run(
      `INSERT INTO opportunity_items (opportunity_id, product_id, quantity, unit_price, discount_pct, amount, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      opportunityId,
      input.product_id,
      input.quantity,
      unitPrice,
      discountPct,
      amount,
      input.notes?.trim() ?? null,
    );
    recalculateOpportunityRevenue(opportunityId);
    audit(actor, "opportunity", opportunityId, "ITEM_ADD", { details: { ...input, amount } });
  });
}

export function updateOpportunityItem(
  actor: Actor,
  itemId: number,
  input: { quantity?: number; unit_price?: number; discount_pct?: number; notes?: string },
) {
  assertActorAccess(actor, "opportunity_item", itemId);
  assert(actor.type === "USER", "Chỉ nhân viên được cập nhật sản phẩm");
  const item = get<OpportunityItem>("SELECT * FROM opportunity_items WHERE id = ?", itemId);
  assert(item, "Không tìm thấy dòng sản phẩm");
  const itemOpp=mustOpen(item.opportunity_id);
  if(itemOpp.stage==='DEVELOP') assert(!input.discount_pct,'Cấu hình dự kiến ở Develop không áp chiết khấu; lập báo giá tại Propose');

  const quantity = input.quantity !== undefined ? input.quantity : item.quantity;
  const unitPrice = input.unit_price !== undefined ? input.unit_price : item.unit_price;
  const discountPct = itemOpp.stage==='DEVELOP'?0:input.discount_pct !== undefined ? input.discount_pct : item.discount_pct;
  assert(quantity > 0, "Số lượng sản phẩm phải lớn hơn 0");
  assert(unitPrice >= 0, "Đơn giá không hợp lệ");
  assert(discountPct >= 0 && discountPct <= 100, "Tỷ lệ chiết khấu phải từ 0 đến 100%");

  const amount = Math.round(quantity * unitPrice * (1 - discountPct / 100));

  tx(() => {
    run(
      `UPDATE opportunity_items
       SET quantity = ?, unit_price = ?, discount_pct = ?, amount = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
      quantity,
      unitPrice,
      discountPct,
      amount,
      input.notes?.trim() ?? null,
      itemId,
    );
    recalculateOpportunityRevenue(item.opportunity_id);
    audit(actor, "opportunity", item.opportunity_id, "ITEM_UPDATE", { details: { itemId, ...input, amount } });
  });
}

export function removeOpportunityItem(actor: Actor, itemId: number) {
  assertActorAccess(actor, "opportunity_item", itemId);
  assert(actor.type === "USER", "Chỉ nhân viên được xóa sản phẩm");
  const item = get<OpportunityItem>("SELECT * FROM opportunity_items WHERE id = ?", itemId);
  assert(item, "Không tìm thấy dòng sản phẩm");
  mustOpen(item.opportunity_id);

  tx(() => {
    run("DELETE FROM opportunity_items WHERE id = ?", itemId);
    recalculateOpportunityRevenue(item.opportunity_id);
    audit(actor, "opportunity", item.opportunity_id, "ITEM_REMOVE", { details: { itemId } });
  });
}

// ===== Hồ sơ giải pháp Presales & Duyệt chuyên môn (FR-41, FR-42, BR-07) =====
export function listSolutions(opportunityId: number): SolutionRecord[] {
  return all<SolutionRecord>(
    `SELECT s.*, u.name AS creator_name
     FROM solutions s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.opportunity_id = ?
     ORDER BY s.id DESC`,
    opportunityId,
  );
}

export function getSolution(id: number): SolutionRecord | undefined {
  return get<SolutionRecord>(
    `SELECT s.*, u.name AS creator_name
     FROM solutions s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = ?`,
    id,
  );
}

/** Hồ sơ đổi sau khi đã duyệt thì kết quả cũ không còn giá trị, phải gửi duyệt lại (BR-07). */
function resetExpertApproval(actor: Actor, opportunityId: number) {
  const { changes } = db().prepare("UPDATE opportunities SET expert_review_status = 'NONE' WHERE id = ? AND expert_review_status = 'APPROVED'").run(opportunityId);
  if (changes) audit(actor, "opportunity", opportunityId, "EXPERT_REVIEW_RESET");
}

export function createSolution(
  actor: Actor,
  opportunityId: number,
  input: {
    title: string;
    technical_approach?: string;
    architecture?: string;
    estimated_effort_mandays?: number;
    integration_required?: boolean;
    risks?: string;
  },
): { id: number } {
  assertActorAccess(actor, "opportunity", opportunityId);
  assert(actor.type === "USER" && (actor.role === "PRESALES" || actor.role === "SALES_MANAGER" || actor.role === "ADMIN"), "Chỉ Chuyên viên tư vấn giải pháp có quyền lập phương án kỹ thuật");
  mustOpen(opportunityId);
  assert(input.title?.trim(), "Tiêu đề phương án kỹ thuật không được để trống");

  const mandays = Math.max(0, input.estimated_effort_mandays ?? 0);
  const integrationReq = input.integration_required ? 1 : 0;

  let insertId = 0;
  tx(() => {
    const { id } = run(
      `INSERT INTO solutions (opportunity_id, title, technical_approach, architecture, estimated_effort_mandays, integration_required, risks, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, datetime('now'), datetime('now'))`,
      opportunityId,
      input.title.trim(),
      input.technical_approach?.trim() ?? null,
      input.architecture?.trim() ?? null,
      mandays,
      integrationReq,
      input.risks?.trim() ?? null,
      actorUserId(actor),
    );
    insertId = id;

    // Cập nhật proposed_solution tổng quan vào cơ hội
    run(
      `UPDATE opportunities
       SET proposed_solution = ?, presales_id = COALESCE(presales_id, ?), solution_confirmed = 0, updated_at = datetime('now')
       WHERE id = ?`,
      input.title.trim() + (input.technical_approach ? `: ${input.technical_approach.trim()}` : ""),
      actorUserId(actor),
      opportunityId,
    );

    audit(actor, "opportunity", opportunityId, "SOLUTION_CREATE", { details: { solutionId: insertId, ...input } });
    resetExpertApproval(actor, opportunityId);
  });

  return { id: insertId };
}

export function updateSolution(
  actor: Actor,
  solutionId: number,
  input: {
    title?: string;
    technical_approach?: string;
    architecture?: string;
    estimated_effort_mandays?: number;
    integration_required?: boolean;
    risks?: string;
  },
) {
  assertActorAccess(actor, "solution", solutionId);
  assert(actor.type === "USER" && (actor.role === "PRESALES" || actor.role === "SALES_MANAGER" || actor.role === "ADMIN"), "Chỉ Chuyên viên tư vấn giải pháp có quyền cập nhật phương án kỹ thuật");
  const sol = getSolution(solutionId);
  assert(sol, "Không tìm thấy hồ sơ giải pháp");
  mustOpen(sol.opportunity_id);

  const keys = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) as (keyof typeof input)[];
  if (!keys.length) return;

  tx(() => {
    const params: (string | number | null)[] = [];
    const sets = keys.map((k) => {
      if (k === "integration_required") {
        params.push(input[k] ? 1 : 0);
        return "integration_required = ?";
      }
      params.push((input[k] ?? null) as string | number | null);
      return `${k} = ?`;
    });

    run(
      `UPDATE solutions SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...params,
      solutionId,
    );

    // Bất kỳ cập nhật giải pháp nào cũng đưa solution_confirmed về 0 để kiểm tra lại
    run("UPDATE opportunities SET solution_confirmed = 0 WHERE id = ?", sol.opportunity_id);

    audit(actor, "opportunity", sol.opportunity_id, "SOLUTION_UPDATE", { details: { solutionId, ...input } });
    resetExpertApproval(actor, sol.opportunity_id);
  });
}

export function expertReviewMinAmount() {
  return Number(setting("expert_review_min_amount") || "500000000");
}

/** Lần gửi và lần quyết định gần nhất của cổng duyệt chuyên môn, lấy từ nhật ký. */
export function expertReviewInfo(opportunityId: number) {
  const rows = all<{ action: string; actor_label: string; details_json: string | null; created_at: string }>(
    `SELECT action, actor_label, details_json, created_at FROM audit_log
     WHERE entity_type = 'opportunity' AND entity_id = ?
       AND action IN ('EXPERT_REVIEW_SUBMIT', 'EXPERT_REVIEW_DECISION', 'EXPERT_REVIEW_RESET')
     ORDER BY id DESC`,
    opportunityId,
  );
  const decision = rows.find((r) => r.action === "EXPERT_REVIEW_DECISION");
  return {
    submitted: rows.find((r) => r.action === "EXPERT_REVIEW_SUBMIT"),
    decision,
    note: decision?.details_json ? (JSON.parse(decision.details_json) as { note?: string }).note ?? null : null,
    reset: rows[0]?.action === "EXPERT_REVIEW_RESET",
  };
}

/** Kiểm tra cơ hội có thuộc diện duyệt chuyên môn theo BR-07 không */
export function isExpertReviewRequired(opp: Opportunity): { required: boolean; reason: string } {
  const enabled = setting("expert_review_enabled") !== "false";
  if (!enabled) return { required: false, reason: "Tính năng duyệt chuyên môn đang tắt" };

  const minAmount = expertReviewMinAmount();
  if (opp.amount >= minAmount) {
    return { required: true, reason: `Doanh thu cơ hội (${opp.amount.toLocaleString("vi-VN")} VND) >= ngưỡng ${minAmount.toLocaleString("vi-VN")} VND` };
  }

  // Kiểm tra giải pháp có yêu cầu tích hợp hoặc công sức >= 30 mandays
  const solutions = listSolutions(opp.id);
  const intSol = solutions.find((s) => s.integration_required === 1);
  if (intSol) {
    return { required: true, reason: `Giải pháp '${intSol.title}' có yêu cầu tích hợp hệ thống` };
  }


  return { required: false, reason: "Không thuộc diện bắt buộc duyệt chuyên môn" };
}

export function submitExpertReview(actor: Actor, opportunityId: number) {
  assertActorAccess(actor, "opportunity", opportunityId);
  const o = mustOpen(opportunityId);
  const check = isExpertReviewRequired(o);
  assert(check.required, "Cơ hội không thuộc diện cần gửi duyệt chuyên môn: " + check.reason);
  assert(listSolutions(opportunityId).length, "Cần lập hồ sơ giải pháp trước khi gửi duyệt chuyên môn");
  assert(o.expert_review_status === "NONE" || o.expert_review_status === "REJECTED", "Yêu cầu duyệt chuyên môn đã được gửi hoặc đã được duyệt");

  tx(() => {
    run("UPDATE opportunities SET expert_review_status = 'PENDING', updated_at = datetime('now') WHERE id = ?", opportunityId);
    audit(actor, "opportunity", opportunityId, "EXPERT_REVIEW_SUBMIT", { details: { reason: check.reason } });
    notifyDeciders(rebuildPolicy().expertReviewerRole, "opportunity", opportunityId, `Cơ hội ${o.code} yêu cầu duyệt chuyên môn (${check.reason})`, `/opportunities/${opportunityId}?tab=solution`);
  });
}

export function reviewExpertSolution(
  actor: Actor,
  opportunityId: number,
  decision: "APPROVED" | "REJECTED",
  note?: string,
) {
  assertActorAccess(actor, "opportunity", opportunityId);
  assert(actor.type === "USER", "Chỉ nhân viên được thực hiện duyệt chuyên môn");
  assert(
    actor.role === rebuildPolicy().expertReviewerRole,
    "Cổng kiểm soát FR-42: Chỉ Quản lý kinh doanh mới có quyền duyệt chuyên môn",
  );
  const o = mustOpen(opportunityId);
  assert(o.expert_review_status === "PENDING", "Không có yêu cầu duyệt chuyên môn đang chờ");
  const comment = note?.trim() || undefined;
  if (decision === "APPROVED") assert(listSolutions(opportunityId).length, "Chưa có hồ sơ giải pháp để phê duyệt");
  else assert(comment, "Từ chối phải ghi lý do");

  tx(() => {
    run(
      "UPDATE opportunities SET expert_review_status = ?, updated_at = datetime('now') WHERE id = ?",
      decision,
      opportunityId,
    );
    audit(actor, "opportunity", opportunityId, "EXPERT_REVIEW_DECISION", { details: { decision, note: comment } });
    const message = `Quản lý kinh doanh đã ${decision === "APPROVED" ? "phê duyệt" : "từ chối"} chuyên môn giải pháp cơ hội ${o.code}${comment ? `: ${comment}` : ""}`;
    for (const userId of new Set([o.owner_id, o.presales_id])) {
      if (userId) notify(userId, message, `/opportunities/${opportunityId}?tab=solution`);
    }
  });
}

// ===== Stakeholders & Đối thủ (FR-39, FR-40, BR-19) =====
export function stakeholdersOf(id: number) {
  return all<{ id: number; name: string; role: string; notes: string | null; contact_id: number | null }>(
    "SELECT * FROM stakeholders WHERE opportunity_id = ? ORDER BY id",
    id,
  );
}

export function addStakeholder(
  actor: Actor,
  id: number,
  input: { name: string; role: string; notes?: string | null; contact_id?: number | null },
) {
  assert(actor.type==='USER','Agent không được tự thêm bên liên quan');
  assertActorAccess(actor, "opportunity", id);
  mustOpen(id);
  assert(input.name?.trim(), "Thiếu tên bên liên quan");
  assert(input.role?.trim(), "Thiếu vai trò bên liên quan");
  // BR-19: Hỗ trợ 1 người liên hệ giữ nhiều vai trò trong cùng cơ hội
  run(
    "INSERT INTO stakeholders (opportunity_id, contact_id, name, role, notes) VALUES (?, ?, ?, ?, ?)",
    id,
    input.contact_id ?? null,
    input.name.trim(),
    input.role.trim(),
    input.notes?.trim() ?? null,
  );
  audit(actor, "opportunity", id, "STAKEHOLDER_ADD", { details: input });
}

export function removeStakeholder(actor: Actor, id: number, stakeholderId: number) {
  assertActorAccess(actor, "opportunity", id);
  mustOpen(id);
  run("DELETE FROM stakeholders WHERE id = ? AND opportunity_id = ?", stakeholderId, id);
  if (!stakeholdersOf(id).some((s) => s.role === "DECISION_MAKER")) {
    run("UPDATE opportunities SET stakeholders_confirmed = 0 WHERE id = ?", id);
  }
  audit(actor, "opportunity", id, "STAKEHOLDER_REMOVE", { details: { stakeholderId } });
}

export function competitorsOf(id: number) {
  return all<{
    id: number;
    competitor_id: number;
    name: string;
    notes: string | null;
    strengths: string | null;
    weaknesses: string | null;
  }>(
    `SELECT oc.id, oc.competitor_id, c.name, oc.notes, c.strengths, c.weaknesses
     FROM opportunity_competitors oc JOIN competitors c ON c.id = oc.competitor_id WHERE oc.opportunity_id = ?`,
    id,
  );
}

export function addCompetitor(actor: Actor, id: number, competitorId: number, notes: string | null) {
  assert(actor.type==='USER','Agent không được tự thêm đối thủ');
  assertActorAccess(actor, "opportunity", id);
  mustOpen(id);
  assert(get("SELECT id FROM competitors WHERE id = ?", competitorId), "Đối thủ không tồn tại");
  run("INSERT OR IGNORE INTO opportunity_competitors (opportunity_id, competitor_id, notes) VALUES (?, ?, ?)", id, competitorId, notes);
  audit(actor, "opportunity", id, "COMPETITOR_ADD", { details: { competitorId, notes } });
}

export function removeCompetitor(actor: Actor, id: number, linkId: number) {
  assertActorAccess(actor, "opportunity", id);
  mustOpen(id);
  run("DELETE FROM opportunity_competitors WHERE id = ? AND opportunity_id = ?", linkId, id);
  if (!competitorsOf(id).length) run("UPDATE opportunities SET competitors_confirmed = 0 WHERE id = ?", id);
  audit(actor, "opportunity", id, "COMPETITOR_REMOVE", { details: { linkId } });
}

// ===== Rủi ro & Tương thích ngược =====
export function risksOf(id: number): OpportunityRisk[] {
  return listRisks(id);
}

// ===== Checklist & Stage Gates (FR-42, FR-45, FR-46, BR-06, BR-07) =====
export function checklistStatus(o: Opportunity) {
  return DEVELOP_CHECKLIST.map((c) => ({ ...c, done: Boolean(o[c.key]) }));
}

export function setChecklist(actor: Actor, id: number, key: ChecklistKey, value: boolean) {
  assertActorAccess(actor, "opportunity", id);
  assert(actor.type === "USER", "Agent không được tự hoàn thành mục kiểm soát");
  assert(DEVELOP_CHECKLIST.some((c) => c.key === key), "Mục checklist không hợp lệ");
  const o = mustOpen(id);
  assert(o.stage === "DEVELOP", "Checklist chỉ cập nhật ở giai đoạn Phát triển cơ hội (DEVELOP)");

  if (value) {
    if (key === "need_confirmed") {
      assert(o.customer_need?.trim() || getScopeDocument(id), "Cần nhập nhu cầu khách hàng hoặc tạo biên bản phạm vi trước");
    }
    if (key === "solution_confirmed") {
      assert(
        actor.role === "SALES" || actor.role === "PRESALES" || actor.role === "SALES_MANAGER",
        "Chỉ Chuyên viên tư vấn giải pháp hoặc Quản lý được xác nhận giải pháp",
      );
      assert(o.proposed_solution?.trim() || listSolutions(id).length > 0, "Chưa có đề xuất phương án giải pháp");
    }
    if (key === "stakeholders_confirmed") {
      assert(stakeholdersOf(id).some((s) => s.role === "DECISION_MAKER"), "Cần ít nhất một stakeholder là Người quyết định (DECISION_MAKER)");
    }
    if (key === "competitors_confirmed") {
      assert(competitorsOf(id).length > 0, "Cần ghi nhận ít nhất một đối thủ cạnh tranh");
    }
  }

  tx(() => {
    run(`UPDATE opportunities SET ${key} = ?, updated_at = datetime('now') WHERE id = ?`, value ? 1 : 0, id);
    audit(actor, "opportunity", id, value ? "CHECKLIST_DONE" : "CHECKLIST_UNDO", { details: { key } });
  });
}

/** BR-06: Cổng rà soát của Quản lý kinh doanh */
export function managerGate(o: Opportunity): { required: boolean; reasons: string[] } {
  const mode = setting("manager_gate_mode");
  if (mode === "NEVER") return { required: false, reasons: [] };
  if (mode === "ALWAYS") return { required: true, reasons: ["Chính sách: Mọi cơ hội cần Sales Manager rà soát"] };

  const reasons: string[] = [];
  if (o.importance === "HIGH") reasons.push("Mức quan trọng Cao (HIGH)");
  const openRisks = listRisks(o.id).filter((r) => r.status === "OPEN").length;
  if (openRisks > 0) reasons.push(`${openRisks} rủi ro chưa xử lý (OPEN)`);
  const flagged=get<{n:number}>("SELECT COUNT(*) n FROM ai_rule_evaluations WHERE opportunity_id=? AND status='HIT' AND human_action='FLAGGED'",o.id)?.n ?? 0;
  if(flagged) reasons.push(`${flagged} vi phạm được nhân viên gắn cờ cần rà soát`);

  return { required: reasons.length > 0, reasons };
}

function latestGateApproval(id: number) {
  return get<{ id: number; status: string; created_at: string; payload_json:string|null }>(
    "SELECT id, status, created_at,payload_json FROM approvals WHERE kind='OPP_STAGE_GATE' AND entity_id = ? ORDER BY id DESC LIMIT 1",
    id,
  );
}
export function gateFingerprint(id: number): string {
  const opp=getOpportunity(id);
  const risks=listRisks(id).map(r=>({id:r.id,status:r.status,severity:r.severity,description:r.description})).sort((a,b)=>a.id-b.id);
  const reopen=get<{id:number}>("SELECT id FROM opportunity_stage_history WHERE opportunity_id=? AND from_stage IN ('WON','LOST') AND to_stage='DEVELOP' ORDER BY id DESC LIMIT 1",id)?.id ?? 0;
  const revision=get<{id:number|null}>("SELECT MAX(id) id FROM audit_log WHERE (entity_type='opportunity' AND entity_id=? AND action IN ('UPDATE','RISK_ADD','RISK_STATUS','OPPORTUNITY_REOPEN')) OR (entity_type IN ('risk','opportunity_risk') AND entity_id IN (SELECT id FROM opportunity_risks WHERE opportunity_id=?))",id,id)?.id ?? 0;
  const flags=all("SELECT id,acted_at,action_note FROM ai_rule_evaluations WHERE opportunity_id=? AND human_action='FLAGGED' ORDER BY id",id);
  return JSON.stringify({importance:opp?.importance,mode:setting('manager_gate_mode'),risks,reopen,revision,flags});
}

export function gateState(o: Opportunity) {
  const gate = managerGate(o);
  const approval = latestGateApproval(o.id);
  return { ...gate, approval: approval?.payload_json === gateFingerprint(o.id) ? approval : null };
}

export function stageHistoryOf(opportunityId: number): StageHistoryRecord[] {
  return all<StageHistoryRecord>(
    `SELECT sh.*, u.name AS moved_by_name
     FROM opportunity_stage_history sh
     LEFT JOIN users u ON u.id = sh.moved_by
     WHERE sh.opportunity_id = ?
     ORDER BY sh.id DESC`,
    opportunityId,
  );
}

export function moveStage(actor: Actor, id: number, to: Opportunity["stage"], reason?: string) {
  assertActorAccess(actor, "opportunity", id);
  const o = getOpportunity(id);
  assert(o, "Không tìm thấy cơ hội");
  tx(() => {
    run(
      `UPDATE opportunities
       SET stage = ?, updated_at = datetime('now'),
           closed_at = CASE WHEN ? IN ('WON', 'LOST') THEN datetime('now') ELSE closed_at END
       WHERE id = ?`,
      to,
      to,
      id,
    );
    if(to!=='DEVELOP') run("UPDATE opportunities SET expert_review_status='NONE' WHERE id=? AND expert_review_status='PENDING'",id);
    run(
      `INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, moved_by, reason)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      o.stage,
      to,
      actorUserId(actor),
      reason ?? null,
    );
    audit(actor, "opportunity", id, "STAGE_CHANGE", { from: o.stage, to, reason });
  });
}

export function advanceStage(actor: Actor, id: number): { moved: boolean; message: string } {
  assertActorAccess(actor, "opportunity", id);
  assert(actor.type === "USER", "Agent không được tự chuyển giai đoạn");
  const o = mustOpen(id);

  if (o.stage === "DEVELOP") {
    // 1. Kiểm tra 4 mục checklist bắt buộc (FR-46)
    const missing = checklistStatus(o).filter((c) => !c.done);
    assert(!missing.length, `Chưa hoàn tất checklist: ${missing.map((m) => m.label).join("; ")}`);
    assert(o.price_list_id, "Chưa chọn bảng giá");

    // 2. Kiểm tra Cổng duyệt chuyên môn (FR-42, BR-07)
    const expCheck = isExpertReviewRequired(o);
    if (expCheck.required && o.expert_review_status !== "APPROVED") {
      if (o.expert_review_status === "PENDING") {
        return { moved: false, message: "Đang chờ Quản lý kinh doanh duyệt chuyên môn (FR-42)" };
      }
      return {
        moved: false,
        message: `Cần Quản lý kinh doanh duyệt chuyên môn (${expCheck.reason}). Vui lòng gửi yêu cầu duyệt chuyên môn trước.`,
      };
    }

    // 3. Kiểm tra Cổng Quản lý kinh doanh rà soát (FR-45, BR-06)
    const gate = gateState(o);
    if (gate.required && gate.approval?.status !== "APPROVED") {
      if (gate.approval?.status === "PENDING") {
        return { moved: false, message: "Đang chờ Sales Manager rà soát theo BR-06" };
      }
      requestApproval(actor, {
        kind: "OPP_STAGE_GATE",
        entityType: "opportunity",
        entityId: id,
        reason: gate.reasons.join("; "),
      });
      return { moved: false, message: `Cần Sales Manager rà soát (${gate.reasons.join("; ")}). Đã gửi yêu cầu phê duyệt.` };
    }

    moveStage(actor, id, "PROPOSE");
    return { moved: true, message: "Đã chuyển sang giai đoạn Đề xuất giải pháp (PROPOSE)" };
  }

  if (o.stage === "PROPOSE") {
    assert(
      get("SELECT id FROM quotes WHERE opportunity_id = ? AND status = 'ACCEPTED'", id),
      "Cần ít nhất một báo giá được khách chấp thuận (ACCEPTED) trước khi tạo đơn hàng",
    );
    moveStage(actor, id, "CLOSE");
    return { moved: true, message: "Đã chuyển sang giai đoạn Tạo đơn hàng (CLOSE)" };
  }

  throw new Error("Ở giai đoạn Close, việc hoàn tất đơn hàng sẽ tự động đánh dấu Thành công (WON)");
}

// ===== Đóng & Mở lại cơ hội (FR-47, BR-17, BR-27) =====
export function markLost(actor: Actor, id: number, reasonCode: string, note?: string) {
  assertActorAccess(actor, "opportunity", id);
  assert(actor.type === "USER", "Agent không được đóng Cơ hội");
  assert(reasonCode?.trim(), "Phải chọn lý do thất bại");

  const validReasons = [
    "Mất vào đối thủ",
    "Không có ngân sách",
    "Khách hoãn hoặc dừng dự án",
    "Không đáp ứng yêu cầu",
    "Bàn giao sai chuẩn từ bước đánh giá",
    "Khác",
    // Tương thích ngược:
    "Thua đối thủ",
    "Giá không phù hợp",
    "Khách hoãn dự án",
    "Không đáp ứng yêu cầu kỹ thuật",
    "Mất liên lạc",
  ];
  assert(validReasons.includes(reasonCode.trim()), `Lý do thất bại '${reasonCode}' không hợp lệ`);

  if (reasonCode.trim() === "Khác") {
    assert(note?.trim(), "Trường hợp lý do 'Khác' bắt buộc phải nhập ghi chú giải thích");
  }

  const o = mustOpen(id);
  const finalReason = note?.trim() ? `${reasonCode.trim()}: ${note.trim()}` : reasonCode.trim();

  tx(() => {
    run(
      "UPDATE opportunities SET stage = 'LOST', expert_review_status=CASE WHEN expert_review_status='PENDING' THEN 'NONE' ELSE expert_review_status END, lost_reason = ?, lost_reason_code = ?, closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      finalReason,
      reasonCode.trim(),
      id,
    );
    run(
      "INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, moved_by, reason) VALUES (?, ?, 'LOST', ?, ?)",
      id,
      o.stage,
      actorUserId(actor),
      finalReason,
    );
    run(
      "UPDATE quotes SET status='SUPERSEDED', updated_at=datetime('now') WHERE opportunity_id=? AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT')",
      id,
    );
    audit(actor, "opportunity", id, "STAGE_CHANGE", {
      from: o.stage,
      to: "LOST",
      reason: finalReason,
      details: { reasonCode: reasonCode.trim() },
    });
  });
}

export function reopenOpportunity(actor: Actor, id: number, reason: string) {
  assertActorAccess(actor, "opportunity", id);
  assert(actor.type === "USER", "Agent không được mở lại cơ hội");
  assert(
    actor.role === "SALES_MANAGER",
    "Cổng kiểm soát BR-17: Chỉ Quản lý kinh doanh (SALES_MANAGER) mới có quyền mở lại cơ hội đã đóng",
  );
  assert(reason?.trim(), "Bắt buộc phải ghi rõ lý do mở lại cơ hội theo BR-17");

  const o = getOpportunity(id);
  assert(o, "Không tìm thấy cơ hội");
  assert(o.stage === "WON" || o.stage === "LOST", "Chỉ có thể mở lại cơ hội đã đóng (WON hoặc LOST)");

  // Kiểm tra thời hạn 90 ngày theo BR-17
  const reopenDays = Number(setting("reopen_window_days") || "90");
  if (o.closed_at) {
    const closedDate = new Date(o.closed_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
    assert(
      diffDays <= reopenDays,
      `Đã quá thời hạn ${reopenDays} ngày kể từ khi đóng cơ hội (đã đóng ${diffDays} ngày), không thể mở lại theo quy tắc BR-17`,
    );
  }

  tx(() => {
    run(
      `UPDATE opportunities
       SET stage = 'DEVELOP',
           closed_at = NULL,
           reopened_at = datetime('now'),
           reopened_by = ?,
           reopen_reason = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      actorUserId(actor),
      reason.trim(),
      id,
    );
    run(
      `INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, moved_by, reason)
       VALUES (?, ?, 'DEVELOP', ?, ?)`,
      id,
      o.stage,
      actorUserId(actor),
      `Mở lại cơ hội: ${reason.trim()}`,
    );
    audit(actor, "opportunity", id, "OPPORTUNITY_REOPEN", {
      from: o.stage,
      to: "DEVELOP",
      reason: reason.trim(),
    });
  });
}

// ===== Hợp đồng cung cấp dữ liệu cho WP-04 (Báo giá & Đơn hàng) =====
export function getOpportunityForQuote(opportunityId: number) {
  const o = getOpportunity(opportunityId);
  assert(o, "Không tìm thấy cơ hội");
  const items = listOpportunityItems(opportunityId);
  const account = get<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE id = ?", o.account_id);
  const primaryContact = o.primary_contact_id
    ? get<{ id: number; full_name: string; email: string | null; phone: string | null }>(
        "SELECT id, full_name, email, phone FROM contacts WHERE id = ?",
        o.primary_contact_id,
      )
    : null;

  return {
    opportunity: o,
    account,
    primaryContact,
    items,
    priceListId: o.price_list_id,
    stakeholders: stakeholdersOf(opportunityId),
  };
}

// ===== Nghiên cứu AI & Tương thích ngược =====
export function researchOf(id: number) {
  return all<{
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
  }>(
    `SELECT r.*, u.name AS reviewed_by_name FROM opportunity_research r LEFT JOIN users u ON u.id = r.reviewed_by
     WHERE r.opportunity_id = ? ORDER BY r.id DESC`,
    id,
  );
}

/** Kết quả từng quy tắc OPP-R01..R10 đã khóa cho một bản nghiên cứu (BR-28). */
export function ruleEvaluationsOf(researchId: number) {
  return all<{
    id:number; human_action:'ACKNOWLEDGED'|'FLAGGED'|'RISK'|'TASK'|null;acted_by:number|null;acted_at:string|null;action_note:string|null;linked_risk_id:number|null;linked_task_id:number|null;
    rule_id: string; br_ref: string; status: string; severity: string | null; raw_value: string | null;
    threshold: string | null; rationale: string; limitation: string | null; evidence_refs_json: string;
    required_action: string | null; human_gate: string | null;
  }>("SELECT * FROM ai_rule_evaluations WHERE research_id = ? ORDER BY rule_id", researchId);
}

export function setProposedSolution(actor: Actor, id: number, solution: string) {
  assertActorAccess(actor, "opportunity", id);
  createSolution(actor, id, { title: solution });
}

export function verifyResearch(actor: Actor, researchId: number, opts: { applyImportance: boolean; riskIndexes: number[] }) {
  assertActorAccess(actor, "research", researchId);
  assert(actor.type === "USER", "Chỉ nhân viên xác minh nghiên cứu");
  assert(actor.role==='SALES' || actor.role==='SALES_MANAGER','Chỉ nhân viên kinh doanh hoặc quản lý được xác minh');
  const r = get<{ id: number; opportunity_id: number; importance: string; risks_json: string; status: string }>(
    "SELECT * FROM opportunity_research WHERE id = ?",
    researchId,
  );
  assert(r, "Không tìm thấy nghiên cứu");
  assert(r.status === "PENDING_REVIEW", "Nghiên cứu đã được xử lý");
  const o = mustOpen(r.opportunity_id);
  const risks = JSON.parse(r.risks_json) as { description: string; severity: string }[];
  tx(() => {
    run("UPDATE opportunity_research SET status='VERIFIED', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?", actorUserId(actor), researchId);
    if (opts.applyImportance) {
      run("UPDATE opportunities SET importance = ?, updated_at = datetime('now') WHERE id = ?", r.importance, o.id);
    }
    for (const i of opts.riskIndexes) {
      const risk = risks[i];
      if (risk && !findMatchingRisk(o.id,risk.description)) {
        run(
          "INSERT INTO opportunity_risks (opportunity_id, description, severity, source, created_by) VALUES (?,?,?,?,?)",
          o.id,
          risk.description,
          risk.severity ?? "MEDIUM",
          "AI",
          actorUserId(actor),
        );
      }
    }
    audit(actor, "opportunity_research", researchId, "VERIFY", {
      from: "PENDING_REVIEW",
      to: "VERIFIED",
      details: { applyImportance: opts.applyImportance, risks: opts.riskIndexes.length },
    });
  });
}

export function dismissResearch(actor: Actor, researchId: number) {
  assertActorAccess(actor, "research", researchId);
  run(
    "UPDATE opportunity_research SET status='DISMISSED', reviewed_by=?, reviewed_at=datetime('now') WHERE id=? AND status='PENDING_REVIEW'",
    actorUserId(actor),
    researchId,
  );
  audit(actor, "opportunity_research", researchId, "DISMISS", { from: "PENDING_REVIEW", to: "DISMISSED" });
}
