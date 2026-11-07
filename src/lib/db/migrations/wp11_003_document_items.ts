import type { Migration } from "./types";

// Lưu dòng sản phẩm đề xuất từ tài liệu và trạng thái hồ sơ kỹ thuật tạo từ tài liệu.
export const wp11_003_document_items: Migration = {
  name: "wp11_003_document_items",
  up(db) {
    db.exec(`
      ALTER TABLE document_extractions ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE document_extractions ADD COLUMN unmatched_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE document_extractions ADD COLUMN solution_status TEXT NOT NULL DEFAULT 'NONE' CHECK (solution_status IN ('NONE','PENDING','CREATED','SKIPPED'));
    `);
  },
};
