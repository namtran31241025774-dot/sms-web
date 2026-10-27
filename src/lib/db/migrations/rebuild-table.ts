import type { DatabaseSync } from 'node:sqlite';

/** Rebuild a table without changing its column values, indexes or triggers. Caller owns the transaction. */
export function rebuildTable(db: DatabaseSync, table: string, change: (sql: string)=>string) {
  const row=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql:string}|undefined;
  if(!row) return;
  const extras=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table) as {sql:string}[];
  const cols=(db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(c=>`"${c.name}"`).join(',');
  db.exec(change(row.sql).replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`\[]?\w+["`\]]?/i,`CREATE TABLE ${table}_review_new`));
  db.exec(`INSERT INTO ${table}_review_new (${cols}) SELECT ${cols} FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_review_new RENAME TO ${table};`);
  for(const item of extras) db.exec(item.sql);
}
