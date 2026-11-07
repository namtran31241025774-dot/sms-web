import { stripAccents } from "../domain";

export interface QuotePdfData {
  quoteCode: string;
  versionNo: number;
  customerName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  opportunityCode: string;
  currency: string;
  validUntil?: string | null;
  createdAt: string;
  lines: Array<{
    productCode: string;
    productName: string;
    productType?: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discountPct: number;
    taxPct: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
}

export interface ProposalPdfData {
  proposalCode: string;
  title: string;
  customerName: string;
  opportunityCode: string;
  solutionSummary?: string | null;
  scopeDescription?: string | null;
  timelineText?: string | null;
  deliverablesText?: string | null;
  assumptions?: string | null;
  createdAt: string;
}

/**
 * Tạo tài liệu PDF chuẩn 1.4 thuần túy trong Node.js, không phụ thuộc thư viện ngoài.
 */
export function generateQuotePdf(data: QuotePdfData): Buffer {
  const linesContent: string[] = [];
  let y = 720;

  function addText(text: string, size = 10, offsetLeft = 50, isBold = false) {
    const safeText = stripAccents(text).replace(/[\r\n]+/g, " ").replace(/[()\\]/g, "\\$&");
    const font = isBold ? "/F2" : "/F1";
    linesContent.push(`BT ${font} ${size} Tf ${offsetLeft} ${y} Td (${safeText}) Tj ET`);
    y -= size + 5;
  }

  // Tiêu đề
  addText("CONG TY CONG NGHE B2B SAAS VIET NAM", 12, 50, true);
  addText("HE THONG QUAN LY BAN HANG (SMS - SALES MANAGEMENT SYSTEM)", 9, 50);
  y -= 10;
  addText(`BAO GIA KINH DOANH: ${data.quoteCode} (Phien ban v${data.versionNo})`, 16, 50, true);
  y -= 10;

  // Thông tin chung
  addText(`Khach hang: ${data.customerName}`, 10, 50, true);
  if (data.contactName) {
    addText(`Nguoi lien he: ${data.contactName} (${data.contactEmail || "Chua co email"})`, 10, 50);
  }
  addText(`Ma co hoi: ${data.opportunityCode} | Ngay lap: ${data.createdAt.slice(0, 10)} | Hieu luc den: ${data.validUntil || "30 ngay"}`, 10, 50);
  y -= 15;

  // Header bảng sản phẩm
  addText("--------------------------------------------------------------------------------------------------------", 9, 50);
  addText("STT   San pham / Dich vu                SL   DVT        Don gia       CK(%)   Thue(%)        Thanh tien", 9, 50, true);
  addText("--------------------------------------------------------------------------------------------------------", 9, 50);

  // Chi tiết từng dòng
  data.lines.forEach((l, idx) => {
    const num = String(idx + 1).padEnd(4, " ");
    const name = stripAccents(l.productName).slice(0, 28).padEnd(30, " ");
    const qty = String(l.quantity).padStart(3, " ");
    const unit = stripAccents(l.unit || "goi").slice(0, 6).padEnd(8, " ");
    const price = l.unitPrice.toLocaleString("en-US").padStart(14, " ");
    const disc = `${l.discountPct}%`.padStart(7, " ");
    const tax = `${l.taxPct}%`.padStart(7, " ");
    const total = l.lineTotal.toLocaleString("en-US").padStart(16, " ");

    addText(`${num} ${name} ${qty} ${unit} ${price} ${disc} ${tax} ${total} ${data.currency}`, 8, 50);
  });

  addText("--------------------------------------------------------------------------------------------------------", 9, 50);
  y -= 10;

  // Tổng kết tài chính
  addText(`Tam tinh:       ${data.subtotal.toLocaleString("en-US")} ${data.currency}`, 10, 320);
  addText(`Chiet khau:    -${data.discountTotal.toLocaleString("en-US")} ${data.currency}`, 10, 320);
  addText(`Thue GTGT:     +${data.taxAmount.toLocaleString("en-US")} ${data.currency}`, 10, 320);
  addText(`TONG CONG:      ${data.total.toLocaleString("en-US")} ${data.currency}`, 12, 320, true);
  y -= 15;

  // Ghi chú & Điều khoản
  if (data.notes) {
    addText("Ghi chu va dieu khoan thuong mai:", 10, 50, true);
    addText(data.notes.slice(0, 300), 9, 50);
    y -= 10;
  }

  addText("Dai dien Ban hang                                                    Dai dien Khach hang", 10, 80, true);
  addText("(Ky, ghi ro ho ten)                                                  (Ky, ghi ro ho ten)", 9, 80);

  return buildPdfDocument(linesContent.join("\n"));
}

/**
 * Tạo tài liệu PDF cho Bản đề xuất giải pháp (FR-48)
 */
export function generateProposalPdf(data: ProposalPdfData): Buffer {
  const linesContent: string[] = [];
  let y = 720;

  function addText(text: string, size = 10, offsetLeft = 50, isBold = false) {
    const safeText = stripAccents(text).replace(/[\r\n]+/g, " ").replace(/[()\\]/g, "\\$&");
    const font = isBold ? "/F2" : "/F1";
    linesContent.push(`BT ${font} ${size} Tf ${offsetLeft} ${y} Td (${safeText}) Tj ET`);
    y -= size + 5;
  }

  addText("CONG TY CONG NGHE B2B SAAS VIET NAM", 12, 50, true);
  addText("HE THONG QUAN LY BAN HANG (SMS)", 9, 50);
  y -= 10;
  addText(`DE XUAT GIAI PHAP: ${data.title.toUpperCase()}`, 15, 50, true);
  addText(`Ma ho so: ${data.proposalCode} | Khach hang: ${data.customerName} | Co hoi: ${data.opportunityCode}`, 10, 50);
  y -= 15;

  if (data.solutionSummary) {
    addText("1. TONG QUAN PHUONG AN GIAI PHAP", 11, 50, true);
    addText(data.solutionSummary.slice(0, 400), 9, 50);
    y -= 10;
  }

  if (data.scopeDescription) {
    addText("2. PHAM VI DUNG VA TINH NANG TRIEN KHAI", 11, 50, true);
    addText(data.scopeDescription.slice(0, 400), 9, 50);
    y -= 10;
  }

  if (data.timelineText) {
    addText("3. LO TRINH TRIEN KHAI DU KIEN", 11, 50, true);
    addText(data.timelineText.slice(0, 300), 9, 50);
    y -= 10;
  }

  if (data.deliverablesText) {
    addText("4. KET QUA BAN GIAO VA HO TRO", 11, 50, true);
    addText(data.deliverablesText.slice(0, 300), 9, 50);
    y -= 10;
  }

  if (data.assumptions) {
    addText("5. RANG BUOC VA GIA DINH KY THUAT", 11, 50, true);
    addText(data.assumptions.slice(0, 300), 9, 50);
    y -= 15;
  }

  addText("Dai dien Don vi Tu van                                               Xac nhan cua Khach hang", 10, 80, true);
  addText("(Ky ten & Dong dau)                                                  (Ky ten & Dong dau)", 9, 80);

  return buildPdfDocument(linesContent.join("\n"));
}

/**
 * Đóng gói luồng nội dung vào cấu trúc PDF 1.4 nhị phân hợp lệ.
 */
function buildPdfDocument(streamContent: string): Buffer {
  const contentBytes = Buffer.from(streamContent, "utf-8");

  const objects: string[] = [
    // 1 0 obj: Catalog
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    // 2 0 obj: Pages
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    // 3 0 obj: Page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    // 4 0 obj: Contents stream
    `4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    // 5 0 obj: Regular Font
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    // 6 0 obj: Bold Font
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  ];

  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let currentOffset = Buffer.byteLength(header, "utf-8");

  const objBuffers: Buffer[] = [];
  for (const obj of objects) {
    offsets.push(currentOffset);
    const buf = Buffer.from(obj, "utf-8");
    objBuffers.push(buf);
    currentOffset += buf.length;
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return Buffer.concat([
    Buffer.from(header, "utf-8"),
    ...objBuffers,
    Buffer.from(xref, "utf-8"),
    Buffer.from(trailer, "utf-8"),
  ]);
}
