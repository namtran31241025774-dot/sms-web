import type { CustomerSegment } from "@/lib/services/pricing";

export function CustomerSegmentBadge({ segment }: { segment: CustomerSegment }) {
  const styles: Record<CustomerSegment, { label: string; cls: string }> = {
    ALL: { label: "Toàn bộ phân khúc", cls: "bg-gray-100 text-gray-800" },
    SMB: { label: "Doanh nghiệp vừa và nhỏ (SMB)", cls: "bg-blue-100 text-blue-800" },
    ENTERPRISE: { label: "Doanh nghiệp lớn (Enterprise)", cls: "bg-purple-100 text-purple-800" },
  };

  const item = styles[segment] || { label: segment, cls: "bg-gray-100 text-gray-800" };

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${item.cls}`}>
      {item.label}
    </span>
  );
}
