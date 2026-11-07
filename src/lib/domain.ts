// Hằng số nghiệp vụ, nhãn tiếng Việt và quy tắc thuần (không truy cập DB).

export class DomainError extends Error {}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new DomainError(message);
}

export type Role =
  | "SALES"
  | "PRESALES"
  | "SALES_MANAGER"
  | "FINANCE"
  | "DELIVERY"
  | "ADMIN";

export const ROLE_LABEL: Record<Role, string> = {
  SALES: "Nhân viên kinh doanh",
  PRESALES: "Chuyên viên tư vấn giải pháp",
  SALES_MANAGER: "Quản lý kinh doanh",
  FINANCE: "Nhân viên Tài chính – Kế toán",
  DELIVERY: "Nhân viên triển khai kỹ thuật",
  ADMIN: "Người quản trị hệ thống",
};

export const LEAD_STATUS: Record<string, string> = {
  OPEN: "Mới",
  WORKING: "Đang đánh giá",
  CONVERTED: "Đã chuyển đổi",
  DISQUALIFIED: "Đã loại",
};

export const LEAD_SOURCE: Record<string, string> = {
  MANUAL: "Nhập tay",
  WEBSITE: "Website",
  IMPORT: "Import",
  MARKETING: "Marketing",
  REFERRAL: "Giới thiệu",
};

/** Nhãn giai đoạn cơ hội theo bài (DEC-19) */
export const OPP_STAGE: Record<string, string> = {
  DEVELOP: "Phát triển cơ hội",
  PROPOSE: "Đề xuất giải pháp",
  CLOSE: "Tạo đơn hàng",
  WON: "Thành công",
  LOST: "Thất bại",
};

/** Quy trình 5 bước tổng thể (DEC-19) */
export const PROCESS_STAGE: Record<string, string> = {
  QUALIFY: "Đánh giá khách hàng",
  DEVELOP: "Phát triển cơ hội",
  PROPOSE: "Đề xuất giải pháp",
  CLOSE: "Tạo đơn hàng",
  FULFILL: "Theo dõi hóa đơn và thanh toán",
};

export const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt giá",
  APPROVED: "Đã duyệt",
  SENT: "Đã gửi khách",
  ACCEPTED: "Khách chấp thuận",
  REJECTED: "Khách từ chối",
  DECLINED: "Từ chối",
  SUPERSEDED: "Đã thay thế",
  EXPIRED: "Hết hiệu lực",
};

export const PROPOSAL_STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi khách",
  ACCEPTED: "Khách chấp thuận",
  SUPERSEDED: "Đã thay thế",
};

export const SIGNATURE_STATUS: Record<string, string> = {
  PENDING: "Chờ ký",
  SIGNED: "Đã ký",
  DECLINED: "Từ chối ký",
  EXPIRED: "Hết hạn ký",
};

export const ORDER_STATUS: Record<string, string> = {
  ACTIVE: "Đã tạo",
  IN_FULFILLMENT: "Đang thực hiện",
  FULFILLED: "Hoàn tất bàn giao",
  CANCELLED: "Đã hủy",
};

export const BILLING_MILESTONE_STATUS: Record<string, string> = {
  PENDING: "Chờ xuất hóa đơn",
  INVOICED: "Đã xuất hóa đơn",
  PAID: "Đã thanh toán",
};

export const HANDOVER_STATUS: Record<string, string> = {
  PENDING: "Chờ bàn giao",
  IN_PROGRESS: "Đang bàn giao",
  COMPLETED: "Đã bàn giao",
};

export const HANDOVER_ITEM_CATEGORY: Record<string, string> = {
  LICENSE: "Bản quyền & Giấy phép",
  DEPLOYMENT: "Triển khai & Cấu hình",
  TRAINING: "Đào tạo & Hướng dẫn",
  DOCUMENTATION: "Tài liệu bàn giao",
};

export const HANDOVER_ITEM_STATUS: Record<string, string> = {
  PENDING: "Chưa nghiệm thu",
  IN_PROGRESS: "Đang nghiệm thu",
  ACCEPTED: "Đã nghiệm thu",
  REJECTED: "Cần xử lý lại",
};

export const INVOICE_STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  ISSUED: "Đã phát hành",
  PARTIALLY_PAID: "Thanh toán một phần",
  PAID: "Đã thanh toán",
  CANCELLED: "Đã hủy",
};

export const TASK_TYPE: Record<string, string> = {
  LICENSE: "Cấp quyền / license",
  DEPLOYMENT: "Triển khai / cấu hình",
  TRAINING: "Đào tạo",
};

export const TASK_STATUS: Record<string, string> = {
  PENDING: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
};

export const STAKEHOLDER_ROLE: Record<string, string> = {
  DECISION_MAKER: "Người quyết định",
  INFLUENCER: "Người ảnh hưởng",
  CHAMPION: "Người ủng hộ",
  BLOCKER: "Người cản trở",
  USER: "Người dùng",
  SPONSOR: "Nhà tài trợ ngân sách",
  GATEKEEPER: "Người gác cổng",
};

export const RISK_STATUS: Record<string, string> = {
  OPEN: "Chưa xử lý",
  MITIGATED: "Đã giảm thiểu",
  RESOLVED: "Đã giải quyết",
  DISMISSED: "Bỏ qua",
};

