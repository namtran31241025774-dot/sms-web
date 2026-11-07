"use client";

interface LeadFilterBarProps {
  currentSource: string;
  currentTag: string;
  sources: Record<string, string>;
  tags: { id: number; name: string }[];
}

export function LeadFilterBar({
  currentSource,
  currentTag,
  sources,
  tags,
}: LeadFilterBarProps) {
  const handleChange = (key: "source" | "tag", value: string) => {
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    window.location.href = url.toString();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 bg-surface p-3 rounded border border-stroke text-sm">
      <span className="font-semibold text-xs text-ink-3">Lọc thêm:</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ink-3">Nguồn:</span>
        <select
          className="select !h-7 !py-0 !text-xs"
          value={currentSource}
          onChange={(e) => handleChange("source", e.target.value)}
        >
          <option value="">Tất cả nguồn</option>
          {Object.entries(sources).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-3">Nhãn (Tag):</span>
          <select
            className="select !h-7 !py-0 !text-xs"
            value={currentTag}
            onChange={(e) => handleChange("tag", e.target.value)}
          >
            <option value="">Tất cả nhãn</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
