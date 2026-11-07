import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";
import { seed } from "./seed";
import { runMigrations } from "./migrations";
import { runAllSeeds } from "./seeds";
import { fixUserRoleCheckConstraint } from "./migrations/wp00_001_shared_schema";

export type Row = Record<string, unknown>;
type Param = SQLInputValue;

declare global {
  var __smsDb: DatabaseSync | undefined;
}

let migrationsChecked = false;

function ensureMigrationsAndSeeds(database: DatabaseSync) {
  runMigrations(database);
  fixUserRoleCheckConstraint(database);
  const { n } = database.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0) {
    seed(database);
  } else {
    runAllSeeds(database);
  }
}

function open(): DatabaseSync {
  const file = process.env.SMS_DB_PATH ?? path.join(process.cwd(), "data", "sms.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);
  ensureMigrationsAndSeeds(db);
  return db;
}

export function db(): DatabaseSync {
  if (!globalThis.__smsDb) {
    globalThis.__smsDb = open();
    migrationsChecked = true;
  } else if (!migrationsChecked) {
    try {
      ensureMigrationsAndSeeds(globalThis.__smsDb);
      migrationsChecked = true;
    } catch {
      try {
        globalThis.__smsDb.close();
      } catch {}
      globalThis.__smsDb = open();
      migrationsChecked = true;
    }
  }
  return globalThis.__smsDb;
}

function resetConnection() {
  if (globalThis.__smsDb) {
    try {
      globalThis.__smsDb.close();
    } catch {}
    globalThis.__smsDb = undefined;
    migrationsChecked = false;
  }
}

// node:sqlite trả về object null-prototype; sao chép thành object thường để
// có thể truyền sang Client Components.
export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  try {
    return db().prepare(sql).all(...params).map((r) => ({ ...r }) as T);
  } catch (err: unknown) {
    if (String(err).includes("no such") && globalThis.__smsDb) {
      resetConnection();
      return db().prepare(sql).all(...params).map((r) => ({ ...r }) as T);
    }
    throw err;
  }
}

export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  try {
    const r = db().prepare(sql).get(...params);
    return r ? ({ ...r } as T) : undefined;
  } catch (err: unknown) {
    if (String(err).includes("no such") && globalThis.__smsDb) {
      resetConnection();
      const r = db().prepare(sql).get(...params);
      return r ? ({ ...r } as T) : undefined;
    }
    throw err;
  }
}

export function run(sql: string, ...params: Param[]): { id: number; changes: number } {
  try {
    const r = db().prepare(sql).run(...params);
    return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
  } catch (err: unknown) {
    if (String(err).includes("no such") && globalThis.__smsDb) {
      resetConnection();
      const r = db().prepare(sql).run(...params);
      return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
    }
    throw err;
  }
}

let depth = 0;
let committedJobs: Array<()=>void> = [];
export function afterCommit(job:()=>void) {
  if(depth>0) committedJobs.push(job); else job();
}
export function tx<T>(fn: () => T): T {
  const d = db();
  if (depth > 0) return fn();
  depth++;
  d.exec("BEGIN IMMEDIATE");
  let out:T;
  try {
    out = fn();
    d.exec("COMMIT");
  } catch (e) {
    committedJobs=[];
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
  const jobs=committedJobs; committedJobs=[];
  for(const job of jobs) {try{job();}catch(e){console.error('After-commit callback failed',e);}}
  return out;
}

/** Sinh mã nghiệp vụ dạng PREFIX-YYYY-0001 */
export function nextCode(table: "opportunities" | "quotes" | "orders" | "invoices" | "handovers", prefix: string): string {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const r = get<{ code: string }>(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1`, like);
  const n = r ? Number(r.code.split("-").pop()) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}
