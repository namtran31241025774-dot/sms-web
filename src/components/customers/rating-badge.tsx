import type { LeadRating } from "@/lib/services/leads";

const RATING_INFO: Record<LeadRating, { label: string; bg: string; text: string; border: string }> = {
  HOT: { label: "Nóng", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  WARM: { label: "Ấm", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  COLD: { label: "Lạnh", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

export function RatingBadge({ rating }: { rating?: LeadRating | null }) {
  if (!rating || !RATING_INFO[rating]) {
    return <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">Chưa xếp loại</span>;
  }
  const info = RATING_INFO[rating];
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${info.bg} ${info.text} ${info.border}`}>
      ● {info.label}
    </span>
  );
}
