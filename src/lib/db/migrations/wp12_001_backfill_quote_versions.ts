import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types";

/** Tạo phiên bản cho báo giá chưa có: báo giá mẫu được tạo sau migration wp04 nên trang chi tiết báo 404. */
export function backfillQuoteVersions(db: DatabaseSync) {
  db.exec(`
    INSERT INTO quote_versions (
      quote_id, version_no, status, price_list_id, currency, subtotal, discount_total, tax_amount, total,
      max_discount_pct, valid_until, notes, customer_response_note, created_by, approved_by,
      approved_at, sent_at, responded_at, created_at, updated_at
    )
    SELECT
      id, revision, status, COALESCE(price_list_id, 1), currency, subtotal, discount_total, 0, total,
      max_discount_pct, valid_until, notes, customer_response_note, created_by, approved_by,
      approved_at, sent_at, responded_at, created_at, updated_at
    FROM quotes
    WHERE id NOT IN (SELECT quote_id FROM quote_versions);

    UPDATE quote_lines
    SET quote_version_id = (
      SELECT qv.id FROM quote_versions qv
      WHERE qv.quote_id = quote_lines.quote_id
      ORDER BY qv.version_no DESC LIMIT 1
    )
    WHERE quote_version_id IS NULL;
  `);
}

export const wp12_001_backfill_quote_versions: Migration = {
  name: "wp12_001_backfill_quote_versions",
  up: backfillQuoteVersions,
};

/** Báo giá mẫu không ghi khách hàng nên truy vấn chi tiết không tìm thấy; lấy theo cơ hội của báo giá. */
export function backfillQuoteAccounts(db: DatabaseSync) {
  db.exec(`
    UPDATE quotes
    SET account_id = (SELECT o.account_id FROM opportunities o WHERE o.id = quotes.opportunity_id)
    WHERE account_id IS NULL;
  `);
}

export const wp12_002_backfill_quote_accounts: Migration = {
  name: "wp12_002_backfill_quote_accounts",
  up: backfillQuoteAccounts,
};
