import { all, get, run, tx } from "@/lib/db";
import { audit, type Actor } from "./core";

function makeActor(userId?: number): Actor {
  if (userId) {
    return { type: "USER", id: userId, name: "Quản lý kinh doanh", role: "SALES_MANAGER" };
  }
  return { type: "SYSTEM" };
}

export type EntityType = "lead" | "opportunity" | "account" | "task";
export type AssignmentType = "INITIAL" | "REASSIGN" | "HANDOVER";

export interface AssignmentRecord {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  from_user_id: number | null;
  from_user_name?: string | null;
  to_user_id: number;
  to_user_name?: string;
  team_id: number | null;
  team_name?: string | null;
  assigned_by: number;
  assigned_by_name?: string;
  assignment_type: AssignmentType;
  reason: string | null;
  created_at: string;
}

export interface AssignInitialParams {
  entityType: "lead" | "opportunity";
  entityId: number;
  toUserId: number;
  teamId?: number | null;
  assignedBy: number;
  reason?: string | null;
}

export interface HandoverParams {
  fromUserId: number;
  toUserId: number;
  teamId?: number | null;
  reason: string;
  handoverBy: number;
  transferLeads?: boolean;
  transferOpportunities?: boolean;
  transferTasks?: boolean;
  specificLeadIds?: number[];
  specificOpportunityIds?: number[];
  specificTaskIds?: number[];
}

/**
 * Kiểm tra xem người dùng có được phép nhận công việc mới không (FR-78).
 */
function verifyRecipientAvailability(userId: number): void {
  const user = get<{ employee_id: string | null }>("SELECT employee_id FROM users WHERE id = ?", userId);
  if (user?.employee_id) {
    const emp = get<{ status: string; can_accept_work: number }>(
      "SELECT status, can_accept_work FROM employees WHERE code = ?",
      user.employee_id,
    );
    if (emp) {
      if (emp.status === "RESIGNED") {
        throw new Error("Không thể phân công cho nhân viên đã nghỉ việc.");
      }
      if (emp.can_accept_work === 0) {
        throw new Error("Nhân sự này hiện đang tạm ngưng nhận việc (đang nghỉ phép hoặc quá tải).");
      }
    }
  }
}

/**
 * FR-82: Phân bổ khách hàng và cơ hội lần đầu.
 * Lưu người giao, người nhận, thời điểm vào bảng assignments.
 */
export function assignInitial(params: AssignInitialParams): AssignmentRecord {
  verifyRecipientAvailability(params.toUserId);

  return tx(() => {
    let currentOwnerId: number | null = null;

    if (params.entityType === "lead") {
      const lead = get<{ id: number; owner_id: number | null }>(
        "SELECT id, owner_id FROM leads WHERE id = ?",
        params.entityId,
      );
      if (!lead) throw new Error(`Không tìm thấy Lead ID ${params.entityId}`);
      currentOwnerId = lead.owner_id;

      run(
        "UPDATE leads SET owner_id = ?, team_id = COALESCE(?, team_id), updated_at = datetime('now') WHERE id = ?",
        params.toUserId,
        params.teamId ?? null,
        params.entityId,
      );
    } else if (params.entityType === "opportunity") {
      const opp = get<{ id: number; owner_id: number | null }>(
        "SELECT id, owner_id FROM opportunities WHERE id = ?",
        params.entityId,
      );
      if (!opp) throw new Error(`Không tìm thấy cơ hội ID ${params.entityId}`);
      currentOwnerId = opp.owner_id;

      run(
        "UPDATE opportunities SET owner_id = ?, team_id = COALESCE(?, team_id), updated_at = datetime('now') WHERE id = ?",
        params.toUserId,
        params.teamId ?? null,
        params.entityId,
      );
    }

    const res = run(
      `INSERT INTO assignments (entity_type, entity_id, from_user_id, to_user_id, team_id, assigned_by, assignment_type, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'INITIAL', ?)`,
      params.entityType,
      params.entityId,
      currentOwnerId,
      params.toUserId,
      params.teamId ?? null,
      params.assignedBy,
      params.reason?.trim() ?? "Phân bổ phụ trách lần đầu",
    );

    audit(makeActor(params.assignedBy), params.entityType, params.entityId, "ASSIGN", {
      details: {
        toUserId: params.toUserId,
        teamId: params.teamId,
        type: "INITIAL",
      },
    });

    return get<AssignmentRecord>("SELECT * FROM assignments WHERE id = ?", res.id)!;
  });
}

/**
 * FR-84: Điều phối và bàn giao khách hàng, cơ hội và công việc chưa hoàn thành.
 * Bắt buộc lưu lý do, người bàn giao, người tiếp nhận và thời điểm.
 * Bảo toàn toàn bộ lịch sử tương tác, giao dịch cũ.
 */
