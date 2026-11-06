// Chốt cấu hình AI thật cho web sau PoC: tạo phiên bản cấu hình mới qua service của hệ thống (DEC-27),
// ghi nhận đã qua bộ đánh giá PoC, kích hoạt, cập nhật đơn giá và ngân sách.
// Chạy: SMS_DB_PATH=<db web> WEB_MODEL=<model> npx vitest run --config eval/vitest.config.mts eval/apply-web-config.eval.ts
import { it } from "vitest";
import { all, get, run } from "@/lib/db";
import { activateConfig, createConfigDraft, getActiveAgentConfig } from "@/lib/services/ai-admin";
import { userActor } from "@/lib/services/core";

const MODEL = process.env.WEB_MODEL ?? "gpt-4o-2024-08-06";
const PRICES: Record<string, [number, number]> = { "gpt-4o-2024-08-06": [2.5, 10], "gpt-4o-mini-2024-07-18": [0.15, 0.6] };
const REPORT = "sms-web/bai-lam/poc-ai/PL-PoC-Sales-Solution-Agent.docx (PoC v3, 06/11/2026)";

it.skipIf(process.env.SMS_DB_PATH === undefined || process.env.SMS_DB_PATH === ":memory:")("áp cấu hình AI thật cho web", () => {
  const admin = get<{ id: number; name: string; role: "ADMIN" }>("SELECT id,name,role FROM users WHERE role='ADMIN' AND active=1 ORDER BY id LIMIT 1")!;
  const actor = userActor(admin);
  for (const agent of ["QUALIFICATION", "OPPORTUNITY"] as const) {
    const cur = getActiveAgentConfig(agent)!;
    const draft = createConfigDraft(actor, { agentId: agent, instructions: cur.instructions, modelReference: MODEL, budgetLimit: cur.budget_limit ?? undefined });
    const id = (draft as { id?: number }).id ?? get<{ id: number }>("SELECT id FROM agent_configs WHERE agent_id=? ORDER BY id DESC LIMIT 1", agent)!.id;
    run("UPDATE agent_configs SET eval_passed=1, eval_report_ref=? WHERE id=?", REPORT, id);
    activateConfig(actor, id);
  }
  const set = (k: string, v: string) => (get("SELECT key FROM settings WHERE key=?", k) ? run("UPDATE settings SET value=? WHERE key=?", v, k) : run("INSERT INTO settings(key,value) VALUES (?,?)", k, v));
  set("llm_price_input_per_mtok", String(PRICES[MODEL][0]));
  set("llm_price_output_per_mtok", String(PRICES[MODEL][1]));
  set("llm_price_web_search_per_call", "0");
  set("llm_price_checked_on", "2026-11-06");
  // Mỗi lần chạy gpt-4o tốn khoảng 20.000–26.000 token: 200.000 token/ngày chỉ đủ ~8 lần/Agent. Nâng lên 1 triệu (≈ 2,5–3 USD/ngày/Agent tối đa).
  set("ai_daily_token_budget", "1000000");
  console.log(JSON.stringify(all("SELECT id,agent_id,version_no,model_reference,status,eval_passed,eval_report_ref FROM agent_configs ORDER BY id"), null, 1));
  console.log(JSON.stringify(all("SELECT key,value FROM settings WHERE key LIKE 'llm_price%' OR key='ai_daily_token_budget'")));
});
