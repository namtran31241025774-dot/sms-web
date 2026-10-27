// Dịch vụ quản lý Bảng giá, Giá theo phân khúc và Hạn mức chiết khấu (FR-27 → FR-29, BR-03, BR-05, BR-22).
import { all, get, run, tx } from "../db";
import { assert } from "../domain";
import type { Role } from "../domain";
import { audit, settingNumber, type Actor } from "./core";

export type CustomerSegment = "ALL" | "SMB" | "ENTERPRISE";

export type PriceList = {
  id: number;
  name: string;
  currency: string;
  customer_segment: CustomerSegment;
  valid_from: string | null;
  valid_to: string | null;
  is_default: number;
  description: string | null;
  active: number;
  items_count?: number;
};

export type PriceListItem = {
  id: number;
  price_list_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_type: string;
  unit: string;
  unit_price: number;
  tax_pct: number;
};

export type PriceListInput = {
  name: string;
  currency?: string;
  customer_segment?: CustomerSegment;
  valid_from?: string | null;
  valid_to?: string | null;
  is_default?: boolean;
  description?: string | null;
};

export type DiscountCheckResult = {
  allowed: boolean;
  requiresApproval: boolean;
  threshold: number;
  maxAllowed: number;
  message?: string;
};

/**
 * FR-27, FR-28: Lấy danh sách bảng giá.
 */
export function listPriceLists(filter: {
  segment?: CustomerSegment;
  currency?: string;
  active?: boolean;
} = {}): PriceList[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.segment) {
    where.push("(pl.customer_segment = ? OR pl.customer_segment = 'ALL')");
    params.push(filter.segment);
  }
  if (filter.currency) {
    where.push("pl.currency = ?");
    params.push(filter.currency);
  }
  if (filter.active !== undefined) {
    where.push("pl.active = ?");
    params.push(filter.active ? 1 : 0);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return all<PriceList>(
    `SELECT pl.*,
       (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id) AS items_count
     FROM price_lists pl
     ${clause}
     ORDER BY pl.is_default DESC, pl.active DESC, pl.name`,
    ...params,
  );
}

export function getPriceList(id: number): PriceList | undefined {
  return get<PriceList>(
    `SELECT pl.*,
       (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id) AS items_count
     FROM price_lists pl WHERE pl.id = ?`,
    id,
  );
}

/**
 * FR-27, BR-22: Tạo mới bảng giá chuẩn hoặc bảng giá theo phân khúc.
 */
export function createPriceList(actor: Actor, input: PriceListInput): number {
  assert(input.name?.trim(), "Tên bảng giá không được để trống");
  const currency = (input.currency || "VND").trim().toUpperCase();
  const segment = input.customer_segment || "ALL";

  return tx(() => {
    // Nếu đặt là default, hủy cờ default của bảng giá khác trong cùng phân khúc
    if (input.is_default) {
      run("UPDATE price_lists SET is_default = 0 WHERE customer_segment = ?", segment);
    }

    const { id } = run(
      `INSERT INTO price_lists (name, currency, customer_segment, valid_from, valid_to, is_default, description, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      input.name.trim(),
      currency,
      segment,
      input.valid_from || null,
      input.valid_to || null,
      input.is_default ? 1 : 0,
      input.description?.trim() || null,
    );

    audit(actor, "price_list", id, "CREATE", {
      details: { name: input.name, currency, segment },
    });

    return id;
  });
}

/**
 * Cập nhật bảng giá (FR-27).
 * Cập nhật bảng giá không làm thay đổi giá đã được khóa trên Đơn hàng hoặc Báo giá đã chốt.
 */
export function updatePriceList(actor: Actor, id: number, input: Partial<PriceListInput>) {
  const current = getPriceList(id);
  assert(current, "Không tìm thấy bảng giá");

  const updates: Record<string, string | number | null> = {};
  if ("name" in input && input.name) updates.name = input.name.trim();
  if ("currency" in input && input.currency) updates.currency = input.currency.trim().toUpperCase();
  if ("customer_segment" in input && input.customer_segment) updates.customer_segment = input.customer_segment;
  if ("valid_from" in input) updates.valid_from = input.valid_from || null;
  if ("valid_to" in input) updates.valid_to = input.valid_to || null;
  if ("is_default" in input) updates.is_default = input.is_default ? 1 : 0;
  if ("description" in input) updates.description = input.description?.trim() || null;

  const keys = Object.keys(updates);
  if (!keys.length) return;

  tx(() => {
    if (updates.is_default === 1) {
      const seg = updates.customer_segment || current.customer_segment;
      run("UPDATE price_lists SET is_default = 0 WHERE customer_segment = ? AND id != ?", seg, id);
    }

    run(
      `UPDATE price_lists SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...keys.map((k) => updates[k]),
      id,
    );

    audit(actor, "price_list", id, "UPDATE", { details: keys });
  });
}

