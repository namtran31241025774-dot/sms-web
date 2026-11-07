import type { ProductType } from "@/lib/services/catalog";
import { PRODUCT_TYPE_LABEL } from "@/lib/services/catalog";

export function ProductTypeBadge({ type }: { type: ProductType }) {
  const styles: Record<ProductType, string> = {
    PACKAGE: "bg-purple-100 text-purple-800 border-purple-200",
    SUBSCRIPTION: "bg-blue-100 text-blue-800 border-blue-200",
    MODULE: "bg-indigo-100 text-indigo-800 border-indigo-200",
    SERVICE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    TRAINING: "bg-amber-100 text-amber-800 border-amber-200",
  };

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${styles[type] || "bg-gray-100 text-gray-800"}`}>
      {PRODUCT_TYPE_LABEL[type] || type}
    </span>
  );
}

export function ProductStatusBadge({ active }: { active: number | boolean }) {
  const isAct = typeof active === "boolean" ? active : active === 1;
  return isAct ? (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Đang kinh doanh
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      Ngừng kinh doanh
    </span>
  );
}
