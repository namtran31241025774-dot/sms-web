// Bảng "Căn cứ quy tắc" của một bản Opportunity Research (BR-28):
// quy tắc → dữ liệu quan sát → ngưỡng → kết quả → giới hạn kết luận → việc cần làm / cổng duyệt.
type Row = {
  rule_id: string; br_ref: string; status: string; severity: string | null; raw_value: string | null;
  threshold: string | null; rationale: string; limitation: string | null; evidence_refs_json: string;
  required_action: string | null; human_gate: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  HIT: { label: "Vi phạm", cls: "bg-[#fde7e9] text-[#a4262c]" },
  WARNING: { label: "Cảnh báo", cls: "bg-[#fff4ce] text-[#8a5300]" },
  PASSED: { label: "Đạt", cls: "bg-[#dff6dd] text-[#107c10]" },
  NOT_EVALUABLE: { label: "Chưa đánh giá được", cls: "bg-[#f3f2f1] text-[#605e5c]" },
  NOT_APPLICABLE: { label: "Không áp dụng", cls: "bg-[#f3f2f1] text-[#a19f9d]" },
};
const GATE: Record<string, string> = { AE_VERIFY: "AE xác minh", MANAGER_REVIEW: "QLKD rà soát", EXPERT_REVIEW: "Rà soát chuyên môn" };

export function RuleEvaluationTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const notEvaluable = rows.filter((r) => r.status === "NOT_EVALUABLE").length;
  return (
    <details className="rounded border border-[#f0f0f0]" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Căn cứ quy tắc ({rows.length} quy tắc{notEvaluable ? `, ${notEvaluable} chưa đủ dữ liệu` : ""})
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-ink-3">
            <tr><th className="px-3 py-1">Quy tắc</th><th className="px-3 py-1">Quan sát</th><th className="px-3 py-1">Ngưỡng</th><th className="px-3 py-1">Kết quả</th><th className="px-3 py-1">Giải thích &amp; giới hạn</th><th className="px-3 py-1">Việc cần làm</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, cls: "" };
              const refs = JSON.parse(r.evidence_refs_json) as string[];
              return (
                <tr key={r.rule_id} className="border-t border-[#f0f0f0] align-top">
                  <td className="px-3 py-1.5"><code>{r.rule_id}</code><div className="text-ink-3">{r.br_ref}</div></td>
                  <td className="px-3 py-1.5">{r.raw_value ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.threshold ?? "—"}</td>
                  <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>{r.severity && <div className="text-ink-3">Mức {r.severity}</div>}</td>
                  <td className="px-3 py-1.5">
                    {r.rationale}
                    {r.limitation && <div className="text-ink-3">Giới hạn: {r.limitation}</div>}
                    {refs.length > 0 && <div className="text-[11px] text-ink-3">Nguồn: {refs.join(", ")}</div>}
                  </td>
                  <td className="px-3 py-1.5">{r.required_action ?? "—"}{r.human_gate && <div className="text-[#5c2e91]">Cổng: {GATE[r.human_gate] ?? r.human_gate}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
