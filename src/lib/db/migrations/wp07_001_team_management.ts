import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp07_001_team_management: Migration = {
  name: "wp07_001_team_management",
  up(db: DatabaseSync) {
    // 1. Hồ sơ nhân viên (EMPLOYEE - FR-75, tách khỏi tài khoản users)
    db.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        title TEXT NOT NULL,
        business_role TEXT NOT NULL DEFAULT 'SALES' CHECK (business_role IN ('SALES', 'PRESALES', 'PRESALES_MANAGER', 'SALES_MANAGER', 'FINANCE', 'ADMIN', 'AI_MANAGER')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED')),
        can_accept_work INTEGER NOT NULL DEFAULT 1 CHECK (can_accept_work IN (0, 1)),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Nhóm bán hàng (TEAM / Sale Pod - FR-79, FR-81)
    db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        leader_id INTEGER REFERENCES users(id),
        territory TEXT,
        target_segment TEXT NOT NULL DEFAULT 'ALL' CHECK (target_segment IN ('ALL', 'SMB', 'ENTERPRISE')),
        product_line TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 3. Thành viên nhóm bán hàng (TEAM_MEMBER - FR-80)
    db.exec(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('LEADER', 'MEMBER')),
        valid_from TEXT NOT NULL DEFAULT (datetime('now')),
        valid_to TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id, valid_from)
      );
    `);

    // 4. Lịch sử phân công & điều phối (ASSIGNMENT - FR-82, FR-84)
    db.exec(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'opportunity', 'account', 'task')),
        entity_id INTEGER NOT NULL,
        from_user_id INTEGER REFERENCES users(id),
        to_user_id INTEGER NOT NULL REFERENCES users(id),
        team_id INTEGER REFERENCES teams(id),
        assigned_by INTEGER NOT NULL REFERENCES users(id),
        assignment_type TEXT NOT NULL DEFAULT 'INITIAL' CHECK (assignment_type IN ('INITIAL', 'REASSIGN', 'HANDOVER')),
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_assignments_entity ON assignments(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_to_user ON assignments(to_user_id);
    `);

    // 5. Mở rộng tasks thành công việc & lịch hẹn (WORK_ITEM - FR-83)
    const hasTasks = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();
    if (hasTasks) {
      const taskCols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name);
      if (!taskCols.includes("type")) {
        db.exec("ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'TASK' CHECK (type IN ('TASK', 'APPOINTMENT'));");
      }
      if (!taskCols.includes("description")) {
        db.exec("ALTER TABLE tasks ADD COLUMN description TEXT;");
      }
      if (!taskCols.includes("due_at")) {
        db.exec("ALTER TABLE tasks ADD COLUMN due_at TEXT;");
      }
      if (!taskCols.includes("outcome")) {
        db.exec("ALTER TABLE tasks ADD COLUMN outcome TEXT;");
      }
      if (!taskCols.includes("completed_at")) {
        db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT;");
      }
      if (!taskCols.includes("priority")) {
        db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'));");
      }
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'TASK' CHECK (type IN ('TASK', 'APPOINTMENT')),
          description TEXT,
          entity_type TEXT,
          entity_id INTEGER,
          assignee_id INTEGER REFERENCES users(id),
          due_date TEXT,
          due_at TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
          priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
          outcome TEXT,
          completed_at TEXT,
          source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    }

    // 6. Thành viên tham gia lịch hẹn / công việc (WORK_PARTICIPANT - FR-83)
    db.exec(`
      CREATE TABLE IF NOT EXISTS work_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'ATTENDEE' CHECK (role IN ('ORGANIZER', 'PRESALES', 'ATTENDEE')),
        status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACCEPTED', 'DECLINED')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (task_id, user_id)
      );
    `);

    // 7. Bổ sung team_id vào leads và opportunities
    const hasLeads = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'leads'").get();
    if (hasLeads) {
      const leadCols = (db.prepare("PRAGMA table_info(leads)").all() as { name: string }[]).map((c) => c.name);
      if (!leadCols.includes("team_id")) {
        db.exec("ALTER TABLE leads ADD COLUMN team_id INTEGER REFERENCES teams(id);");
      }
    }

    const hasOpps = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opportunities'").get();
    if (hasOpps) {
      const oppCols = (db.prepare("PRAGMA table_info(opportunities)").all() as { name: string }[]).map((c) => c.name);
      if (!oppCols.includes("team_id")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN team_id INTEGER REFERENCES teams(id);");
      }
    }

    // 8. Chỉ tiêu doanh số (SALES_TARGET - FR-85, BR-14)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL CHECK (period_type IN ('MONTH', 'QUARTER', 'YEAR')),
        period_name TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id),
        team_id INTEGER REFERENCES teams(id),
        target_amount INTEGER NOT NULL DEFAULT 0,
        target_deals INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK ((user_id IS NOT NULL AND team_id IS NULL) OR (user_id IS NULL AND team_id IS NOT NULL)),
        UNIQUE (period_type, period_name, user_id, team_id)
      );
    `);

    // 9. Đánh giá hiệu suất bán hàng (PERFORMANCE_REVIEW - FR-87)
    db.exec(`
      CREATE TABLE IF NOT EXISTS performance_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        reviewer_id INTEGER NOT NULL REFERENCES users(id),
        period_name TEXT NOT NULL,
        actual_revenue INTEGER NOT NULL DEFAULT 0,
        target_revenue INTEGER NOT NULL DEFAULT 0,
        completion_pct REAL NOT NULL DEFAULT 0,
        rating TEXT NOT NULL CHECK (rating IN ('EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_IMPROVEMENT')),
        feedback TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_perf_reviews_emp ON performance_reviews(employee_id);
    `);
  },
};
