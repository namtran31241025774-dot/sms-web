// Workflow thực tế của MỘT lần chạy Opportunity Agent, dựng từ ai_runs.tool_calls_json,
// ai_rule_evaluations và trạng thái xác minh của bản nghiên cứu — không phải hình minh họa tĩnh.
import { get } from "@/lib/db";
import { TOOLS, type ToolName } from "@/lib/agents/tools";
import { WorkflowSteps, type FlowStep } from "./agent-workflow";

type Research = { id: number; run_id: number | null; status: string; gates_json: string | null; reviewed_by_name: string | null; sources_json: string };
type Eval = { status: string };

export function ResearchFlow({ research, evals }: { research: Research; evals: Eval[] }) {
  const run = research.run_id
    ? get<{ trigger: string; model: string; status: string; tool_calls_json: string | null; input_tokens: number; output_tokens: number; name: string | null }>(
        "SELECT r.trigger, r.model, r.status, r.tool_calls_json, r.input_tokens, r.output_tokens, u.name FROM ai_runs r LEFT JOIN users u ON u.id = r.triggered_by WHERE r.id = ?",
        research.run_id,
      )
    : undefined;
  const calls = JSON.parse(run?.tool_calls_json ?? "[]") as { tool: string; ok: boolean }[];
  const reads = calls.filter((c) => TOOLS[c.tool as ToolName]?.access === "READ" && c.tool !== "evaluate_opportunity_rules");
  const count = (s: string) => evals.filter((e) => e.status === s).length;
  const gates = JSON.parse(research.gates_json ?? "[]") as string[];
  const sources = (JSON.parse(research.sources_json) as unknown[]).length;
  const verified = research.status === "VERIFIED";
  const dismissed = research.status === "DISMISSED";
  const needManager = gates.includes("MANAGER_REVIEW");

  const steps: FlowStep[] = [
    { key: "trigger", title: "Kích hoạt", owner: "SYSTEM", detail: "", state: "done", note: `${run?.trigger ?? "—"} · ${run?.name ?? "tự động"}` },
    { key: "guard", title: "Kiểm tra an toàn", owner: "SYSTEM", detail: "", state: "done", note: "Đạt: Agent bật, còn ngân sách, đúng giai đoạn" },
    { key: "read", title: "Thu thập dữ liệu", owner: "LLM", detail: "", state: "done", note: `${reads.length} lần gọi công cụ đọc` },
    {
      key: "rules", title: "Áp bộ quy tắc", owner: "RULES", detail: "", state: evals.length ? "done" : "skipped",
      note: evals.length ? `${count("HIT")} vi phạm · ${count("WARNING")} cảnh báo · ${count("NOT_EVALUABLE")} thiếu dữ liệu` : "Bản cũ, chưa có bộ quy tắc",
    },
    { key: "explain", title: "Diễn giải", owner: "LLM", detail: "", state: "done", note: run ? `${run.model}${run.input_tokens + run.output_tokens ? ` · ${run.input_tokens + run.output_tokens} token` : ""}` : "—" },
    { key: "save", title: "Kiểm căn cứ & lưu", owner: "SYSTEM", detail: "", state: "done", note: `Bản #${research.id} · ${sources} nguồn đã xác thực` },
    {
      key: "verify", title: "AE xác minh", owner: "HUMAN", detail: "",
      state: verified ? "done" : dismissed ? "skipped" : "active",
      note: verified ? `Đã xác minh${research.reviewed_by_name ? ` · ${research.reviewed_by_name}` : ""}` : dismissed ? "Đã bỏ qua / thay bằng bản mới" : "Đang chờ AE (HG4)",
    },
    {
      key: "manager", title: "QLKD rà soát", owner: "HUMAN", detail: "",
      state: !needManager || dismissed ? "skipped" : verified ? "active" : "todo",
      note: !needManager ? "Không thuộc diện BR-06" : "Bắt buộc trước khi sang Propose (HG6)",
    },
  ];
  return (
    <div className="rounded-md border border-[#f0f0f0] bg-[#fafafa] p-3">
      <div className="label mb-2">Workflow của lần chạy này</div>
      <WorkflowSteps steps={steps} compact />
    </div>
  );
}
