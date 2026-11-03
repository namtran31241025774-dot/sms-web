// Bộ component giao diện kiểu Fluent 2 / Dynamics 365 (server components).
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------- Command bar ---------------- */
export function CommandBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-1 overflow-x-auto border-b border-stroke bg-surface/95 px-5 backdrop-blur">
      {children}
    </div>
  );
}

export function CommandSep() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-[var(--stroke-strong)]" />;
}

export function CommandLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <Link href={href} className="cmd">
      <Icon name={icon} size={18} />
      {children}
    </Link>
  );
}

/** Nút lệnh gửi một form (đặt form ở chỗ khác bằng thuộc tính form=id) hoặc tự là form với action. */
export function CommandAction({
  action,
  icon,
  children,
  fields,
  disabled,
  title,
}: {
  action: (fd: FormData) => Promise<void>;
  icon: IconName;
  children: ReactNode;
  fields?: Record<string, string | number>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <form action={action} className="contents">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className="cmd" disabled={disabled} title={title}>
        <Icon name={icon} size={18} />
        {children}
      </button>
    </form>
  );
}

/* ---------------- Page / record header ---------------- */
export function PageTitle({
  title,
  subtitle,
  icon = "home",
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  right?: ReactNode;
}) {
  return (
    <div className="mx-6 mb-4 mt-5 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-stroke bg-gradient-to-r from-[#eaf2fc] via-white to-white px-6 py-5 shadow-[var(--shadow-4)]">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_4px_12px_rgba(15,108,189,0.3)]">
          <Icon name={icon} size={24} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-bold leading-8 text-brand-ink">{title}</h1>
          {subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</div>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </div>
  );
}

export function HeaderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-[120px] rounded-xl border border-stroke bg-white/80 px-3.5 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold leading-5 text-brand-ink">{children}</div>
    </div>
  );
}

