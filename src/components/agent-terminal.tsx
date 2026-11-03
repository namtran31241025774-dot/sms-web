"use client";
// Nhật ký một lần chạy Agent dạng terminal, dựng từ dấu vết đã lưu (tool_calls, ai_rule_evaluations).
// Không hiển thị suy luận nội bộ của mô hình vì hệ thống không lưu; nút Phát lại cho các dòng hiện lần lượt.
import { useEffect, useState } from "react";

export type TerminalLine = { time: string; kind: "SYSTEM" | "TOOL" | "RESULT" | "RULE" | "ARTIFACT" | "HUMAN" | "ERROR"; text: string; detail?: string };

const KIND: Record<TerminalLine["kind"], { label: string; cls: string }> = {
  SYSTEM: { label: "HỆ THỐNG", cls: "text-[#8fb3e8]" },
  TOOL: { label: "CÔNG CỤ", cls: "text-[#f4c26b]" },
  RESULT: { label: "KẾT QUẢ", cls: "text-[#7fd1a8]" },
  RULE: { label: "QUY TẮC", cls: "text-[#c7a6f5]" },
  ARTIFACT: { label: "LƯU", cls: "text-[#5aa9ff]" },
  HUMAN: { label: "CON NGƯỜI", cls: "text-[#f59aa5]" },
  ERROR: { label: "LỖI", cls: "text-[#ff7b7b]" },
};

export function AgentTerminal({ title, subtitle, lines }: { title: string; subtitle?: string; lines: TerminalLine[] }) {
  const [shown, setShown] = useState(lines.length);
  const playing = shown < lines.length;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setShown((n) => n + 1), 420);
    return () => clearTimeout(t);
  }, [shown, playing]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1d2a44] bg-[#0a1324] text-[12.5px] text-[#d7e2f5] shadow-[var(--shadow-16)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d2a44] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" /></span>
          <span className="ml-2 font-semibold text-white">{title}</span>
          {subtitle && <span className="text-[11px] text-[#7f93bb]">{subtitle}</span>}
        </div>
        <button
          type="button"
          onClick={() => setShown(playing ? lines.length : 0)}
          className="rounded-full border border-[#2b3c5e] px-3 py-1 text-[11px] font-semibold text-[#c9d6ef] hover:bg-[#13203a]"
        >
          {playing ? "Hiện hết" : "▶ Phát lại"}
        </button>
      </div>
      <ol className="max-h-[360px] space-y-1 overflow-y-auto px-4 py-3 font-mono">
        {lines.slice(0, shown).map((l, i) => (
          <li key={i} className="grid grid-cols-[64px_86px_1fr] gap-2 leading-5">
            <span className="text-[#5d6f92]">{l.time}</span>
            <span className={`font-semibold ${KIND[l.kind].cls}`}>{KIND[l.kind].label}</span>
            <span>
              {l.text}
              {l.detail && <span className="block text-[11.5px] text-[#8a9bbd]">{l.detail}</span>}
            </span>
          </li>
        ))}
        {playing && <li className="animate-pulse pl-[160px] text-[#5aa9ff]">▍</li>}
        {!lines.length && <li className="text-[#7f93bb]">Chưa có dấu vết của lần chạy này.</li>}
      </ol>
    </div>
  );
}
