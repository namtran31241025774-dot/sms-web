import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp06_001_invoices_payments: Migration = {
  name: "wp06_001_invoices_payments",
  up(db: DatabaseSync): void {
    // 1. Tạo hoặc nâng cấp bảng invoices
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        order_id INTEGER NOT NULL,
        milestone TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL CHECK (amount > 0),
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')),
        paid_amount INTEGER NOT NULL DEFAULT 0,
        erp_ref TEXT,
        created_by INTEGER,
        issued_by INTEGER,
        issued_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const invCols = db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[];
    const invColNames = new Set(invCols.map((c) => c.name));

    if (!invColNames.has("milestone_id")) {
      db.exec("ALTER TABLE invoices ADD COLUMN milestone_id INTEGER;");
    }

    if (!invColNames.has("account_id")) {
      db.exec("ALTER TABLE invoices ADD COLUMN account_id INTEGER;");
    }

    if (!invColNames.has("subtotal")) {
      db.exec("ALTER TABLE invoices ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;");
    }

    if (!invColNames.has("tax_amount")) {
      db.exec("ALTER TABLE invoices ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0;");
    }

    if (!invColNames.has("external_system")) {
      db.exec("ALTER TABLE invoices ADD COLUMN external_system TEXT NOT NULL DEFAULT 'MOCK_ERP';");
    }

    if (!invColNames.has("customer_snapshot")) {
      db.exec("ALTER TABLE invoices ADD COLUMN customer_snapshot TEXT;");
    }

    if (!invColNames.has("reviewed_by")) {
      db.exec("ALTER TABLE invoices ADD COLUMN reviewed_by INTEGER;");
    }

    if (!invColNames.has("reviewed_at")) {
      db.exec("ALTER TABLE invoices ADD COLUMN reviewed_at TEXT;");
    }

    if (!invColNames.has("notes")) {
      db.exec("ALTER TABLE invoices ADD COLUMN notes TEXT;");
    }

    // Điền account_id cho các hóa đơn hiện có nếu thiếu
    const hasOrderTable = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (hasOrderTable) {
      db.exec(`
        UPDATE invoices
        SET account_id = (SELECT account_id FROM orders WHERE orders.id = invoices.order_id)
        WHERE account_id IS NULL;
      `);
    }

    // 2. Bảng invoice_lines
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        product_id INTEGER,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        tax_pct REAL NOT NULL DEFAULT 10,
        line_total INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
    `);

    // 3. Tạo hoặc nâng cấp bảng payments
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        amount INTEGER NOT NULL CHECK (amount > 0),
        paid_at TEXT NOT NULL,
        method TEXT,
        reference TEXT,
        source TEXT NOT NULL DEFAULT 'USER',
        recorded_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const payCols = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[];
    const payColNames = new Set(payCols.map((c) => c.name));

    if (!payColNames.has("account_id")) {
      db.exec("ALTER TABLE payments ADD COLUMN account_id INTEGER;");
    }

    if (!payColNames.has("external_transaction_id")) {
      db.exec("ALTER TABLE payments ADD COLUMN external_transaction_id TEXT;");
    }

    if (!payColNames.has("gateway_status")) {
      db.exec("ALTER TABLE payments ADD COLUMN gateway_status TEXT;");
    }

    if (!payColNames.has("reconciliation_status")) {
      db.exec("ALTER TABLE payments ADD COLUMN reconciliation_status TEXT NOT NULL DEFAULT 'MATCHED';");
    }

    // 4. Bảng payment_allocations (ERD: PAYMENT_ALLOCATION, DEC-23, FR-69)
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
      CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON payment_allocations(invoice_id);
    `);

    // 5. Bảng payment_requests (ERD: PAYMENT_REQUEST, FR-70, DEC-13)
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        invoice_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        gateway_provider TEXT NOT NULL DEFAULT 'MOCK_GATEWAY',
        gateway_url TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','EXPIRED','FAILED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_payment_requests_invoice ON payment_requests(invoice_id);
    `);

    // 6. Bảng invoice_change_requests (ERD: INVOICE_CHANGE, FR-73)
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_change_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('ADJUSTMENT', 'CANCELLATION')),
        reason TEXT NOT NULL,
        requested_by INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
        reviewed_by INTEGER,
        review_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_inv_change_invoice ON invoice_change_requests(invoice_id);
    `);

    // 7. Bảng sync_events (ERD: SYNC_EVENT, FR-72, WP-10 / WP-06)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
        system TEXT NOT NULL DEFAULT 'ERP',
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'PENDING')),
        payload TEXT,
        response TEXT,
        error_message TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events(entity_type, entity_id);
    `);
  },
};
