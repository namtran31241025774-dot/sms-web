import { all, get, run, tx } from "@/lib/db";
import { audit, type Actor } from "./core";

function makeActor(userId?: number, source?: "USER" | "AI"): Actor {
  if (source === "AI") {
    return { type: "AI", agent: "OPPORTUNITY", runId: 0 };
  }
  if (userId) {
    return { type: "USER", id: userId, name: "Người dùng", role: "SALES" };
  }
  return { type: "SYSTEM" };
}

export type WorkItemType = "TASK" | "APPOINTMENT";
export type WorkItemStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type WorkItemPriority = "LOW" | "MEDIUM" | "HIGH";
export type ParticipantRole = "ORGANIZER" | "PRESALES" | "ATTENDEE";
export type ParticipantStatus = "INVITED" | "ACCEPTED" | "DECLINED";

export interface WorkItem {
  id: number;
  title: string;
  type: WorkItemType;
  description: string | null;
  entity_type: string | null;
  entity_id: number | null;
  assignee_id: number | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  due_date: string | null;
  due_at: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  outcome: string | null;
  completed_at: string | null;
  source: "USER" | "AI";
  created_at: string;
  participants?: WorkParticipant[];
}

export interface WorkParticipant {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  title: string | null;
  role: ParticipantRole;
  status: ParticipantStatus;
  notes: string | null;
  created_at: string;
}

export interface CreateWorkItemInput {
  title: string;
  type?: WorkItemType;
  description?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  assigneeId?: number | null;
  dueDate?: string | null;
  dueAt?: string | null;
  priority?: WorkItemPriority;
  source?: "USER" | "AI";
  participants?: {
    userId: number;
    role?: ParticipantRole;
  }[];
}

export interface UpdateWorkItemInput {
  title?: string;
  description?: string | null;
  assigneeId?: number | null;
  dueDate?: string | null;
  dueAt?: string | null;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  outcome?: string | null;
}

/**
 * Hợp đồng tạo công việc hoặc lịch hẹn (FR-83).
 * Được sử dụng bởi QLKD, NVKD, và tích hợp với WP-03, WP-08.
 */
