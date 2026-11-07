// Chấm độc lập đầu ra Agent bằng một model OpenAI (rubric mục 8.4 VIBECODE-GUIDE, DEC-29).
// node eval/judge.mjs <thư-mục-phiên> [judge-model]
// Judge nhận NGUỒN (dữ liệu hồ sơ đã che PII) và ĐẦU RA của Agent, không nhận nhãn kỳ vọng.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const JUDGE = process.argv[3] ?? "gpt-4o-2024-08-06";
const PRICE = { "gpt-4o-2024-08-06": [2.5, 10], "gpt-4o-mini-2024-07-18": [0.15, 0.6] }[JUDGE];
const DRY = process.env.JUDGE_DRY === "1";
if (!process.env.OPENAI_API_KEY && fs.existsSync(".env.local")) { const k = fs.readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m); if (k) process.env.OPENAI_API_KEY = k[1].trim(); }
if (!process.env.OPENAI_API_KEY && !DRY) { console.error("Thiếu OPENAI_API_KEY"); process.exit(2); }
const res = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
if (res.model === JUDGE) console.log(`Lưu ý: judge trùng model của Agent (${JUDGE}), kết quả có thể thiên vị.`);
const db = new DatabaseSync(path.join(dir, "evaluation.db"), { readOnly: true });

const PII = /(email|phone|tax_code|password|token)/i;
const redact = (s) => String(s ?? "").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]").replace(/(?<!\d)(?:\+?84|0)(?:[ .-]*\d){8,10}(?!\d)/g, "[PHONE]");
const clean = (row) => row && Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && v !== "" && !PII.test(k)).map(([k, v]) => [k, typeof v === "string" ? redact(v) : v]));
const rows = (sql, ...a) => { try { return db.prepare(sql).all(...a).map(clean); } catch { return []; } };
const one = (sql, ...a) => rows(sql, ...a)[0] ?? null;

function sourceOf(c) {
  if (c.agent === "QUALIFICATION") {
    return { lead: one("SELECT * FROM leads WHERE id=?", c.entity_id), activities: rows("SELECT id,type,direction,subject,body,occurred_at FROM activities WHERE entity_type='lead' AND entity_id=?", c.entity_id) };
  }
  const o = one("SELECT * FROM opportunities WHERE id=?", c.entity_id);
  return {
    opportunity: o, account: o ? one("SELECT id,name,industry,employee_size,address FROM accounts WHERE id=?", o.account_id) : null,
    stakeholders: rows("SELECT * FROM stakeholders WHERE opportunity_id=?", c.entity_id),
    competitors: rows("SELECT oc.notes, cp.* FROM opportunity_competitors oc LEFT JOIN competitors cp ON cp.id=oc.competitor_id WHERE oc.opportunity_id=?", c.entity_id),
    activities: rows("SELECT id,type,direction,subject,body,occurred_at FROM activities WHERE entity_type='opportunity' AND entity_id=?", c.entity_id),
    emails: rows("SELECT direction,subject,body,status,sent_at FROM email_messages WHERE entity_type='opportunity' AND entity_id=?", c.entity_id),
  };
}

function claimsOf(c) {
  const claims = [];
  let email = null;
  if (c.agent === "QUALIFICATION") {
    const bant = c.suggestions.find((s) => s.kind === "BANT_SCORE");
    for (const [k, v] of Object.entries(bant?.payload_json?.breakdown ?? {})) claims.push({ id: `bant.${k}`, text: `${k}: ${v.score}/25 — ${v.reason}` });
    for (const s of c.suggestions.filter((s) => ["DISQUALIFY", "CONVERSION", "ENRICHMENT"].includes(s.kind))) claims.push({ id: s.kind.toLowerCase(), text: `${s.title}: ${JSON.stringify(s.payload_json).slice(0, 600)}` });
    const e = c.suggestions.find((s) => s.kind === "EMAIL_DRAFT");
    if (e) email = { subject: e.payload_json?.subject, body: e.payload_json?.body };
  } else {
    const r = c.research[0];
    if (r) {
      if (r.summary) claims.push({ id: "summary", text: r.summary });
      for (const [k, v] of Object.entries(r.insights_json ?? {})) if (v && v.text) claims.push({ id: `insight.${k}`, text: v.text });
      for (const x of r.risks_json ?? []) if (x.unclassified) claims.push({ id: "llm_risk", text: x.description ?? JSON.stringify(x) });
      for (const x of r.additional_actions_json ?? []) if (!x.rule_id) claims.push({ id: "llm_action", text: `${x.action} — ${x.why ?? ""}` });
    }
  }
  return { claims: claims.map((x) => ({ ...x, text: redact(x.text).slice(0, 1200) })), email: email && { subject: redact(email.subject), body: redact(email.body) } };
}

