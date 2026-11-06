// Tạo một phiên PoC độc lập: sao snapshot dữ liệu đánh giá ra thư mục mới rồi chạy eval/poc-agent.eval.ts.
// node eval/run-session.mjs <mock|llm> [model] [rep] [case,case...]
// Chế độ llm đọc OPENAI_API_KEY từ biến môi trường của tiến trình; script không in, không ghi key.
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [mode = "mock", model = "", rep = "1", only = ""] = process.argv.slice(2);
// Lấy key từ .env.local của web nếu tiến trình chưa có (không in ra).
if (mode === "llm" && !process.env.OPENAI_API_KEY && fs.existsSync(".env.local")) { const k = fs.readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m); if (k) process.env.OPENAI_API_KEY = k[1].trim(); }
const TAG = process.env.EVAL_TAG ?? "";
const SNAPSHOT = process.env.EVAL_SNAPSHOT ?? "C:/Users/Admin/.codex/.chatgpt-projects/g-p-6a906d5b60e48191ac9c1e4ca01ac0e6/outputs/sales-agent-evaluation/agent-evaluation-ready.db";
const CASES = process.env.EVAL_CASES ?? path.join(path.dirname(SNAPSHOT), "cases-with-expected.json");
const OUTROOT = process.env.EVAL_OUTROOT ?? "D:/Năm 3/System Architecture/sms-web/bai-lam/poc-ai/runs";
if (mode === "llm" && !process.env.OPENAI_API_KEY) { console.error("Thiếu OPENAI_API_KEY trong biến môi trường"); process.exit(2); }
if (mode === "llm" && !model) { console.error("Chế độ llm cần tên model"); process.exit(2); }

const name = `${TAG ? TAG + "-" : ""}${mode === "llm" ? model : "mock"}-r${rep}${only ? "-subset" : ""}`;
const dir = path.join(OUTROOT, name);
fs.mkdirSync(dir, { recursive: true });
const db = path.join(dir, "evaluation.db");
for (const f of [db, db + "-wal", db + "-shm"]) fs.rmSync(f, { force: true });
const src = new DatabaseSync(SNAPSHOT, { readOnly: true });
src.exec(`VACUUM INTO '${db.replaceAll("'", "''")}'`);
src.close();

const env = { ...process.env, SMS_DB_PATH: db, SMS_AI_MODE: mode, EVAL_MODEL: model, EVAL_CASES: CASES, EVAL_OUT: path.join(dir, "result.json"), EVAL_ONLY: only, NODE_ENV: "test" };
console.log(`Phiên ${name}: dữ liệu ${db}`);
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vitest", "run", "--config", "eval/vitest.config.mts", "--reporter=verbose"], { env, stdio: "inherit", shell: process.platform === "win32" });
try {
  const res = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  let tin = 0, tout = 0, cost = 0, fail = 0;
  for (const c of res.cases) { const x = c.run ?? {}; tin += x.input_tokens ?? 0; tout += x.output_tokens ?? 0; cost += x.cost ?? 0; if (x.status !== "SUCCEEDED") { fail++; console.log(`  ${c.case_id} ${x.status ?? "NO_RUN"} ${(x.error ?? JSON.stringify(c.result)).slice(0, 200)}`); } }
  console.log(`Tổng: ${res.cases.length} ca, lỗi ${fail}, token vào ${tin}, ra ${tout}, chi phí ước tính $${cost.toFixed(4)} (${(cost / Math.max(1, res.cases.length)).toFixed(5)}/ca)`);
  if (mode === "llm" && fail === res.cases.length) { console.log("Tất cả ca đều lỗi, dừng."); process.exit(3); }
} catch { /* chưa có result.json */ }
console.log(`Kết thúc ${name}, mã ${r.status}. Kết quả: ${path.join(dir, "result.json")}`);
process.exit(r.status ?? 1);
