import { cx } from "@/components/ui";

export function EmployeeStatusBadge({ status, canAccept }: { status: string; canAccept?: number }) {
  let color = "bg-green-100 text-green-800 border-green-200";
  let label = "Đang làm việc";

  if (status === "ON_LEAVE") {
    color = "bg-amber-100 text-amber-800 border-amber-200";
    label = "Nghỉ phép";
  } else if (status === "RESIGNED") {
    color = "bg-gray-100 text-gray-700 border-gray-200";
    label = "Đã nghỉ việc";
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", color)}>
        {label}
      </span>
      {canAccept === 0 && status === "ACTIVE" && (
        <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
          Tạm ngưng nhận việc
        </span>
      )}
    </div>
  );
}

export function WorkItemStatusBadge({ status, type }: { status: string; type?: string }) {
  let color = "bg-blue-100 text-blue-800 border-blue-200";
  let label = "Đang mở";

  if (status === "IN_PROGRESS") {
    color = "bg-indigo-100 text-indigo-800 border-indigo-200";
    label = "Đang thực hiện";
  } else if (status === "DONE") {
    color = "bg-green-100 text-green-800 border-green-200";
    label = "Hoàn thành";
  } else if (status === "CANCELLED") {
    color = "bg-gray-100 text-gray-700 border-gray-200";
    label = "Đã huỷ";
  }

  return (
    <div className="inline-flex items-center gap-1">
      {type === "APPOINTMENT" ? (
        <span className="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
          Lịch hẹn 📅
        </span>
      ) : (
        <span className="rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
          Công việc 📋
        </span>
      )}
      <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", color)}>
        {label}
      </span>
    </div>
  );
}

export function PerformanceRatingBadge({ rating }: { rating: string }) {
  let color = "bg-green-100 text-green-800 border-green-200";
  let label = "Xuất sắc (A)";

  if (rating === "GOOD") {
    color = "bg-blue-100 text-blue-800 border-blue-200";
    label = "Tốt (B)";
  } else if (rating === "AVERAGE") {
    color = "bg-amber-100 text-amber-800 border-amber-200";
    label = "Đạt yêu cầu (C)";
  } else if (rating === "NEEDS_IMPROVEMENT") {
    color = "bg-rose-100 text-rose-800 border-rose-200";
    label = "Cần cải thiện (D)";
  }

  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", color)}>
      {label}
    </span>
  );
}
