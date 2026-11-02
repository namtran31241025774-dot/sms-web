import { DomainError } from "../domain";
import { assertActorAccess } from "./access";
// Giai đoạn PROPOSE: Báo giá, kiểm tra chiết khấu, phê duyệt khi vượt thẩm quyền,
// thương lượng phiên bản (DEC-22), xuất PDF, gửi email, tra cứu hiệu lực (BR-09), ký điện tử (FR-55).
import { all, get, nextCode, run, tx } from "../db";
import { assert, lineTotal } from "../domain";
import type { UserScope } from "../scope";
import { recordVisible } from "./access";
import { email, esign } from "../integrations";
import { generateQuotePdf } from "../pdf";
import { requestApproval } from "./approvals";
import { actorUserId, addActivity, audit, settingNumber, type Actor } from "./core";
import { getOpportunity, moveStage } from "./opportunities";
import { checkDiscount, priceFor } from "./pricing";
import {can} from '../rbac';

export type QuoteStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "SUPERSEDED"
  | "EXPIRED";

export interface Quote {
  id: number;
  code: string;
  opportunity_id: number;
  opportunity_code?: string;
  account_id: number;
  account_name?: string;
  revision: number; // Tương thích ngược với schema cũ (phiên bản mới nhất)
  status: QuoteStatus; // Trạng thái của phiên bản mới nhất
  price_list_id: number;
  currency: string;
  subtotal: number;
  discount_total: number;
  total: number;
  max_discount_pct: number;
  valid_until: string | null;
  notes: string | null;
  customer_response_note: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteVersion {
  id: number;
  quote_id: number;
  quote_code?: string;
  version_no: number;
  status: QuoteStatus;
  price_list_id: number;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_amount: number;
  total: number;
  max_discount_pct: number;
  valid_until: string | null;
  notes: string | null;
  customer_response_note: string | null;
  created_by: number;
  created_by_name?: string | null;
  approved_by: number | null;
  approved_by_name?: string | null;
  approved_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLine {
  id: number;
  quote_id: number;
  quote_version_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_type: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  license_count: number | null;
  term_months: number | null;
}

export interface QuoteResponseRecord {
  respondent_name:string|null;
  id: number;
  quote_version_id: number;
  response_type: "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED";
  contact_id: number | null;
  contact_name?: string | null;
  notes: string | null;
  responded_at: string;
  created_by: number | null;
}

export interface QuoteSignatureRecord {
  id: number;
  quote_version_id: number;
  external_reference: string;
  provider: string;
  status: "PENDING" | "SIGNED" | "DECLINED" | "EXPIRED";
  sign_url: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  signed_at: string | null;
  created_at: string;
}

// ===== Truy vấn cơ sở dữ liệu =====

const SELECT_QUOTE = `
  SELECT q.*, o.code AS opportunity_code, a.name AS account_name, u.name AS approved_by_name
  FROM quotes q
  JOIN opportunities o ON o.id = q.opportunity_id
  JOIN accounts a ON a.id = q.account_id
  LEFT JOIN users u ON u.id = q.approved_by
`;

const SELECT_VERSION = `
  SELECT qv.*, q.code AS quote_code, u1.name AS created_by_name, u2.name AS approved_by_name
  FROM quote_versions qv
  JOIN quotes q ON q.id = qv.quote_id
  LEFT JOIN users u1 ON u1.id = qv.created_by
  LEFT JOIN users u2 ON u2.id = qv.approved_by
`;

export function getQuote(id: number, user?:UserScope): Quote | undefined {
  if(user && !recordVisible(user,'quote',id)) return undefined;
  return get<Quote>(`${SELECT_QUOTE} WHERE q.id = ?`, id);
}

export function getQuoteByCode(code: string): Quote | undefined {
  return get<Quote>(`${SELECT_QUOTE} WHERE q.code = ?`, code);
}

export function getQuoteVersion(versionId: number): QuoteVersion | undefined {
  return get<QuoteVersion>(`${SELECT_VERSION} WHERE qv.id = ?`, versionId);
}

export function getLatestQuoteVersion(quoteId: number): QuoteVersion | undefined {
  return get<QuoteVersion>(`${SELECT_VERSION} WHERE qv.quote_id = ? ORDER BY qv.version_no DESC LIMIT 1`, quoteId);
}

export function quoteVersions(quoteId: number): QuoteVersion[] {
  return all<QuoteVersion>(`${SELECT_VERSION} WHERE qv.quote_id = ? ORDER BY qv.version_no DESC`, quoteId);
}

export function quoteLines(versionOrQuoteId: number): QuoteLine[] {
  // Ưu tiên tìm theo quote_version_id (chuẩn mới)
  const byVersion = all<QuoteLine>(
    `SELECT ql.*, p.code AS product_code, p.name AS product_name, p.type AS product_type, p.unit
     FROM quote_lines ql
     JOIN products p ON p.id = ql.product_id
     WHERE ql.quote_version_id = ?
     ORDER BY ql.id`,
    versionOrQuoteId,
  );
  if (byVersion.length > 0) return byVersion;

  // Tương thích ngược: tìm theo quote_id nếu không có quote_version_id
  return all<QuoteLine>(
    `SELECT ql.*, p.code AS product_code, p.name AS product_name, p.type AS product_type, p.unit
     FROM quote_lines ql
     JOIN products p ON p.id = ql.product_id
     WHERE ql.quote_id = ? AND ql.quote_version_id IS NULL
     ORDER BY ql.id`,
    versionOrQuoteId,
  );
}

export function quoteResponses(versionId: number): QuoteResponseRecord[] {
  return all<QuoteResponseRecord>(
    `SELECT qr.*, c.full_name AS contact_name
     FROM quote_responses qr
     LEFT JOIN contacts c ON c.id = qr.contact_id
     WHERE qr.quote_version_id = ?
     ORDER BY qr.id DESC`,
    versionId,
  );
}

export function quoteSignatures(versionId: number): QuoteSignatureRecord[] {
  return all<QuoteSignatureRecord>(
    `SELECT qs.* FROM quote_signatures qs WHERE qs.quote_version_id = ? ORDER BY qs.id DESC`,
    versionId,
  );
}

export function quotesOf(oppId: number): Quote[] {
  return all<Quote>(
    `${SELECT_QUOTE} WHERE q.opportunity_id = ? ORDER BY q.revision DESC, q.id DESC`,
    oppId,
  );
}

export function listQuotes(filter: {
  search?: string;
  status?: string;
  opportunityId?: number;
  accountId?: number;
  expiredOnly?: boolean;
  user?:UserScope;
} = {}): Quote[] {
  const conds: string[] = [];
  const params: (string | number | null)[] = [];

  if (filter.search?.trim()) {
    const s = `%${filter.search.trim()}%`;
    conds.push("(q.code LIKE ? OR a.name LIKE ? OR o.code LIKE ?)");
    params.push(s, s, s);
  }
  if (filter.status) {
    conds.push("q.status = ?");
    params.push(filter.status);
  }
  if (filter.opportunityId) {
    conds.push("q.opportunity_id = ?");
    params.push(filter.opportunityId);
  }
  if (filter.accountId) {
    conds.push("q.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.expiredOnly) {
    conds.push("q.valid_until < date('now') AND q.status NOT IN ('ACCEPTED','SUPERSEDED')");
  }

  const whereClause = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  return all<Quote>(`${SELECT_QUOTE} ${whereClause} ORDER BY q.id DESC`, ...params).filter(r=>!filter.user || recordVisible(filter.user,'quote',r.id));
}

// ===== Tiện ích kiểm tra và tính toán =====

function mustDraftVersion(versionId: number): QuoteVersion {
  const v = getQuoteVersion(versionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(v.status === "DRAFT", "Chỉ được sửa phiên bản báo giá ở trạng thái Nháp");
  return v;
}

/**
 * Tính lại tổng tiền, chiết khấu, thuế VAT và chiết khấu tối đa cho phiên bản báo giá (BR-05, BR-22).
 */
function recomputeVersion(versionId: number) {
  const lines = quoteLines(versionId);
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const discountTotal = lines.reduce((s, l) => s + Math.round((l.quantity * l.unit_price * l.discount_pct) / 100), 0);
  const totalBeforeTax = lines.reduce((s, l) => s + l.line_total, 0);
  const taxAmount = lines.reduce((s, l) => s + Math.round((l.line_total * (l.tax_pct || 10)) / 100), 0);
  const finalTotal = totalBeforeTax + taxAmount;
  const maxDiscount = lines.reduce((m, l) => Math.max(m, l.discount_pct), 0);

  const v = getQuoteVersion(versionId)!;

  run(
    `UPDATE quote_versions
     SET subtotal=?, discount_total=?, tax_amount=?, total=?, max_discount_pct=?, updated_at=datetime('now')
     WHERE id=?`,
    subtotal,
    discountTotal,
    taxAmount,
    finalTotal,
    maxDiscount,
    versionId,
  );

  // Đồng bộ lên bản ghi cha `quotes` nếu đây là phiên bản mới nhất
  const latest = getLatestQuoteVersion(v.quote_id);
  if (latest && latest.id === versionId) {
    run(
      `UPDATE quotes
       SET subtotal=?, discount_total=?, total=?, max_discount_pct=?, revision=?, status=?, updated_at=datetime('now')
       WHERE id=?`,
      subtotal,
      discountTotal,
      finalTotal,
      maxDiscount,
      v.version_no,
      v.status,
      v.quote_id,
    );
  }
}

// ===== Nghiệp vụ tạo và sửa báo giá (FR-49) =====

/**
 * FR-49: Lập báo giá nháp mới gắn với cơ hội và khách hàng.
 */
export function createQuote(
  actor: Actor,
  oppId: number,
  options: { notes?: string; validDays?: number; priceListId?: number } = {},
): { quoteId: number; versionId: number } {
  assertActorAccess(actor, "opportunity", oppId);
  const o = getOpportunity(oppId);
  assert(o, "Không tìm thấy cơ hội");
  assert(o.stage === "PROPOSE", "Chỉ lập báo giá ở giai đoạn Đề xuất giải pháp (PROPOSE)");

  const priceListId = options.priceListId || o.price_list_id;
  assert(priceListId, "Cơ hội chưa được chọn bảng giá áp dụng");

  // Kiểm tra nếu có báo giá đang hiệu lực chưa đóng
  const activeVersion = get<{ id: number }>(
    `SELECT qv.id FROM quote_versions qv
     JOIN quotes q ON q.id = qv.quote_id
     WHERE q.opportunity_id = ? AND qv.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT')
     LIMIT 1`,
    oppId,
  );
  assert(!activeVersion, "Đã có báo giá đang trong quá trình xử lý — hãy mở bản đó hoặc tạo phiên bản điều chỉnh mới");

  const validDays = options.validDays || settingNumber("quote_valid_days");
  const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);
  const code = nextCode("quotes", "Q");

  return tx(() => {
    // Tạo bản ghi cha quotes
    const quoteId = run(
      `INSERT INTO quotes (code, opportunity_id, account_id, revision, status, price_list_id, valid_until, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'DRAFT', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      code,
      oppId,
      o.account_id,
      priceListId,
      validUntil,
      options.notes ?? null,
      actorUserId(actor),
    ).id;

    // Tạo phiên bản đầu tiên v1 (DEC-22)
    const versionId = run(
      `INSERT INTO quote_versions (
        quote_id, version_no, status, price_list_id, currency, valid_until, notes, created_by, created_at, updated_at
      ) VALUES (?, 1, 'DRAFT', ?, 'VND', ?, ?, ?, datetime('now'), datetime('now'))`,
      quoteId,
      priceListId,
      validUntil,
      options.notes ?? null,
      actorUserId(actor),
    ).id;

    audit(actor, "quote", quoteId, "CREATE", {
      to: "DRAFT",
      details: { code, versionId, versionNo: 1, opportunityId: oppId },
    });

    return { quoteId, versionId };
  });
}

/**
 * Thêm dòng sản phẩm vào phiên bản báo giá nháp.
 */
export function addLine(
  actor: Actor,
  versionId: number,
  productId: number,
  quantity: number,
  discountPct: number,
  options: { taxPct?: number; licenseCount?: number; termMonths?: number } = {},
) {
  assertActorAccess(actor, "quote_version", versionId);
  const v = mustDraftVersion(versionId);
  assert(Number.isInteger(quantity) && quantity > 0, "Số lượng phải là số nguyên dương");
  assert(discountPct >= 0 && discountPct <= 100, "Chiết khấu phải từ 0% đến 100%");

  // Đơn giá lấy từ bảng giá đã chọn (BR-22); không sửa đơn giá gốc
  const itemPrice = priceFor(v.price_list_id, productId);
  assert(itemPrice, "Sản phẩm không có trong bảng giá được áp dụng của báo giá");

  const taxPct = options.taxPct !== undefined ? options.taxPct : (itemPrice.taxPct || 10);
  const lineTot = lineTotal(quantity, itemPrice.unitPrice, discountPct);

  tx(() => {
    run(
      `INSERT INTO quote_lines (
        quote_id, quote_version_id, product_id, quantity, unit_price, discount_pct, tax_pct, line_total, license_count, term_months
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.quote_id,
      versionId,
      productId,
      quantity,
      itemPrice.unitPrice,
      discountPct,
      taxPct,
      lineTot,
      options.licenseCount ?? null,
      options.termMonths ?? null,
    );

    recomputeVersion(versionId);
    audit(actor, "quote_version", versionId, "LINE_ADD", {
      details: { productId, quantity, discountPct, taxPct },
    });
  });
}

/**
 * Cập nhật dòng báo giá khi còn ở trạng thái DRAFT.
 */
export function updateLine(
  actor: Actor,
  versionId: number,
  lineId: number,
  quantity: number,
  discountPct: number,
  options: { taxPct?: number; licenseCount?: number; termMonths?: number } = {},
) {
  assertActorAccess(actor, "quote_version", versionId);
  mustDraftVersion(versionId);
  assert(Number.isInteger(quantity) && quantity > 0, "Số lượng phải là số nguyên dương");
  assert(discountPct >= 0 && discountPct <= 100, "Chiết khấu phải từ 0% đến 100%");

  const line = get<{ unit_price: number; tax_pct: number }>(
    "SELECT unit_price, tax_pct FROM quote_lines WHERE id = ? AND (quote_version_id = ? OR quote_id = ?)",
    lineId,
    versionId,
    versionId,
  );
  assert(line, "Không tìm thấy dòng báo giá");

  const taxPct = options.taxPct !== undefined ? options.taxPct : line.tax_pct;
  const lineTot = lineTotal(quantity, line.unit_price, discountPct);

  tx(() => {
    run(
      `UPDATE quote_lines
       SET quantity = ?, discount_pct = ?, tax_pct = ?, line_total = ?, license_count = ?, term_months = ?
       WHERE id = ?`,
      quantity,
      discountPct,
      taxPct,
      lineTot,
      options.licenseCount ?? null,
      options.termMonths ?? null,
      lineId,
    );

    recomputeVersion(versionId);
    audit(actor, "quote_version", versionId, "LINE_UPDATE", {
      details: { lineId, quantity, discountPct, taxPct },
    });
  });
}

/**
 * Xóa dòng báo giá.
 */
export function removeLine(actor: Actor, versionId: number, lineId: number) {
  assertActorAccess(actor, "quote_version", versionId);
  mustDraftVersion(versionId);
  tx(() => {
    run("DELETE FROM quote_lines WHERE id = ? AND (quote_version_id = ? OR quote_id = ?)", lineId, versionId, versionId);
    recomputeVersion(versionId);
    audit(actor, "quote_version", versionId, "LINE_REMOVE", { details: { lineId } });
  });
}

/**
 * Cập nhật ghi chú và hạn hiệu lực của phiên bản báo giá nháp.
 */
export function updateQuoteDetails(
  actor: Actor,
  versionId: number,
  input: { notes?: string | null; validUntil?: string | null },
) {
  assertActorAccess(actor, "quote_version", versionId);
  const v = mustDraftVersion(versionId);
  run(
    "UPDATE quote_versions SET notes = ?, valid_until = ?, updated_at = datetime('now') WHERE id = ?",
    input.notes ?? v.notes,
    input.validUntil ?? v.valid_until,
    versionId,
  );
  recomputeVersion(versionId);
  audit(actor, "quote_version", versionId, "UPDATE", { details: input });
}

// ===== FR-50: Kiểm tra cấu hình báo giá =====

export interface QuoteConfigValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * FR-50: Đối chiếu cấu hình báo giá cụ thể với tính năng theo gói và chính sách quyền sử dụng.
 */
export function validateQuoteConfiguration(versionId: number): QuoteConfigValidationResult {
  const lines = quoteLines(versionId);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    errors.push("Báo giá chưa có dòng sản phẩm hoặc dịch vụ nào.");
    return { valid: false, warnings, errors };
  }

  // 1. Kiểm tra thành phần bắt buộc của gói (PACKAGE)
  for (const line of lines) {
    if (line.product_type === "PACKAGE") {
      // Lấy danh sách thành phần bắt buộc
      const requiredComponents = all<{ component_name: string; component_id: number }>(
        `SELECT p.name AS component_name, pc.component_id
         FROM product_components pc
         JOIN products p ON p.id = pc.component_id
         WHERE pc.package_id = ? AND pc.is_optional = 0`,
        line.product_id,
      );

      for (const req of requiredComponents) {
        const hasComponent = lines.some((l) => l.product_id === req.component_id);
        if (!hasComponent) {
          warnings.push(
            `Gói "${line.product_name}" yêu cầu thành phần bắt buộc "${req.component_name}" nhưng chưa có trong báo giá.`,
          );
        }
      }
    }

    // 2. Kiểm tra chính sách quyền sử dụng (License policy)
    const p = get<{ license_policy: string | null }>("SELECT license_policy FROM products WHERE id = ?", line.product_id);
    if (p?.license_policy && p.license_policy !== "UNLIMITED") {
      if (!line.license_count || line.license_count <= 0) {
        warnings.push(`Sản phẩm "${line.product_name}" yêu cầu xác định số lượng quyền sử dụng (license count).`);
      }
      if (!line.term_months || line.term_months <= 0) {
        warnings.push(`Sản phẩm "${line.product_name}" yêu cầu xác định thời hạn thuê bao (tháng).`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ===== FR-51 & HG7: Phê duyệt giá và chiết khấu (BR-05) =====

/**
 * FR-51: Trình duyệt báo giá.
 * - Chiết khấu <= 10%: NVKD tự duyệt (APPROVED).
 * - Chiết khấu 10% - 30%: Chờ QLKD duyệt (PENDING_APPROVAL).
 * - Chiết khấu > 30%: Bị chặn hoàn toàn.
 */
export function submitQuote(actor: Actor, versionId: number): { status: QuoteStatus; message: string } {
  assertActorAccess(actor, "quote_version", versionId);
  const v = mustDraftVersion(versionId);
  const lines = quoteLines(versionId);
  assert(lines.length > 0, "Báo giá chưa có dòng sản phẩm nào");

  // Kiểm tra cấu hình báo giá (FR-50)
  const configCheck = validateQuoteConfiguration(versionId);
  assert(configCheck.valid, `Lỗi cấu hình báo giá: ${configCheck.errors.join("; ")}`);

  const maxDisc = v.max_discount_pct;
  const check = checkDiscount(maxDisc, "SALES");

  assert(check.allowed, check.message || "Mức chiết khấu không hợp lệ");

  return tx(() => {
    if (check.requiresApproval) {
      // Vượt thẩm quyền NVKD (> 10%) -> Cần QLKD duyệt (HG7)
      run(
        "UPDATE quote_versions SET status = 'PENDING_APPROVAL', updated_at = datetime('now') WHERE id = ?",
        versionId,
      );
      run("UPDATE quotes SET status = 'PENDING_APPROVAL', updated_at = datetime('now') WHERE id = ?", v.quote_id);

      requestApproval(actor, {
        kind: "QUOTE_DISCOUNT",
        entityType: "quote",
        entityId: versionId,
        reason: `Chiết khấu tối đa ${maxDisc}% vượt hạn mức tự quyết (ngưỡng ${check.threshold}%). Cần Quản lý kinh doanh phê duyệt.`,
      });

      audit(actor, "quote_version", versionId, "SUBMIT", {
        from: "DRAFT",
        to: "PENDING_APPROVAL",
        reason: "Vượt hạn mức chiết khấu",
      });

      return {
        status: "PENDING_APPROVAL",
        message: `Chiết khấu ${maxDisc}% vượt hạn mức tự quyết (${check.threshold}%). Đã gửi Quản lý kinh doanh phê duyệt (HG7).`,
      };
    }

    // Trong thẩm quyền NVKD (<= 10%) -> Tự động duyệt hợp lệ
    run(
      `UPDATE quote_versions
       SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      actorUserId(actor),
      versionId,
    );
    run(
      `UPDATE quotes
       SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      actorUserId(actor),
      v.quote_id,
    );

    audit(actor, "quote_version", versionId, "SUBMIT", {
      from: "DRAFT",
      to: "APPROVED",
      reason: `Chiết khấu ${maxDisc}% nằm trong thẩm quyền tự quyết`,
    });

    return {
      status: "APPROVED",
      message: `Báo giá đã được phê duyệt tự động (Chiết khấu ${maxDisc}% <= ${check.threshold}%).`,
    };
  });
}

/**
 * Xử lý quyết định phê duyệt của Quản lý kinh doanh (từ approvals).
 */
export function applyDiscountDecision(
  actor: Actor,
  versionOrQuoteId: number,
  approved: boolean,
  comment: string | null,
) {
  let v = getQuoteVersion(versionOrQuoteId);
  if (!v || v.status !== "PENDING_APPROVAL") {
    // Thử tìm theo quote_id
    const latest = getLatestQuoteVersion(versionOrQuoteId);
    if (latest && latest.status === "PENDING_APPROVAL") {
      v = latest;
    }
  }
  assert(v && v.status === "PENDING_APPROVAL", "Phiên bản báo giá không ở trạng thái chờ duyệt");
  assert(actor.type==='USER' && actor.role==='SALES_MANAGER','Chỉ Quản lý kinh doanh được duyệt chiết khấu');
  assertActorAccess(actor,'quote_version',v.id);

  const to: QuoteStatus = approved ? "APPROVED" : "REJECTED";
  const versionId = v.id;

  tx(() => {
    run(
      `UPDATE quote_versions
       SET status = ?, approved_by = ?, approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END, updated_at = datetime('now')
       WHERE id = ?`,
      to,
      approved ? actorUserId(actor) : null,
      to,
      versionId,
    );
    run(
      `UPDATE quotes
       SET status = ?, approved_by = ?, approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END, updated_at = datetime('now')
       WHERE id = ?`,
      to,
      approved ? actorUserId(actor) : null,
      to,
      v.quote_id,
    );

    // Duyệt ở trang báo giá cũng phải đóng yêu cầu trong danh sách phê duyệt.
    run(
      "UPDATE approvals SET status=?, decided_by=?, decision_comment=?, decided_at=datetime('now') WHERE kind='QUOTE_DISCOUNT' AND status='PENDING' AND entity_id=?",
      to,
      actorUserId(actor),
      comment,
      versionId,
    );

    audit(actor, "quote_version", versionId, approved ? "APPROVE" : "REJECT_APPROVAL", {
      from: "PENDING_APPROVAL",
      to,
      reason: comment,
    });
  });
}

// ===== FR-52: Gửi báo giá cho khách hàng (PDF & Email) =====

/**
 * FR-52: Xuất đề xuất & báo giá ra tệp PDF và gửi cho khách hàng qua email; khóa báo giá đã gửi.
 */
export function sendQuote(actor: Actor, versionId: number): { providerRef: string; pdfBuffer: Buffer } {
  assertActorAccess(actor, "quote_version", versionId);
  assert(actor.type === "USER", "Chỉ nhân viên được gửi báo giá cho khách hàng");
  const v = getQuoteVersion(versionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(v.status === "APPROVED", "Báo giá phải được phê duyệt hợp lệ trước khi gửi cho khách hàng (HG7)");

  const q = getQuote(v.quote_id)!;
  const o = getOpportunity(q.opportunity_id)!;
  const contact = o.primary_contact_id
    ? get<{ email: string | null; full_name: string }>(
        "SELECT email, full_name FROM contacts WHERE id = ?",
        o.primary_contact_id,
      )
    : null;
  assert(contact?.email, "Khách hàng chưa có người liên hệ chính hoặc thiếu địa chỉ email");

  const lines = quoteLines(versionId);

  // Sinh tệp PDF nhị phân chuẩn 1.4
  const pdfBuffer = generateQuotePdf({
    quoteCode: q.code,
    versionNo: v.version_no,
    customerName: q.account_name || "Khách hàng",
    contactName: contact.full_name,
    contactEmail: contact.email,
    opportunityCode: q.opportunity_code || o.code,
    currency: v.currency,
    validUntil: v.valid_until,
    createdAt: v.created_at,
    lines: lines.map((l) => ({
      productCode: l.product_code,
      productName: l.product_name,
      productType: l.product_type,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discountPct: l.discount_pct,
      taxPct: l.tax_pct,
      lineTotal: l.line_total,
    })),
    subtotal: v.subtotal,
    discountTotal: v.discount_total,
    taxAmount: v.tax_amount,
    total: v.total,
    notes: v.notes,
  });

  return tx(() => {
    const subject = `Báo giá ${q.code} (Phiên bản v${v.version_no}) – ${q.account_name}`;
    const body = `Kính gửi ${contact.full_name},\n\nChúng tôi trân trọng gửi Quý khách bản báo giá ${q.code} phiên bản v${v.version_no}, tổng giá trị ${v.total.toLocaleString("vi-VN")} ${v.currency}, hiệu lực đến ${v.valid_until || "—"}.\n\nChi tiết sản phẩm, dịch vụ và bảng tính giá kèm theo tệp PDF đính kèm.\n\nTrân trọng.`;

    const { providerRef } = email.send({ to: contact.email!, subject, body });

    run(
      `INSERT INTO email_messages (entity_type, entity_id, to_email, subject, body, approved_by, provider_ref, status)
       VALUES ('quote', ?, ?, ?, ?, ?, ?, 'SENT')`,
      v.id,
      contact.email!,
      subject,
      body,
      actorUserId(actor),
      providerRef,
    );

    addActivity({
      entityType: "opportunity",
      entityId: o.id,
      type: "EMAIL",
      direction: "OUT",
      subject,
      body,
      createdBy: actorUserId(actor),
    });

    run("UPDATE quote_versions SET status = 'SENT', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", v.id);
    run("UPDATE quotes SET status = 'SENT', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", q.id);

    audit(actor, "quote_version", v.id, "SEND", {
      from: "APPROVED",
      to: "SENT",
      details: { to: contact.email, providerRef },
    });

    return { providerRef, pdfBuffer };
  });
}

// ===== FR-53: Hiệu lực và tra cứu báo giá (BR-09) =====

/**
 * Kiểm tra xem phiên bản báo giá có hết hạn chưa.
 */
export function isQuoteExpired(version: QuoteVersion): boolean {
  if (!version.valid_until) return false;
  const today = new Date().toISOString().slice(0, 10);
  return version.valid_until < today && !["ACCEPTED", "SUPERSEDED"].includes(version.status);
}

/**
 * Quét và cập nhật trạng thái EXPIRED cho các báo giá đã quá hạn.
 */
export function checkExpiredQuotes(): number {
  const expiredList = all<{ id: number; quote_id: number }>(
    `SELECT id, quote_id FROM quote_versions
     WHERE valid_until < date('now') AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT')`,
  );

  for (const exp of expiredList) {
    run("UPDATE quote_versions SET status = 'EXPIRED', updated_at = datetime('now') WHERE id = ?", exp.id);
    run("UPDATE quotes SET status = 'EXPIRED', updated_at = datetime('now') WHERE id = ?", exp.quote_id);
  }

  return expiredList.length;
}

// ===== FR-54: Ghi nhận phản hồi và điều chỉnh báo giá (DEC-22) =====

/**
 * Ghi nhận phản hồi của khách hàng (Chấp thuận, Từ chối, Yêu cầu điều chỉnh).
 */
export function recordCustomerResponse(
  actor: Actor,
  versionId: number,
  responseType: "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED",
  note: string | null = null,
  contactId?: number | null,
) {
  assertActorAccess(actor, "quote_version", versionId);
  assert(actor.type === "USER", "Chỉ nhân viên được ghi nhận phản hồi của khách hàng");
  assert(can(actor.role,'quote.write'),'Không có quyền ghi phản hồi khách hàng');
  const v = getQuoteVersion(versionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(v.status === "SENT", "Chỉ ghi nhận phản hồi cho báo giá đã gửi khách hàng");
  assert(getLatestQuoteVersion(v.quote_id)?.id===v.id,'Phiên bản báo giá đã bị thay thế');
  if(contactId) assert(get('SELECT c.id FROM contacts c JOIN opportunities o ON o.account_id=c.account_id JOIN quotes q ON q.opportunity_id=o.id WHERE q.id=? AND c.id=?',v.quote_id,contactId),'Người phản hồi không thuộc doanh nghiệp của báo giá');

  // Kiểm tra hiệu lực (BR-09): Báo giá hết hạn không nhận chấp thuận mới
  if (responseType === "ACCEPTED" && isQuoteExpired(v)) {
    throw new DomainError("Báo giá đã hết hạn hiệu lực, không thể ghi nhận chấp thuận mới");
  }

  return tx(() => {
    // 1. Lưu bản ghi phản hồi vào quote_responses
    run(
      `INSERT INTO quote_responses (quote_version_id, response_type, contact_id, notes, responded_at, created_by)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`,
      versionId,
      responseType,
      contactId ?? null,
      note,
      actorUserId(actor),
    );

    if (responseType === "ACCEPTED") {
      run(
        `UPDATE quote_versions
         SET status = 'ACCEPTED', customer_response_note = ?, responded_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        note,
        versionId,
      );
      run(
        `UPDATE quotes
         SET status = 'ACCEPTED', customer_response_note = ?, responded_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        note,
        v.quote_id,
      );

      // Tự động chuyển cơ hội sang CLOSE (Tạo đơn hàng) nếu đang ở PROPOSE
      const q = getQuote(v.quote_id)!;
      const o = getOpportunity(q.opportunity_id)!;
      if (o.stage === "PROPOSE") {
        moveStage(actor, o.id, "CLOSE", `Khách hàng chấp thuận báo giá ${q.code} phiên bản v${v.version_no}`);
      }

      audit(actor, "quote_version", versionId, "CUSTOMER_RESPONSE", {
        from: "SENT",
        to: "ACCEPTED",
        reason: note,
      });
    } else if (responseType === "REJECTED") {
      run(
        `UPDATE quote_versions
         SET status = 'REJECTED', customer_response_note = ?, responded_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        note,
        versionId,
      );
      run(
        `UPDATE quotes
         SET status = 'REJECTED', customer_response_note = ?, responded_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        note,
        v.quote_id,
      );

      audit(actor, "quote_version", versionId, "CUSTOMER_RESPONSE", {
        from: "SENT",
        to: "REJECTED",
        reason: note,
      });
    } else if (responseType === "REVISION_REQUESTED") {
      // Yêu cầu điều chỉnh: tạo phiên bản mới tự động
      return reviseQuote(actor, versionId, note);
    }
  });
}

/**
 * Tạo phiên bản điều chỉnh mới (DEC-22):
 * - Đánh dấu bản cũ thành SUPERSEDED.
 * - Hủy các phê duyệt đang chờ của bản cũ.
 * - Tạo phiên bản mới (version_no + 1) ở trạng thái DRAFT.
 * - Sao chép toàn bộ các dòng sản phẩm sang phiên bản mới.
 */
export function recordCustomerFeedback(actor:Actor,versionId:number,input:{responseType:'ACCEPTED'|'REJECTED'|'REVISION_REQUESTED';respondentName?:string;contactId?:number;respondedAt:string;content:string}) {
  assert(actor.type==='USER' && can(actor.role,'quote.write'),'Chỉ kinh doanh được ghi nhận phản hồi');
  assertActorAccess(actor,'quote_version',versionId);
  const contact=input.contactId?get<{full_name:string}>('SELECT full_name FROM contacts WHERE id=?',input.contactId):undefined;
  const name=input.respondentName?.trim() || contact?.full_name;
  assert(name && input.content?.trim(),'Cần người phản hồi và nội dung phản hồi của khách');
  const time=Date.parse(input.respondedAt);
  assert(Number.isFinite(time) && time<=Date.now()+60000,'Thời điểm phản hồi không hợp lệ hoặc ở tương lai');
  const v=getQuoteVersion(versionId);
  assert(v,'Không tìm thấy phiên bản');
  if(v.sent_at) assert(time>=Date.parse(v.sent_at.includes('T')?v.sent_at:v.sent_at.replace(' ','T')+'Z'),'Phản hồi phải sau thời điểm gửi báo giá');
  return tx(()=>{
    recordCustomerResponse(actor,versionId,input.responseType,input.content.trim(),input.contactId);
    const r=get<{id:number}>('SELECT id FROM quote_responses WHERE quote_version_id=? ORDER BY id DESC LIMIT 1',versionId)!;
    run('UPDATE quote_responses SET respondent_name=?,responded_at=? WHERE id=?',name,new Date(time).toISOString(),r.id);
    return {id:r.id,versionId,respondentName:name,respondedAt:new Date(time).toISOString(),content:input.content.trim()};
  });
}

export function reviseQuote(actor: Actor, versionId: number, revisionNote: string | null = null): number {
  assertActorAccess(actor, "quote_version", versionId);
  const v = getQuoteVersion(versionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(
    ["PENDING_APPROVAL", "APPROVED", "SENT", "REJECTED", "EXPIRED"].includes(v.status),
    "Không thể tạo phiên bản mới từ trạng thái này",
  );

  const q = getQuote(v.quote_id)!;
  const o = getOpportunity(q.opportunity_id)!;
  assert(o.stage === "PROPOSE" || o.stage === "CLOSE", "Cơ hội không còn ở giai đoạn có thể điều chỉnh báo giá");

  return tx(() => {
    // Bản cũ chuyển thành SUPERSEDED
    run("UPDATE quote_versions SET status = 'SUPERSEDED', updated_at = datetime('now') WHERE id = ?", versionId);
    run(
      "UPDATE approvals SET status = 'REJECTED', decision_comment = 'Báo giá đã thay bằng phiên bản mới', decided_at = datetime('now') WHERE kind = 'QUOTE_DISCOUNT' AND entity_id = ? AND status = 'PENDING'",
      versionId,
    );

    const newVersionNo = v.version_no + 1;
    const validDays = settingNumber("quote_valid_days");
    const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);

    // Tạo phiên bản mới
    const newVersionId = run(
      `INSERT INTO quote_versions (
        quote_id, version_no, status, price_list_id, currency, valid_until, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      q.id,
      newVersionNo,
      v.price_list_id,
      v.currency,
      validUntil,
      revisionNote ? `${v.notes ? v.notes + "\n" : ""}Điều chỉnh v${newVersionNo}: ${revisionNote}` : v.notes,
      actorUserId(actor),
    ).id;

    // Sao chép các dòng sản phẩm sang phiên bản mới (giữ đơn giá để thương lượng nhất quán)
    const oldLines = quoteLines(versionId);
    for (const l of oldLines) {
      run(
        `INSERT INTO quote_lines (
          quote_id, quote_version_id, product_id, quantity, unit_price, discount_pct, tax_pct, line_total, license_count, term_months
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        q.id,
        newVersionId,
        l.product_id,
        l.quantity,
        l.unit_price,
        l.discount_pct,
        l.tax_pct,
        l.line_total,
        l.license_count,
        l.term_months,
      );
    }

    recomputeVersion(newVersionId);

    audit(actor, "quote_version", versionId, "SUPERSEDE", {
      from: v.status,
      to: "SUPERSEDED",
      details: { newVersionId, newVersionNo },
    });
    audit(actor, "quote_version", newVersionId, "CREATE", {
      to: "DRAFT",
      reason: `Phiên bản v${newVersionNo} của báo giá ${q.code}`,
    });

    return newVersionId;
  });
}

// ===== FR-55: Theo dõi ký điện tử (DEC-13) =====

/**
 * FR-55: Yêu cầu ký điện tử cho phiên bản báo giá đã được phê duyệt hoặc gửi khách.
 */
export function requestQuoteEsign(
  actor: Actor,
  versionId: number,
  recipientEmail?: string,
  recipientName?: string,
): QuoteSignatureRecord {
  assertActorAccess(actor, "quote_version", versionId);
  const v = getQuoteVersion(versionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(
    ["APPROVED", "SENT", "ACCEPTED"].includes(v.status),
    "Chỉ gửi ký điện tử cho báo giá đã được duyệt hoặc đã gửi khách hàng",
  );

  const q = getQuote(v.quote_id)!;
  const o = getOpportunity(q.opportunity_id)!;
  const contact = o.primary_contact_id
    ? get<{ email: string | null; full_name: string }>(
        "SELECT email, full_name FROM contacts WHERE id = ?",
        o.primary_contact_id,
      )
    : null;

  const emailToUse = recipientEmail || contact?.email;
  const nameToUse = recipientName || contact?.full_name || "Đại diện khách hàng";
  assert(emailToUse, "Chưa xác định địa chỉ email người ký");

  const esignRes = esign.requestSignature({
    title: `Báo giá ${q.code} v${v.version_no} – ${q.account_name}`,
    recipientEmail: emailToUse,
    recipientName: nameToUse,
    documentRef: `quote-${v.id}`,
  });

  return tx(() => {
    const sigId = run(
      `INSERT INTO quote_signatures (
        quote_version_id, external_reference, provider, status, sign_url, recipient_email, recipient_name, created_at, updated_at
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, datetime('now'), datetime('now'))`,
      versionId,
      esignRes.externalReference,
      esignRes.provider,
      esignRes.signUrl,
      emailToUse,
      nameToUse,
    ).id;

    audit(actor, "quote_signature", sigId, "REQUEST_ESIGN", {
      details: { versionId, externalReference: esignRes.externalReference, recipientEmail: emailToUse },
    });

    return get<QuoteSignatureRecord>("SELECT * FROM quote_signatures WHERE id = ?", sigId)!;
  });
}

/**
 * Cập nhật trạng thái ký điện tử (từ webhook hoặc kiểm tra định kỳ).
 */
export function checkQuoteEsignStatus(actor: Actor, signatureId: number): QuoteSignatureRecord {
  const sig = get<QuoteSignatureRecord>("SELECT * FROM quote_signatures WHERE id = ?", signatureId);
  assert(sig, "Không tìm thấy yêu cầu ký điện tử");

  const statusRes = esign.checkStatus(sig.external_reference);
  if (statusRes.status !== sig.status) {
    run(
      `UPDATE quote_signatures
       SET status = ?, signed_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      statusRes.status,
      statusRes.signedAt ?? null,
      signatureId,
    );

    audit(actor, "quote_signature", signatureId, "STATUS_CHANGE", {
      from: sig.status,
      to: statusRes.status,
    });
  }

  return get<QuoteSignatureRecord>("SELECT * FROM quote_signatures WHERE id = ?", signatureId)!;
}

// ===== Hợp đồng cung cấp cho WP-05 (Đơn hàng) =====

export interface AcceptedQuoteVersionResult {
  quoteVersion: QuoteVersion;
  quote: Quote;
  opportunity: { id: number; code: string; account_id: number; stage: string };
  account: { id: number; name: string };
  lines: QuoteLine[];
}

/**
 * Hợp đồng cho WP-05: Lấy thông tin phiên bản báo giá đã được khách hàng chấp thuận để lập đơn hàng.
 * Kiểm tra cửa sổ thời gian lập đơn hợp lệ (BR-09: 30 ngày kể từ ngày chấp thuận).
 */
export function getAcceptedQuoteVersion(quoteVersionId: number): AcceptedQuoteVersionResult {
  const v = getQuoteVersion(quoteVersionId);
  assert(v, "Không tìm thấy phiên bản báo giá");
  assert(v.status === "ACCEPTED", "Báo giá chưa được khách hàng chấp thuận hợp lệ");
  const sourceQuote = getQuote(v.quote_id)!;
  assert(getOpportunity(sourceQuote.opportunity_id)?.stage === "CLOSE", "Chỉ lập đơn khi cơ hội ở giai đoạn Tạo đơn hàng (CLOSE)");

  // Kiểm tra cửa sổ thời gian lập đơn (BR-09: accepted_quote_order_window_days)
  if (v.responded_at) {
    const windowDays = settingNumber("accepted_quote_order_window_days");
    const respondedTime = new Date(v.responded_at).getTime();
    const expiryTime = respondedTime + windowDays * 86400000;
    if (Date.now() > expiryTime) {
      throw new DomainError(`Đã quá hạn ${windowDays} ngày kể từ khi khách chấp thuận; không thể lập đơn hàng mới`);
    }
  }

  const q = getQuote(v.quote_id)!;
  const o = getOpportunity(q.opportunity_id)!;
  const account = get<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE id = ?", q.account_id)!;
  const lines = quoteLines(v.id);

  return {
    quoteVersion: v,
    quote: q,
    opportunity: o,
    account,
    lines,
  };
}
