import type { Role } from "./domain";

// Ma trận phân quyền theo vai trò (đặc tả tại docs/requirements/ROLES.md).
// Kiểm tra ở server trong mọi Server Action và Route Handler.
const MATRIX = {
  // 1.0 Khách hàng, Doanh nghiệp, Người liên hệ
  "lead.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "lead.write": ["SALES", "SALES_MANAGER"],
  "lead.qualify": ["SALES", "SALES_MANAGER"],
  "lead.convert": ["SALES", "SALES_MANAGER"],
  "lead.disqualify": ["SALES", "SALES_MANAGER"],
  "lead.merge.request": ["SALES", "SALES_MANAGER"],
  "lead.merge.approve": ["SALES_MANAGER"],
  "account.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "account.write": ["SALES", "SALES_MANAGER"],
  "contact.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "contact.write": ["SALES", "SALES_MANAGER"],

  // 2.0 Danh mục, Sản phẩm, Bảng giá, Chiết khấu
  "catalog.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "catalog.write": ["PRESALES", "PRESALES_MANAGER", "SALES_MANAGER"],
  "pricelist.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "pricelist.write": ["SALES_MANAGER"],
  "discount.policy.write": ["SALES_MANAGER"],

  // 3.0 Cơ hội bán hàng & Báo giá
  "opp.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER"],
  "opp.write": ["SALES", "SALES_MANAGER"],
  "opp.solution": ["PRESALES", "SALES_MANAGER"],
  "opp.stage": ["SALES", "SALES_MANAGER"],
  "opp.expert_review": ["PRESALES_MANAGER"],
  "opp.manager_review": ["SALES_MANAGER"],
  "opp.reopen": ["SALES_MANAGER"],
  "quote.read": ["SALES", "PRESALES", "PRESALES_MANAGER", "SALES_MANAGER", "FINANCE"],
  "quote.write": ["SALES", "SALES_MANAGER"],
  "quote.approve": ["SALES_MANAGER"],
  "quote.send": ["SALES", "SALES_MANAGER"],

  // 4.0 Đơn hàng
  "order.read": ["SALES", "PRESALES", "SALES_MANAGER", "FINANCE"],
  "order.create": ["SALES", "SALES_MANAGER"],
  "order.create_direct": ["SALES_MANAGER"],
  "order.write": ["SALES", "SALES_MANAGER"],
  "fulfillment.update": ["SALES", "SALES_MANAGER"],

  // 5.0 Hoá đơn & Thanh toán
  "invoice.read": ["SALES", "SALES_MANAGER", "FINANCE"],
  "invoice.create": ["FINANCE"],
  "invoice.write": ["FINANCE"],
  "invoice.finance": ["FINANCE"],
  "payment.read": ["SALES", "SALES_MANAGER", "FINANCE"],
  "payment.write": ["FINANCE"],

  // 6.0 Đội ngũ & Phân công
  "team.read": ["SALES", "PRESALES", "SALES_MANAGER", "ADMIN"],
  "team.write": ["SALES_MANAGER", "ADMIN"],
  "task.read": ["SALES", "PRESALES", "SALES_MANAGER"],
  "task.write": ["SALES", "PRESALES", "SALES_MANAGER"],

  // 7.1 AI Agent
  "ai.run": ["SALES", "SALES_MANAGER"],
  "ai.review": ["SALES", "SALES_MANAGER"],
  "ai.proposal.view": ["SALES", "PRESALES", "SALES_MANAGER"],
  "ai.proposal.review": ["SALES", "SALES_MANAGER"],
  "ai.config.read": ["SALES_MANAGER", "ADMIN", "AI_MANAGER"],
  "ai.config.write": ["AI_MANAGER"],
  "ai.config.approve": ["SALES_MANAGER"],
  "ai.config.manage": ["AI_MANAGER"],
  "ai.monitor.read": ["SALES_MANAGER", "AI_MANAGER"],
  "ai.feedback": ["SALES", "PRESALES", "SALES_MANAGER"],
  "ai.admin.security": ["ADMIN"],
  "ai.report.read": ["SALES_MANAGER", "AI_MANAGER"],

  // 7.2 Quản trị hệ thống & Báo cáo
  "admin.users": ["ADMIN"],
  "admin.permissions": ["ADMIN"],
  "admin.scope": ["ADMIN"],
  "admin.settings": ["ADMIN"],
  "admin.logs": ["ADMIN", "SALES_MANAGER", "AI_MANAGER"],
  "report.funnel": ["SALES", "SALES_MANAGER"],

  // Tương thích ngược
  "approval.manager": ["SALES_MANAGER"],
  "approval.legal": ["LEGAL"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role, permission: Permission): boolean {
  const allowed = MATRIX[permission] as readonly Role[] | undefined;
  if (!allowed) return false;
  return allowed.includes(role);
}

export const PERMISSION_MATRIX = MATRIX;
