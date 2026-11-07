import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp09_001_admin_management: Migration = {
  name: "wp09_001_admin_management",
  up(db: DatabaseSync) {
    // 1. Kiểm tra và bổ sung các cột cần thiết cho bảng users (FR-96, FR-97, FR-98)
    const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);

    if (!userCols.includes("employee_id")) {
      db.exec("ALTER TABLE users ADD COLUMN employee_id TEXT;");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);");
    }

    if (!userCols.includes("team_id")) {
      db.exec("ALTER TABLE users ADD COLUMN team_id INTEGER REFERENCES teams(id);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);");
    }

    if (!userCols.includes("password_hash")) {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
    }

    if (!userCols.includes("status")) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED'));");
    }

    if (!userCols.includes("reset_token")) {
      db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT;");
    }

    if (!userCols.includes("reset_token_expires_at")) {
      db.exec("ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT;");
    }

    if (!userCols.includes("created_at")) {
      db.exec("ALTER TABLE users ADD COLUMN created_at TEXT;");
      db.exec("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL;");
    }

    if (!userCols.includes("updated_at")) {
      db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT;");
      db.exec("UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL;");
    }

    // 2. Tối ưu hóa chỉ mục cho audit_log (FR-100) nếu bảng đã tồn tại
    const hasAuditTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").get();
    if (hasAuditTable) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
      `);
    }
  },
};