export function createWorkItem(
  input: CreateWorkItemInput,
  actorUserId?: number,
): WorkItem {
  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    throw new Error("Tiêu đề công việc hoặc lịch hẹn không được để trống.");
  }

  const itemType: WorkItemType = input.type ?? "TASK";
  const priority: WorkItemPriority = input.priority ?? "MEDIUM";
  const source = input.source ?? "USER";

  return tx(() => {
    const res = run(
      `INSERT INTO tasks (
        title, type, description, entity_type, entity_id,
        assignee_id, due_date, due_at, status, priority, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      cleanTitle,
      itemType,
      input.description?.trim() ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.assigneeId ?? null,
      input.dueDate ?? (input.dueAt ? input.dueAt.slice(0, 10) : null),
      input.dueAt ?? null,
      priority,
      source,
    );

    const taskId = res.id;

    // Nếu là lịch hẹn và có người tham gia (vd mời Presales tham gia tư vấn kỹ thuật trên cơ hội)
    if (input.participants && input.participants.length > 0) {
      for (const p of input.participants) {
        const role = p.role ?? "ATTENDEE";
        run(
          `INSERT INTO work_participants (task_id, user_id, role, status)
           VALUES (?, ?, ?, 'INVITED')
           ON CONFLICT(task_id, user_id) DO NOTHING`,
          taskId,
          p.userId,
          role,
        );
      }
    }

    audit(makeActor(actorUserId, source), "task", taskId, "CREATE", {
      to: "OPEN",
      details: {
        title: cleanTitle,
        type: itemType,
        assigneeId: input.assigneeId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    return getWorkItem(taskId)!;
  });
}

/**
 * FR-83: Cập nhật thông tin, tiến độ hoặc hoàn thành công việc.
 */
export function updateWorkItem(
  id: number,
  data: UpdateWorkItemInput,
  actorUserId?: number,
): WorkItem {
  const item = getWorkItem(id);
  if (!item) {
    throw new Error(`Không tìm thấy công việc ID ${id}`);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.title !== undefined) {
    updates.push("title = ?");
    params.push(data.title.trim());
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description?.trim() ?? null);
  }
  if (data.assigneeId !== undefined) {
    updates.push("assignee_id = ?");
    params.push(data.assigneeId);
  }
  if (data.dueDate !== undefined) {
    updates.push("due_date = ?");
    params.push(data.dueDate);
  }
  if (data.dueAt !== undefined) {
    updates.push("due_at = ?");
    params.push(data.dueAt);
  }
  if (data.priority !== undefined) {
    updates.push("priority = ?");
    params.push(data.priority);
  }
  if (data.outcome !== undefined) {
    updates.push("outcome = ?");
    params.push(data.outcome?.trim() ?? null);
  }
  if (data.status !== undefined) {
    updates.push("status = ?");
    params.push(data.status);
    if (data.status === "DONE") {
      updates.push("completed_at = datetime('now')");
    } else if (data.status === "OPEN" || data.status === "IN_PROGRESS") {
      updates.push("completed_at = NULL");
    }
  }

  if (updates.length === 0) return item;

  params.push(id);

  return tx(() => {
    run(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, ...params);

    audit(makeActor(actorUserId), "task", id, "UPDATE", {
      from: item.status,
      to: data.status ?? item.status,
      details: data,
    });

    return getWorkItem(id)!;
  });
}

/**
 * Đánh dấu hoàn tất công việc kèm ghi nhận kết quả (outcome).
 */
export function completeWorkItem(
  id: number,
  outcome?: string | null,
  actorUserId?: number,
): WorkItem {
  return updateWorkItem(
    id,
    {
      status: "DONE",
      outcome: outcome !== undefined ? outcome : "Đã hoàn thành theo kế hoạch",
    },
    actorUserId,
  );
}

/**
 * Mời thành viên tham gia lịch hẹn / công việc (FR-83).
 */
export function inviteParticipant(
  taskId: number,
  userId: number,
  role: ParticipantRole = "ATTENDEE",
): void {
  run(
    `INSERT INTO work_participants (task_id, user_id, role, status)
     VALUES (?, ?, ?, 'INVITED')
     ON CONFLICT(task_id, user_id) DO UPDATE SET role = excluded.role`,
    taskId,
    userId,
    role,
  );
}

/**
 * Phản hồi lời mời tham gia lịch hẹn (ACCEPTED / DECLINED).
 */
export function respondInvitation(
  taskId: number,
  userId: number,
  status: "ACCEPTED" | "DECLINED",
  notes?: string | null,
): void {
  run(
    `UPDATE work_participants
     SET status = ?, notes = ?
     WHERE task_id = ? AND user_id = ?`,
    status,
    notes?.trim() ?? null,
    taskId,
    userId,
  );
}

export function getWorkItem(id: number): WorkItem | undefined {
  const item = get<WorkItem>(
    `SELECT t.*, u.name as assignee_name, u.email as assignee_email
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.id = ?`,
    id,
  );
  if (!item) return undefined;

  const participants = all<WorkParticipant>(
    `SELECT wp.*, u.name as user_name, u.email as user_email, u.role as user_role, u.title
     FROM work_participants wp
     JOIN users u ON u.id = wp.user_id
     WHERE wp.task_id = ?
     ORDER BY wp.role DESC`,
    id,
  );

  return { ...item, participants };
}

export function listWorkItems(filters?: {
  assigneeId?: number;
  entityType?: string;
  entityId?: number;
  type?: WorkItemType;
  status?: string;
  source?: "USER" | "AI";
  fromDate?: string;
  toDate?: string;
  participantUserId?: number;
}): WorkItem[] {
  let sql = `
    SELECT t.*, u.name as assignee_name, u.email as assignee_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.assigneeId) {
    sql += " AND t.assignee_id = ?";
    params.push(filters.assigneeId);
  }
  if (filters?.entityType) {
    sql += " AND t.entity_type = ?";
    params.push(filters.entityType);
  }
  if (filters?.entityId) {
    sql += " AND t.entity_id = ?";
    params.push(filters.entityId);
  }
  if (filters?.type) {
    sql += " AND t.type = ?";
    params.push(filters.type);
  }
  if (filters?.status) {
    sql += " AND t.status = ?";
    params.push(filters.status);
  }
  if (filters?.source) {
    sql += " AND t.source = ?";
    params.push(filters.source);
  }
  if (filters?.fromDate) {
    sql += " AND (t.due_date >= ? OR t.due_at >= ?)";
    params.push(filters.fromDate, filters.fromDate);
  }
  if (filters?.toDate) {
    sql += " AND (t.due_date <= ? OR t.due_at <= ?)";
    params.push(filters.toDate, filters.toDate);
  }
  if (filters?.participantUserId) {
    sql += ` AND t.id IN (SELECT task_id FROM work_participants WHERE user_id = ?)`;
    params.push(filters.participantUserId);
  }

  sql += " ORDER BY t.due_date ASC, t.id DESC";
  return all<WorkItem>(sql, ...params);
}
