import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";
import { wp00_001_shared_schema } from "./wp00_001_shared_schema";
import { wp01_001_customer_management } from "./wp01_001_customer_management";
import { wp02_001_catalog } from "./wp02_001_catalog";
import { wp07_001_team_management } from "./wp07_001_team_management";
import { wp09_001_admin_management } from "./wp09_001_admin_management";
import { wp03_001_opportunity_management } from "./wp03_001_opportunity_management";
import { wp08_001_ai_management } from "./wp08_001_ai_management";
import { wp04_001_quotes_versions } from "./wp04_001_quotes_versions";
import { wp05_001_orders_handover } from "./wp05_001_orders_handover";
import { wp06_001_invoices_payments } from "./wp06_001_invoices_payments";
import { wp06_002_payment_invoice_safety } from "./wp06_002_payment_invoice_safety";
import { wp08_002_edit_and_refresh } from "./wp08_002_edit_and_refresh";
import {wp10_001_integration_requests} from './wp10_001_integration_requests';
import { wp08_003_rule_evaluations } from "./wp08_003_rule_evaluations";

export const MIGRATIONS: readonly Migration[] = [
  wp00_001_shared_schema,
  wp01_001_customer_management,
  wp02_001_catalog,
  wp07_001_team_management,
  wp09_001_admin_management,
  wp03_001_opportunity_management,
  wp08_001_ai_management,
  wp04_001_quotes_versions,
  wp05_001_orders_handover,
  wp06_001_invoices_payments,
  wp06_002_payment_invoice_safety,
  wp08_002_edit_and_refresh,
  wp10_001_integration_requests,
  wp08_003_rule_evaluations,
] as const;

/**
 * Khởi tạo bảng theo dõi migration và thực thi tuần tự các migration chưa chạy.
 */
export function runMigrations(db: DatabaseSync): { applied: string[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));
  const newlyApplied: string[] = [];

  for (const m of MIGRATIONS) {
    if (!appliedSet.has(m.name)) {
      m.up(db);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(m.name);
      newlyApplied.push(m.name);
    }
  }

  return { applied: newlyApplied };
}

export * from "./types";