/* ---------------- Tabs (điều hướng bằng query ?tab=) ---------------- */
export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string; count?: number }[] }) {
  return (
    <div className="mx-6 flex gap-1 overflow-x-auto rounded-full border border-stroke bg-surface p-1 shadow-[var(--shadow-2)]">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            className={cx(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[13.5px] transition-colors",
              active ? "bg-brand font-semibold text-white shadow-[0_2px_6px_rgba(15,108,189,0.25)]" : "text-ink-2 hover:bg-brand-tint hover:text-brand-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 text-[11px] font-semibold leading-4", active ? "bg-white/25 text-white" : "bg-[#eef1f5] text-ink-3")}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------- Card / Section ---------------- */
export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[var(--shadow-4)]", className)}>
      {(title || actions) && (
        <header className="flex min-h-13 items-center justify-between gap-2 border-b border-[#eef1f5] px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-brand-ink">
            <span className="h-4 w-1 rounded-full bg-brand" aria-hidden="true" />
            {title}
          </h2>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-[#f5f5f5] py-2 text-sm last:border-0">
      <div className="text-ink-3">{label}</div>
      <div className="min-w-0 break-words">{children ?? <span className="text-ink-3">—</span>}</div>
    </div>
  );
}

export function FormField({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

/* ---------------- Badge ---------------- */
const TONES = {
  brand: "bg-[#ebf3fc] text-[#0f6cbd] border-[#b4d6fa]",
  success: "bg-[#f1faf1] text-[#0e700e] border-[#9fd89f]",
  warning: "bg-[#fff9f5] text-[#bc4b09] border-[#fdcfb4]",
  danger: "bg-[#fdf3f4] text-[#b10e1c] border-[#eeacb2]",
  neutral: "bg-[#f5f5f5] text-[#424242] border-[#e0e0e0]",
  purple: "bg-[#f7f4fb] text-[#5c2e91] border-[#c6b1de]",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2 text-xs font-semibold", TONES[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  OPEN: "brand", WORKING: "warning", CONVERTED: "success", DISQUALIFIED: "neutral",
  DEVELOP: "brand", PROPOSE: "purple", CLOSE: "warning", WON: "success", LOST: "neutral",
  DRAFT: "neutral", PENDING_APPROVAL: "warning", APPROVED: "success", SENT: "brand", ACCEPTED: "success", REJECTED: "danger", SUPERSEDED: "neutral",
  ACTIVE: "brand", IN_FULFILLMENT: "warning", FULFILLED: "success", CANCELLED: "neutral",
  ISSUED: "brand", PARTIALLY_PAID: "warning", PAID: "success",
  PENDING: "warning", IN_PROGRESS: "brand", DONE: "success",
  PENDING_REVIEW: "purple", VERIFIED: "success", DISMISSED: "neutral",
  RUNNING: "brand", SUCCEEDED: "success", FAILED: "danger",
  HIGH: "danger", MEDIUM: "warning", LOW: "neutral", RESOLVED: "success",
};

export function StatusBadge({ status, labels }: { status: string | null | undefined; labels?: Record<string, string> }) {
  if (!status) return <span className="text-ink-3">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{labels?.[status] ?? status}</Badge>;
}

/* ---------------- MessageBar ---------------- */
export function MessageBar({ intent = "info", title, children, action }: { intent?: "info" | "success" | "warning" | "error"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const style = {
    info: { cls: "bg-[#f5f5f5] border-[#e0e0e0]", icon: "info" as IconName, color: "text-[#616161]" },
    success: { cls: "bg-[#f1faf1] border-[#9fd89f]", icon: "checkCircle" as IconName, color: "text-[#107c10]" },
    warning: { cls: "bg-[#fff9f5] border-[#fdcfb4]", icon: "warning" as IconName, color: "text-[#bc4b09]" },
    error: { cls: "bg-[#fdf3f4] border-[#eeacb2]", icon: "dismissCircle" as IconName, color: "text-[#c50f1f]" },
  }[intent];
  return (
    <div role={intent === "error" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-2.5 text-sm", style.cls)}>
      <Icon name={style.icon} size={18} className={cx("mt-px shrink-0", style.color)} />
      <div className="min-w-0 flex-1">
        {title && <span className="mr-1 font-semibold">{title}</span>}
        {children}
      </div>
      {action}
    </div>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (!sp.ok && !sp.error) return null;
  return (
    <div className="px-6 pt-3">
      {sp.error ? <MessageBar intent="error" title="Không thực hiện được.">{sp.error}</MessageBar> : <MessageBar intent="success">{sp.ok}</MessageBar>}
    </div>
  );
}

/* ---------------- Persona ---------------- */
const AVATAR_COLORS = ["#0f6cbd", "#8764b8", "#038387", "#c239b3", "#ca5010", "#498205", "#4f6bed", "#986f0b"];
export function Persona({ name, sub, size = 32 }: { name: string | null | undefined; sub?: string; size?: number }) {
  if (!name) return <span className="text-ink-3">—</span>;
  const words = name.split(" ").filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

/* ---------------- Business Process Flow ---------------- */
export function ProcessFlow({ stages, current, lost }: { stages: { key: string; label: string; sub?: string }[]; current: string; lost?: boolean }) {
  const idx = stages.findIndex((s) => s.key === current);
  return (
    <div className="mx-6 mb-4 flex items-stretch overflow-x-auto rounded-2xl border border-stroke bg-surface shadow-[var(--shadow-2)]">
      {stages.map((s, i) => {
        const done = i < idx || (i === idx && s.key === "__done");
        const active = i === idx;
        return (
          <div key={s.key} className="relative flex min-w-[150px] flex-1 items-center gap-2.5 px-4 py-2.5">
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                done && "border-brand bg-brand text-white",
                active && !lost && "border-brand bg-surface text-brand ring-4 ring-[#ebf3fc]",
                active && lost && "border-[#c50f1f] bg-[#fdf3f4] text-[#c50f1f]",
                !done && !active && "border-[var(--stroke-strong)] text-ink-3",
              )}
            >
              {done ? <Icon name="check" size={14} strokeWidth={2.5} /> : active && lost ? <Icon name="dismiss" size={14} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cx("block text-sm", active ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3")}>{s.label}</span>
              {s.sub && <span className="block truncate text-xs text-ink-3">{s.sub}</span>}
            </span>
            {i < stages.length - 1 && <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-[#bdbdbd]" />}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Empty / KPI ---------------- */
export function Empty({ icon = "info", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-3">
      <Icon name={icon} size={28} className="text-[#bdbdbd]" />
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, icon, href }: { label: string; value: ReactNode; sub?: ReactNode; icon: IconName; href?: string }) {
  const body = (
    <div className="flex h-full items-start gap-4 rounded-2xl border border-stroke bg-surface p-5 shadow-[var(--shadow-4)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-16)]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
        <div className="mt-0.5 text-[26px] font-bold leading-8 text-brand-ink">{value}</div>
        {sub && <div className="text-xs text-ink-3">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="grid-table">{children}</table>
    </div>
  );
}
