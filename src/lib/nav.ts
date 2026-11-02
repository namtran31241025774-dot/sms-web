import type { Role } from "./domain";
import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles?: readonly Role[];
  badgeKey?: "ai" | "approvals";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Danh mục điều hướng phân nhóm toàn hệ thống (WP-00).
 * Mỗi WP khác khi thêm trang chỉ thêm một dòng vào nhóm tương ứng.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Của tôi",
    items: [
      {
        href: "/",
        label: "Trang chủ",
        icon: "home",
      },
      {
        href: "/agents",
        label: "AI Agent",
        icon: "bot",
      },
      {
        href: "/ai-review",
        label: "Kiểm duyệt AI",
        icon: "sparkle",
        roles: ["SALES", "SALES_MANAGER", "PRESALES"],
        badgeKey: "ai",
      },
      {
        href: "/approvals",
        label: "Phê duyệt",
        icon: "approval",
        roles: ["SALES_MANAGER"],
        badgeKey: "approvals",
      },
    ],
  },
  {
    label: "Bán hàng",
    items: [
      {
        href: "/leads",
        label: "Leads",
        icon: "lead",
        roles: ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE"],
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        icon: "opportunity",
        roles: ["SALES", "SALES_MANAGER", "PRESALES"],
      },
      {
        href: "/quotes",
        label: "Báo giá",
        icon: "quote",
        roles: ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE"],
      },
      {
        href: "/accounts",
        label: "Accounts",
        icon: "account",
        roles: ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE"],
      },
      {
        href: "/contacts",
        label: "Contacts",
        icon: "contact",
        roles: ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE"],
      },
      {
        href: "/reports",
        label: "Báo cáo & Dự báo",
        icon: "opportunity",
        roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      },
    ],
  },
  {
    label: "Thực hiện & thu tiền",
    items: [
      {
        href: "/orders",
        label: "Orders",
        icon: "order",
        roles: ["SALES", "SALES_MANAGER", "DELIVERY", "FINANCE"],
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: "invoice",
        roles: ["SALES", "SALES_MANAGER", "FINANCE"],
      },
    ],
  },
  {
    label: "Danh mục & Đội ngũ",
    items: [
      {
        href: "/catalog",
        label: "Sản phẩm & bảng giá",
        icon: "product",
        roles: ["SALES", "PRESALES", "SALES_MANAGER", "FINANCE"],
      },
      {
        href: "/team",
        label: "Đội ngũ Sales",
        icon: "people",
        roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      {
        href: "/admin/ai",
        label: "Quản trị AI Agent",
        icon: "bot",
        roles: ["ADMIN", "SALES_MANAGER"],
      },
      {
        href: "/admin",
        label: "Quản trị hệ thống",
        icon: "settings",
        roles: ["ADMIN", "SALES_MANAGER"],
      },
    ],
  },
] as const;

/**
 * Lọc các mục menu phù hợp với vai trò của người dùng.
 */
export function getNavForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
