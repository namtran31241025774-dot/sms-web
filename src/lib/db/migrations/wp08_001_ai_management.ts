import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";
import { QUALIFICATION_SYSTEM, OPPORTUNITY_SYSTEM } from "../../agents/prompts";

export const wp08_001_ai_management: Migration = {
  name: "wp08_001_ai_management",
  up(db: DatabaseSync) {
    // 1. Bảng agents: 2 tác nhân cố định QUALIFICATION & OPPORTUNITY (DATA-MODEL)
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare("INSERT OR IGNORE INTO agents (id, name, description) VALUES (?, ?, ?)").run(
      "QUALIFICATION",
      "Sales Qualification Agent",
      "Sàng lọc và làm giàu thông tin Lead, chấm điểm BANT và đề xuất chuyển đổi / loại bỏ",
    );
    db.prepare("INSERT OR IGNORE INTO agents (id, name, description) VALUES (?, ?, ?)").run(
      "OPPORTUNITY",
      "Sales Opportunity Agent",
      "Nghiên cứu cơ hội, phát hiện rủi ro, phân tích insight và đề xuất hành động ưu tiên",
    );

    // 2. Bảng agent_configs: Quản lý phiên bản prompt, model, tiêu chí, ngân sách (DEC-27, BR-25)
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL REFERENCES agents(id),
        version_no INTEGER NOT NULL,
        instructions TEXT NOT NULL,
        model_reference TEXT NOT NULL,
        criteria_snapshot TEXT,
        schedule_rule TEXT,
        budget_limit INTEGER NOT NULL DEFAULT 200000,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
        eval_report_ref TEXT,
        eval_passed INTEGER NOT NULL DEFAULT 0,
        configured_by INTEGER REFERENCES users(id),
        business_approved_by INTEGER REFERENCES users(id),
        effective_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agent_configs_agent ON agent_configs(agent_id, status);
    `);

    // Seed phiên bản v1 ACTIVE cho 2 agents nếu chưa có
    const qualConfig = db.prepare("SELECT id FROM agent_configs WHERE agent_id = 'QUALIFICATION'").get();
    if (!qualConfig) {
      db.prepare(`
        INSERT INTO agent_configs (agent_id, version_no, instructions, model_reference, budget_limit, status, eval_passed, effective_at)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, datetime('now'))
      `).run("QUALIFICATION", 1, QUALIFICATION_SYSTEM, "gpt-4o-2024-08-06", 200000);
    }

    const oppConfig = db.prepare("SELECT id FROM agent_configs WHERE agent_id = 'OPPORTUNITY'").get();
    if (!oppConfig) {
      db.prepare(`
        INSERT INTO agent_configs (agent_id, version_no, instructions, model_reference, budget_limit, status, eval_passed, effective_at)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, datetime('now'))
      `).run("OPPORTUNITY", 1, OPPORTUNITY_SYSTEM, "gpt-4o-2024-08-06", 200000);
    }

    // 3. Bảng tools & tool_grants: Quản lý danh mục công cụ và phân quyền theo DEC-24, FR-92, FR-93
    db.exec(`
      CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        category TEXT,
        access TEXT NOT NULL CHECK (access IN ('READ', 'WRITE')),
        parameters_schema TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tool_grants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER REFERENCES agent_configs(id),
        agent TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        scope_restriction TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tool_grants_agent ON tool_grants(agent, tool_name);
    `);

    // 4. Bảng tool_calls: Ghi nhật ký thực thi công cụ chi tiết (DEC-28, DATA-MODEL)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER REFERENCES ai_runs(id),
        tool_name TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('OK', 'ERROR', 'DENIED')),
        input_redacted TEXT,
        output_summary TEXT,
        duration_ms INTEGER DEFAULT 0,
        authorization_snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);
    `);

    // 5. Bảng ai_evidence: Quản lý căn cứ trích dẫn chứng minh dữ liệu (BUG-006, BUG-007, DATA-MODEL)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER REFERENCES ai_runs(id),
        suggestion_id INTEGER REFERENCES ai_suggestions(id),
        research_id INTEGER REFERENCES opportunity_research(id),
        source_type TEXT NOT NULL,
        ref TEXT NOT NULL,
        quote TEXT,
        verified INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ai_evidence_suggestion ON ai_evidence(suggestion_id);
      CREATE INDEX IF NOT EXISTS idx_ai_evidence_research ON ai_evidence(research_id);
    `);

    // 6. Bảng ai_feedback: Đánh giá chất lượng và ghi nhận phản hồi người dùng (FR-90, FR-95, DATA-MODEL)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER REFERENCES ai_runs(id),
        suggestion_id INTEGER REFERENCES ai_suggestions(id),
        research_id INTEGER REFERENCES opportunity_research(id),
        user_id INTEGER REFERENCES users(id),
        rating TEXT CHECK (rating IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL')),
        feedback_type TEXT,
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ai_feedback_run ON ai_feedback(run_id);
    `);

    // 7. Cập nhật bảng ai_runs (FR-89, FR-90, FR-94, BR-24)
    const runTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_runs'").get();
    if (!runTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent TEXT NOT NULL CHECK (agent IN ('QUALIFICATION','OPPORTUNITY')),
          trigger TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          model TEXT NOT NULL,
          config_id INTEGER REFERENCES agent_configs(id),
          retry_of_run_id INTEGER REFERENCES ai_runs(id),
          idempotency_key TEXT,
          status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
          tool_calls_json TEXT NOT NULL DEFAULT '[]',
          summary TEXT,
          stop_reason TEXT,
          error TEXT,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          web_search_calls INTEGER DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          triggered_by INTEGER REFERENCES users(id),
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          finished_at TEXT
        );
      `);
    } else {
      const runCols = (db.prepare("PRAGMA table_info(ai_runs)").all() as { name: string }[]).map((c) => c.name);
      if (!runCols.includes("config_id")) db.exec("ALTER TABLE ai_runs ADD COLUMN config_id INTEGER REFERENCES agent_configs(id);");
      if (!runCols.includes("retry_of_run_id")) db.exec("ALTER TABLE ai_runs ADD COLUMN retry_of_run_id INTEGER REFERENCES ai_runs(id);");
      if (!runCols.includes("idempotency_key")) db.exec("ALTER TABLE ai_runs ADD COLUMN idempotency_key TEXT;");
      if (!runCols.includes("input_tokens")) db.exec("ALTER TABLE ai_runs ADD COLUMN input_tokens INTEGER DEFAULT 0;");
      if (!runCols.includes("output_tokens")) db.exec("ALTER TABLE ai_runs ADD COLUMN output_tokens INTEGER DEFAULT 0;");
      if (!runCols.includes("web_search_calls")) db.exec("ALTER TABLE ai_runs ADD COLUMN web_search_calls INTEGER DEFAULT 0;");
      if (!runCols.includes("latency_ms")) db.exec("ALTER TABLE ai_runs ADD COLUMN latency_ms INTEGER DEFAULT 0;");
      if (!runCols.includes("cost")) db.exec("ALTER TABLE ai_runs ADD COLUMN cost REAL DEFAULT 0;");
    }

    // 8. Cập nhật bảng ai_suggestions (BUG-001, BUG-002, BR-26)
    const sugTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_suggestions'").get();
    if (!sugTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id INTEGER REFERENCES ai_runs(id),
          agent TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('ENRICHMENT','BANT_SCORE','EMAIL_DRAFT','DISQUALIFY','CONVERSION')),
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          edited_payload_json TEXT,
          evidence_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED','EDITED')),
          reviewed_by INTEGER REFERENCES users(id),
          edited_by INTEGER REFERENCES users(id),
          reviewed_at TEXT,
          review_note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } else {
      const sugCols = (db.prepare("PRAGMA table_info(ai_suggestions)").all() as { name: string }[]).map((c) => c.name);
      if (!sugCols.includes("edited_payload_json")) db.exec("ALTER TABLE ai_suggestions ADD COLUMN edited_payload_json TEXT;");
      if (!sugCols.includes("edited_by")) db.exec("ALTER TABLE ai_suggestions ADD COLUMN edited_by INTEGER REFERENCES users(id);");
    }

    // 9. Cập nhật bảng opportunity_research (BUG-009, HG4, BR-26)
    const resTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='opportunity_research'").get();
    if (!resTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS opportunity_research (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
          run_id INTEGER REFERENCES ai_runs(id),
          importance TEXT NOT NULL CHECK (importance IN ('LOW','MEDIUM','HIGH')),
          importance_reason TEXT,
          summary TEXT NOT NULL,
          edited_summary TEXT,
          changes_since_last TEXT,
          insights_json TEXT NOT NULL DEFAULT '{}',
          risks_json TEXT NOT NULL DEFAULT '[]',
          next_actions_json TEXT NOT NULL DEFAULT '[]',
          additional_actions_json TEXT NOT NULL DEFAULT '[]',
          sources_json TEXT NOT NULL DEFAULT '[]',
          email_insight_status TEXT NOT NULL DEFAULT 'OK',
          status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','VERIFIED','DISMISSED','EDITED')),
          reviewed_by INTEGER REFERENCES users(id),
          reviewed_at TEXT,
          verified_by INTEGER REFERENCES users(id),
          verified_at TEXT,
          dismiss_reason TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } else {
      const resCols = (db.prepare("PRAGMA table_info(opportunity_research)").all() as { name: string }[]).map((c) => c.name);
      if (!resCols.includes("importance_reason")) db.exec("ALTER TABLE opportunity_research ADD COLUMN importance_reason TEXT;");
      if (!resCols.includes("edited_summary")) db.exec("ALTER TABLE opportunity_research ADD COLUMN edited_summary TEXT;");
      if (!resCols.includes("changes_since_last")) db.exec("ALTER TABLE opportunity_research ADD COLUMN changes_since_last TEXT;");
      if (!resCols.includes("insights_json")) db.exec("ALTER TABLE opportunity_research ADD COLUMN insights_json TEXT NOT NULL DEFAULT '{}';");
      if (!resCols.includes("additional_actions_json")) db.exec("ALTER TABLE opportunity_research ADD COLUMN additional_actions_json TEXT NOT NULL DEFAULT '[]';");
      if (!resCols.includes("email_insight_status")) db.exec("ALTER TABLE opportunity_research ADD COLUMN email_insight_status TEXT NOT NULL DEFAULT 'OK';");
      if (!resCols.includes("dismiss_reason")) db.exec("ALTER TABLE opportunity_research ADD COLUMN dismiss_reason TEXT;");
      if (!resCols.includes("verified_by")) db.exec("ALTER TABLE opportunity_research ADD COLUMN verified_by INTEGER REFERENCES users(id);");
      if (!resCols.includes("verified_at")) db.exec("ALTER TABLE opportunity_research ADD COLUMN verified_at TEXT;");
    }

    // 10. Cập nhật bảng email_messages (BUG-005, HG1, BR-26, DATA-MODEL)
    const emailRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_messages'").get() as { sql?: string } | undefined;
    const emailSql = emailRow?.sql ?? "";

    if (!emailSql) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          suggestion_id INTEGER REFERENCES ai_suggestions(id),
          approved_by INTEGER REFERENCES users(id),
          approved_at TEXT,
          status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('DRAFT', 'APPROVED', 'SENT', 'FAILED')),
          content_snapshot TEXT,
          edited_by_human INTEGER DEFAULT 0,
          direction TEXT NOT NULL DEFAULT 'OUT',
          contact_id INTEGER REFERENCES contacts(id),
          provider_ref TEXT,
          sent_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } else {
      if (!emailSql.includes("'APPROVED'")) {
        db.exec("PRAGMA foreign_keys = OFF;");
        db.exec(`
          CREATE TABLE email_messages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            to_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('DRAFT', 'APPROVED', 'SENT', 'FAILED')),
            suggestion_id INTEGER REFERENCES ai_suggestions(id),
            approved_by INTEGER REFERENCES users(id),
            approved_at TEXT,
            content_snapshot TEXT,
            edited_by_human INTEGER DEFAULT 0,
            direction TEXT NOT NULL DEFAULT 'OUT',
            contact_id INTEGER REFERENCES contacts(id),
            provider_ref TEXT,
            sent_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);

        db.exec(`
          INSERT INTO email_messages_new (id, entity_type, entity_id, to_email, subject, body, status, suggestion_id, approved_by, provider_ref, sent_at)
          SELECT id, entity_type, entity_id, to_email, subject, body, status, suggestion_id, approved_by, provider_ref, sent_at
          FROM email_messages;
        `);
        db.exec("DROP TABLE email_messages;");
        db.exec("ALTER TABLE email_messages_new RENAME TO email_messages;");
        db.exec("PRAGMA foreign_keys = ON;");
      }

      const emailCols = (db.prepare("PRAGMA table_info(email_messages)").all() as { name: string }[]).map((c) => c.name);
      if (!emailCols.includes("status")) db.exec("ALTER TABLE email_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'SENT';");
      if (!emailCols.includes("content_snapshot")) db.exec("ALTER TABLE email_messages ADD COLUMN content_snapshot TEXT;");
      if (!emailCols.includes("edited_by_human")) db.exec("ALTER TABLE email_messages ADD COLUMN edited_by_human INTEGER DEFAULT 0;");
      if (!emailCols.includes("approved_at")) db.exec("ALTER TABLE email_messages ADD COLUMN approved_at TEXT;");
      if (!emailCols.includes("direction")) db.exec("ALTER TABLE email_messages ADD COLUMN direction TEXT NOT NULL DEFAULT 'OUT';");
      if (!emailCols.includes("contact_id")) db.exec("ALTER TABLE email_messages ADD COLUMN contact_id INTEGER REFERENCES contacts(id);");
    }
  },
};
