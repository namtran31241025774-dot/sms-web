import crypto from "node:crypto";
import { all, get, run } from "../db";
import { assert, type Role } from "../domain";
import { SETTING_DEFAULTS } from "../settings-defaults";
import { audit, type Actor } from "./core";
import { hashPassword } from "../password";

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  employee_id: string | null;
  employee_name?: string | null;
  team_id: number | null;
  team_name?: string | null;
  team_code?: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  active: number;
  created_at: string;
  updated_at: string;
}

export interface UserAccountFilter {
  role?: Role;
  status?: string;
  team_id?: number;
  search?: string;
}

/**
 * Danh sách người dùng hệ thống kèm thông tin nhóm và hồ sơ nhân viên (FR-96, FR-98).
 */
export function listUsers(filter?: UserAccountFilter): UserAccount[] {
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (filter?.role) {
    where.push("u.role = ?");
    params.push(filter.role);
  }

  if (filter?.status) {
    where.push("u.status = ?");
    params.push(filter.status);
  }

  if (filter?.team_id) {
    where.push("u.team_id = ?");
    params.push(filter.team_id);
  }

  if (filter?.search) {
    const s = `%${filter.search.trim()}%`;
    where.push("(u.name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)");
    params.push(s, s, s);
  }

  return all<UserAccount>(
    `SELECT 
       u.id, u.name, u.email, u.role, u.title, u.employee_id, u.team_id,
       u.status, u.active, u.created_at, u.updated_at,
       e.full_name AS employee_name,
       t.name AS team_name, t.code AS team_code
     FROM users u
     LEFT JOIN employees e ON e.code = u.employee_id
     LEFT JOIN teams t ON t.id = u.team_id
     WHERE ${where.join(" AND ")}
     ORDER BY u.id ASC`,
    ...params,
  );
}

/**
 * Lấy chi tiết tài khoản người dùng theo ID (FR-96).
 */
export function getUser(id: number): UserAccount | null {
  return (
    get<UserAccount>(
      `SELECT 
         u.id, u.name, u.email, u.role, u.title, u.employee_id, u.team_id,
         u.status, u.active, u.created_at, u.updated_at,
         e.full_name AS employee_name,
         t.name AS team_name, t.code AS team_code
       FROM users u
       LEFT JOIN employees e ON e.code = u.employee_id
       LEFT JOIN teams t ON t.id = u.team_id
       WHERE u.id = ?`,
      id,
    ) ?? null
  );
}

/**
 * Tạo tài khoản người dùng mới (FR-96).
 * - Kiểm tra trùng lặp email và employee_id.
 * - Liên kết hồ sơ nhân viên đã có.
 * - Khởi tạo mật khẩu được băm scrypt.
 * - Ghi audit_log.
 */
export function createUser(
  actor: Actor,
  data: {
    name: string;
    email: string;
    role: Role;
    title?: string;
    employee_id?: string;
    team_id?: number;
    password?: string;
  },
): number {
  const normEmail = data.email.trim().toLowerCase();
  assert(normEmail.includes("@"), "Email không hợp lệ");
  assert(data.name.trim().length > 0, "Họ và tên không được để trống");

  // Kiểm tra trùng email
  const existingEmail = get<{ id: number }>("SELECT id FROM users WHERE LOWER(email) = ?", normEmail);
  assert(!existingEmail, `Email '${normEmail}' đã được sử dụng bởi tài khoản khác`);

  // Kiểm tra trùng employee_id nếu có
  const normEmployeeId = data.employee_id?.trim() || null;
  if (normEmployeeId) {
    const existingEmp = get<{ id: number }>("SELECT id FROM users WHERE employee_id = ?", normEmployeeId);
    assert(!existingEmp, `Mã nhân viên '${normEmployeeId}' đã được liên kết với tài khoản khác`);

    // Kiểm tra xem mã nhân viên có tồn tại trong bảng employees không
    const empRecord = get<{ id: number }>("SELECT id FROM employees WHERE code = ?", normEmployeeId);
    assert(!!empRecord, `Không tìm thấy hồ sơ nhân viên có mã '${normEmployeeId}'`);
  }

  // Khởi tạo mật khẩu
  // No shared default. An administrator can issue a one-time reset token via FR-97.
  const rawPassword = data.password?.trim() || crypto.randomBytes(32).toString("base64url");
  const passwordHash = hashPassword(rawPassword);

  const teamId = data.team_id ?? null;
  const title = data.title?.trim() || null;

  run(
    `INSERT INTO users (name, email, role, title, employee_id, team_id, password_hash, status, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, datetime('now'), datetime('now'))`,
    data.name.trim(),
    normEmail,
    data.role,
    title,
    normEmployeeId,
    teamId,
    passwordHash,
  );

  const newId = get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id;

  // Nếu người dùng có gán team_id, ghi nhận thêm vào team_members nếu chưa có
  if (teamId) {
    const existsInTeam = get<{ id: number }>(
      "SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))",
      teamId,
      newId,
    );
    if (!existsInTeam) {
      run(
        "INSERT INTO team_members (team_id, user_id, role, valid_from) VALUES (?, ?, 'MEMBER', datetime('now'))",
        teamId,
        newId,
      );
    }
  }

  audit(actor, "user", newId, "CREATE", {
    to: data.role,
    reason: `Tạo tài khoản người dùng ${normEmail}`,
    details: { name: data.name, role: data.role, employee_id: normEmployeeId, team_id: teamId },
  });

  return newId;
}

