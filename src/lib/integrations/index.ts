// Adapter cho hệ thống ngoài ranh giới SMS (System Context F10–F14).
// Hiện là bản giả lập (mock) vì nhà cung cấp chưa được chọn (brief: "provider A").
// Thay bằng adapter thật bằng cách cài đặt cùng interface.
import { normalizeCompany, stripAccents } from "../domain";

// ---------- F12 Maps service ----------
export interface MapsAdapter {
  normalizeAddress(raw: string): { normalized: string; province: string | null; confidence: number };
}

const PROVINCES: [RegExp, string][] = [
  [/(tp\.?\s*)?(ho chi minh|hcm|sai gon|saigon)/, "TP. Hồ Chí Minh"],
  [/ha noi|hanoi/, "Hà Nội"],
  [/da nang/, "Đà Nẵng"],
  [/hai phong/, "Hải Phòng"],
  [/can tho/, "Cần Thơ"],
  [/binh duong/, "Bình Dương"],
  [/dong nai/, "Đồng Nai"],
  [/bac ninh/, "Bắc Ninh"],
];

export const maps: MapsAdapter = {
  normalizeAddress(raw) {
    const cleaned = raw.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
    const key = stripAccents(cleaned.toLowerCase());
    const hit = PROVINCES.find(([re]) => re.test(key));
    if (!hit) return { normalized: cleaned, province: null, confidence: 0.4 };
    const already = stripAccents(hit[1].toLowerCase());
    const normalized = key.includes(already) ? cleaned : `${cleaned}, ${hit[1]}`;
    return { normalized, province: hit[1], confidence: 0.9 };
  },
};

// ---------- F11 Web research ----------
export type ResearchResult = { title: string; snippet: string; source: string };
export interface WebResearchAdapter {
  search(query: string): ResearchResult[];
}

// Dữ liệu nghiên cứu giả lập cho demo — nguồn đánh dấu mock:// để không nhầm là dữ liệu thật.
const MOCK_WEB: Record<string, ResearchResult[]> = {
  "thep nam viet": [
    {
      title: "Thép Nam Việt mở rộng nhà máy Bình Dương",
      snippet: "Doanh nghiệp sản xuất thép xây dựng ~800 nhân sự, đang tuyển 20 nhân viên kinh doanh khu vực miền Nam, kế hoạch số hóa bán hàng năm 2027.",
      source: "mock://web-research/thep-nam-viet/news-1",
    },
  ],
  "duoc pham an khang": [
    {
      title: "Dược phẩm An Khang chọn đối tác ERP",
      snippet: "Công ty phân phối dược ~300 nhân sự, đội trình dược viên 60 người; CIO chia sẻ ưu tiên chuẩn hóa quy trình chăm sóc nhà thuốc trong Q1/2027.",
      source: "mock://web-research/duoc-an-khang/news-1",
    },
  ],
  "logistics song hong": [
    {
      title: "Logistics Sông Hồng tái cấu trúc",
      snippet: "Doanh nghiệp vận tải ~40 nhân sự, đang cắt giảm chi phí vận hành, tạm dừng các dự án CNTT mới đến hết 2026.",
      source: "mock://web-research/song-hong/news-1",
    },
  ],
  "giai phap so minh tam": [
    {
      title: "Minh Tâm Digital gọi vốn Series A",
      snippet: "Công ty dịch vụ CNTT ~150 nhân sự, đội sales B2B 15 người, đang dùng bảng tính để quản lý pipeline; CEO tìm kiếm nền tảng CRM có AI.",
      source: "mock://web-research/minh-tam/news-1",
    },
  ],
};

export const webResearch: WebResearchAdapter = {
  search(query) {
    const q = normalizeCompany(query);
    for (const [key, results] of Object.entries(MOCK_WEB)) {
      if (q.includes(key) || key.includes(q)) return results;
    }
    return [];
  },
};

// ---------- F10 Email / Collaboration ----------
export interface EmailAdapter {
  send(msg: { to: string; subject: string; body: string }): { providerRef: string };
}

export const email: EmailAdapter = {
  send(msg) {
    // Giả lập: không gửi ra ngoài, chỉ trả mã tham chiếu.
    console.info(`[email-mock] -> ${msg.to}: ${msg.subject}`);
    return { providerRef: `mock-mail-${Date.now()}` };
  },
};

// ---------- F13 ERP / Finance ----------
export interface ErpAdapter {
  pushInvoice(inv: { code: string; amount: number; orderCode: string }): { erpRef: string };
  syncAccountingTransactions(since?: string): Array<{
    externalTransactionId: string;
    accountCode: string;
    amount: number;
    reference: string;
    paidAt: string;
  }>;
}

export const erp: ErpAdapter = {
  pushInvoice(inv) {
    console.info(`[erp-mock] invoice ${inv.code} (${inv.amount})`);
    return { erpRef: `ERP-${inv.code}` };
  },
  syncAccountingTransactions() {
    console.info("[erp-mock] sync transactions");
    return [];
  },
};

// ---------- F14 Provisioning / Delivery ----------
export interface ProvisioningAdapter {
  requestFulfillment(order: { code: string; lines: { product: string; quantity: number }[] }): { ticket: string };
}

export const provisioning: ProvisioningAdapter = {
  requestFulfillment(order) {
    console.info(`[provisioning-mock] order ${order.code}, ${order.lines.length} dòng`);
    return { ticket: `PRV-${order.code}` };
  },
};

// ---------- F15 E-Signature (FR-55, DEC-13) ----------
export * from "./esign";

// ---------- F16 Payment Gateway (FR-70, DEC-13) ----------
export * from "./payment-gateway";
