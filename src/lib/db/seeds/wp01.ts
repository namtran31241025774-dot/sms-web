import type { DatabaseSync } from "node:sqlite";

export function seedWp01(db: DatabaseSync) {
  const ins = (sql: string, ...p: (string | number | null)[]) =>
    Number(db.prepare(sql).run(...p).lastInsertRowid);

  // 1. Thêm Tags mẫu (FR-07)
  const tagList = [
    { name: "Tiềm năng cao", color: "#107c41" },
    { name: "Cần Demo kỹ thuật", color: "#0078d4" },
    { name: "Khu vực Miền Nam", color: "#d83b01" },
    { name: "Khu vực Miền Bắc", color: "#5c2d91" },
    { name: "Doanh nghiệp FDI", color: "#008272" },
    { name: "Sản xuất & Vận tải", color: "#b4009e" },
  ];

  const tagIds: number[] = [];
  for (const t of tagList) {
    db.prepare(`
      INSERT INTO tags (name, color) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET color = excluded.color;
    `).run(t.name, t.color);
    const row = db.prepare("SELECT id FROM tags WHERE name = ?").get(t.name) as { id: number };
    tagIds.push(row.id);
  }

  // 2. Tạo affiliations ban đầu cho các contact đã có (FR-14, DEC-21)
  const contacts = db.prepare("SELECT id, account_id, title FROM contacts").all() as {
    id: number;
    account_id: number;
    title: string | null;
  }[];

  for (const c of contacts) {
    const existing = db.prepare("SELECT id FROM affiliations WHERE contact_id = ? AND account_id = ?").get(c.id, c.account_id);
    if (!existing) {
      ins(
        "INSERT INTO affiliations (contact_id, account_id, job_title, valid_from, is_current) VALUES (?, ?, ?, datetime('now', '-30 days'), 1)",
        c.id,
        c.account_id,
        c.title ?? "Nhân sự",
      );
    }
  }

  // 3. Gắn tag cho các Lead hiện có
  const leads = db.prepare("SELECT id FROM leads LIMIT 3").all() as { id: number }[];
  if (leads.length > 0 && tagIds.length > 1) {
    db.prepare("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)").run(leads[0].id, tagIds[0]);
    db.prepare("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)").run(leads[0].id, tagIds[1]);
  }
}