/**
 * Cập nhật thông tin tài khoản người dùng (FR-96, FR-98).
 */
export function updateUser(
  actor: Actor,
  id: number,
  data: {
    name?: string;
    role?: Role;
    title?: string;
    employee_id?: string | null;
    team_id?: number | null;
  },
) {
  const current = getUser(id);
  assert(current, "Không tìm thấy người dùng");

  const updates: string[] = ["updated_at = datetime('now')"];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) {
    assert(data.name.trim().length > 0, "Tên không được để trống");
    updates.push("name = ?");
    params.push(data.name.trim());
  }

  if (data.role !== undefined) {
    updates.push("role = ?");
    params.push(data.role);
  }

  if (data.title !== undefined) {
    updates.push("title = ?");
    params.push(data.title ? data.title.trim() : null);
  }

  if (data.employee_id !== undefined) {
    const empId = data.employee_id ? data.employee_id.trim() : null;
    if (empId && empId !== current.employee_id) {
      const dup = get<{ id: number }>("SELECT id FROM users WHERE employee_id = ? AND id != ?", empId, id);
      assert(!dup, `Mã nhân viên '${empId}' đã được liên kết với tài khoản khác`);
      const empRecord = get<{ id: number }>("SELECT id FROM employees WHERE code = ?", empId);
      assert(!!empRecord, `Không tìm thấy hồ sơ nhân viên có mã '${empId}'`);
    }
    updates.push("employee_id = ?");
    params.push(empId);
  }

  if (data.team_id !== undefined) {
    updates.push("team_id = ?");
    params.push(data.team_id);

    // Cập nhật quan hệ nhóm
    if (data.team_id) {
      const existsInTeam = get<{ id: number }>(
        "SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))",
        data.team_id,
        id,
      );
      if (!existsInTeam) {
        run(
          "INSERT INTO team_members (team_id, user_id, role, valid_from) VALUES (?, ?, 'MEMBER', datetime('now'))",
          data.team_id,
          id,
        );
      }
    }
  }

  params.push(id);
  run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, ...params);

  audit(actor, "user", id, "UPDATE", {
    from: current.role,
    to: data.role ?? current.role,
    reason: `Cập nhật thông tin tài khoản ${current.email}`,
    details: data,
  });
}

/**
 * Khóa hoặc kích hoạt lại tài khoản người dùng (FR-96).
 * Khi khóa: trạng thái chuyển sang SUSPENDED/INACTIVE, active = 0.
 * Không xóa tài khoản hay giao dịch lịch sử.
 */
