import { describe, it, expect } from "vitest";
import { all, get, run } from "@/lib/db";
import { evaluateOpportunityRules, rulesetHash } from "@/lib/agents/rules";
import { invokeTool, type ToolContext } from "@/lib/agents/tools";
import { runAgent } from "@/lib/agents/runtime";

let seq = 0;
function makeOpp(opts: { amount: number; budget?: number; need?: string | null; employees?: string | null; closeInDays?: number }) {
  seq++;
  const { id: acc } = run("INSERT INTO accounts (name, name_norm, employee_size) VALUES (?, ?, ?)", `Rule Acc ${seq}`, `rule acc ${seq}`, opts.employees ?? null);
  const close = opts.closeInDays === undefined ? null : new Date(Date.now() + opts.closeInDays * 86400000).toISOString().slice(0, 10);
  const { id } = run(
    "INSERT INTO opportunities (code, name, account_id, stage, amount, budget, customer_need, close_date) VALUES (?, ?, ?, 'DEVELOP', ?, ?, ?, ?)",
    `OPP-RULE-${seq}`, `Rule Opp ${seq}`, acc, opts.amount, opts.budget ?? 0, opts.need ?? null, close,
  );
  return id;
}
const byId = (o: ReturnType<typeof evaluateOpportunityRules>, id: string) => o.evaluations.find((e) => e.rule_id === id)!;

describe("WP-08 BR-28: Bộ quy tắc Opportunity Agent (OPP-R01..R10)", () => {
  it("OPP-R01 đọc ngưỡng BR-08 từ settings (100 triệu = Trung bình), không dùng ngưỡng cứng 150 triệu", () => {
    const o = evaluateOpportunityRules(makeOpp({ amount: 120_000_000 }));
    expect(o.importance).toBe("MEDIUM");
    expect(byId(o, "OPP-R01").threshold).toBe("100000000 / 500000000");
    expect(evaluateOpportunityRules(makeOpp({ amount: 30_000_000 })).importance).toBe("LOW");
  });

  it("OPP-R01 khách Enterprise (≥ 200 nhân sự) là mức Cao dù doanh thu thấp", () => {
    expect(evaluateOpportunityRules(makeOpp({ amount: 30_000_000, employees: "250-500" })).importance).toBe("HIGH");
  });

  it("OPP-R02 thiếu người quyết định: HIT kèm giới hạn kết luận, không khẳng định chưa tiếp cận", () => {
    const e = byId(evaluateOpportunityRules(makeOpp({ amount: 50_000_000 })), "OPP-R02");
    expect(e.status).toBe("HIT");
    expect(e.limitation).toContain("chưa đủ căn cứ");
  });

  it("Thiếu dữ liệu thì NOT_EVALUABLE thay vì kết luận (email, ngân sách, ngày chốt, đối thủ)", () => {
    const o = evaluateOpportunityRules(makeOpp({ amount: 50_000_000 }));
    for (const id of ["OPP-R04", "OPP-R05", "OPP-R06", "OPP-R07"]) expect(byId(o, id).status).toBe("NOT_EVALUABLE");
    // 4/10 quy tắc thiếu dữ liệu → độ bao phủ 0,6 = đúng ngưỡng ai_min_confidence
    expect(o.confidence).toBe(0.6);
    expect(o.confidence_band).toBe("MEDIUM");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_min_confidence', '0.7')");
    expect(evaluateOpportunityRules(makeOpp({ amount: 50_000_000 })).confidence_band).toBe("LOW");
    run("DELETE FROM settings WHERE key = 'ai_min_confidence'");
  });

  it("OPP-R07 vượt ngân sách và OPP-R06 sắp tới ngày chốt khi còn Develop", () => {
    const o = evaluateOpportunityRules(makeOpp({ amount: 200_000_000, budget: 100_000_000, need: "CRM", closeInDays: 5 }));
    expect(byId(o, "OPP-R07").status).toBe("HIT");
    expect(byId(o, "OPP-R06").status).toBe("HIT");
    expect(o.risks.map((r) => r.category)).toEqual(expect.arrayContaining(["OVER_BUDGET", "TIMELINE"]));
  });

  it("Hành động ưu tiên xếp theo HIT/mức độ, tối đa 3; cổng QLKD bật khi có rủi ro", () => {
    const o = evaluateOpportunityRules(makeOpp({ amount: 200_000_000, budget: 100_000_000, closeInDays: 5 }));
    expect(o.next_actions).toHaveLength(3);
    const ruleOrder = o.next_actions.map((a) => byId(o, a.rule_id));
    expect(ruleOrder.every((e) => e.status === "HIT")).toBe(true);
    expect(ruleOrder[0].severity).toBe("HIGH");
    expect(o.gates).toContain("MANAGER_REVIEW");
  });

  it("Hash bộ quy tắc đổi khi đổi tham số BR-08", () => {
    const before = rulesetHash();
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('importance_medium_amount', '120000000')");
    expect(rulesetHash()).not.toBe(before);
    run("DELETE FROM settings WHERE key = 'importance_medium_amount'");
    expect(rulesetHash()).toBe(before);
  });

  it("save_opportunity_research khóa mức quan trọng theo quy tắc, tách rủi ro LLM thành 'chưa phân loại' và lưu AI_RULE_EVALUATION", () => {
    const oppId = makeOpp({ amount: 30_000_000 });
    const ctx: ToolContext = { agent: "OPPORTUNITY", runId: 0, entityType: "opportunity", entityId: oppId };
    const out = invokeTool(ctx, "save_opportunity_research", {
      importance: "HIGH",
      summary: "LLM tự đánh giá mức Cao",
      risks: [{ category: "TECH_CONSTRAINT", severity: "MEDIUM", description: "Ràng buộc tích hợp" }],
      next_actions: ["Họp kỹ thuật"],
      sources: [{ ref: "opportunity.code", quote: `OPP-RULE-${seq}` }],
    }, []) as { research_id: number; importance: string };
    expect(out.importance).toBe("LOW");
    const row = get<{ importance: string; llm_importance: string; risks_json: string; ruleset_hash: string }>(
      "SELECT importance, llm_importance, risks_json, ruleset_hash FROM opportunity_research WHERE id = ?", out.research_id);
    expect(row?.importance).toBe("LOW");
    expect(row?.llm_importance).toBe("HIGH");
    expect(row?.ruleset_hash).toBe(rulesetHash());
    const risks = JSON.parse(row!.risks_json) as { rule_id: string | null; unclassified?: boolean; category: string }[];
    expect(risks.find((r) => r.category === "TECH_CONSTRAINT")?.unclassified).toBe(true);
    expect(risks.find((r) => r.category === "MISSING_DECISION_MAKER")?.rule_id).toBe("OPP-R02");
    expect(all("SELECT rule_id FROM ai_rule_evaluations WHERE research_id = ?", out.research_id)).toHaveLength(10);
  });

  it("Mock Agent chạy end-to-end và dùng kết quả rule (không còn ngưỡng tự đặt)", async () => {
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('agent_opportunity_enabled', 'true')");
    const oppId = makeOpp({ amount: 120_000_000, need: "CRM cho 20 nhân viên" });
    const res = await runAgent("OPPORTUNITY", { type: "opportunity", id: oppId }, "MANUAL", null);
    expect(res.status).toBe("SUCCEEDED");
    const r = get<{ importance: string; ruleset_version: string }>("SELECT importance, ruleset_version FROM opportunity_research WHERE opportunity_id = ? ORDER BY id DESC", oppId);
    expect(r?.importance).toBe("MEDIUM");
    expect(r?.ruleset_version).toBe("opp-rules-v1");
  });
});
