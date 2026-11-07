import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp04_001_quotes_versions: Migration = {
  name: "wp04_001_quotes_versions",
  up(db: DatabaseSync): void {
    // 1. Tạo bảng quotes nếu chưa tồn tại
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        opportunity_id INTEGER NOT NULL,
        account_id INTEGER,
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED','REJECTED','SUPERSEDED','EXPIRED')),
        price_list_id INTEGER,
        currency TEXT NOT NULL DEFAULT 'VND',
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount_total INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        max_discount_pct REAL NOT NULL DEFAULT 0,
        valid_until TEXT,
        notes TEXT,
        customer_response_note TEXT,
        created_by INTEGER,
        approved_by INTEGER,
        approved_at TEXT,
        sent_at TEXT,
        responded_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const quoteCols = db.prepare("PRAGMA table_info(quotes)").all() as { name: string }[];
    const quoteColNames = new Set(quoteCols.map((c) => c.name));

    if (!quoteColNames.has("account_id")) {
      db.exec("ALTER TABLE quotes ADD COLUMN account_id INTEGER;");
    }

    // Điền account_id nếu cả opportunities và accounts đều tồn tại
    const hasOppTable = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='opportunities'").get();
    const hasAccTable = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
    if (hasOppTable && hasAccTable) {
      db.exec(`
        UPDATE quotes
        SET account_id = (SELECT account_id FROM opportunities WHERE opportunities.id = quotes.opportunity_id)
        WHERE account_id IS NULL;
      `);
    }

    // 2. Tạo bảng QUOTE_VERSION theo ERD-03 và DEC-22
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        version_no INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SENT','ACCEPTED','DECLINED','SUPERSEDED','EXPIRED')),
        price_list_id INTEGER NOT NULL DEFAULT 1,
        currency TEXT NOT NULL DEFAULT 'VND',
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount_total INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        max_discount_pct REAL NOT NULL DEFAULT 0,
        valid_until TEXT,
        notes TEXT,
        customer_response_note TEXT,
        created_by INTEGER,
        approved_by INTEGER,
        approved_at TEXT,
        sent_at TEXT,
        responded_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (quote_id, version_no)
      );

      CREATE INDEX IF NOT EXISTS idx_quote_versions_quote ON quote_versions(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_versions_status ON quote_versions(status);
    `);

    // 3. Tạo hoặc mở rộng bảng quote_lines
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        quote_version_id INTEGER REFERENCES quote_versions(id),
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price INTEGER NOT NULL,
        discount_pct REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
        tax_pct REAL NOT NULL DEFAULT 10,
        line_total INTEGER NOT NULL,
        license_count INTEGER,
        term_months INTEGER
      );
    `);

    const lineCols = db.prepare("PRAGMA table_info(quote_lines)").all() as { name: string }[];
    const lineColNames = new Set(lineCols.map((c) => c.name));

    if (!lineColNames.has("quote_version_id")) {
      db.exec("ALTER TABLE quote_lines ADD COLUMN quote_version_id INTEGER REFERENCES quote_versions(id);");
    }
    if (!lineColNames.has("tax_pct")) {
      db.exec("ALTER TABLE quote_lines ADD COLUMN tax_pct REAL NOT NULL DEFAULT 10;");
    }
    if (!lineColNames.has("license_count")) {
      db.exec("ALTER TABLE quote_lines ADD COLUMN license_count INTEGER;");
    }
    if (!lineColNames.has("term_months")) {
      db.exec("ALTER TABLE quote_lines ADD COLUMN term_months INTEGER;");
    }

    // 4. Di trú các bản ghi báo giá cũ sang quote_versions (nếu có)
    db.exec(`
      INSERT OR IGNORE INTO quote_versions (
        quote_id, version_no, status, price_list_id, currency, subtotal, discount_total, tax_amount, total,
        max_discount_pct, valid_until, notes, customer_response_note, created_by, approved_by,
        approved_at, sent_at, responded_at, created_at, updated_at
      )
      SELECT
        id, revision, status, COALESCE(price_list_id, 1), currency, subtotal, discount_total, 0, total,
        max_discount_pct, valid_until, notes, customer_response_note, created_by, approved_by,
        approved_at, sent_at, responded_at, created_at, updated_at
      FROM quotes
      WHERE id NOT IN (SELECT quote_id FROM quote_versions);

      UPDATE quote_lines
      SET quote_version_id = (
        SELECT qv.id FROM quote_versions qv
        WHERE qv.quote_id = quote_lines.quote_id
        ORDER BY qv.version_no DESC LIMIT 1
      )
      WHERE quote_version_id IS NULL;
    `);

    // 5. Bảng PROPOSALS (FR-48: Bản đề xuất giải pháp gửi khách hàng)
    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        opportunity_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        quote_version_id INTEGER REFERENCES quote_versions(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','SUPERSEDED')),
        solution_summary TEXT,
        scope_description TEXT,
        timeline_text TEXT,
        deliverables_text TEXT,
        assumptions TEXT,
        pdf_path TEXT,
        sent_at TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_opp ON proposals(opportunity_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_account ON proposals(account_id);
    `);

    // 6. Bảng QUOTE_RESPONSES (FR-54: Phản hồi của khách hàng gắn đúng phiên bản)
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
        response_type TEXT NOT NULL CHECK (response_type IN ('ACCEPTED','REJECTED','REVISION_REQUESTED')),
        contact_id INTEGER,
        notes TEXT,
        responded_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_quote_responses_version ON quote_responses(quote_version_id);
    `);

    // 7. Bảng QUOTE_SIGNATURES (FR-55: Theo dõi tiến độ ký điện tử)
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
        external_reference TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'mock-esign',
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SIGNED','DECLINED','EXPIRED')),
        sign_url TEXT,
        recipient_email TEXT,
        recipient_name TEXT,
        signed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_quote_signatures_version ON quote_signatures(quote_version_id);
    `);
  },
};
