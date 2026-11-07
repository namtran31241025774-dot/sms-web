import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

export const wp02_001_catalog: Migration = {
  name: "wp02_001_catalog",
  up(db: DatabaseSync) {
    const existingTables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name);

    // 1. Nâng cấp bảng products: hỗ trợ type MODULE, PACKAGE và thêm license_policy, category
    if (existingTables.includes("products")) {
      const prodCols = (db.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name);

      if (!prodCols.includes("category") || !prodCols.includes("license_policy")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE IF NOT EXISTS products_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('SUBSCRIPTION','SERVICE','TRAINING','MODULE','PACKAGE')),
            category TEXT,
            unit TEXT NOT NULL,
            description TEXT,
            license_policy TEXT,
            active INTEGER NOT NULL DEFAULT 1
          );

          INSERT INTO products_new (id, code, name, type, unit, description, active)
            SELECT id, code, name, type, unit, description, active FROM products;

          DROP TABLE products;
          ALTER TABLE products_new RENAME TO products;
          PRAGMA foreign_keys = ON;
        `);
      }
    }

    // 2. Tạo bảng product_components: thành phần của gói SaaS (DATA-MODEL.md, FR-25)
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        is_optional INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (package_id, component_id),
        CHECK (package_id != component_id)
      );
      CREATE INDEX IF NOT EXISTS idx_prod_comp_package ON product_components(package_id);
      CREATE INDEX IF NOT EXISTS idx_prod_comp_component ON product_components(component_id);
    `);

    // 3. Nâng cấp bảng price_lists (BR-03, BR-22, FR-27, FR-28)
    if (existingTables.includes("price_lists")) {
      const plCols = (db.prepare("PRAGMA table_info(price_lists)").all() as { name: string }[]).map((c) => c.name);
      if (!plCols.includes("customer_segment")) {
        db.exec("ALTER TABLE price_lists ADD COLUMN customer_segment TEXT NOT NULL DEFAULT 'ALL' CHECK (customer_segment IN ('ALL','SMB','ENTERPRISE'));");
      }
      if (!plCols.includes("valid_from")) {
        db.exec("ALTER TABLE price_lists ADD COLUMN valid_from TEXT;");
      }
      if (!plCols.includes("valid_to")) {
        db.exec("ALTER TABLE price_lists ADD COLUMN valid_to TEXT;");
      }
      if (!plCols.includes("is_default")) {
        db.exec("ALTER TABLE price_lists ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;");
      }
      if (!plCols.includes("description")) {
        db.exec("ALTER TABLE price_lists ADD COLUMN description TEXT;");
      }
    }

    // 4. Nâng cấp bảng price_list_items (BR-22: thuế suất GTGT theo từng dòng)
    if (existingTables.includes("price_list_items")) {
      const pliCols = (db.prepare("PRAGMA table_info(price_list_items)").all() as { name: string }[]).map((c) => c.name);
      if (!pliCols.includes("tax_pct")) {
        db.exec("ALTER TABLE price_list_items ADD COLUMN tax_pct REAL NOT NULL DEFAULT 10 CHECK (tax_pct >= 0 AND tax_pct <= 100);");
      }
    }
  },
};
