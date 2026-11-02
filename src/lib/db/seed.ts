// Dữ liệu mẫu cho demo (tên doanh nghiệp/người là hư cấu).
import type { DatabaseSync } from "node:sqlite";
import { backfillQuoteAccounts, backfillQuoteVersions } from "./migrations/wp12_001_backfill_quote_versions";
import { SETTING_DEFAULTS } from "../settings-defaults";
import { runAllSeeds } from "./seeds";

export function seed(db: DatabaseSync) {
  const ins = (sql: string, ...p: (string | number | null)[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  db.exec("BEGIN");
  try {
    const U = (name: string, email: string, role: string, title: string) =>
      ins("INSERT INTO users (name, email, role, title) VALUES (?,?,?,?)", name, email, role, title);
    const sdr = U("Nguyễn Văn An", "an.nguyen@sms.local", "SALES", "SDR");
    const ae = U("Trần Thị Bình", "binh.tran@sms.local", "SALES", "Account Executive");
    const presales = U("Lê Minh Châu", "chau.le@sms.local", "PRESALES", "Solution Engineer");
    const manager = U("Phạm Quốc Dũng", "dung.pham@sms.local", "SALES_MANAGER", "Sales Manager");
    U("Võ Thu Hà", "ha.vo@sms.local", "FINANCE", "Kế toán công nợ");
    const delivery = U("Đặng Hải Long", "long.dang@sms.local", "DELIVERY", "Nhân viên triển khai kỹ thuật");
    const retired = U("Bùi Mai Lan", "lan.bui@sms.local", "SALES", "Nhân viên kinh doanh");
    db.prepare("UPDATE users SET active = 0, status = 'INACTIVE' WHERE id = ?").run(retired); // giữ chỗ để không đổi ID dữ liệu mẫu
    U("Hoàng Gia Khánh", "khanh.hoang@sms.local", "ADMIN", "Quản trị hệ thống");

    for (const [k, v] of Object.entries(SETTING_DEFAULTS)) {
      ins("INSERT INTO settings (key, value, description) VALUES (?,?,?)", k, v.value, v.description);
    }

    // ----- Sản phẩm & bảng giá
    const P = (code: string, name: string, type: string, unit: string, desc: string) =>
      ins("INSERT INTO products (code, name, type, unit, description) VALUES (?,?,?,?,?)", code, name, type, unit, desc);
    const pStd = P("SC-STD", "Sales Cloud – Standard", "SUBSCRIPTION", "user/năm", "CRM bán hàng: Lead, Opportunity, báo giá");
    const pPro = P("SC-PRO", "Sales Cloud – Professional", "SUBSCRIPTION", "user/năm", "Standard + CPQ, dashboard nâng cao");
    const pAi = P("SC-AI", "Add-on AI Sales Agents", "SUBSCRIPTION", "user/năm", "Qualification Agent & Opportunity Agent");
    const pImpl = P("SV-IMPL", "Triển khai & cấu hình", "SERVICE", "man-day", "Cấu hình quy trình, phân quyền, tích hợp");
    const pMig = P("SV-MIG", "Chuyển đổi dữ liệu", "SERVICE", "gói", "Làm sạch & nạp dữ liệu khách hàng cũ");
    const pTrain = P("SV-TRAIN", "Đào tạo người dùng", "TRAINING", "buổi", "Đào tạo tối đa 20 người/buổi");
    const pl = ins("INSERT INTO price_lists (name, currency) VALUES (?, 'VND')", "Bảng giá chuẩn 2026");
    const price: [number, number][] = [
      [pStd, 3_600_000], [pPro, 6_000_000], [pAi, 2_400_000], [pImpl, 4_000_000], [pMig, 25_000_000], [pTrain, 8_000_000],
    ];
    for (const [pid, p] of price) ins("INSERT INTO price_list_items (price_list_id, product_id, unit_price) VALUES (?,?,?)", pl, pid, p);

    const C = (name: string, web: string | null, s: string, w: string) =>
      ins("INSERT INTO competitors (name, website, strengths, weaknesses) VALUES (?,?,?,?)", name, web, s, w);
    const cA = C("CloudCRM Global", "mock://cloudcrm", "Thương hiệu quốc tế, hệ sinh thái lớn", "Giá cao, triển khai lâu");
    C("VietSales Suite", "mock://vietsales", "Giá rẻ, hỗ trợ tiếng Việt", "Ít tính năng AI, khó mở rộng");
    const cC = C("Bảng tính nội bộ (Excel)", null,"Không tốn phí bản quyền", "Không có quy trình, dễ sai lệch");

    // ----- Accounts & contacts có sẵn
    const A = (name: string, norm: string, industry: string, domain: string, address: string, size: string, owner: number) =>
      ins("INSERT INTO accounts (name, name_norm, industry, email_domain, address, employee_size, owner_id) VALUES (?,?,?,?,?,?,?)", name, norm, industry, domain, address, size, owner);
    const accMinhTam = A("Công ty CP Giải pháp số Minh Tâm", "giai phap so minh tam", "Dịch vụ CNTT", "minhtam.vn", "12 Trần Phú, Hải Châu, Đà Nẵng", "100–200", ae);
    const accHoaPhat = A("Công ty TNHH Bao bì Hòa Phát Nam", "bao bi hoa phat nam", "Sản xuất – Bao bì", "baobihpn.vn", "KCN Sóng Thần, Dĩ An, Bình Dương", "200–500", ae);
    const accTanCang = A("Công ty CP Phân phối Tân Cảng", "phan phoi tan cang", "Phân phối – FMCG", "tancangdist.vn", "88 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh", "500+", ae);

    const K = (acc: number, name: string, title: string, email: string, phone: string, primary = 0) =>
      ins("INSERT INTO contacts (account_id, full_name, title, email, phone, is_primary) VALUES (?,?,?,?,?,?)", acc, name, title, email, phone, primary);
    const kMT = K(accMinhTam, "Ngô Thanh Tâm", "CEO", "tam.ngo@minhtam.vn", "0905111222", 1);
    K(accMinhTam, "Lý Hoàng Nam", "Trưởng phòng Kinh doanh", "nam.ly@minhtam.vn", "0905333444");
    const kHP = K(accHoaPhat, "Đỗ Thị Hạnh", "Giám đốc Kinh doanh", "hanh.do@baobihpn.vn", "0918555666", 1);
    const kTC = K(accTanCang, "Trịnh Văn Phúc", "CIO", "phuc.trinh@tancangdist.vn", "0909777888", 1);

    // ----- Leads
    const L = (company: string, norm: string, contact: string, title: string | null, email: string | null, phone: string | null, address: string | null, source: string, notes: string | null, owner: number, createdAgo: number) =>
      ins(
        `INSERT INTO leads (company_name, company_norm, contact_name, contact_title, email, phone, address, source, notes, owner_id, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        company, norm, contact, title, email, phone, address, source, notes, owner, owner, daysAgo(createdAgo), daysAgo(createdAgo),
      );
    L("Công ty CP Thép Nam Việt", "thep nam viet", "Phan Văn Hùng", "Giám đốc Kinh doanh", "hung.phan@thepnamviet.vn", "0912345678",
      "45 Đại lộ Bình Dương, Thủ Dầu Một, binh duong", "WEBSITE",
      "Điền form website: cần CRM cho đội kinh doanh 20 người, đang quản lý pipeline bằng Excel. Muốn triển khai trong Q1/2027.", sdr, 2);
    L("Dược phẩm An Khang", "duoc pham an khang", "Mai Thị Thu", "Trưởng phòng Sales Ops", "thu.mai@ankhangpharma.vn", "0987654321",
      "120 Lê Lợi, Quận 1, ho chi minh", "MARKETING", "Tham dự webinar 'AI cho đội Sales'. Hỏi về tích hợp ERP.", sdr, 4);
    L("Logistics Sông Hồng", "logistics song hong", "Vũ Đức Minh", "Nhân viên IT", "minh.vu@songhonglog.vn", null,
      "Long Biên, ha noi", "IMPORT", "Danh sách từ hội chợ triển lãm.", sdr, 6);
    L("Cty TNHH Giải Pháp Số Minh Tâm", "giai phap so minh tam", "Lý Hoàng Nam", "Trưởng phòng Kinh doanh", "nam.ly@minhtam.vn", "0905333444",
      null, "REFERRAL", "Khách hiện hữu giới thiệu thêm nhu cầu add-on AI.", sdr, 1);
    const lConv = L("Công ty TNHH Bao bì Hòa Phát Nam", "bao bi hoa phat nam", "Đỗ Thị Hạnh", "Giám đốc Kinh doanh", "hanh.do@baobihpn.vn", "0918555666",
      "KCN Sóng Thần, Dĩ An, Bình Dương", "WEBSITE", "Cần chuẩn hóa quy trình báo giá cho 3 chi nhánh.", sdr, 40);
    db.prepare(
      `UPDATE leads SET status='CONVERTED', bant_budget=20, bant_authority=22, bant_need=22, bant_timeline=16, bant_score=80,
       bant_notes='Ngân sách đã duyệt 2026; GĐKD là người quyết định; cần CPQ; go-live trước Tết', converted_account_id=?, converted_contact_id=?, converted_at=? WHERE id=?`,
    ).run(accHoaPhat, kHP, daysAgo(35), lConv);

    // ----- Opportunities
    const O = (code: string, name: string, acc: number, contact: number, stage: string, amount: number, close: string, need: string | null, solution: string | null, flags: [number, number, number, number], lead: number | null, createdAgo: number) =>
      ins(
        `INSERT INTO opportunities (code, name, account_id, primary_contact_id, owner_id, presales_id, lead_id, stage, amount, close_date, price_list_id,
           customer_need, proposed_solution, need_confirmed, solution_confirmed, stakeholders_confirmed, competitors_confirmed, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code, name, acc, contact, ae, presales, lead, stage, amount, close, pl, need, solution, ...flags, daysAgo(createdAgo), daysAgo(Math.max(0, createdAgo - 3)),
      );
    const y = new Date().getFullYear();
    const oMT = O(`OPP-${y}-0001`, "Minh Tâm – Sales Cloud Pro + AI", accMinhTam, kMT, "DEVELOP", 420_000_000, inDays(45),
      "Đội sales 15 người, pipeline trên Excel; cần dự báo doanh thu và nhắc follow-up tự động.", null, [1, 0, 0, 0], null, 12);
    const oTC = O(`OPP-${y}-0002`, "Tân Cảng – Chuẩn hóa bán hàng kênh phân phối", accTanCang, kTC, "PROPOSE", 780_000_000, inDays(20),
      "120 nhân viên bán hàng kênh GT/MT; cần quản lý báo giá theo vùng và tích hợp ERP hiện có.",
      "Sales Cloud Professional 120 user + triển khai 40 man-day + chuyển đổi dữ liệu + 3 buổi đào tạo.", [1, 1, 1, 1], null, 30);
    const oHP = O(`OPP-${y}-0003`, "Hòa Phát Nam – CRM & báo giá 3 chi nhánh", accHoaPhat, kHP, "WON", 252_000_000, inDays(-10),
      "Chuẩn hóa quy trình báo giá cho 3 chi nhánh.", "Sales Cloud Standard 40 user + triển khai 20 man-day + 2 buổi đào tạo.", [1, 1, 1, 1], lConv, 35);
    db.prepare("UPDATE leads SET converted_opportunity_id=? WHERE id=?").run(oHP, lConv);
    db.prepare("UPDATE opportunities SET closed_at=? WHERE id=?").run(daysAgo(10), oHP);

    ins("INSERT INTO stakeholders (opportunity_id, name, role, notes) VALUES (?,?,?,?)", oMT, "Lý Hoàng Nam", "CHAMPION", "Người dùng chính, ủng hộ mạnh");
    ins("INSERT INTO stakeholders (opportunity_id, name, role, notes) VALUES (?,?,?,?)", oTC, "Trịnh Văn Phúc", "DECISION_MAKER", "CIO, quyết định cuối cùng");
    ins("INSERT INTO stakeholders (opportunity_id, name, role, notes) VALUES (?,?,?,?)", oTC, "Phòng Tài chính", "INFLUENCER", "Quan tâm tổng chi phí 3 năm");
    ins("INSERT INTO stakeholders (opportunity_id, name, role) VALUES (?,?,?)", oHP, "Đỗ Thị Hạnh", "DECISION_MAKER");
    ins("INSERT INTO opportunity_competitors (opportunity_id, competitor_id, notes) VALUES (?,?,?)", oMT, cC, "Đang dùng Excel");
    ins("INSERT INTO opportunity_competitors (opportunity_id, competitor_id, notes) VALUES (?,?,?)", oTC, cA, "Đã nhận demo từ CloudCRM");
    ins("INSERT INTO opportunity_competitors (opportunity_id, competitor_id) VALUES (?,?)", oHP, cC);

    const act = (et: string, eid: number, type: string, dir: string | null, subject: string, body: string, ago: number, by: number) =>
      ins("INSERT INTO activities (entity_type, entity_id, type, direction, subject, body, occurred_at, created_by) VALUES (?,?,?,?,?,?,?,?)", et, eid, type, dir, subject, body, daysAgo(ago), by);
    act("opportunity", oMT, "MEETING", null, "Họp khảo sát nhu cầu", "CEO muốn dashboard dự báo; anh Nam lo ngại thời gian nhập liệu.", 8, ae);
    act("opportunity", oMT, "EMAIL", "IN", "Re: Lịch demo Sales Cloud", "Bên em sắp xếp demo tuần sau được không ạ?", 5, ae);
    act("opportunity", oTC, "MEETING", null, "Workshop giải pháp với CIO", "Yêu cầu tích hợp ERP, phân quyền theo vùng.", 14, presales);
    act("opportunity", oTC, "EMAIL", "OUT", "Gửi tài liệu kiến trúc tích hợp", "Đính kèm tài liệu kiến trúc tích hợp ERP.", 10, ae);

    // ----- Quote đang chờ duyệt cho Tân Cảng (chiết khấu 15% > 10%)
    const qTC = ins(
      "INSERT INTO quotes (code, opportunity_id, revision, status, price_list_id, valid_until, created_by, created_at) VALUES (?,?,1,'PENDING_APPROVAL',?,?,?,?)",
      `Q-${y}-0001`, oTC, pl, inDays(25), ae, daysAgo(2),
    );
    const QL = (q: number, p: number, qty: number, unit: number, disc: number) =>
      ins("INSERT INTO quote_lines (quote_id, product_id, quantity, unit_price, discount_pct, line_total) VALUES (?,?,?,?,?,?)", q, p, qty, unit, disc, Math.round(qty * unit * (1 - disc / 100)));
    QL(qTC, pPro, 120, 6_000_000, 15);
    QL(qTC, pImpl, 40, 4_000_000, 0);
    QL(qTC, pMig, 1, 25_000_000, 0);
    QL(qTC, pTrain, 3, 8_000_000, 0);
    const recompute = (q: number) => {
      const r = db.prepare("SELECT SUM(quantity*unit_price) s, SUM(line_total) t, MAX(discount_pct) m FROM quote_lines WHERE quote_id=?").get(q) as { s: number; t: number; m: number };
      db.prepare("UPDATE quotes SET subtotal=?, discount_total=?, total=?, max_discount_pct=? WHERE id=?").run(r.s, r.s - r.t, r.t, r.m, q);
      return r.t;
    };
    recompute(qTC);
    ins("INSERT INTO approvals (kind, entity_type, entity_id, reason, requested_by, created_at) VALUES ('QUOTE_DISCOUNT','quote',?,?,?,?)",
      qTC, "Chiết khấu tối đa 15% vượt thẩm quyền 10%", ae, daysAgo(2));

    // ----- Deal đã thắng: Quote accepted → Order → Fulfillment → Invoice
    const qHP = ins(
      "INSERT INTO quotes (code, opportunity_id, revision, status, price_list_id, valid_until, created_by, approved_at, sent_at, responded_at, created_at) VALUES (?,?,1,'ACCEPTED',?,?,?,?,?,?,?)",
      `Q-${y}-0002`, oHP, pl, inDays(-5), ae, daysAgo(20), daysAgo(19), daysAgo(12), daysAgo(21),
    );
    QL(qHP, pStd, 40, 3_600_000, 5);
    QL(qHP, pImpl, 20, 4_000_000, 0);
    QL(qHP, pTrain, 2, 8_000_000, 0);
    const totalHP = recompute(qHP);
    db.prepare("UPDATE opportunities SET amount=? WHERE id=?").run(totalHP, oHP);
    const ord = ins(
      "INSERT INTO orders (code, quote_id, opportunity_id, account_id, status, total, price_locked_at, created_by, created_at) VALUES (?,?,?,?,'IN_FULFILLMENT',?,?,?,?)",
      `SO-${y}-0001`, qHP, oHP, accHoaPhat, totalHP, daysAgo(10), ae, daysAgo(10),
    );
    const lines = db.prepare("SELECT ql.*, p.type, p.name, p.unit FROM quote_lines ql JOIN products p ON p.id = ql.product_id WHERE quote_id=?").all(qHP) as {
      product_id: number; quantity: number; unit_price: number; discount_pct: number; line_total: number; type: string; name: string; unit: string;
    }[];
    lines.forEach((l, i) => {
      const olId = ins("INSERT INTO order_lines (order_id, product_id, quantity, unit_price, discount_pct, line_total) VALUES (?,?,?,?,?,?)", ord, l.product_id, l.quantity, l.unit_price, l.discount_pct, l.line_total);
      const type = l.type === "SUBSCRIPTION" ? "LICENSE" : l.type === "TRAINING" ? "TRAINING" : "DEPLOYMENT";
      ins("INSERT INTO fulfillment_tasks (order_id, order_line_id, type, description, status, assignee_id) VALUES (?,?,?,?,?,?)",
        ord, olId, type, `${l.name} × ${l.quantity} ${l.unit}`, i === 0 ? "DONE" : i === 1 ? "IN_PROGRESS" : "PENDING", delivery);
    });
    const deposit = Math.round(totalHP * 0.5);
    const inv = ins(
      "INSERT INTO invoices (code, order_id, milestone, amount, due_date, status, paid_amount, erp_ref, created_by, issued_at) VALUES (?,?,?,?,?,'PAID',?,?,?,?)",
      `INV-${y}-0001`, ord, "Tạm ứng 50% khi ký đơn hàng", deposit, inDays(-3), deposit, `ERP-INV-${y}-0001`, ae, daysAgo(9),
    );
    ins("INSERT INTO payments (invoice_id, amount, paid_at, method, reference, source) VALUES (?,?,?,?,?, 'ERP')", inv, deposit, daysAgo(5), "Chuyển khoản", "UNC-778812");

    // ----- Nhật ký khởi tạo
    const log = (et: string, id: number, action: string, to: string | null) =>
      ins("INSERT INTO audit_log (entity_type, entity_id, action, to_status, actor_type, actor_label, reason) VALUES (?,?,?,?, 'SYSTEM', 'Hệ thống', 'Dữ liệu mẫu')", et, id, action, to);
    log("opportunity", oMT, "CREATE", "DEVELOP");
    log("opportunity", oTC, "CREATE", "PROPOSE");
    log("opportunity", oHP, "CREATE", "WON");
    log("order", ord, "CREATE", "IN_FULFILLMENT");
    void manager;

    // Chạy các seed mở rộng của từng WP (WP-00, WP-01, ...)
    runAllSeeds(db);

    backfillQuoteVersions(db);
    backfillQuoteAccounts(db);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
