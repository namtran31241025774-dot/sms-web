import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp05_001_orders_handover: Migration = {
  name: "wp05_001_orders_handover",
  up(db: DatabaseSync): void {
    // 1. Tạo hoặc nâng cấp bảng orders
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        quote_id INTEGER UNIQUE,
        opportunity_id INTEGER,
        account_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','IN_FULFILLMENT','FULFILLED','CANCELLED')),
        total INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'VND',
        price_locked_at TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        fulfilled_at TEXT
      );
    `);

    const orderCols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
    const orderColNames = new Set(orderCols.map((c) => c.name));

    if (!orderColNames.has("source_quote_version_id")) {
      db.exec("ALTER TABLE orders ADD COLUMN source_quote_version_id INTEGER;");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_quote_version ON orders(source_quote_version_id) WHERE source_quote_version_id IS NOT NULL;");
    }

    if (!orderColNames.has("customer_snapshot")) {
      db.exec("ALTER TABLE orders ADD COLUMN customer_snapshot TEXT;");
    }

    if (!orderColNames.has("terms_snapshot")) {
      db.exec("ALTER TABLE orders ADD COLUMN terms_snapshot TEXT;");
    }

    if (!orderColNames.has("is_manual")) {
      db.exec("ALTER TABLE orders ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;");
    }

    if (!orderColNames.has("subtotal")) {
      db.exec("ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;");
    }

    if (!orderColNames.has("discount_amount")) {
      db.exec("ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;");
    }

    if (!orderColNames.has("tax_amount")) {
      db.exec("ALTER TABLE orders ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0;");
    }

    if (!orderColNames.has("grand_total")) {
      db.exec("ALTER TABLE orders ADD COLUMN grand_total INTEGER NOT NULL DEFAULT 0;");
    }

    if (!orderColNames.has("payment_status")) {
      db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';");
    }

    if (!orderColNames.has("fulfillment_status")) {
      db.exec("ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'PENDING';");
    }

    if (!orderColNames.has("notes")) {
      db.exec("ALTER TABLE orders ADD COLUMN notes TEXT;");
    }

    if (!orderColNames.has("pending_issues")) {
      db.exec("ALTER TABLE orders ADD COLUMN pending_issues TEXT;");
    }

    if (!orderColNames.has("post_sales_assignee_id")) {
      db.exec("ALTER TABLE orders ADD COLUMN post_sales_assignee_id INTEGER;");
    }

    if (!orderColNames.has("post_sales_contact")) {
      db.exec("ALTER TABLE orders ADD COLUMN post_sales_contact TEXT;");
    }

    if (!orderColNames.has("handed_over_at")) {
      db.exec("ALTER TABLE orders ADD COLUMN handed_over_at TEXT;");
    }

    if (!orderColNames.has("completed_at")) {
      db.exec("ALTER TABLE orders ADD COLUMN completed_at TEXT;");
    }

    // 2. Tạo hoặc nâng cấp bảng order_lines
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        discount_pct REAL NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL
      );
    `);

    const lineCols = db.prepare("PRAGMA table_info(order_lines)").all() as { name: string }[];
    const lineColNames = new Set(lineCols.map((c) => c.name));

    if (!lineColNames.has("source_quote_line_id")) {
      db.exec("ALTER TABLE order_lines ADD COLUMN source_quote_line_id INTEGER;");
    }

    if (!lineColNames.has("license_count")) {
      db.exec("ALTER TABLE order_lines ADD COLUMN license_count INTEGER NOT NULL DEFAULT 1;");
    }

    if (!lineColNames.has("term_months")) {
      db.exec("ALTER TABLE order_lines ADD COLUMN term_months INTEGER NOT NULL DEFAULT 12;");
    }

    if (!lineColNames.has("tax_pct")) {
      db.exec("ALTER TABLE order_lines ADD COLUMN tax_pct REAL NOT NULL DEFAULT 10;");
    }

    // 3. Bảng billing_milestones (ERD: BILLING_MILESTONE, FR-59, BR-11)
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        percentage REAL NOT NULL,
        amount INTEGER NOT NULL,
        due_date TEXT,
        conditions TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVOICED', 'PAID')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_milestones_order_id ON billing_milestones(order_id);
    `);

    // 4. Bảng handovers (ERD: HANDOVER, FR-61, FR-62, DEC-10)
    db.exec(`
      CREATE TABLE IF NOT EXISTS handovers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        scope_summary TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_handovers_order_id ON handovers(order_id);
    `);

    // 5. Bảng handover_items (ERD: HANDOVER_ITEM, FR-62)
    db.exec(`
      CREATE TABLE IF NOT EXISTS handover_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handover_id INTEGER NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('LICENSE', 'DEPLOYMENT', 'TRAINING', 'DOCUMENTATION')),
        item_name TEXT NOT NULL,
        specification TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'ACCEPTED', 'REJECTED')),
        acceptance_notes TEXT,
        accepted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_handover_items_handover_id ON handover_items(handover_id);
    `);
  },
};
