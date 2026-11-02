// Workflow thực tế của MỘT lần chạy Opportunity Agent, dựng từ ai_runs.tool_calls_json,
// ai_rule_evaluations và trạng thái xác minh của bản nghiên cứu — không phải hình minh họa tĩnh.
import { runForWorkflow } from "@/lib/services/ai-review";
import type { StageGateStatus } from "@/lib/services/approvals";
import { TOOLS, type ToolName } from "@/lib/agents/tools";
import { WorkflowSteps, type FlowStep } from "./agent-workflow";

type Research = { id: number; run_id: number | null; status: string; gates_json: string | null; reviewed_by_name: string | null; sources_json: string };
type Eval = { status: string };

// Bước QLKD rà soát theo trạng thái thật của cổng; bản đã bỏ qua thì giữ ảnh chụp lúc chạy.
function managerStep(gate: StageGateStatus | undefined, snapshotNeeded: boolean, verified: boolean, dismissed: boolean, canReview: boolean): Pick<FlowStep, "state" | "note" | "href" | "hrefLabel"> {
  if (dismissed || !gate) return { state: "skipped", note: snapshotNeeded ? "Bắt buộc trước khi sang Propose (HG6)" : "Không thuộc diện BR-06" };
  const decided = gate.decidedBy ? ` · ${gate.decidedBy}` : "";
  if (gate.status === "APPROVED") return { state: "done", note: `Đã duyệt${decided}${gate.comment ? `: ${gate.comment}` : ""}` };
  if (gate.passed) return { state: "done", note: "Cơ hội đã qua giai đoạn Develop" };
  if (!gate.required) return { state: "skipped", note: "Không thuộc diện BR-06" };
  const review = canReview ? { href: "/approvals", hrefLabel: "Mở Phê duyệt" } : {};
  if (gate.status === "PENDING") return { state: "active", note: `Đang chờ ${gate.deciders.join(", ")} duyệt`, ...review };
  if (gate.status === "REJECTED") return { state: "active", note: `Bị từ chối${decided}: ${gate.comment ?? ""}. AE bổ sung rồi bấm Giai đoạn kế tiếp để gửi lại` };
  return { state: verified ? "active" : "todo", note: "Chưa gửi. Hệ thống gửi QLKD khi AE bấm Giai đoạn kế tiếp" };
}

export function ResearchFlow({ research, evals, gate, canReview = false }: { research: Research; evals: Eval[]; gate?: StageGateStatus; canReview?: boolean }) {
  const run = research.run_id ? runForWorkflow(research.run_id) : undefined;
  const calls = JSON.parse(run?.tool_calls_json ?? "[]") as { tool: string; ok: boolean }[];
  const reads = calls.filter((c) => TOOLS[c.tool as ToolName]?.access === "READ" && c.tool !== "evaluate_opportunity_rules");
  const count = (s: string) => evals.filter((e) => e.status === s).length;
  const gates = JSON.parse(research.gates_json ?? "[]") as string[];
  const sources = (JSON.parse(research.sources_json) as unknown[]).length;
  const verified = research.status === "VERIFIED";
  const dismissed = research.status === "DISMISSED";
  const needManager = gates.includes("MANAGER_REVIEW");
  const tokens = (run?.input_tokens ?? 0) + (run?.output_tokens ?? 0);

  const steps: FlowStep[] = [
    { key: "trigger", title: "Kích hoạt", owner: "SYSTEM", detail: "", state: "done", note: `${run?.trigger ?? "—"} · ${run?.name ?? "tự động"}` },
    { key: "guard", title: "Kiểm tra an toàn", owner: "SYSTEM", detail: "", state: "done", note: "Đạt: Agent bật, còn ngân sách, đúng giai đoạn" },
    { key: "read", title: "Thu thập dữ liệu", owner: "LLM", detail: "", state: "done", note: `${reads.length} lần gọi công cụ đọc` },
    {
      key: "rules", title: "Áp bộ quy tắc", owner: "RULES", detail: "", state: evals.length ? "done" : "skipped",
      note: evals.length ? `${count("HIT")} vi phạm · ${count("WARNING")} cảnh báo · ${count("NOT_EVALUABLE")} thiếu dữ liệu` : "Bản cũ, chưa có bộ quy tắc",
    },
    { key: "explain", title: "Diễn giải", owner: "LLM", detail: "", state: "done", note: run ? `${run.model}${tokens ? ` · ${tokens} token` : ""}` : "—" },
    { key: "save", title: "Kiểm căn cứ & lưu", owner: "SYSTEM", detail: "", state: "done", note: `Bản #${research.id} · ${sources} nguồn đã xác thực` },
    {
      key: "verify", title: "AE xác minh", owner: "HUMAN", detail: "",
      state: verified ? "done" : dismissed ? "skipped" : "active",
      note: verified ? `Đã xác minh${research.reviewed_by_name ? ` · ${research.reviewed_by_name}` : ""}` : dismissed ? "Đã bỏ qua / thay bằng bản mới" : "Đang chờ AE (HG4)",
    },
    { key: "manager", title: "QLKD rà soát", owner: "HUMAN", detail: "", ...managerStep(gate, needManager, verified, dismissed, canReview) },
  ];
  return (
    <div className="rounded-md border border-[#f0f0f0] bg-[#fafafa] p-3">
      <div className="label mb-2">Workflow của lần chạy này</div>
      <WorkflowSteps steps={steps} compact />
    </div>
  );
}