/**
 * Ngừng sử dụng bảng giá (FR-27).
 */
export function deactivatePriceList(actor: Actor, id: number) {
  const current = getPriceList(id);
  assert(current, "Không tìm thấy bảng giá");
  assert(current.is_default === 0, "Không thể ngừng áp dụng bảng giá mặc định");

  tx(() => {
    run("UPDATE price_lists SET active = 0 WHERE id = ?", id);
    audit(actor, "price_list", id, "DEACTIVATE", { from: "1", to: "0" });
  });
}

/**
 * Kích hoạt lại bảng giá (FR-27).
 */
export function activatePriceList(actor: Actor, id: number) {
  const current = getPriceList(id);
  assert(current, "Không tìm thấy bảng giá");

  tx(() => {
    run("UPDATE price_lists SET active = 1 WHERE id = ?", id);
    audit(actor, "price_list", id, "ACTIVATE", { from: "0", to: "1" });
  });
}

/**
 * Lấy danh sách các sản phẩm và đơn giá trong bảng giá.
 */
export function getPriceListItems(priceListId: number): PriceListItem[] {
  return all<PriceListItem>(
    `SELECT pli.*, p.code AS product_code, p.name AS product_name, p.type AS product_type, p.unit
     FROM price_list_items pli
     JOIN products p ON p.id = pli.product_id
     WHERE pli.price_list_id = ?
     ORDER BY p.type, p.name`,
    priceListId,
  );
}

/**
 * Thiết lập hoặc cập nhật đơn giá cho sản phẩm trong bảng giá (FR-27, BR-22).
 */
export function setPriceListItem(
  actor: Actor,
  priceListId: number,
  productId: number,
  unitPrice: number,
  taxPct = 10,
) {
  assert(unitPrice >= 0, "Đơn giá không được âm");
  assert(taxPct >= 0 && taxPct <= 100, "Thuế suất GTGT phải từ 0% đến 100%");

  const pl = getPriceList(priceListId);
  assert(pl, "Không tìm thấy bảng giá");

  return tx(() => {
    run(
      `INSERT INTO price_list_items (price_list_id, product_id, unit_price, tax_pct)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(price_list_id, product_id) DO UPDATE SET
         unit_price = excluded.unit_price,
         tax_pct = excluded.tax_pct`,
      priceListId,
      productId,
      Math.round(unitPrice),
      taxPct,
    );

    audit(actor, "price_list", priceListId, "ITEM_SET", {
      details: { productId, unitPrice, taxPct },
    });
  });
}

/**
 * Gỡ bỏ sản phẩm khỏi bảng giá.
 */
export function removePriceListItem(actor: Actor, priceListId: number, productId: number) {
  tx(() => {
    run(
      "DELETE FROM price_list_items WHERE price_list_id = ? AND product_id = ?",
      priceListId,
      productId,
    );
    audit(actor, "price_list", priceListId, "ITEM_REMOVE", { details: { productId } });
  });
}

/**
 * Hợp đồng cung cấp cho WP-03, WP-04, WP-05:
 * Lựa chọn Bảng giá phù hợp dựa trên phân khúc khách hàng (BR-03, BR-22).
 */