export function setUserStatus(
  actor: Actor,
  id: number,
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED",
) {
  const current = getUser(id);
  assert(current, "Không tìm thấy người dùng");

  // Không cho phép tự khóa tài khoản của chính mình
  if (actor.type === "USER" && actor.id === id && status !== "ACTIVE") {
    throw new Error("Bạn không thể tự khóa tài khoản của chính mình");
  }

  const active = status === "ACTIVE" ? 1 : 0;
  run(
    "UPDATE users SET status = ?, active = ?, updated_at = datetime('now') WHERE id = ?",
    status,
    active,
    id,
  );

  audit(actor, "user", id, status === "ACTIVE" ? "ACTIVATE" : "SUSPEND", {
    from: current.status,
    to: status,
    reason: status === "ACTIVE" ? "Kích hoạt lại tài khoản" : "Khóa tài khoản người dùng",
  });
}

/**
 * Đặt lại mật khẩu người dùng bởi Người quản trị (FR-97).
 */
export function resetUserPassword(
  actor: Actor,
  id: number,
  newPassword?: string,
): { newPassword?: string; token?: string } {
  const current = getUser(id);
  assert(current, "Không tìm thấy người dùng");

  if (newPassword && newPassword.trim().length > 0) {
    const passwordHash = hashPassword(newPassword.trim());
    run(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL, updated_at = datetime('now') WHERE id = ?",
      passwordHash,
      id,
    );

    audit(actor, "user", id, "RESET_PASSWORD", {
      reason: `Quản trị viên đặt lại mật khẩu trực tiếp cho tài khoản ${current.email}`,
    });

    return { newPassword: newPassword.trim() };
  } else {
    // Sinh token đặt lại mật khẩu tự phục vụ có hiệu lực 1 giờ (FR-97)
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    run(
      "UPDATE users SET reset_token = ?, reset_token_expires_at = ?, updated_at = datetime('now') WHERE id = ?",
      token,
      expiresAt,
      id,
    );

    audit(actor, "user", id, "REQUEST_PASSWORD_RESET", {
      reason: `Tạo mã đặt lại mật khẩu cho tài khoản ${current.email}`,
    });

    return { token };
  }
}

/**
 * Yêu cầu đặt lại mật khẩu bằng email (FR-97).
 */
export function requestPasswordReset(email: string): string {
  const normEmail = email.trim().toLowerCase();
  const user = get<{ id: number; active: number; status: string }>(
    "SELECT id, active, status FROM users WHERE LOWER(email) = ?",
    normEmail,
  );

  assert(user, "Không tìm thấy tài khoản với email này");
  assert(user.active === 1 && user.status === "ACTIVE", "Tài khoản hiện đang bị khóa hoặc ngưng hoạt động");

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  run(
    "UPDATE users SET reset_token = ?, reset_token_expires_at = ?, updated_at = datetime('now') WHERE id = ?",
    token,
    expiresAt,
    user.id,
  );

  return token;
}

/**
 * Đặt lại mật khẩu bằng Token hợp lệ (FR-97).
 */
export function resetPasswordWithToken(token: string, newPassword: string) {
  assert(newPassword.trim().length >= 6, "Mật khẩu mới phải có tối thiểu 6 ký tự");

  const user = get<{ id: number; email: string; reset_token_expires_at: string }>(
    "SELECT id, email, reset_token_expires_at FROM users WHERE reset_token = ?",
    token,
  );

  assert(user, "Mã đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng");

  const now = new Date().toISOString();
  if (user.reset_token_expires_at && user.reset_token_expires_at < now) {
    throw new Error("Mã đặt lại mật khẩu đã hết hạn");
  }

  const passwordHash = hashPassword(newPassword.trim());
  run(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL, updated_at = datetime('now') WHERE id = ?",
    passwordHash,
    user.id,
  );

  audit({ type: "SYSTEM" }, "user", user.id, "RESET_PASSWORD_WITH_TOKEN", {
    reason: `Người dùng đặt lại mật khẩu thành công qua mã xác nhận`,
  });
}

// ===== Quản trị Cấu hình Hệ thống (Settings) =====
export function listSettings() {
  return all<{ key: string; value: string; description: string | null }>("SELECT * FROM settings ORDER BY key");
}