const SYSTEM = `Bạn là người chấm độc lập cho đầu ra của AI Agent bán hàng B2B. Chỉ dựa vào NGUỒN được cung cấp.
Với mỗi nhận định: "supported" nếu mọi thông tin cụ thể (số liệu, tên, vai trò, thời gian, trạng thái) có trong nguồn hoặc suy ra trực tiếp; "unsupported" nếu có chi tiết không có trong nguồn (bịa hoặc suy đoán quá mức); "contradicted" nếu trái với nguồn.
Câu nói rõ "thiếu thông tin / chưa xác định / cần xác minh" khi nguồn thật sự thiếu là supported. [EMAIL]/[PHONE] là dữ liệu đã che, không tính là bịa.
Nếu có email nháp, chấm 1–5 cho: personalization (cá nhân hoá đúng nguồn), relevance (bám nhu cầu), cta (lời mời hành động rõ), tone (tiếng Việt chuyên nghiệp, ngắn), no_fabrication (5 = không bịa gì). Trả đúng JSON theo schema.`;
const SCHEMA = {
  name: "judge", strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["claims", "email"],
    properties: {
      claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "verdict", "reason"], properties: { id: { type: "string" }, verdict: { type: "string", enum: ["supported", "unsupported", "contradicted"] }, reason: { type: "string" } } } },
      email: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["personalization", "relevance", "cta", "tone", "no_fabrication", "comment"], properties: { personalization: { type: "integer" }, relevance: { type: "integer" }, cta: { type: "integer" }, tone: { type: "integer" }, no_fabrication: { type: "integer" }, comment: { type: "string" } } }] },
    },
  },
};

const out = { session: path.basename(dir), agent_model: res.model, judge_model: JUDGE, at: new Date().toISOString(), cases: [], usage: { input: 0, output: 0 } };
for (const c of res.cases) {
  const { claims, email } = claimsOf(c);
  if (!claims.length && !email) { out.cases.push({ case_id: c.case_id, skipped: "không có đầu ra để chấm" }); continue; }
  if (DRY) { const src = JSON.stringify(sourceOf(c)); console.log(c.case_id, `${claims.length} nhận định`, email ? "có email" : "", `nguồn ${src.length} ký tự`, /@|\b0\d{9}\b/.test(src) ? "CÒN PII?" : ""); continue; }
  const body = {
    model: JUDGE, temperature: 0, response_format: { type: "json_schema", json_schema: SCHEMA },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ NGUON: sourceOf(c), DAU_RA: { claims, email } }) }],
  };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${j?.error?.message ?? ""}`);
    out.usage.input += j.usage?.prompt_tokens ?? 0; out.usage.output += j.usage?.completion_tokens ?? 0;
    const v = JSON.parse(j.choices[0].message.content);
    out.cases.push({ case_id: c.case_id, agent: c.agent, claims, verdicts: v.claims, email, email_score: v.email });
    console.log(c.case_id, v.claims.map((x) => x.verdict[0]).join(""), v.email ? `email ${["personalization", "relevance", "cta", "tone", "no_fabrication"].map((k) => v.email[k]).join("/")}` : "");
  } catch (e) {
    out.cases.push({ case_id: c.case_id, error: e instanceof Error ? e.message : String(e) });
    console.log(c.case_id, "LỖI", e instanceof Error ? e.message : e);
  }
}
out.cost_usd = PRICE ? (out.usage.input * PRICE[0] + out.usage.output * PRICE[1]) / 1e6 : null;
fs.writeFileSync(path.join(dir, "judge.json"), JSON.stringify(out, null, 1));
console.log(`Xong ${out.session}: token ${out.usage.input}/${out.usage.output}, chi phí judge $${(out.cost_usd ?? 0).toFixed(4)}`);
