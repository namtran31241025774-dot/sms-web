// Các hình trực quan về logic và kiểm soát AI Agent: 6 lớp kiểm soát (có số liệu thật),
// ma trận "điều kiện → kết quả" của bộ quy tắc, thang mức quan trọng BR-08.
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

type LayerStats = { runs: number; failed: number; denied: number; toolErrors: number; evidence: number; hits: number; missing: number; overridden: number; pending: number; decided: number };
type PreRun = { name: string; killed: boolean; enabled: boolean; used: number; budget: number; ok: boolean };

function Metric({ value, label, tone = "text-ink" }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div>
      <div className={cx("text-[20px] font-semibold leading-6", tone)}>{value}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

export function ControlLayers({ stats, preRun }: { stats: LayerStats; preRun: PreRun[] }) {
  const layers: { n: number; title: string; icon: IconName; blocks: string; where: string; exit: string; body: ReactNode }[] = [
    {
      n: 1, title: "Kiểm tra trước khi chạy", icon: "shield", where: "runtime.ts", exit: "Không tạo lần chạy",
      blocks: "Agent tắt · kill switch · hết ngân sách ngày · sai giai đoạn · đang chạy trùng · model ngoài danh sách",
      body: (
        <div className="space-y-1.5">
          {preRun.map((p) => (
            <div key={p.name} className="text-[11px]">
              <div className="flex items-center justify-between"><span>{p.name}</span><span className={p.ok ? "text-[#107c10]" : "text-[#c50f1f]"}>{p.ok ? "Sẵn sàng" : p.killed ? "Kill switch" : !p.enabled ? "Đang tắt" : "Hết ngân sách"}</span></div>
              <div className="mt-0.5 h-1.5 rounded bg-[#f0f0f0]"><div className="h-1.5 rounded bg-[#0f6cbd]" style={{ width: `${Math.min(100, p.budget ? (p.used / p.budget) * 100 : 0)}%` }} /></div>
              <div className="text-ink-3">{p.used.toLocaleString("vi-VN")} / {p.budget.toLocaleString("vi-VN")} token hôm nay</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      n: 2, title: "Giới hạn trong lúc chạy", icon: "history", where: "runtime.ts", exit: "FAILED kèm lý do",
      blocks: "Tối đa 15 vòng · 60 000 token · 5 lượt tìm web · 300 giây mỗi lần chạy",
      body: <div className="grid grid-cols-2 gap-2"><Metric value={stats.runs} label="lần chạy" /><Metric value={stats.failed} label="dừng (FAILED)" tone={stats.failed ? "text-[#c50f1f]" : undefined} /></div>,
    },
    {
      n: 3, title: "Quyền công cụ", icon: "flag", where: "tools.ts · invokeTool", exit: "DENIED / lỗi trả về cho model",
      blocks: "Công cụ ngoài danh sách của Agent · sai schema · thao tác ngoài hồ sơ đang chạy · log che email, SĐT, khoá",
      body: <div className="grid grid-cols-2 gap-2"><Metric value={stats.denied} label="bị chặn quyền" tone={stats.denied ? "text-[#c50f1f]" : undefined} /><Metric value={stats.toolErrors} label="lỗi schema / dữ liệu" /></div>,
    },
    {
      n: 4, title: "Kiểm căn cứ", icon: "link", where: "evidence.ts", exit: "Không lưu kết quả",
      blocks: "Nguồn không thuộc hồ sơ · URL không có trong lần chạy · trích dẫn không có trong nguồn",
      body: <Metric value={stats.evidence} label="căn cứ đã xác thực" tone="text-[#107c10]" />,
    },
    {
      n: 5, title: "Bộ quy tắc khóa kết quả", icon: "check", where: "rules.ts (BR-28)", exit: "Thay giá trị LLM bằng kết quả quy tắc",
      blocks: "Mức quan trọng, rủi ro có mã, thứ tự hành động, cổng duyệt do backend tính; thiếu dữ liệu → Chưa đánh giá được",
      body: <div className="grid grid-cols-3 gap-2"><Metric value={stats.hits} label="vi phạm" tone="text-[#c50f1f]" /><Metric value={stats.missing} label="thiếu dữ liệu" /><Metric value={stats.overridden} label="LLM bị thay" /></div>,
    },
    {
      n: 6, title: "Con người quyết định", icon: "person", where: "HG1 – HG8", exit: "Không đổi hồ sơ khi chưa duyệt",
      blocks: "Email, loại / chuyển đổi Lead, xác minh nghiên cứu, rủi ro, chuyển giai đoạn đều cần người có thẩm quyền",
      body: <div className="grid grid-cols-2 gap-2"><Metric value={stats.pending} label="đang chờ duyệt" tone="text-[#0f6cbd]" /><Metric value={stats.decided} label="đã quyết định" tone="text-[#107c10]" /></div>,
    },
  ];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
        <span className="rounded bg-[#f1ebf9] px-1.5 py-0.5 text-[#5c2e91]">Yêu cầu chạy Agent</span>
        <Icon name="arrowRight" size={14} /> đi qua 6 lớp theo thứ tự; lớp nào không đạt thì dừng ở lớp đó (dòng đỏ) · số liệu 7 ngày gần nhất
      </div>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {layers.map((l) => (
          <li key={l.n} className="flex flex-col rounded-lg border border-[#e0e0e0] bg-surface">
            <div className="flex items-center gap-2 rounded-t-lg bg-[#f5f9fe] px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f6cbd] text-xs font-semibold text-white">{l.n}</span>
              <span className="text-sm font-semibold leading-tight">{l.title}</span>
              <Icon name={l.icon} size={16} className="ml-auto text-[#0f6cbd]" />
            </div>
            <div className="flex-1 space-y-2 px-3 py-2">
              <p className="text-[11px] text-ink-2"><b>Chặn:</b> {l.blocks}</p>
              {l.body}
            </div>
            <div className="border-t border-[#f0f0f0] px-3 py-1.5 text-[11px] text-ink-3"><code>{l.where}</code></div>
            <div className="rounded-b-lg bg-[#fdf3f4] px-3 py-1.5 text-[11px] text-[#b10e1c]">✕ Không đạt → {l.exit}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type RuleRow = { id: string; br: string; title: string; logic: { input: string; missing?: string; hit?: string; warn?: string; pass: string } };

export function RuleLogicMatrix({ rules }: { rules: RuleRow[] }) {
  const cell = (text: string | undefined, cls: string) => (
    <td className="px-2 py-1.5 align-top">{text ? <div className={cx("rounded px-2 py-1 text-[11px]", cls)}>{text}</div> : <span className="text-[11px] text-[#c8c6c4]">—</span>}</td>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="text-left text-ink-3">
          <tr>
            <th className="px-2 py-1.5">Quy tắc</th>
            <th className="px-2 py-1.5">Dữ liệu vào</th>
            <th className="px-2 py-1.5">1 · Thiếu dữ liệu?</th>
            <th className="px-2 py-1.5">2 · Vi phạm khi</th>
            <th className="px-2 py-1.5">3 · Cảnh báo khi</th>
            <th className="px-2 py-1.5">4 · Ngược lại → Đạt</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-t border-[#f0f0f0]">
              <td className="px-2 py-1.5 align-top"><code className="font-semibold">{r.id}</code><div className="text-ink-3">{r.title}</div><div className="text-[10px] text-ink-3">{r.br}</div></td>
              <td className="px-2 py-1.5 align-top text-[11px] text-ink-2">{r.logic.input}</td>
              {cell(r.logic.missing && `${r.logic.missing} → Chưa đánh giá được`, "bg-[#f3f2f1] text-[#605e5c]")}
              {cell(r.logic.hit, "bg-[#fde7e9] text-[#a4262c]")}
              {cell(r.logic.warn, "bg-[#fff4ce] text-[#8a5300]")}
              {cell(r.logic.pass, "bg-[#dff6dd] text-[#107c10]")}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-ink-3">Thứ tự xét từ trái sang phải: thiếu dữ liệu thì dừng ở cột 1, không đoán tiếp. Ngưỡng hiển thị là giá trị cấu hình hiện hành.</p>
    </div>
  );
}

/** Thang mức quan trọng BR-08; truyền amount để đánh dấu vị trí của một cơ hội. */
export function ImportanceScale({ medium, high, amount }: { medium: number; high: number; amount?: number }) {
  const max = Math.max(high * 1.4, (amount ?? 0) * 1.1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const fmt = (v: number) => `${(v / 1_000_000).toLocaleString("vi-VN")} tr`;
  return (
    <div className="relative pb-5 pt-5">
      <div className="flex h-3 overflow-hidden rounded">
        <div className="bg-[#dff6dd]" style={{ width: pct(medium) }} />
        <div className="bg-[#fff4ce]" style={{ width: `calc(${pct(high)} - ${pct(medium)})` }} />
        <div className="flex-1 bg-[#fde7e9]" />
      </div>
      <span className="absolute left-0 top-0 text-[11px] text-[#107c10]">THẤP</span>
      <span className="absolute top-0 text-[11px] text-[#8a5300]" style={{ left: pct(medium) }}>TRUNG BÌNH</span>
      <span className="absolute top-0 text-[11px] text-[#a4262c]" style={{ left: pct(high) }}>CAO</span>
      <span className="absolute bottom-0 -translate-x-1/2 text-[10px] text-ink-3" style={{ left: pct(medium) }}>{fmt(medium)}</span>
      <span className="absolute bottom-0 -translate-x-1/2 text-[10px] text-ink-3" style={{ left: pct(high) }}>{fmt(high)}</span>
      {amount !== undefined && (
        <span className="absolute top-3 -translate-x-1/2 text-center" style={{ left: pct(amount) }}>
          <span className="block h-4 w-0.5 bg-ink mx-auto" />
          <span className="whitespace-nowrap rounded bg-ink px-1 text-[10px] text-white">{fmt(amount)}</span>
        </span>
      )}
    </div>
  );
}
