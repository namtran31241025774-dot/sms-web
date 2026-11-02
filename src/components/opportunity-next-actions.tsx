import { createElement } from "react";
import { ROLE_LABEL, type Role } from "@/lib/domain";

type NextAction = { action: string; owner_role?: string; why?: string };

export function OpportunityNextActions({ serialized }: { serialized: string }) {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return createElement("p", { className: "text-ink-3" }, "Không đọc được hành động đề xuất.");
  }
  const actions: NextAction[] = Array.isArray(raw)
    ? raw.flatMap((item: unknown): NextAction[] => {
        // Older research rows contain strings; current Agent results contain objects.
        if (typeof item === "string") return item.trim() ? [{ action: item }] : [];
        if (!item || typeof item !== "object" || !("action" in item) || typeof item.action !== "string" || !item.action.trim()) return [];
        return [{
          action: item.action,
          owner_role: "owner_role" in item && typeof item.owner_role === "string" ? item.owner_role : undefined,
          why: "why" in item && typeof item.why === "string" ? item.why : undefined,
        }];
      }).slice(0, 3)
    : [];

  if (!actions.length) return createElement("p", { className: "text-ink-3" }, "Chưa có hành động ưu tiên.");
  return createElement("ol", { className: "list-decimal space-y-2 pl-5" },
    ...actions.map((item, index) => createElement("li", { key: index },
      createElement("div", null, item.action),
      item.owner_role ? createElement("div", { className: "text-xs text-ink-3" }, "Vai trò đề xuất: ", ROLE_LABEL[item.owner_role as Role] ?? item.owner_role) : null,
      item.why ? createElement("div", { className: "text-xs text-ink-2" }, "Lý do: ", item.why) : null,
    )),
  );
}
