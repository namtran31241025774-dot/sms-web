import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dbPath = process.env.SMS_DB_PATH ?? path.join(rootDir, "data", "sms.db");

console.log("==> Resetting database at:", dbPath);

if (dbPath !== ":memory:" && fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log("Removed old database file.");
  } catch (err) {
    console.warn("Could not delete file directly, will let migration/seed reinitialize.", err);
  }
}

// Remove WAL and SHM if present
for (const ext of ["-wal", "-shm"]) {
  const p = dbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

console.log("Database reset complete. On next request, fresh schema, migrations and seeds will run.");
