import type { Migration } from "./types";

// Kết quả Agent đọc tài liệu: chỉ là đề xuất, người dùng xác nhận mới ghi vào hồ sơ cơ hội.
export const wp11_002_document_extractions: Migration = {
  name: "wp11_002_document_extractions",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id),
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
        mode TEXT NOT NULL,
        run_id INTEGER REFERENCES ai_runs(id) ON DELETE SET NULL,
        fields_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPLIED','REJECTED')),
        review_note TEXT,
        created_by INTEGER REFERENCES users(id),
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_document_extractions_opportunity ON document_extractions(opportunity_id, status);
    `);
  },
};
