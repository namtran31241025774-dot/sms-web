import type { Migration } from "./types";
import type { DatabaseSync } from "node:sqlite";

function rebuild(db: DatabaseSync, table: string, change: (sql: string) => string) {
  const original = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql:string}|undefined;
  if (!original) return;
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table) as {sql:string}[];
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(c=>`"${c.name}"`).join(',');
  const sql = change(original.sql).replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`\[]?\w+["`\]]?/i, `CREATE TABLE ${table}_safety_new`);
  db.exec(sql);
  db.exec(`INSERT INTO ${table}_safety_new (${columns}) SELECT ${columns} FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_safety_new RENAME TO ${table};`);
  for (const index of indexes) db.exec(index.sql);
}

export const wp06_002_payment_invoice_safety: Migration = {
  name: "wp06_002_payment_invoice_safety",
  up(db) {
    const foreignKeys = (db.prepare('PRAGMA foreign_keys').get() as {foreign_keys:number}).foreign_keys;
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try {
      rebuild(db, 'payments', sql => sql.replace(/invoice_id INTEGER NOT NULL/i,'invoice_id INTEGER').replace(/'USER'\s*,\s*'ERP'/g,"'USER','ERP','GATEWAY'"));
      const columns = db.prepare('PRAGMA table_info(payments)').all() as {name:string}[];
      if (!columns.some(c=>c.name==='currency')) db.exec("ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'VND'");
      rebuild(db, 'invoices', sql=>sql.replace(/'DRAFT'\s*,\s*'ISSUED'/g,"'DRAFT','REVIEWED','ISSUED'"));
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
    finally { db.exec(`PRAGMA foreign_keys=${foreignKeys}`); }
  },
};
