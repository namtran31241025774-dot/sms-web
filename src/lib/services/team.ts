import { all, get, run, tx } from "@/lib/db";
import { audit, type Actor } from "./core";

function makeActor(userId?: number): Actor {
  if (userId) {
    return { type: "USER", id: userId, name: "Quản lý kinh doanh", role: "SALES_MANAGER" };
  }
  return { type: "SYSTEM" };
}

export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "RESIGNED";
export type BusinessRole =
  | "SALES"
  | "PRESALES"
  | "SALES_MANAGER"
  | "FINANCE"
  | "ADMIN"
  | "AI_MANAGER";

export interface Employee {
  id: number;
  code: string;
  full_name: string;
  email: string;
  phone: string | null;
  title: string;
  business_role: BusinessRole;
  status: EmployeeStatus;
  can_accept_work: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEmployeeInput {
  code: string;
  full_name: string;
  email: string;
  phone?: string | null;
  title: string;
  business_role: BusinessRole;
  status?: EmployeeStatus;
  can_accept_work?: boolean;
  notes?: string | null;
}

export interface UpdateEmployeeInput {
  full_name?: string;
  email?: string;
  phone?: string | null;
  title?: string;
  business_role?: BusinessRole;
  status?: EmployeeStatus;
  can_accept_work?: boolean;
  notes?: string | null;
}

export interface Team {
  id: number;
  code: string;
  name: string;
  description: string | null;
  leader_id: number | null;
  leader_name?: string | null;
  territory: string | null;
  target_segment: "ALL" | "SMB" | "ENTERPRISE";
  product_line: string | null;
  active: number;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  title: string | null;
  role: "LEADER" | "MEMBER";
  valid_from: string;
  valid_to: string | null;
  is_active: number;
}

export interface CreateTeamInput {
  code: string;
  name: string;
  description?: string | null;
  leader_id?: number | null;
  territory?: string | null;
  target_segment?: "ALL" | "SMB" | "ENTERPRISE";
  product_line?: string | null;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
  leader_id?: number | null;
  territory?: string | null;
  target_segment?: "ALL" | "SMB" | "ENTERPRISE";
  product_line?: string | null;
  active?: boolean;
}

// ==========================================
// 1. Quản lý Hồ sơ nhân viên (FR-75, 76, 77, 78)
// ==========================================

export function listEmployees(filters?: {
  query?: string;
  status?: EmployeeStatus;
  businessRole?: BusinessRole;
  canAcceptWork?: boolean;
}): Employee[] {
  let sql = "SELECT * FROM employees WHERE 1=1";
  const params: (string | number)[] = [];

  if (filters?.query) {
    sql += " AND (code LIKE ? OR full_name LIKE ? OR email LIKE ? OR title LIKE ?)";
    const q = `%${filters.query}%`;
    params.push(q, q, q, q);
  }
  if (filters?.status) {
    sql += " AND status = ?";
    params.push(filters.status);
  }
  if (filters?.businessRole) {
    sql += " AND business_role = ?";
    params.push(filters.businessRole);
  }
  if (filters?.canAcceptWork !== undefined) {
    sql += " AND can_accept_work = ?";
    params.push(filters.canAcceptWork ? 1 : 0);
  }

  sql += " ORDER BY code ASC";
  return all<Employee>(sql, ...params);
}

export function getEmployee(id: number): Employee | undefined {
  return get<Employee>("SELECT * FROM employees WHERE id = ?", id);
}

export function getEmployeeByCode(code: string): Employee | undefined {
  return get<Employee>("SELECT * FROM employees WHERE code = ?", code);
}

/**
 * FR-75: Tạo hồ sơ nhân viên nghiệp vụ (tách biệt tài khoản đăng nhập).
 * Kiểm tra trùng mã nhân viên và trùng email.
 */
export function createEmployee(
  data: CreateEmployeeInput,
  actorUserId?: number,
): Employee {
  const cleanCode = data.code.trim().toUpperCase();
  const existingCode = getEmployeeByCode(cleanCode);
  if (existingCode) {
    throw new Error(`Mã nhân viên "${cleanCode}" đã tồn tại trên hệ thống.`);
  }

  const existingEmail = get<Employee>("SELECT id FROM employees WHERE email = ?", data.email.trim());
  if (existingEmail) {
    throw new Error(`Email nhân viên "${data.email}" đã tồn tại trên hệ thống.`);
  }

  const canAccept = data.can_accept_work !== undefined ? (data.can_accept_work ? 1 : 0) : 1;
  const status = data.status ?? "ACTIVE";

  return tx(() => {
    const res = run(
      `INSERT INTO employees (code, full_name, email, phone, title, business_role, status, can_accept_work, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cleanCode,
      data.full_name.trim(),
      data.email.trim(),
      data.phone?.trim() ?? null,
      data.title.trim(),
      data.business_role,
      status,
      canAccept,
      data.notes?.trim() ?? null,
    );

    audit(makeActor(actorUserId), "employee", res.id, "CREATE", {
      to: status,
      details: { code: cleanCode, title: data.title, role: data.business_role },
    });

    return getEmployee(res.id)!;
  });
}

/**
 * FR-76, FR-77: Xem và cập nhật hồ sơ, chức danh, vai trò nghiệp vụ.
 */
export function updateEmployee(
  id: number,
  data: UpdateEmployeeInput,
  actorUserId?: number,
): Employee {
  const emp = getEmployee(id);
  if (!emp) {
    throw new Error(`Không tìm thấy nhân viên ID ${id}`);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.full_name !== undefined) {
    updates.push("full_name = ?");
    params.push(data.full_name.trim());
  }
  if (data.email !== undefined) {
    const email = data.email.trim();
    const dup = get<Employee>("SELECT id FROM employees WHERE email = ? AND id != ?", email, id);
    if (dup) throw new Error(`Email "${email}" đã thuộc nhân viên khác.`);
    updates.push("email = ?");
    params.push(email);
  }
  if (data.phone !== undefined) {
    updates.push("phone = ?");
    params.push(data.phone?.trim() ?? null);
  }
  if (data.title !== undefined) {
    updates.push("title = ?");
    params.push(data.title.trim());
  }
  if (data.business_role !== undefined) {
    updates.push("business_role = ?");
    params.push(data.business_role);
  }
  if (data.status !== undefined) {
    updates.push("status = ?");
    params.push(data.status);
  }
  if (data.can_accept_work !== undefined) {
    updates.push("can_accept_work = ?");
    params.push(data.can_accept_work ? 1 : 0);
  }
  if (data.notes !== undefined) {
    updates.push("notes = ?");
    params.push(data.notes?.trim() ?? null);
  }

  if (updates.length === 0) return emp;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  return tx(() => {
    run(`UPDATE employees SET ${updates.join(", ")} WHERE id = ?`, ...params);

    audit(makeActor(actorUserId), "employee", id, "UPDATE", {
      from: emp.status,
      to: data.status ?? emp.status,
      details: data,
    });

    return getEmployee(id)!;
  });
}

/**
 * FR-78: Cập nhật trạng thái làm việc và khả năng nhận việc của nhân viên.
 */
export function updateEmployeeWorkStatus(
  id: number,
  status: EmployeeStatus,
  canAcceptWork: boolean,
  notes?: string | null,
  actorUserId?: number,
): Employee {
  return updateEmployee(
    id,
    {
      status,
      can_accept_work: canAcceptWork,
      notes: notes !== undefined ? notes : undefined,
    },
    actorUserId,
  );
}

/**
 * FR-78, FR-84: Kiểm tra khối lượng công việc hiện tại của nhân viên để chuẩn bị điều phối/bàn giao.
 */
export function getEmployeeWorkload(employeeCode: string): {
  user?: { id: number; name: string; email: string };
  assignedLeads: { id: number; company_name: string; contact_name: string; status: string }[];
  assignedOpportunities: { id: number; code: string; name: string; stage: string; amount: number }[];
  assignedTasks: { id: number; title: string; due_date: string | null; status: string }[];
} {
  const user = get<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE employee_id = ?",
    employeeCode,
  );

  if (!user) {
    return {
      assignedLeads: [],
      assignedOpportunities: [],
      assignedTasks: [],
    };
  }

  const assignedLeads = all<{ id: number; company_name: string; contact_name: string; status: string }>(
    "SELECT id, company_name, contact_name, status FROM leads WHERE owner_id = ? AND status IN ('OPEN', 'WORKING')",
    user.id,
  );

  const assignedOpportunities = all<{ id: number; code: string; name: string; stage: string; amount: number }>(
    "SELECT id, code, name, stage, amount FROM opportunities WHERE owner_id = ? AND stage NOT IN ('WON', 'LOST')",
    user.id,
  );

  const assignedTasks = all<{ id: number; title: string; due_date: string | null; status: string }>(
    "SELECT id, title, due_date, status FROM tasks WHERE assignee_id = ? AND status = 'OPEN'",
    user.id,
  );

  return {
    user,
    assignedLeads,
    assignedOpportunities,
    assignedTasks,
  };
}

// ==========================================
// 2. Quản lý Nhóm bán hàng (Sale Pods - FR-79, 80, 81)
// ==========================================

export function listTeams(filters?: {
  activeOnly?: boolean;
  territory?: string;
  segment?: string;
}): Team[] {
  let sql = `
    SELECT t.*, u.name as leader_name,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND (tm.valid_to IS NULL OR tm.valid_to > datetime('now'))) as member_count
    FROM teams t
    LEFT JOIN users u ON u.id = t.leader_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.activeOnly) {
    sql += " AND t.active = 1";
  }
  if (filters?.territory) {
    sql += " AND t.territory = ?";
    params.push(filters.territory);
  }
  if (filters?.segment) {
    sql += " AND (t.target_segment = ? OR t.target_segment = 'ALL')";
    params.push(filters.segment);
  }

  sql += " ORDER BY t.code ASC";
  return all<Team>(sql, ...params);
}

export function getTeam(id: number): Team | undefined {
  return get<Team>(
    `SELECT t.*, u.name as leader_name,
       (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND (tm.valid_to IS NULL OR tm.valid_to > datetime('now'))) as member_count
     FROM teams t
     LEFT JOIN users u ON u.id = t.leader_id
     WHERE t.id = ?`,
    id,
  );
}

export function getTeamByCode(code: string): Team | undefined {
  return get<Team>("SELECT * FROM teams WHERE code = ?", code);
}

/**
 * FR-79, FR-81: Tạo nhóm bán hàng (Sale Pod) và thiết lập phạm vi phụ trách.
 */
export function createTeam(data: CreateTeamInput, actorUserId?: number): Team {
  const cleanCode = data.code.trim().toUpperCase();
  const exist = getTeamByCode(cleanCode);
  if (exist) {
    throw new Error(`Mã nhóm bán hàng "${cleanCode}" đã tồn tại.`);
  }

  return tx(() => {
    const res = run(
      `INSERT INTO teams (code, name, description, leader_id, territory, target_segment, product_line, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      cleanCode,
      data.name.trim(),
      data.description?.trim() ?? null,
      data.leader_id ?? null,
      data.territory?.trim() ?? null,
      data.target_segment ?? "ALL",
      data.product_line?.trim() ?? null,
    );

    // Nếu có trưởng nhóm, tự động thêm vào team_members với vai trò LEADER
    if (data.leader_id) {
      run(
        `INSERT INTO team_members (team_id, user_id, role, valid_from)
         VALUES (?, ?, 'LEADER', datetime('now'))`,
        res.id,
        data.leader_id,
      );
    }

    audit(makeActor(actorUserId), "team", res.id, "CREATE", {
      to: "ACTIVE",
      details: { code: cleanCode, name: data.name, territory: data.territory },
    });

    return getTeam(res.id)!;
  });
}

/**
 * FR-79, FR-81: Cập nhật thông tin nhóm, trưởng nhóm và phạm vi phụ trách.
 */
export function updateTeam(id: number, data: UpdateTeamInput, actorUserId?: number): Team {
  const team = getTeam(id);
  if (!team) {
    throw new Error(`Không tìm thấy nhóm ID ${id}`);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name.trim());
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description?.trim() ?? null);
  }
  if (data.leader_id !== undefined) {
    updates.push("leader_id = ?");
    params.push(data.leader_id);
  }
  if (data.territory !== undefined) {
    updates.push("territory = ?");
    params.push(data.territory?.trim() ?? null);
  }
  if (data.target_segment !== undefined) {
    updates.push("target_segment = ?");
    params.push(data.target_segment);
  }
  if (data.product_line !== undefined) {
    updates.push("product_line = ?");
    params.push(data.product_line?.trim() ?? null);
  }
  if (data.active !== undefined) {
    updates.push("active = ?");
    params.push(data.active ? 1 : 0);
  }

  if (updates.length === 0) return team;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  return tx(() => {
    run(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`, ...params);

    // Nếu đổi trưởng nhóm, cập nhật hoặc gán LEADER trong team_members
    if (data.leader_id && data.leader_id !== team.leader_id) {
      // Đóng vai trò LEADER cũ nếu có
      if (team.leader_id) {
        run(
          `UPDATE team_members SET role = 'MEMBER' WHERE team_id = ? AND user_id = ? AND role = 'LEADER'`,
          id,
          team.leader_id,
        );
      }
      // Gán hoặc nâng cấp LEADER mới
      const hasMember = get<{ id: number }>(
        "SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))",
        id,
        data.leader_id,
      );
      if (hasMember) {
        run("UPDATE team_members SET role = 'LEADER' WHERE id = ?", hasMember.id);
      } else {
        run(
          "INSERT INTO team_members (team_id, user_id, role, valid_from) VALUES (?, ?, 'LEADER', datetime('now'))",
          id,
          data.leader_id,
        );
      }
    }

    audit(makeActor(actorUserId), "team", id, "UPDATE", {
      details: data,
    });

    return getTeam(id)!;
  });
}

/**
 * FR-80: Phân công trưởng nhóm và thành viên.
 */
export function addTeamMember(
  teamId: number,
  userId: number,
  role: "LEADER" | "MEMBER" = "MEMBER",
  actorUserId?: number,
): void {
  const team = getTeam(teamId);
  if (!team) throw new Error(`Không tìm thấy nhóm bán hàng ID ${teamId}`);

  // Kiểm tra thành viên đã có trong nhóm và còn hiệu lực không
  const activeMember = get<{ id: number }>(
    `SELECT id FROM team_members
     WHERE team_id = ? AND user_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))`,
    teamId,
    userId,
  );

  if (activeMember) {
    // Cập nhật vai trò nếu khác
    run("UPDATE team_members SET role = ? WHERE id = ?", role, activeMember.id);
    return;
  }

  tx(() => {
    run(
      `INSERT INTO team_members (team_id, user_id, role, valid_from)
       VALUES (?, ?, ?, datetime('now'))`,
      teamId,
      userId,
      role,
    );

    if (role === "LEADER") {
      run("UPDATE teams SET leader_id = ? WHERE id = ?", userId, teamId);
    }

    audit(makeActor(actorUserId), "team", teamId, "ADD_MEMBER", {
      details: { userId, role },
    });
  });
}

/**
 * FR-80: Kết thúc tham gia của thành viên trong nhóm.
 * Lưu ý: Thay đổi thành viên KHÔNG tự chuyển khách hàng/cơ hội đang phụ trách.
 */
export function removeTeamMember(teamId: number, userId: number, actorUserId?: number): void {
  tx(() => {
    run(
      `UPDATE team_members SET valid_to = datetime('now')
       WHERE team_id = ? AND user_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))`,
      teamId,
      userId,
    );

    // Nếu người này là leader của team, xoá leader_id trên team
    const team = getTeam(teamId);
    if (team?.leader_id === userId) {
      run("UPDATE teams SET leader_id = NULL WHERE id = ?", teamId);
    }

    audit(makeActor(actorUserId), "team", teamId, "REMOVE_MEMBER", {
      details: { userId },
    });
  });
}

export function listTeamMembers(teamId: number, activeOnly = true): TeamMember[] {
  let sql = `
    SELECT tm.*, u.name as user_name, u.email as user_email, u.role as user_role, u.title,
      CASE WHEN tm.valid_to IS NULL OR tm.valid_to > datetime('now') THEN 1 ELSE 0 END as is_active
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
  `;
  if (activeOnly) {
    sql += " AND (tm.valid_to IS NULL OR tm.valid_to > datetime('now'))";
  }
  sql += " ORDER BY tm.role DESC, tm.valid_from ASC";
  return all<TeamMember>(sql, teamId);
}

export function getUserTeams(userId: number): Team[] {
  const sql = `
    SELECT t.*, u.name as leader_name
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    LEFT JOIN users u ON u.id = t.leader_id
    WHERE tm.user_id = ? AND (tm.valid_to IS NULL OR tm.valid_to > datetime('now')) AND t.active = 1
  `;
  return all<Team>(sql, userId);
}
