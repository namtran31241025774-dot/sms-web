import type { DatabaseSync } from "node:sqlite";

export function seedWp09(db: DatabaseSync) {
  // 1. Cập nhật liên kết team_id cho người dùng từ team_members nếu bảng tồn tại
  const hasTeamMembers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'team_members'").get();
  if (hasTeamMembers) {
    db.exec(`
      UPDATE users
      SET team_id = (
        SELECT tm.team_id 
        FROM team_members tm 
        WHERE tm.user_id = users.id AND (tm.valid_to IS NULL OR tm.valid_to > datetime('now'))
        LIMIT 1
      )
      WHERE team_id IS NULL;
    `);
  }

  // 2. Nạp thêm nhật ký kiểm toán mẫu nếu chưa có đủ nhật ký phục vụ tra cứu FR-100
  const auditCount = (db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number })?.n ?? 0;
  if (auditCount < 5) {
    const insAudit = db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, from_status, to_status, actor_type, actor_id, actor_label, reason, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);

    insAudit.run(
      "user",
      1,
      "UPDATE_ROLE",
      null,
      null,
      "USER",
      8,
      "Hoàng Gia Khánh (ADMIN)",
      "Phân quyền ban đầu",
      JSON.stringify({ role: "SALES", team: "POD-SMB-NORTH" }),
      "-3 days",
    );

    insAudit.run(
      "lead",
      1,
      "CONVERT",
      "OPEN",
      "CONVERTED",
      "USER",
      1,
      "Nguyễn Văn An (SALES)",
      "Khách hàng đạt chuẩn BANT",
      JSON.stringify({ bant_score: 75, account_name: "Công ty Cổ phần Công nghệ Sao Mai" }),
      "-2 days",
    );

    insAudit.run(
      "opportunity",
      1,
      "STAGE_CHANGE",
      "DEVELOP",
      "PROPOSE",
      "USER",
      2,
      "Trần Thị Bình (SALES)",
      "Hoàn thành khảo sát và biên bản phạm vi",
      JSON.stringify({ old_stage: "DEVELOP", new_stage: "PROPOSE" }),
      "-1 days",
    );

    insAudit.run(
      "quote",
      1,
      "DISCOUNT_APPROVAL",
      "PENDING_APPROVAL",
      "APPROVED",
      "USER",
      5,
      "Phạm Quốc Dũng (SALES_MANAGER)",
      "Chiết khấu 15% khách hàng thân thiết",
      JSON.stringify({ discount_pct: 15, approver: "Phạm Quốc Dũng" }),
      "-4 hours",
    );
  }
}
