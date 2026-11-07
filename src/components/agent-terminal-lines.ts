// Chuyển dấu vết một lần chạy (runForWorkflow) thành các dòng cho AgentTerminal.
import type { runForWorkflow } from "@/lib/services/ai-review";
import type { TerminalLine } from "./agent-terminal";

type Run = NonNullable<ReturnType<typeof runForWorkflow>>;

const RULE_STATUS: Record<string, string> = { PASSED: "Đạt", WARNING: "Cảnh báo", HIT: "Vi phạm", NOT_EVALUABLE: "Thiếu dữ liệu", NOT_APPLICABLE: "Không áp dụng" };

const hhmmss = (iso: string | null | undefined) => {
  if (!iso) return "--:--:--";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? iso.slice(11, 19) : d.toLocaleTimeString("vi-VN", { hour12: false });
};

// Kết quả công cụ thường là JSON dài: nêu số trường hoặc số mục, kèm đoạn trích ngắn.
function summarize(raw: string | null): { text: string; detail?: string } {
  if (!raw) return { text: "Hoàn tất" };
  const clip = (s: string) => (s.length > 150 ? `${s.slice(0, 150)}…` : s);
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return { text: `Trả về ${v.length} mục`, detail: clip(raw) };
    if (v && typeof v === "object") return { text: `Trả về dữ liệu ${Object.keys(v).length} trường`, detail: clip(raw) };
  } catch {
    // Không phải JSON, hoặc đã bị cắt: giữ nguyên nhưng rút ngắn.
  }
  return raw.trim().startsWith("{") || raw.trim().startsWith("[") ? { text: "Trả về dữ liệu", detail: clip(raw) } : { text: clip(raw) };
}

export function terminalLines(run: Run, extra: { savedLabel?: string; human?: string | null } = {}): TerminalLine[] {
  const first = run.trace[0]?.created_at;
  const last = run.trace.at(-1)?.created_at;
  const lines: TerminalLine[] = [
    { time: hhmmss(first), kind: "SYSTEM", text: `Kích hoạt ${run.trigger}${run.name ? ` bởi ${run.name}` : ""}`, detail: `Mô hình ${run.model}${run.research_phase ? ` · ${run.research_phase === "INITIAL" ? "lần 1" : run.research_phase === "POST_SURVEY" ? "lần 2" : run.research_phase}` : ""}` },
    { time: hhmmss(first), kind: "SYSTEM", text: "Kiểm tra an toàn đạt: Agent đang bật, còn ngân sách, đúng phạm vi dữ liệu" },
  ];
  for (const t of run.trace) {
    lines.push({ time: hhmmss(t.created_at), kind: "TOOL", text: `Gọi ${t.tool_name}`, detail: t.duration_ms ? `${t.duration_ms} ms` : undefined });
    lines.push({
      time: hhmmss(t.created_at),
      kind: t.outcome === "OK" ? "RESULT" : "ERROR",
      ...(t.outcome === "OK" ? summarize(t.output_summary) : { text: `${t.outcome === "DENIED" ? "Bị chặn quyền" : "Lỗi"}: ${t.output_summary ?? t.tool_name}` }),
    });
  }
  for (const r of run.ruleResults) {
    if (r.status === "PASSED" || r.status === "NOT_APPLICABLE") continue;
    lines.push({ time: hhmmss(last), kind: "RULE", text: `${r.rule_id} · ${RULE_STATUS[r.status] ?? r.status}`, detail: r.rationale });
  }
  const passed = run.ruleResults.filter((r) => r.status === "PASSED").length;
  if (run.ruleResults.length) lines.push({ time: hhmmss(last), kind: "RULE", text: `${passed}/${run.ruleResults.length} quy tắc đạt` });
  if (extra.savedLabel) lines.push({ time: hhmmss(last), kind: "ARTIFACT", text: extra.savedLabel, detail: "Đề xuất chờ người xác minh, Agent không tự ghi vào hồ sơ" });
  lines.push({ time: hhmmss(last), kind: run.status === "SUCCEEDED" ? "SYSTEM" : "ERROR", text: run.status === "SUCCEEDED" ? "Kết thúc lần chạy" : `Lần chạy kết thúc với trạng thái ${run.status}` });
  if (extra.human) lines.push({ time: "", kind: "HUMAN", text: extra.human });
  return lines;
}