const VALIDATORS: Record<string, (v: string) => boolean> = {
  bant_threshold: (v) => /^\d+$/.test(v) && Number(v) <= 100,
  discount_threshold_pct: (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) <= 100,
  manager_gate_mode: (v) => ["HIGH_OR_OPEN_RISK", "ALWAYS", "NEVER"].includes(v),
  ai_auto_convert: (v) => v === "false", // ADR-03 chưa chốt: khóa ở false cho tới khi nhóm quyết định
  allow_direct_order: (v) => v === "false" || v === "true",
  agent_qualification_enabled: (v) => v === "true" || v === "false",
  agent_opportunity_enabled: (v) => v === "true" || v === "false",
  opp_refresh_hours: (v) => /^\d+$/.test(v) && Number(v) >= 1,
  email_window_days: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365,
  qualification_tcp: (v) => v.trim().length >= 10,
};

export function setSetting(actor: Actor, key: string, value: string) {
  assert(key in SETTING_DEFAULTS, "Tham số không tồn tại");
  assert(VALIDATORS[key]?.(value.trim()) ?? true, `Giá trị không hợp lệ cho ${key}`);
  const old = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value;
  if (old === value.trim()) return;
  run(
    "INSERT INTO settings (key, value, description) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value.trim(),
    SETTING_DEFAULTS[key].description,
  );
  audit(actor, "setting", 0, "UPDATE", { from: old ?? null, to: value.trim(), reason: key });
}

export function recentAudit(limit = 100) {
  return all<{
    id: number;
    entity_type: string;
    entity_id: number;
    action: string;
    from_status: string | null;
    to_status: string | null;
    actor_type: string;
    actor_label: string;
    reason: string | null;
    created_at: string;
  }>("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", limit);
}

export function dashboard(userId: number) {
  const pipeline = all<{ stage: string; n: number; amount: number }>(
    "SELECT stage, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount FROM opportunities GROUP BY stage",
  );
  const leads = all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM leads GROUP BY status");
  const orders = all<{ status: string; n: number; amount: number }>(
    "SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS amount FROM orders GROUP BY status",
  );
  const ar = get<{ issued: number; paid: number }>(
    "SELECT COALESCE(SUM(amount),0) AS issued, COALESCE(SUM(paid_amount),0) AS paid FROM invoices WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID')",
  ) ?? { issued: 0, paid: 0 };
  const pendingApprovals = get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status='PENDING'")?.n ?? 0;
  const pendingAi =
    get<{ n: number }>(
      "SELECT (SELECT COUNT(*) FROM ai_suggestions WHERE status='PENDING_REVIEW') + (SELECT COUNT(*) FROM opportunity_research WHERE status='PENDING_REVIEW') AS n",
    )?.n ?? 0;
  const tasks = all<{
    id: number;
    title: string;
    entity_type: string | null;
    entity_id: number | null;
    due_date: string | null;
    source: string;
  }>("SELECT * FROM tasks WHERE assignee_id = ? AND status = 'OPEN' ORDER BY due_date LIMIT 10", userId);
  const notifications = all<{ id: number; message: string; link: string | null; is_read: number; created_at: string }>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8",
    userId,
  );
  const atRisk = all<{
    id: number;
    code: string;
    name: string;
    account_name: string;
    stage: string;
    importance: string | null;
    open_risks: number;
  }>(
    `SELECT o.id, o.code, o.name, a.name AS account_name, o.stage, o.importance,
       (SELECT COUNT(*) FROM opportunity_risks r WHERE r.opportunity_id = o.id AND r.status='OPEN') AS open_risks
     FROM opportunities o JOIN accounts a ON a.id = o.account_id
     WHERE o.stage NOT IN ('WON','LOST') ORDER BY open_risks DESC, o.amount DESC LIMIT 5`,
  );
  return { pipeline, leads, orders, ar, pendingApprovals, pendingAi, tasks, notifications, atRisk };
}

export function unreadCount(userId: number) {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", userId)?.n ?? 0;
}

export function markNotificationsRead(userId: number) {
  run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", userId);
}

export function completeTask(userId: number, taskId: number) {
  run("UPDATE tasks SET status='DONE' WHERE id = ? AND assignee_id = ?", taskId, userId);
}
