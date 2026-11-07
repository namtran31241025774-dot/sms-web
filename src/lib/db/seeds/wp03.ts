import type { DatabaseSync } from "node:sqlite";

export function seedWp03(db: DatabaseSync) {
  // Kiểm tra xem đã có cơ hội mẫu chưa
  const oppCount = (db.prepare("SELECT COUNT(*) AS n FROM opportunities").get() as { n: number })?.n ?? 0;

  // Lấy ID tài khoản và bảng giá đầu tiên
  const account = db.prepare("SELECT id FROM accounts LIMIT 1").get() as { id: number } | undefined;
  const accountId = account?.id ?? 1;

  const priceList = db.prepare("SELECT id FROM price_lists LIMIT 1").get() as { id: number } | undefined;
  const priceListId = priceList?.id ?? 1;

  const user = db.prepare("SELECT id FROM users WHERE role = 'SALES' LIMIT 1").get() as { id: number } | undefined;
  const salesId = user?.id ?? 1;

  const presalesUser = db.prepare("SELECT id FROM users WHERE role = 'PRESALES' LIMIT 1").get() as { id: number } | undefined;
  const presalesId = presalesUser?.id ?? 3;

  const contact = db.prepare("SELECT id FROM contacts LIMIT 1").get() as { id: number } | undefined;
  const contactId = contact?.id ?? 1;

  const competitor = db.prepare("SELECT id FROM competitors LIMIT 1").get() as { id: number } | undefined;
  const competitorId = competitor?.id ?? 1;

  const product = db.prepare("SELECT id, unit_price FROM price_list_items WHERE price_list_id = ? LIMIT 1").get(priceListId) as
    | { id: number; unit_price: number }
    | undefined;
  const productId = product?.id ?? 1;
  const unitPrice = product?.unit_price ?? 3600000;

  if (oppCount < 3) {
    // 1. Cơ hội DEVELOP
    const opp1Id = Number(
      db.prepare(`
        INSERT INTO opportunities (code, name, account_id, primary_contact_id, owner_id, presales_id, stage, amount, close_date, price_list_id, customer_need, need_confirmed, proposed_solution, solution_confirmed, stakeholders_confirmed, competitors_confirmed, importance)
        VALUES ('OPP-2026-001', 'Hệ thống CRM Doanh nghiệp - Nam Việt Tech', ?, ?, ?, ?, 'DEVELOP', 150000000, '2026-11-30', ?, 'Cần chuẩn hóa quy trình bán hàng B2B, quản lý Lead và tích hợp AI', 1, 'Giải pháp SMS Cloud Enterprise 30 Users + Addon AI', 1, 1, 1, 'HIGH')
      `).run(accountId, contactId, salesId, presalesId, priceListId).lastInsertRowid,
    );

    // Gắn Stakeholders (FR-39, BR-19)
    db.prepare(`
      INSERT INTO stakeholders (opportunity_id, contact_id, name, role, notes)
      VALUES (?, ?, 'Trần Văn Quyết', 'DECISION_MAKER', 'Giám đốc Điều hành - Người ký quyết định')
    `).run(opp1Id, contactId);

    db.prepare(`
      INSERT INTO stakeholders (opportunity_id, contact_id, name, role, notes)
      VALUES (?, ?, 'Lê Thu Thảo', 'INFLUENCER', 'Trưởng phòng Kinh doanh - Người sử dụng chính')
    `).run(opp1Id, contactId);

    // Gắn Đối thủ (FR-40)
    db.prepare(`
      INSERT OR IGNORE INTO opportunity_competitors (opportunity_id, competitor_id, notes)
      VALUES (?, ?, 'Chào giá thấp hơn 10% nhưng không có tính năng AI Qualification')
    `).run(opp1Id, competitorId);

    // Gắn Rủi ro (FR-43, HG5)
    db.prepare(`
      INSERT INTO opportunity_risks (opportunity_id, description, severity, status, source)
      VALUES (?, 'Khách hàng yêu cầu tùy biến quy trình phê duyệt phức tạp', 'MEDIUM', 'OPEN', 'USER')
    `).run(opp1Id);

    // Gắn Biên bản phạm vi (FR-37)
    db.prepare(`
      INSERT INTO scope_documents (opportunity_id, version, title, detailed_needs, business_problem, scope_description, scale_users, technical_constraints, status, created_by)
      VALUES (?, 1, 'Biên bản phạm vi giai đoạn 1', 'Quản lý phễu cơ hội và phê duyệt chiết khấu nhiều cấp', 'Thất thoát lead do theo dõi bằng Excel', 'Triển khai SMS Core, BANT Scoring và tích hợp Email', 30, 'Cần kết nối API với hệ thống ERP nội bộ', 'CONFIRMED', ?)
    `).run(opp1Id, salesId);

    // Gắn Sản phẩm cấu hình (FR-38)
    db.prepare(`
      INSERT INTO opportunity_items (opportunity_id, product_id, quantity, duration_months, unit_price, line_total, notes)
      VALUES (?, ?, 30, 12, ?, ?, 'Gói thuê bao chuẩn 30 người dùng')
    `).run(opp1Id, productId, unitPrice, unitPrice * 30);

    // Gắn Hồ sơ giải pháp nội bộ Presales (FR-41, FR-42)
    db.prepare(`
      INSERT INTO solutions (opportunity_id, version, type, title, technical_solution, integration_requirements, deployment_scope, estimated_effort_mandays, expert_review_status, created_by)
      VALUES (?, 1, 'TECHNICAL', 'Phương án kiến trúc triển khai SMS Cloud', 'Triển khai cụm Next.js trên hạ tầng riêng, kết nối DB SQLite WAL', 'REST Webhook 2 chiều', 'Toàn bộ khối kinh doanh và phòng dịch vụ', 15, 'APPROVED', ?)
    `).run(opp1Id, presalesId);

    // Lịch sử chuyển giai đoạn (FR-46)
    db.prepare(`
      INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, moved_by, reason)
      VALUES (?, 'QUALIFY', 'DEVELOP', ?, 'Lead đạt điểm BANT 80')
    `).run(opp1Id, salesId);
  }
}