export const LEVEL: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao" };

export const APPROVAL_KIND: Record<string, string> = {
  QUOTE_DISCOUNT: "Duyệt chiết khấu báo giá",
  OPP_STAGE_GATE: "Rà soát chuyển Develop → Propose",
  LEGAL_REVIEW: "Rà soát điều khoản",
  EXPERT_REVIEW: "Rà soát chuyên môn giải pháp",
};

export const SUGGESTION_KIND: Record<string, string> = {
  ENRICHMENT: "Làm giàu dữ liệu",
  BANT_SCORE: "Chấm điểm BANT",
  EMAIL_DRAFT: "Email nháp",
  DISQUALIFY: "Đề xuất loại Lead",
  CONVERSION: "Đề xuất chuyển đổi",
};

export const DISQUALIFY_REASONS = [
  "Không có ngân sách",
  "Không đúng khách hàng mục tiêu (TCP)",
  "Không liên lạc được",
  "Đã chọn nhà cung cấp khác",
  "Nhu cầu không phù hợp sản phẩm",
  "Trùng lặp với bản ghi khác",
  "Khác",
];

export const LOST_REASONS_BR27 = [
  "Mất vào đối thủ",
  "Không có ngân sách",
  "Khách hoãn hoặc dừng dự án",
  "Không đáp ứng yêu cầu",
  "Bàn giao sai chuẩn từ bước đánh giá",
  "Khác",
] as const;

export const LOST_REASONS = [
  ...LOST_REASONS_BR27,
  "Thua đối thủ",
  "Giá không phù hợp",
  "Khách hoãn dự án",
  "Không đáp ứng yêu cầu kỹ thuật",
  "Mất liên lạc",
];

// ===== Chuẩn hóa & kiểm tra trùng =====

const COMPANY_NOISE = /\b(cong ty|cty|co phan|cp|tnhh|mtv|jsc|ltd|llc|corp|corporation|group|tap doan|viet nam|vietnam)\b/g;

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export function normalizeCompany(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(email?: string | null): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  return p || null;
}

export function emailDomain(email?: string | null): string | null {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return null;
  const d = e.split("@")[1];
  const freemail = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];
  return freemail.includes(d) ? null : d;
}

// ===== BANT =====
// Mỗi tiêu chí 0–25 điểm, tổng 0–100. Ngưỡng đạt chuẩn cấu hình trong settings (bant_threshold).
export const BANT_KEYS = ["budget", "authority", "need", "timeline"] as const;
export type BantKey = (typeof BANT_KEYS)[number];

// Thang chấm BANT đã chốt (DEC-31, BR-01). Chọn mức gần nhất với thông tin đang có.
export const BANT_SCALE: Record<BantKey, string> = {
  budget: "0: không có thông tin · 8: có nói đến, chưa rõ số · 15: có khoảng ngân sách · 25: đã được duyệt",
  authority: "0: chưa rõ người quyết định · 8: mới gặp người dùng cuối · 15: gặp người ảnh hưởng · 25: gặp đúng người quyết định",
  need: "0: chưa rõ nhu cầu · 8: chung chung · 15: nêu được vấn đề cụ thể · 25: rõ vấn đề và phạm vi",
  timeline: "0: chưa rõ · 8: năm sau · 15: trong năm nay · 25: trong tháng hoặc cuối quý",
};
export const BANT_LABEL: Record<BantKey, string> = {
  budget: "Budget – Ngân sách",
  authority: "Authority – Thẩm quyền",
  need: "Need – Nhu cầu",
  timeline: "Timeline – Thời điểm",
};

export function clampBant(v: number): number {
  return Math.max(0, Math.min(25, Math.round(v)));
}

export function bantScore(b: Record<BantKey, number>): number {
  return BANT_KEYS.reduce((s, k) => s + clampBant(b[k]), 0);
}

// ===== Giá =====
export function lineTotal(quantity: number, unitPrice: number, discountPct: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPct / 100));
}

// ===== Develop checklist =====
// GIẢ ĐỊNH: brief nêu "bốn mục kiểm soát" của Develop nhưng chưa liệt kê tên; chọn 4 mục
// theo các bước được mô tả: Nhu cầu, Giải pháp đề xuất, Stakeholders, Đối thủ.
export const DEVELOP_CHECKLIST = [
  { key: "need_confirmed", label: "Customer Need đã khảo sát & xác nhận" },
  { key: "solution_confirmed", label: "Proposed Solution đã được Chuyên viên tư vấn giải pháp xác nhận" },
  { key: "stakeholders_confirmed", label: "Đã xác định stakeholders (có người quyết định)" },
  { key: "competitors_confirmed", label: "Đã xác định đối thủ cạnh tranh" },
] as const;

export type ChecklistKey = (typeof DEVELOP_CHECKLIST)[number]["key"];

export function formatVnd(n: number | null | undefined): string {
  return new Intl.NumberFormat("vi-VN").format(Number(n ?? 0)) + " ₫";
}

export function formatDate(s: string | null | undefined, withTime = false): string {
  if (!s) return "—";
  // SQLite datetime('now') lưu UTC dạng "YYYY-MM-DD HH:MM:SS"
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(d);
}
