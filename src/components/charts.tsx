// Biểu đồ dùng chung, vẽ bằng HTML/CSS (không thêm thư viện).
// Hai màu đã kiểm bằng validate_palette (dataviz): xanh thương hiệu và cam đất, đạt CVD và tương phản trên nền trắng.
import { cx } from "./ui";

export const SERIES = { a: "#0f6cbd", b: "#c97d0e" } as const;

const short = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ` : v >= 1e6 ? `${Math.round(v / 1e6).toLocaleString("vi-VN")} tr` : v.toLocaleString("vi-VN");
const vnd = (v: number) => `${v.toLocaleString("vi-VN")} ₫`;

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Cột chồng theo tháng: phần A dưới, phần B trên, khe 2px giữa hai phần. Một trục, bắt đầu từ 0. */
export function StackedColumns({ data, aLabel, bLabel, target }: {
  data: { label: string; a: number; b: number; note?: string }[];
  aLabel: string;
  bLabel: string;
  target?: number | null;
}) {
  const peak = Math.max(1, ...data.map((d) => d.a + d.b), target ?? 0);
  return (
    <div>
      <div className="relative flex h-56 items-end gap-3 border-b border-stroke pl-1">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <span key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#eef1f5]" style={{ bottom: `${g * 100}%` }} />
        ))}
        {target ? (
          <span className="pointer-events-none absolute inset-x-0 border-t-2 border-[#3d4757]" style={{ bottom: `${(target / peak) * 100}%` }}>
            <span className="absolute -top-5 right-0 rounded bg-white px-1 text-[11px] font-semibold text-ink-2">Chỉ tiêu tháng {short(target)}</span>
          </span>
        ) : null}
        {data.map((d) => {
          const total = d.a + d.b;
          return (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${d.label}: ${aLabel} ${vnd(d.a)} · ${bLabel} ${vnd(d.b)}${d.note ? ` · ${d.note}` : ""}`}>
              <span className="mb-1 text-[11px] font-semibold tabular-nums text-ink-2">{total ? short(total) : ""}</span>
              <div className="flex w-full max-w-12 flex-col justify-end gap-[2px]" style={{ height: `${(total / peak) * 100}%` }}>
                {d.b > 0 && <div className="w-full rounded-t-[4px]" style={{ flexGrow: d.b, background: SERIES.b }} />}
                {d.a > 0 && <div className={cx("w-full", d.b > 0 ? "" : "rounded-t-[4px]")} style={{ flexGrow: d.a, background: SERIES.a }} />}
              </div>
              <span className="pointer-events-none absolute -top-2 z-10 hidden -translate-y-full whitespace-nowrap rounded-lg border border-stroke bg-white px-2.5 py-1.5 text-[11px] text-ink shadow-[var(--shadow-16)] group-hover:block">
                <b>{d.label}</b><br />{aLabel}: {vnd(d.a)}<br />{bLabel}: {vnd(d.b)}{d.note && <><br />{d.note}</>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-3 pl-1">
        {data.map((d) => <span key={d.label} className="flex-1 text-center text-[11px] text-ink-3">{d.label}</span>)}
      </div>
    </div>
  );
}

/** Thanh ngang so sánh: tổng (nhạt, viền) và phần đã tính (đậm) trên cùng một trục. */
export function CompareBars({ rows, totalLabel, partLabel }: {
  rows: { label: string; total: number; part: number; sub?: string }[];
  totalLabel: string;
  partLabel: string;
}) {
  const peak = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="group text-sm" title={`${r.label}: ${totalLabel} ${vnd(r.total)} · ${partLabel} ${vnd(r.part)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">{r.label}{r.sub && <span className="ml-1.5 text-xs font-normal text-ink-3">{r.sub}</span>}</span>
            <span className="text-xs tabular-nums text-ink-2"><b className="text-ink">{short(r.part)}</b> / {short(r.total)}</span>
          </div>
          <div className="relative h-3 rounded-full bg-[#eef1f5]">
            <div className="absolute inset-y-0 left-0 rounded-full border-2" style={{ width: `${(r.total / peak) * 100}%`, borderColor: SERIES.a, background: "#eaf2fc" }} />
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.part / peak) * 100}%`, background: SERIES.a }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Thanh tiến độ tới chỉ tiêu: phần A (đậm) + phần B (màu thứ hai), khe 2px, vạch 100%. */
export function TargetProgress({ a, b, target, aLabel, bLabel }: { a: number; b: number; target: number; aLabel: string; bLabel: string }) {
  const scale = Math.max(target, a + b) || 1;
  return (
    <div>
      <div className="relative flex h-4 gap-[2px] overflow-hidden rounded-full bg-[#eef1f5]">
        {a > 0 && <div className="h-full" style={{ width: `${(a / scale) * 100}%`, background: SERIES.a }} title={`${aLabel}: ${vnd(a)}`} />}
        {b > 0 && <div className="h-full" style={{ width: `${(b / scale) * 100}%`, background: SERIES.b }} title={`${bLabel}: ${vnd(b)}`} />}
        <span className="absolute inset-y-0 w-[2px] bg-[#3d4757]" style={{ left: `calc(${(target / scale) * 100}% - 2px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3"><span>0</span><span>Chỉ tiêu {short(target)}</span></div>
    </div>
  );
}
