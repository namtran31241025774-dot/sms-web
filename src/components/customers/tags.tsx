import type { Tag } from "@/lib/services/leads";

export function TagList({ tags }: { tags?: Tag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium text-white shadow-xs"
          style={{ backgroundColor: t.color || "#0078d4" }}
        >
          {t.name}
        </span>
      ))}
    </div>
  );
}
