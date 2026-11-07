import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp01_001_customer_management: Migration = {
  name: "wp01_001_customer_management",
  up(db: DatabaseSync) {
    const existingTables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);

    // 1. Cập nhật bảng accounts (nếu bảng đã tồn tại trong schema cơ sở)
    if (existingTables.includes("accounts")) {
      const accCols = (db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[]).map((c) => c.name);
      if (!accCols.includes("tax_code")) {
        db.exec("ALTER TABLE accounts ADD COLUMN tax_code TEXT;");
      }
      if (!accCols.includes("status")) {
        db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'));");
      }
      if (!accCols.includes("email")) {
        db.exec("ALTER TABLE accounts ADD COLUMN email TEXT;");
      }
      if (!accCols.includes("phone")) {
        db.exec("ALTER TABLE accounts ADD COLUMN phone TEXT;");
      }
    }

    // 2. Cập nhật bảng contacts
    if (existingTables.includes("contacts")) {
      const conCols = (db.prepare("PRAGMA table_info(contacts)").all() as { name: string }[]).map((c) => c.name);
      if (!conCols.includes("status")) {
        db.exec("ALTER TABLE contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'));");
      }
    }

    // 3. Tạo bảng affiliations (ERD-01, FR-14, DEC-21)
    db.exec(`
      CREATE TABLE IF NOT EXISTS affiliations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        job_title TEXT,
        valid_from TEXT NOT NULL DEFAULT (datetime('now')),
        valid_to TEXT,
        is_current INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_affiliations_contact ON affiliations(contact_id);
      CREATE INDEX IF NOT EXISTS idx_affiliations_account ON affiliations(account_id);
    `);

    // 4. Cập nhật bảng leads (FR-01, FR-05, FR-07, FR-10, FR-11, FR-17)
    if (existingTables.includes("leads")) {
      const leadCols = (db.prepare("PRAGMA table_info(leads)").all() as { name: string }[]).map((c) => c.name);
      if (!leadCols.includes("topic")) {
        db.exec("ALTER TABLE leads ADD COLUMN topic TEXT;");
      }
      if (!leadCols.includes("account_id")) {
        db.exec("ALTER TABLE leads ADD COLUMN account_id INTEGER REFERENCES accounts(id);");
      }
      if (!leadCols.includes("contact_id")) {
        db.exec("ALTER TABLE leads ADD COLUMN contact_id INTEGER REFERENCES contacts(id);");
      }
      if (!leadCols.includes("deleted_at")) {
        db.exec("ALTER TABLE leads ADD COLUMN deleted_at TEXT;");
      }
      if (!leadCols.includes("merged_into_lead_id")) {
        db.exec("ALTER TABLE leads ADD COLUMN merged_into_lead_id INTEGER REFERENCES leads(id);");
      }
      if (!leadCols.includes("rating")) {
        db.exec("ALTER TABLE leads ADD COLUMN rating TEXT CHECK (rating IN ('HOT','WARM','COLD'));");
      }
    }

    // 5. Tạo bảng tags và lead_tags (FR-07)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#0078d4',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lead_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (lead_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags(lead_id);
      CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag_id);
    `);

    // 6. Nâng cấp bảng approvals để hỗ trợ kind MERGE và payload_json
    if (existingTables.includes("approvals")) {
      const appCols = (db.prepare("PRAGMA table_info(approvals)").all() as { name: string }[]).map((c) => c.name);
      if (!appCols.includes("payload_json")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE IF NOT EXISTS approvals_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
            reason TEXT,
            payload_json TEXT,
            requested_by INTEGER REFERENCES users(id),
            decided_by INTEGER REFERENCES users(id),
            decision_comment TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            decided_at TEXT
          );
          INSERT INTO approvals_new (id, kind, entity_type, entity_id, status, reason, requested_by, decided_by, decision_comment, created_at, decided_at)
            SELECT id, kind, entity_type, entity_id, status, reason, requested_by, decided_by, decision_comment, created_at, decided_at FROM approvals;
          DROP TABLE approvals;
          ALTER TABLE approvals_new RENAME TO approvals;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  },
};
