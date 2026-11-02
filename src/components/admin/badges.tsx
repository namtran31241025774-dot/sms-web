import type { Role } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain";

export function RoleBadge({ role }: { role: Role }) {
  const colorMap: Record<Role, string> = {
    ADMIN: "bg-purple-100 text-purple-800 border-purple-300",
    SALES_MANAGER: "bg-blue-100 text-blue-800 border-blue-300",
    SALES: "bg-emerald-100 text-emerald-800 border-emerald-300",
    PRESALES: "bg-cyan-100 text-cyan-800 border-cyan-300",
    FINANCE: "bg-amber-100 text-amber-800 border-amber-300",
    DELIVERY: "bg-teal-100 text-teal-800 border-teal-300",
  };

  const style = colorMap[role] || "bg-gray-100 text-gray-800 border-gray-300";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style}`}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

export function UserStatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" | "SUSPENDED" }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
        Đang hoạt động
      </span>
    );
  }

  if (status === "SUSPENDED") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
        Đã khóa
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-300">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1.5" />
      Ngưng hoạt động
    </span>
  );
}
