// Hiển thị workflow của Agent theo từng bước, có nhãn "ai làm bước này" (Hệ thống / LLM / Quy tắc / Con người).
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

export type FlowOwner = "SYSTEM" | "LLM" | "RULES" | "HUMAN";
export type FlowState = "done" | "active" | "todo" | "skipped" | "failed";
export type FlowStep = { key: string; title: string; owner: FlowOwner; detail: string; state?: FlowState; note?: string };

export const OWNER: Record<FlowOwner, { label: string; icon: IconName; cls: string }> = {
  SYSTEM: { label: "Hệ thống", icon: "shield", cls: "bg-[#ebf3fc] text-[#0f6cbd]" },
  LLM: { label: "LLM", icon: "sparkle", cls: "bg-[#f1ebf9] text-[#5c2e91]" },
  RULES: { label: "Quy tắc", icon: "check", cls: "bg-[#fff4ce] text-[#8a5300]" },
  HUMAN: { label: "Con người", icon: "person", cls: "bg-[#dff6dd] text-[#107c10]" },
};

export function OwnerBadge({ owner }: { owner: FlowOwner }) {
  const o = OWNER[owner];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", o.cls)}>
      <Icon name={o.icon} size={12} /> {o.label}
    </span>
  );
}

export function WorkflowSteps({ steps, compact }: { steps: FlowStep[]; compact?: boolean }) {
  return (
    <ol className={cx("grid gap-2", compact ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-8" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
      {steps.map((s, i) => {
        const st = s.state ?? "todo";
        return (
          <li
            key={s.key}
            className={cx(
              "relative rounded-lg border p-3",
              st === "done" && "border-[#9fd89f] bg-[#f6fcf5]",
              st === "active" && "border-[#0f6cbd] bg-[#f5f9fe] ring-2 ring-[#ebf3fc]",
              st === "failed" && "border-[#eeacb2] bg-[#fdf3f4]",
              (st === "todo" || st === "skipped") && "border-[#e0e0e0] bg-surface",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  st === "done" ? "bg-[#107c10] text-white" : st === "failed" ? "bg-[#c50f1f] text-white" : st === "active" ? "bg-[#0f6cbd] text-white" : "bg-[#f0f0f0] text-ink-3",
                )}
              >
                {st === "done" ? <Icon name="check" size={13} strokeWidth={2.5} /> : st === "failed" ? <Icon name="dismiss" size={13} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={cx("text-sm font-semibold", st === "skipped" && "text-ink-3")}>{s.title}</span>
            </div>
            <div className="mt-1.5"><OwnerBadge owner={s.owner} /></div>
            {!compact && <p className="mt-1.5 text-xs text-ink-2">{s.detail}</p>}
            {s.note && <p className={cx("mt-1 text-xs", st === "failed" ? "text-[#b10e1c]" : "text-ink-3")}>{s.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
