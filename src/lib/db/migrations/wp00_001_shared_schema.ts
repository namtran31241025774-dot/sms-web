import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

/**
 * Đảm bảo bảng users có đầy đủ vai trò mới trong CHECK constraint (PRESALES_MANAGER, AI_MANAGER).
 * Do SQLite không hỗ trợ ALTER CHECK constraint, cần rebuild bảng nếu bảng cũ chưa có 2 role này.
 */
export function fixUserRoleCheckConstraint(db: DatabaseSync): void {
  const userRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql: string } | undefined;
  const userSql = userRow?.sql ?? "";

  if (userSql && (!userSql.includes("PRESALES_MANAGER") || !userSql.includes("AI_MANAGER"))) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('SALES','PRESALES','PRESALES_MANAGER','SALES_MANAGER','FINANCE','LEGAL','DELIVERY','ADMIN','AI_MANAGER')),
        title TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        employee_id TEXT,
        password_hash TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED'))
      );
    `);

    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    const hasEmployeeId = cols.includes("employee_id");
    const hasPasswordHash = cols.includes("password_hash");
    const hasStatus = cols.includes("status");

    const selectCols = [
      "id", "name", "email", "role", "title", "active",
      hasEmployeeId ? "employee_id" : "NULL AS employee_id",
      hasPasswordHash ? "password_hash" : "NULL AS password_hash",
      hasStatus ? "status" : "'ACTIVE' AS status",
    ].join(", ");

    db.exec(`
      INSERT INTO users_new (id, name, email, role, title, active, employee_id, password_hash, status)
      SELECT ${selectCols} FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
      PRAGMA foreign_keys = ON;
    `);
  }
}

export const wp00_001_shared_schema: Migration = {
  name: "wp00_001_shared_schema",
  up(db: DatabaseSync) {
    // 1. Tạo bảng documents (quản lý tài liệu có phiên bản và trạng thái ký)
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT,
        version_no INTEGER NOT NULL DEFAULT 1,
        previous_version_id INTEGER REFERENCES documents(id),
        checksum TEXT,
        signature_status TEXT NOT NULL DEFAULT 'UNSIGNED' CHECK (signature_status IN ('UNSIGNED','PENDING','SIGNED','REJECTED')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Tạo bảng document_links (liên kết tài liệu với các thực thể nghiệp vụ)
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('lead','opportunity','quote','quote_version','order','invoice','activity')),
        entity_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (document_id, entity_type, entity_id)
      );
    `);

    // 3. Nâng cấp bảng users: thêm employee_id, password_hash, status và hỗ trợ role PRESALES_MANAGER, AI_MANAGER
    fixUserRoleCheckConstraint(db);

    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const colNames = userCols.map((c) => c.name);

    if (!colNames.includes("employee_id")) {
      db.exec("ALTER TABLE users ADD COLUMN employee_id TEXT;");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);");
    }

    if (!colNames.includes("password_hash")) {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
    }

    if (!colNames.includes("status")) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED'));");
    }
  },
};