export function getApplicablePriceList(params: {
  customerSegment?: CustomerSegment;
  employeeCount?: number;
  currency?: string;
  date?: string;
}): PriceList | undefined {
  const currency = params.currency || "VND";
  const now = params.date || new Date().toISOString().slice(0, 10);

  // Xác định phân khúc theo số lượng nhân sự nếu chưa chỉ định rõ (BR-03)
  let segment: CustomerSegment = params.customerSegment || "ALL";
  if (!params.customerSegment && params.employeeCount !== undefined) {
    const enterpriseThreshold = settingNumber("segment_enterprise_min_employees");
    segment = params.employeeCount >= enterpriseThreshold ? "ENTERPRISE" : "SMB";
  }

  // 1. Tìm bảng giá khớp chính xác phân khúc, tiền tệ và trong hạn hiệu lực
  const matched = get<PriceList>(
    `SELECT * FROM price_lists
     WHERE active = 1 AND currency = ? AND customer_segment = ?
       AND (valid_from IS NULL OR valid_from <= ?)
       AND (valid_to IS NULL OR valid_to >= ?)
     ORDER BY is_default DESC, id DESC LIMIT 1`,
    currency,
    segment,
    now,
    now,
  );
  if (matched) return matched;

  // 2. Tìm bảng giá áp dụng chung (segment = 'ALL')
  const general = get<PriceList>(
    `SELECT * FROM price_lists
     WHERE active = 1 AND currency = ? AND customer_segment = 'ALL'
       AND (valid_from IS NULL OR valid_from <= ?)
       AND (valid_to IS NULL OR valid_to >= ?)
     ORDER BY is_default DESC, id DESC LIMIT 1`,
    currency,
    now,
    now,
  );
  if (general) return general;

  // 3. Dự phòng bảng giá mặc định bất kỳ còn hoạt động
  return get<PriceList>(
    "SELECT * FROM price_lists WHERE active = 1 ORDER BY is_default DESC, id LIMIT 1",
  );
}

/**
 * Hợp đồng cung cấp cho WP-04, WP-05:
 * Lấy đơn giá và thuế suất của một sản phẩm trong bảng giá cụ thể.
 */
export function priceFor(
  priceListId: number,
  productId: number,
): { unitPrice: number; taxPct: number; currency: string } | undefined {
  const row = get<{ unit_price: number; tax_pct: number; currency: string }>(
    `SELECT pli.unit_price, pli.tax_pct, pl.currency
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.price_list_id = ? AND pli.product_id = ?`,
    priceListId,
    productId,
  );

  if (!row) return undefined;
  return {
    unitPrice: row.unit_price,
    taxPct: row.tax_pct,
    currency: row.currency,
  };
}

/**
 * FR-29 & BR-05: Kiểm tra chính sách chiết khấu và hạn mức duyệt.
 * - NVKD (SALES): tự áp dụng <= 10% (discount_threshold_pct).
 * - Chiết khấu từ > 10% đến 30% (discount_max_pct): cần Quản lý kinh doanh (SALES_MANAGER) duyệt.
 * - Chiết khấu > 30%: không cho phép áp dụng.
 */
export function checkDiscount(discountPct: number, role: Role = "SALES"): DiscountCheckResult {
  const threshold = settingNumber("discount_threshold_pct");
  const maxAllowed = settingNumber("discount_max_pct");

  if (discountPct < 0) {
    return {
      allowed: false,
      requiresApproval: false,
      threshold,
      maxAllowed,
      message: "Tỷ lệ chiết khấu không được âm",
    };
  }

  if (discountPct > maxAllowed) {
    return {
      allowed: false,
      requiresApproval: false,
      threshold,
      maxAllowed,
      message: `Mức chiết khấu (${discountPct}%) vượt quá hạn mức tối đa cho phép (${maxAllowed}% theo BR-05)`,
    };
  }

  if (discountPct > threshold) {
    const isManager = role === "SALES_MANAGER";
    return {
      allowed: true,
      requiresApproval: !isManager,
      threshold,
      maxAllowed,
      message: isManager
        ? `Chiết khấu ${discountPct}% nằm trong thẩm quyền duyệt của Quản lý kinh doanh`
        : `Mức chiết khấu (${discountPct}%) vượt thẩm quyền nhân viên (${threshold}%), yêu cầu Quản lý kinh doanh duyệt (BR-05)`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    threshold,
    maxAllowed,
  };
}

/**
 * FR-29: Quản lý kinh doanh cập nhật chính sách và hạn mức duyệt chiết khấu.
 */
export function updateDiscountPolicy(
  actor: Actor,
  thresholdPct: number,
  maxPct: number,
) {
  assert(thresholdPct >= 0 && thresholdPct <= 100, "Ngưỡng chiết khấu nhân viên phải từ 0 đến 100%");
  assert(maxPct >= thresholdPct && maxPct <= 100, "Hạn mức tối đa phải lớn hơn hoặc bằng ngưỡng nhân viên");

  tx(() => {
    run(
      "INSERT INTO settings (key, value) VALUES ('discount_threshold_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(thresholdPct),
    );
    run(
      "INSERT INTO settings (key, value) VALUES ('discount_max_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(maxPct),
    );

    audit(actor, "setting", 0, "DISCOUNT_POLICY_UPDATE", {
      details: { thresholdPct, maxPct },
    });
  });
}