export function handoverWork(params: HandoverParams): {
  transferredLeads: number;
  transferredOpportunities: number;
  transferredTasks: number;
} {
  const cleanReason = params.reason.trim();
  if (!cleanReason) {
    throw new Error("Lý do điều phối và bàn giao là bắt buộc.");
  }

  if (params.fromUserId === params.toUserId) {
    throw new Error("Người nhận bàn giao phải khác người bàn giao hiện tại.");
  }

  verifyRecipientAvailability(params.toUserId);

  return tx(() => {
    let transferredLeads = 0;
    let transferredOpportunities = 0;
    let transferredTasks = 0;

    // 1. Bàn giao Leads
    if (params.transferLeads !== false) {
      let leadRows: { id: number }[] = [];
      if (params.specificLeadIds && params.specificLeadIds.length > 0) {
        const placeholders = params.specificLeadIds.map(() => "?").join(",");
        leadRows = all<{ id: number }>(
          `SELECT id FROM leads WHERE id IN (${placeholders}) AND owner_id = ? AND status IN ('OPEN', 'WORKING')`,
          ...params.specificLeadIds,
          params.fromUserId,
        );
      } else {
        leadRows = all<{ id: number }>(
          "SELECT id FROM leads WHERE owner_id = ? AND status IN ('OPEN', 'WORKING')",
          params.fromUserId,
        );
      }

      for (const lead of leadRows) {
        run(
          "UPDATE leads SET owner_id = ?, team_id = COALESCE(?, team_id), updated_at = datetime('now') WHERE id = ?",
          params.toUserId,
          params.teamId ?? null,
          lead.id,
        );

        run(
          `INSERT INTO assignments (entity_type, entity_id, from_user_id, to_user_id, team_id, assigned_by, assignment_type, reason)
           VALUES ('lead', ?, ?, ?, ?, ?, 'HANDOVER', ?)`,
          lead.id,
          params.fromUserId,
          params.toUserId,
          params.teamId ?? null,
          params.handoverBy,
          cleanReason,
        );

        audit(makeActor(params.handoverBy), "lead", lead.id, "HANDOVER", {
          reason: cleanReason,
          details: { from: params.fromUserId, to: params.toUserId },
        });
        transferredLeads++;
      }
    }

    // 2. Bàn giao Cơ hội (Opportunities)
    if (params.transferOpportunities !== false) {
      let oppRows: { id: number }[] = [];
      if (params.specificOpportunityIds && params.specificOpportunityIds.length > 0) {
        const placeholders = params.specificOpportunityIds.map(() => "?").join(",");
        oppRows = all<{ id: number }>(
          `SELECT id FROM opportunities WHERE id IN (${placeholders}) AND owner_id = ? AND stage NOT IN ('WON', 'LOST')`,
          ...params.specificOpportunityIds,
          params.fromUserId,
        );
      } else {
        oppRows = all<{ id: number }>(
          "SELECT id FROM opportunities WHERE owner_id = ? AND stage NOT IN ('WON', 'LOST')",
          params.fromUserId,
        );
      }

      for (const opp of oppRows) {
        run(
          "UPDATE opportunities SET owner_id = ?, team_id = COALESCE(?, team_id), updated_at = datetime('now') WHERE id = ?",
          params.toUserId,
          params.teamId ?? null,
          opp.id,
        );

        run(
          `INSERT INTO assignments (entity_type, entity_id, from_user_id, to_user_id, team_id, assigned_by, assignment_type, reason)
           VALUES ('opportunity', ?, ?, ?, ?, ?, 'HANDOVER', ?)`,
          opp.id,
          params.fromUserId,
          params.toUserId,
          params.teamId ?? null,
          params.handoverBy,
          cleanReason,
        );

        audit(makeActor(params.handoverBy), "opportunity", opp.id, "HANDOVER", {
          reason: cleanReason,
          details: { from: params.fromUserId, to: params.toUserId },
        });
        transferredOpportunities++;
      }
    }

    // 3. Bàn giao Công việc chưa hoàn thành (Tasks)
    if (params.transferTasks !== false) {
      let taskRows: { id: number }[] = [];
      if (params.specificTaskIds && params.specificTaskIds.length > 0) {
        const placeholders = params.specificTaskIds.map(() => "?").join(",");
        taskRows = all<{ id: number }>(
          `SELECT id FROM tasks WHERE id IN (${placeholders}) AND assignee_id = ? AND status = 'OPEN'`,
          ...params.specificTaskIds,
          params.fromUserId,
        );
      } else {
        taskRows = all<{ id: number }>(
          "SELECT id FROM tasks WHERE assignee_id = ? AND status = 'OPEN'",
          params.fromUserId,
        );
      }

      for (const task of taskRows) {
        run(
          "UPDATE tasks SET assignee_id = ? WHERE id = ?",
          params.toUserId,
          task.id,
        );

        run(
          `INSERT INTO assignments (entity_type, entity_id, from_user_id, to_user_id, team_id, assigned_by, assignment_type, reason)
           VALUES ('task', ?, ?, ?, ?, ?, 'HANDOVER', ?)`,
          task.id,
          params.fromUserId,
          params.toUserId,
          params.teamId ?? null,
          params.handoverBy,
          cleanReason,
        );
        transferredTasks++;
      }
    }

    return {
      transferredLeads,
      transferredOpportunities,
      transferredTasks,
    };
  });
}

/**
 * Tra cứu lịch sử phân công và điều phối của một hồ sơ hoặc người dùng.
 */
export function listAssignments(filters?: {
  entityType?: EntityType;
  entityId?: number;
  userId?: number;
  limit?: number;
}): AssignmentRecord[] {
  let sql = `
    SELECT a.*,
      fu.name as from_user_name,
      tu.name as to_user_name,
      t.name as team_name,
      ab.name as assigned_by_name
    FROM assignments a
    LEFT JOIN users fu ON fu.id = a.from_user_id
    JOIN users tu ON tu.id = a.to_user_id
    LEFT JOIN teams t ON t.id = a.team_id
    JOIN users ab ON ab.id = a.assigned_by
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.entityType) {
    sql += " AND a.entity_type = ?";
    params.push(filters.entityType);
  }
  if (filters?.entityId) {
    sql += " AND a.entity_id = ?";
    params.push(filters.entityId);
  }
  if (filters?.userId) {
    sql += " AND (a.to_user_id = ? OR a.from_user_id = ?)";
    params.push(filters.userId, filters.userId);
  }

  sql += " ORDER BY a.created_at DESC";
  if (filters?.limit) {
    sql += ` LIMIT ${filters.limit}`;
  }

  return all<AssignmentRecord>(sql, ...params);
}
