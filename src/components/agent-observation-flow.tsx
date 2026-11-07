// Khung quan sát AI Agent theo luồng chuẩn 6 bước (cho cả Opportunity Agent và Qualification Agent):
// 1. Dữ liệu được cấp quyền → 2. Agent và công cụ xử lý → 3. Kiểm tra quy tắc, căn cứ →
// 4. Lưu đề xuất → 5. Con người xác minh → 6. Cập nhật nghiệp vụ.

import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

export interface AgentObservationStep {
  key: string;
  title: string;
  owner: "SYSTEM" | "LLM" | "RULES" | "HUMAN";
  ownerLabel: string;
  status: "done" | "active" | "skipped" | "failed" | "upcoming";
  summary: string;
  details?: string[];
  note?: string;
}

interface AgentObservationFlowProps {
  agentName: string; // "Opportunity Agent" hoặc "Sales Qualification Agent"
  runId?: number | null;
  trigger?: string;
  model?: string;
  tokens?: number;
  steps: AgentObservationStep[];
  className?: string;
}

const OWNER_STYLE: Record<string, { label: string; icon: IconName; cls: string }> = {
  SYSTEM: { label: "Hệ thống", icon: "shield", cls: "bg-[#ebf3fc] text-[#0f6cbd]" },
  LLM: { label: "Agent / LLM", icon: "sparkle", cls: "bg-[#f1ebf9] text-[#5c2e91]" },
  RULES: { label: "Bộ quy tắc", icon: "check", cls: "bg-[#fff4ce] text-[#8a5300]" },
  HUMAN: { label: "Con người", icon: "person", cls: "bg-[#dff6dd] text-[#107c10]" },
};

export function AgentObservationFlow({
  agentName,
  runId,
  trigger,
  model,
  tokens,
  steps,
  className,
}: AgentObservationFlowProps) {
  return (
    <div className={cx("rounded-xl border border-stroke bg-[#fafafa] p-4 shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ececec] pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5c2e91]/10 text-[#5c2e91]">
            <Icon name="bot" size={16} />
          </div>
          <div>
            <span className="text-xs font-semibold text-ink uppercase tracking-wider">
              Khung quan sát vận hành: {agentName}
            </span>
            <span className="ml-2 text-[11px] text-ink-3">
              {runId ? `Lần chạy #${runId}` : ""} {trigger ? `· ${trigger}` : ""} {model ? `· ${model}` : ""} {tokens ? `· ${tokens} tokens` : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          <span>Hệ thống kiểm soát đa tầng</span>
        </div>
      </div>

      {/* 6 bước quan sát */}
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
        {steps.map((s, idx) => {
          const ownerInfo = OWNER_STYLE[s.owner] ?? OWNER_STYLE.SYSTEM;
          const isDone = s.status === "done";
          const isActive = s.status === "active";
          const isSkipped = s.status === "skipped";

          return (
            <li
              key={s.key}
              className={cx(
                "relative flex flex-col justify-between rounded-lg border p-2.5 text-xs transition-all",
                isDone && "border-[#c4e5c4] bg-[#f9fdf8]",
                isActive && "border-brand bg-surface ring-2 ring-brand/15 shadow-sm",
                isSkipped && "border-stroke bg-[#f5f5f5] text-ink-3 opacity-80",
                s.status === "failed" && "border-danger bg-danger-tint",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={cx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      isDone && "bg-success text-white",
                      isActive && "bg-brand text-white",
                      isSkipped && "bg-[#e0e0e0] text-ink-3",
                      s.status === "failed" && "bg-danger text-white",
                    )}
                  >
                    {isDone ? <Icon name="check" size={11} strokeWidth={2.5} /> : idx + 1}
                  </span>

                  <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", ownerInfo.cls)}>
                    <Icon name={ownerInfo.icon} size={10} />
                    {s.ownerLabel || ownerInfo.label}
                  </span>
                </div>

                <div className="font-semibold text-ink text-[12px] leading-tight">
                  {s.title}
                </div>

                <p className="mt-1 text-[11px] text-ink-2 leading-relaxed">
                  {s.summary}
                </p>

                {s.details && s.details.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 border-t border-[#f0f0f0] pt-1 text-[10px] text-ink-3 font-mono">
                    {s.details.map((d, i) => (
                      <li key={i} className="truncate" title={d}>
                        • {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {s.note && (
                <div className="mt-2 border-t border-[#f0f0f0] pt-1 text-[10px] font-medium text-ink-3">
                  {s.note}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
