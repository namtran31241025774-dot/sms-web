import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp03_001_opportunity_management: Migration = {
  name: "wp03_001_opportunity_management",
  up(db: DatabaseSync) {
    // 1. Đánh giá sàng lọc & Khảo sát sơ bộ Lead (FR-30, FR-31)
    db.exec(`
      CREATE TABLE IF NOT EXISTS lead_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        business_problem TEXT,
        user_scale INTEGER,
        current_software TEXT,
        bant_budget INTEGER NOT NULL DEFAULT 0,
        bant_authority INTEGER NOT NULL DEFAULT 0,
        bant_need INTEGER NOT NULL DEFAULT 0,
        bant_timeline INTEGER NOT NULL DEFAULT 0,
        bant_score INTEGER NOT NULL DEFAULT 0,
        timeline_frame TEXT CHECK (timeline_frame IN ('IN_MONTH', 'END_OF_QUARTER', 'NEXT_YEAR', 'UNKNOWN')),
        rating TEXT CHECK (rating IN ('HOT', 'WARM', 'COLD')),
        missing_info TEXT,
        assessed_by INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lead_assessments_lead ON lead_assessments(lead_id);
    `);

    // 2. Biên bản phạm vi & Nhu cầu chi tiết (SCOPE_DOCUMENT - FR-37)
    db.exec(`
      CREATE TABLE IF NOT EXISTS scope_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        content TEXT,
        deliverables TEXT,
        detailed_needs TEXT,
        business_problem TEXT,
        scope_description TEXT,
        scale_users INTEGER,
        technical_constraints TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'CONFIRMED')),
        sent_at TEXT,
        confirmed_by INTEGER REFERENCES users(id),
        confirmed_at TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_scope_docs_opp ON scope_documents(opportunity_id);
    `);

    // 3. Cấu hình sản phẩm dự kiến trên cơ hội & Tính lại doanh thu (FR-38)
    db.exec(`
      CREATE TABLE IF NOT EXISTS opportunity_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        duration_months INTEGER NOT NULL DEFAULT 12,
        unit_price INTEGER NOT NULL DEFAULT 0,
        discount_pct REAL NOT NULL DEFAULT 0,
        amount INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_opp_items_opp ON opportunity_items(opportunity_id);
    `);

    // 4. Hồ sơ giải pháp kỹ thuật nội bộ (SOLUTION - FR-41, FR-42)
    db.exec(`
      CREATE TABLE IF NOT EXISTS solutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        type TEXT NOT NULL DEFAULT 'TECHNICAL',
        title TEXT NOT NULL,
        technical_approach TEXT,
        technical_solution TEXT,
        architecture TEXT,
        integration_required INTEGER NOT NULL DEFAULT 0,
        integration_requirements TEXT,
        deployment_scope TEXT,
        risks TEXT,
        estimated_effort_mandays INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        expert_review_status TEXT NOT NULL DEFAULT 'NONE',
        expert_reviewer_id INTEGER REFERENCES users(id),
        expert_review_note TEXT,
        expert_reviewed_at TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_solutions_opp ON solutions(opportunity_id);
    `);

    // 5. Lịch sử chuyển giai đoạn bán hàng (STAGE_HISTORY - FR-46)
    db.exec(`
      CREATE TABLE IF NOT EXISTS opportunity_stage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        from_stage TEXT NOT NULL,
        to_stage TEXT NOT NULL,
        moved_by INTEGER REFERENCES users(id),
        reason TEXT,
        moved_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_opp_stage_hist_opp ON opportunity_stage_history(opportunity_id);
    `);

    // 6. Mở rộng hoặc tạo bảng opportunities (FR-35, FR-47, BR-17, BR-27)
    const oppTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opportunities'").get();
    if (!oppTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          account_id INTEGER REFERENCES accounts(id),
          primary_contact_id INTEGER REFERENCES contacts(id),
          owner_id INTEGER REFERENCES users(id),
          presales_id INTEGER REFERENCES users(id),
          lead_id INTEGER REFERENCES leads(id),
          stage TEXT NOT NULL DEFAULT 'DEVELOP' CHECK (stage IN ('DEVELOP','PROPOSE','CLOSE','WON','LOST')),
          amount INTEGER NOT NULL DEFAULT 0,
          budget INTEGER NOT NULL DEFAULT 0,
          close_date TEXT,
          price_list_id INTEGER REFERENCES price_lists(id),
          customer_need TEXT,
          need_confirmed INTEGER NOT NULL DEFAULT 0,
          proposed_solution TEXT,
          solution_confirmed INTEGER NOT NULL DEFAULT 0,
          stakeholders_confirmed INTEGER NOT NULL DEFAULT 0,
          competitors_confirmed INTEGER NOT NULL DEFAULT 0,
          importance TEXT CHECK (importance IN ('LOW','MEDIUM','HIGH')),
          lost_reason TEXT,
          lost_reason_code TEXT,
          reopened_at TEXT,
          reopened_by INTEGER REFERENCES users(id),
          reopen_reason TEXT,
          expert_review_status TEXT NOT NULL DEFAULT 'NONE' CHECK (expert_review_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          closed_at TEXT
        );
      `);
    } else {
      const oppCols = (db.prepare("PRAGMA table_info(opportunities)").all() as { name: string }[]).map((c) => c.name);

      if (!oppCols.includes("budget")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN budget INTEGER NOT NULL DEFAULT 0;");
      }
      if (!oppCols.includes("lost_reason_code")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN lost_reason_code TEXT;");
      }
      if (!oppCols.includes("reopened_at")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN reopened_at TEXT;");
      }
      if (!oppCols.includes("reopened_by")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN reopened_by INTEGER REFERENCES users(id);");
      }
      if (!oppCols.includes("reopen_reason")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN reopen_reason TEXT;");
      }
      if (!oppCols.includes("expert_review_status")) {
        db.exec("ALTER TABLE opportunities ADD COLUMN expert_review_status TEXT NOT NULL DEFAULT 'NONE' CHECK (expert_review_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED'));");
      }
    }

    // 7. Nâng cấp hoặc tạo bảng opportunity_risks để hỗ trợ 4 trạng thái theo HG5: OPEN, MITIGATED, RESOLVED, DISMISSED
    const riskRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'opportunity_risks'").get() as { sql: string } | undefined;
    if (!riskRow) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS opportunity_risks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','MITIGATED','RESOLVED','DISMISSED')),
          source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI')),
          resolution TEXT,
          dismiss_reason TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_by INTEGER REFERENCES users(id),
          resolved_at TEXT
        );
      `);
    } else {
      const riskSql = riskRow.sql ?? "";
      if (!riskSql.includes("MITIGATED") || !riskSql.includes("DISMISSED")) {
        db.exec("PRAGMA foreign_keys = OFF;");
        db.exec(`
          CREATE TABLE opportunity_risks_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','MITIGATED','RESOLVED','DISMISSED')),
            source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI')),
            resolution TEXT,
            dismiss_reason TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            resolved_by INTEGER REFERENCES users(id),
            resolved_at TEXT
          );
        `);

        db.exec(`
          INSERT INTO opportunity_risks_new (id, opportunity_id, description, severity, status, source, resolution, created_by, created_at, resolved_by, resolved_at)
          SELECT id, opportunity_id, description, severity, status, source, resolution, created_by, created_at, resolved_by, resolved_at
          FROM opportunity_risks;
          DROP TABLE opportunity_risks;
          ALTER TABLE opportunity_risks_new RENAME TO opportunity_risks;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  },
};
