import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  calculateLeadRating,
  recordSurvey,
  scoreBant,
  convertLeadToOpportunity,
  batchConvertLeads,
  disqualifyLeadWithReason,
  reactivateDisqualifiedLead,
} from "@/lib/services/qualification";
import {
  getOpportunity,
  updateOpportunity,
  createScopeDocument,
  confirmScopeDocument,
  getScopeDocument,
  addOpportunityItem,
  removeOpportunityItem,
  listOpportunityItems,
  createSolution,
  isExpertReviewRequired,
  managerGate,
  submitExpertReview,
  reviewExpertSolution,
  addStakeholder,
  stakeholdersOf,
  addCompetitor,
  competitorsOf,
  setChecklist,
  advanceStage,
  markLost,
  reopenOpportunity,
  getOpportunityForQuote,
  stageHistoryOf,
} from "@/lib/services/opportunities";
import { addRisk, listRisks, updateRiskStatus } from "@/lib/services/risks";
import type { Actor } from "@/lib/services/core";

describe("WP-03: Đánh giá khách hàng & Phát triển cơ hội (FR-30 → FR-47)", () => {
  const salesActor: Actor = { type: "USER", id: 1, name: "Sales Test", role: "SALES" };
  const salesMgrActor: Actor = { type: "USER", id: 2, name: "Manager Test", role: "SALES_MANAGER" };
  const presalesActor: Actor = { type: "USER", id: 3, name: "Presales Test", role: "PRESALES" };
  const presalesMgrActor: Actor = { type: "USER", id: 4, name: "Presales Mgr Test", role: "PRESALES_MANAGER" };
  const aiActor: Actor = { type: "AI", agent: "QUALIFICATION", runId: 1 };

  let testLeadId: number;
  let testAccountId: number;
  let testContactId: number;
  let testPriceListId: number;
  let testProductId: number;

  beforeEach(() => {
    db().prepare("INSERT OR IGNORE INTO teams(id,code,name,leader_id) VALUES (991,'TEST-SCOPE','Test Scope',2)").run();
    for(const user of [1,3,4]) db().prepare("INSERT OR IGNORE INTO team_members(team_id,user_id) VALUES (991,?)").run(user);
    // Thiết lập dữ liệu mẫu
    const acc = db().prepare("SELECT id FROM accounts LIMIT 1").get() as { id: number } | undefined;
    if (acc) {
      testAccountId = acc.id;
    } else {
      const ins = db().prepare("INSERT INTO accounts (name, name_norm) VALUES ('Tập đoàn An Nam', 'tap doan an nam')").run();
      testAccountId = Number(ins.lastInsertRowid);
    }

    const con = db().prepare("SELECT id FROM contacts WHERE account_id = ? LIMIT 1").get(testAccountId) as { id: number } | undefined;
    if (con) {
      testContactId = con.id;
    } else {
      const ins = db().prepare("INSERT INTO contacts (account_id, full_name, email) VALUES (?, 'Nguyễn Văn A', 'an@annam.vn')").run(testAccountId);
      testContactId = Number(ins.lastInsertRowid);
    }

    const pl = db().prepare("SELECT id FROM price_lists LIMIT 1").get() as { id: number } | undefined;
    if (pl) {
      testPriceListId = pl.id;
    } else {
      const ins = db().prepare("INSERT INTO price_lists (name, currency) VALUES ('Bảng giá 2026', 'VND')").run();
      testPriceListId = Number(ins.lastInsertRowid);
    }

    const pr = db().prepare("SELECT id FROM products LIMIT 1").get() as { id: number } | undefined;
    if (pr) {
      testProductId = pr.id;
    } else {
      const ins = db().prepare("INSERT INTO products (code, name, type, unit) VALUES ('CRM-PRO', 'Gói CRM Pro', 'SUBSCRIPTION', 'Gói/Năm')").run();
      testProductId = Number(ins.lastInsertRowid);
      db().prepare("INSERT OR REPLACE INTO price_list_items (price_list_id, product_id, unit_price) VALUES (?, ?, 50000000)").run(testPriceListId, testProductId);
    }

    const lIns = db().prepare(`
      INSERT INTO leads (company_name, company_norm, contact_name, email, phone, status, owner_id)
      VALUES ('Công ty ABC Tech', 'cong ty abc tech', 'Trần Thị B', 'b@abctech.vn', '0912345678', 'OPEN', 1)
    `).run();
    testLeadId = Number(lIns.lastInsertRowid);
    db().prepare('UPDATE leads SET team_id=991 WHERE id=?').run(testLeadId);
  });

  // ===== FR-30: Khảo sát sơ bộ nhu cầu khách hàng =====
  describe("FR-30: Khảo sát sơ bộ nhu cầu khách hàng", () => {
    it("ghi nhận kết quả khảo sát sơ bộ bài toán nghiệp vụ, quy mô và phần mềm hiện tại", () => {
      recordSurvey(salesActor, testLeadId, {
        business_problem: "Cần quản lý phễu bán hàng B2B và quản lý đội ngũ sales",
        user_scale: 25,
        current_software: "Excel và Google Sheets",
        notes: "Khách đang mở rộng đội ngũ thêm 10 người",
      });

      const survey = db().prepare("SELECT * FROM lead_assessments WHERE lead_id = ?").get(testLeadId) as
        | { business_problem: string; user_scale: number; current_software: string }
        | undefined;
      expect(survey).toBeDefined();
      expect(survey?.business_problem).toContain("quản lý phễu bán hàng");
      expect(survey?.user_scale).toBe(25);
      expect(survey?.current_software).toBe("Excel và Google Sheets");
    });
  });

  // ===== FR-31: Đánh giá BANT & Xếp hạng Lead =====
  describe("FR-31: Đánh giá BANT theo thang 0–100 & Xếp hạng Lead (BR-01, BR-02)", () => {
    it("tính toán xếp hạng HOT/WARM/COLD theo đúng chuẩn BR-01 và BR-02", () => {
      // HOT: Đạt chuẩn (tổng >= 60 và authority > 0) và mua trong tháng / cuối quý
      expect(calculateLeadRating(70, 20, "IN_MONTH", 60, 40)).toBe("HOT");
      expect(calculateLeadRating(60, 15, "END_OF_QUARTER", 60, 40)).toBe("HOT");

      // WARM: 40-59, hoặc đạt chuẩn nhưng mua năm sau
      expect(calculateLeadRating(50, 15, "IN_MONTH", 60, 40)).toBe("WARM");
      expect(calculateLeadRating(80, 20, "NEXT_YEAR", 60, 40)).toBe("WARM");

      // COLD: Tổng < 40 hoặc authority = 0 hoặc chưa rõ
      expect(calculateLeadRating(35, 10, "IN_MONTH", 60, 40)).toBe("COLD");
      expect(calculateLeadRating(75, 0, "IN_MONTH", 60, 40)).toBe("COLD");
    });

    it("chấm điểm BANT và cập nhật điểm số cùng xếp hạng vào Lead", () => {
      const res = scoreBant(salesActor, testLeadId, {
        budget: 20,
        authority: 20,
        need: 20,
        timeline: 15,
        timeline_frame: "END_OF_QUARTER",
        notes: "Khách có ngân sách rõ ràng, dự kiến mua cuối quý này",
      });

      expect(res.totalScore).toBe(75);
      expect(res.rating).toBe("HOT");

      const lead = db().prepare("SELECT bant_score, status FROM leads WHERE id = ?").get(testLeadId) as
        | { bant_score: number; status: string }
        | undefined;
      expect(lead?.bant_score).toBe(75);
    });
  });

  // ===== FR-33: Chuyển đổi Lead thành Cơ hội (HG3) =====
  describe("FR-33: Chuyển đổi Lead thành Cơ hội (Cổng HG3)", () => {
    it("chuyển đổi thành công khi BANT đạt chuẩn và tạo cơ hội ở giai đoạn DEVELOP", () => {
      scoreBant(salesActor, testLeadId, {
        budget: 20,
        authority: 20,
        need: 15,
        timeline: 15,
      });

      const conv = convertLeadToOpportunity(salesActor, testLeadId, {
        account_action: "new",
        contact_action: "new",
        opportunity_name: "Dự án CRM Cho ABC Tech",
        owner_id: 1,
        amount: 150000000,
        close_date: "2026-12-31",
      });

      expect(conv.opportunity_id).toBeDefined();
      const opp = getOpportunity(conv.opportunity_id);
      expect(opp).toBeDefined();
      expect(opp?.stage).toBe("DEVELOP");
      expect(opp?.name).toBe("Dự án CRM Cho ABC Tech");
      expect(opp?.amount).toBe(150000000);

      // Lead đổi trạng thái thành CONVERTED
      const lead = db().prepare("SELECT status, converted_opportunity_id FROM leads WHERE id = ?").get(testLeadId) as
        | { status: string; converted_opportunity_id: number }
        | undefined;
      expect(lead?.status).toBe("CONVERTED");
      expect(lead?.converted_opportunity_id).toBe(conv.opportunity_id);
    });

    it("chặn AI tự động chuyển đổi khi ai_auto_convert=false (DEC-03)", () => {
      scoreBant(salesActor, testLeadId, { budget: 25, authority: 25, need: 25, timeline: 25 });
      expect(() => {
        convertLeadToOpportunity(aiActor, testLeadId, {
          account_action: "new",
          contact_action: "new",
          opportunity_name: "AI Auto Opp",
          owner_id: 1,
        });
      }).toThrow(/DEC-03: AI Agent không được phép tự động chuyển đổi Lead/);
    });

    it("hỗ trợ chuyển đổi hàng loạt (batchConvertLeads)", () => {
      const l2 = Number(db().prepare("INSERT INTO leads (company_name, company_norm, contact_name, status, bant_score, bant_authority,owner_id,team_id) VALUES ('Cty XYZ', 'cty xyz', 'Anh C', 'OPEN', 70, 20,1,991)").run().lastInsertRowid);
      const l3 = Number(db().prepare("INSERT INTO leads (company_name, company_norm, contact_name, status, bant_score, bant_authority,owner_id,team_id) VALUES ('Cty DEF', 'cty def', 'Chị D', 'OPEN', 65, 15,1,991)").run().lastInsertRowid);

      const batch = batchConvertLeads(salesActor, [l2, l3]);
      expect(batch.successCount).toBe(2);
      expect(batch.results.length).toBe(2);
    });
  });

  // ===== FR-34: Loại Lead & Tái kích hoạt (HG2) =====
  describe("FR-34: Loại Lead và Tái kích hoạt Lead đã loại (Cổng HG2)", () => {
    it("loại lead kèm lý do bắt buộc và cho phép tái kích hoạt", () => {
      disqualifyLeadWithReason(salesActor, testLeadId, "Không có ngân sách", "Khách hàng xác nhận hết budget năm nay");

      const l1 = db().prepare("SELECT status, disqualify_reason FROM leads WHERE id = ?").get(testLeadId) as
        | { status: string; disqualify_reason: string }
        | undefined;
      expect(l1?.status).toBe("DISQUALIFIED");
      expect(l1?.disqualify_reason).toContain("Không có ngân sách");

      reactivateDisqualifiedLead(salesActor, testLeadId);
      const l2 = db().prepare("SELECT status, disqualify_reason FROM leads WHERE id = ?").get(testLeadId) as
        | { status: string; disqualify_reason: string | null }
        | undefined;
      expect(l2?.status).toBe("WORKING");
      expect(l2?.disqualify_reason).toBeNull();
    });

    it("bắt buộc ghi chú khi chọn lý do 'Khác'", () => {
      expect(() => {
        disqualifyLeadWithReason(salesActor, testLeadId, "Khác", "");
      }).toThrow(/bắt buộc phải nhập ghi chú/);
    });
  });

  // ===== FR-35, FR-37, FR-38: Hồ sơ cơ hội, Biên bản phạm vi & Cấu hình sản phẩm =====
  describe("FR-35, FR-37, FR-38: Thông tin chung, Biên bản phạm vi & Sản phẩm", () => {
    let oppId: number;

    beforeEach(() => {
      scoreBant(salesActor, testLeadId, { budget: 20, authority: 20, need: 20, timeline: 20 });
      const conv = convertLeadToOpportunity(salesActor, testLeadId, {
        account_action: "new",
        contact_action: "new",
        opportunity_name: "Cơ hội Thử Nghiệm",
        owner_id: 1,
      });
      oppId = conv.opportunity_id;
    });

    it("FR-35: xem và cập nhật thông tin chung cơ hội, ngân sách, ngày chốt", () => {
      updateOpportunity(salesActor, oppId, {
        name: "Cơ hội Mới Đổi Tên",
        budget: 200000000,
        close_date: "2026-11-30",
        price_list_id: testPriceListId,
        importance: "HIGH",
      });

      const opp = getOpportunity(oppId);
      expect(opp?.name).toBe("Cơ hội Mới Đổi Tên");
      expect(opp?.budget).toBe(200000000);
      expect(opp?.close_date).toBe("2026-11-30");
      expect(opp?.price_list_id).toBe(testPriceListId);
      expect(opp?.importance).toBe("HIGH");
    });

    it("FR-37: lập biên bản phạm vi triển khai và xác nhận tự động tích need_confirmed = 1", () => {
      const doc = createScopeDocument(salesActor, oppId, {
        title: "Biên bản phạm vi triển khai giai đoạn 1",
        content: "Triển khai module Bán hàng và Báo cáo",
        deliverables: "Tài liệu đào tạo và hệ thống CRM chạy thực tế",
      });

      const sDoc = getScopeDocument(oppId);
      expect(sDoc).toBeDefined();
      expect(sDoc?.status).toBe("DRAFT");

      // Xác nhận biên bản
      confirmScopeDocument(salesActor, doc.id);
      const updatedDoc = getScopeDocument(oppId);
      expect(updatedDoc?.status).toBe("CONFIRMED");

      const opp = getOpportunity(oppId);
      expect(opp?.need_confirmed).toBe(1);
    });

    it("FR-38: cấu hình sản phẩm/dịch vụ và tự động tính lại tổng doanh thu cơ hội (amount)", () => {
      updateOpportunity(salesActor, oppId, { price_list_id: testPriceListId });

      addOpportunityItem(salesActor, oppId, {
        product_id: testProductId,
        quantity: 2,
        unit_price: 50000000,
        discount_pct: 10, // 2 * 50,000,000 * 0.9 = 90,000,000
      });

      const items = listOpportunityItems(oppId);
      expect(items.length).toBe(1);
      expect(items[0].amount).toBe(90000000);

      const opp = getOpportunity(oppId);
      expect(opp?.amount).toBe(90000000);

      // Thêm sản phẩm thứ 2
      addOpportunityItem(salesActor, oppId, {
        product_id: testProductId,
        quantity: 1,
        unit_price: 30000000,
        discount_pct: 0,
      });

      const opp2 = getOpportunity(oppId);
      expect(opp2?.amount).toBe(120000000);

      // Xóa sản phẩm thứ 2
      const itemsAfter = listOpportunityItems(oppId);
      removeOpportunityItem(salesActor, itemsAfter[1].id);
      const opp3 = getOpportunity(oppId);
      expect(opp3?.amount).toBe(90000000);
    });
  });

  // ===== FR-39, FR-40, FR-41, FR-42, FR-43: Stakeholders, Giải pháp, Rủi ro (HG5) =====
  describe("FR-39 → FR-43: Stakeholders, Đối thủ, Presales và Rủi ro (HG5)", () => {
    let oppId: number;

    beforeEach(() => {
      scoreBant(salesActor, testLeadId, { budget: 20, authority: 20, need: 20, timeline: 20 });
      const conv = convertLeadToOpportunity(salesActor, testLeadId, {
        account_action: "new",
        contact_action: "new",
        opportunity_name: "Cơ hội Presales & Rủi ro",
        owner_id: 1,
      });
      oppId = conv.opportunity_id;
    });

    it("FR-39: hỗ trợ một người liên hệ giữ nhiều vai trò trong cùng cơ hội (BR-19)", () => {
      addStakeholder(salesActor, oppId, {
        name: "Lê Văn Giám Đốc",
        role: "DECISION_MAKER",
        contact_id: testContactId,
      });

      addStakeholder(salesActor, oppId, {
        name: "Lê Văn Giám Đốc",
        role: "USER",
        contact_id: testContactId,
        notes: "Vừa quyết định vừa trực tiếp dùng báo cáo",
      });

      const sh = stakeholdersOf(oppId);
      expect(sh.length).toBe(2);
      expect(sh.map((s) => s.role)).toContain("DECISION_MAKER");
      expect(sh.map((s) => s.role)).toContain("USER");
    });

    it("FR-40: ghi nhận và quản lý đối thủ cạnh tranh trên cơ hội", () => {
      const comp = db().prepare("SELECT id FROM competitors LIMIT 1").get() as { id: number } | undefined;
      let compId = comp?.id;
      if (!compId) {
        compId = Number(db().prepare("INSERT INTO competitors (name) VALUES ('Đối thủ X')").run().lastInsertRowid);
      }

      addCompetitor(salesActor, oppId, compId, "Khách đang cân nhắc giải pháp của Đối thủ X");
      const list = competitorsOf(oppId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it("FR-41 & FR-42: lập hồ sơ giải pháp và thực hiện Cổng duyệt chuyên môn (BR-07)", () => {
      createSolution(presalesActor, oppId, {
        title: "Phương án kỹ thuật tích hợp SAP ERP",
        technical_approach: "Sử dụng RESTful API và Message Queue",
        architecture: "Hybrid Cloud",
        estimated_effort_mandays: 35, // >= 30 mandays và có tích hợp -> kích hoạt BR-07
        integration_required: true,
      });

      const opp = getOpportunity(oppId)!;
      const check = isExpertReviewRequired(opp);
      expect(check.required).toBe(true);
      expect(check.reason).toContain("tích hợp");

      // Gửi duyệt chuyên môn
      submitExpertReview(salesActor, oppId);
      const pendingOpp = getOpportunity(oppId);
      expect(pendingOpp?.expert_review_status).toBe("PENDING");

      // Nhân viên thường không có quyền duyệt
      expect(() => {
        reviewExpertSolution(salesActor, oppId, "APPROVED");
      }).toThrow(/Chỉ Quản lý tư vấn giải pháp/);

      // PRESALES_MANAGER duyệt
      reviewExpertSolution(presalesMgrActor, oppId, "APPROVED", "Phương án thiết kế đạt chuẩn kiến trúc");
      const approvedOpp = getOpportunity(oppId);
      expect(approvedOpp?.expert_review_status).toBe("APPROVED");
      expect(approvedOpp?.solution_confirmed).toBe(0);
      setChecklist(salesActor,oppId,'solution_confirmed',true);
      expect(getOpportunity(oppId)?.solution_confirmed).toBe(1);
    });

    it("FR-43: quản lý rủi ro 4 trạng thái và Cổng HG5 bắt buộc lý do khi bỏ qua (DISMISSED)", () => {
      const risk = addRisk(salesActor, oppId, {
        description: "Rủi ro khách hàng chậm bàn giao tài liệu kết nối API",
        severity: "HIGH",
      });

      expect(risk.id).toBeDefined();
      const list = listRisks(oppId);
      expect(list.find((r) => r.id === risk.id)?.status).toBe("OPEN");

      // HG5: Bỏ qua (DISMISSED) không có lý do -> Bị chặn
      expect(() => {
        updateRiskStatus(salesActor, oppId, risk.id, "DISMISSED", { dismiss_reason: "" });
      }).toThrow(/Cổng HG5: Bỏ qua rủi ro \(DISMISSED\) bắt buộc phải có lý do giải trình/);

      // Bỏ qua với lý do hợp lệ -> Cho phép
      updateRiskStatus(salesActor, oppId, risk.id, "DISMISSED", {
        dismiss_reason: "Khách đã cam kết hợp đồng bàn giao đúng tiến độ, không còn là rủi ro",
      });
      const dismissedRisk = listRisks(oppId).find((r) => r.id === risk.id);
      expect(dismissedRisk?.status).toBe("DISMISSED");
      expect(dismissedRisk?.dismiss_reason).toContain("Khách đã cam kết");
    });
  });

  // ===== FR-45, FR-46, FR-47: Chuyển giai đoạn, Đóng & Mở lại cơ hội =====
  describe("FR-45 → FR-47: Chuyển giai đoạn (Checklist), Đóng LOST và Mở lại (BR-17)", () => {
    let oppId: number;

    beforeEach(() => {
      scoreBant(salesActor, testLeadId, { budget: 20, authority: 20, need: 20, timeline: 20 });
      const conv = convertLeadToOpportunity(salesActor, testLeadId, {
        account_action: "new",
        contact_action: "new",
        opportunity_name: "Cơ hội Chuyển Giai Đoạn",
        owner_id: 1,
      });
      oppId = conv.opportunity_id;

      // Cấu hình bảng giá và các bên liên quan
      updateOpportunity(salesActor, oppId, { price_list_id: testPriceListId, customer_need: "Cần phần mềm" });
      addStakeholder(salesActor, oppId, { name: "Anh Quyết Định", role: "DECISION_MAKER" });

      const comp = db().prepare("SELECT id FROM competitors LIMIT 1").get() as { id: number } | undefined;
      const cId = comp?.id ?? Number(db().prepare("INSERT INTO competitors (name) VALUES ('Đối thủ Test')").run().lastInsertRowid);
      addCompetitor(salesActor, oppId, cId, "Ghi nhận đối thủ");

      createSolution(presalesActor, oppId, { title: "Giải pháp tiêu chuẩn", estimated_effort_mandays: 5 });
    });

    it("FR-45: rà soát cơ hội của Quản lý kinh doanh (Cổng HG6, BR-06)", () => {
      // Khi mức quan trọng HIGH hoặc có rủi ro OPEN -> HG6 kích hoạt
      updateOpportunity(salesActor, oppId, { importance: "HIGH" });
      const opp = getOpportunity(oppId)!;
      const gate = managerGate(opp);
      expect(gate.required).toBe(true);
      expect(gate.reasons[0]).toContain("Mức quan trọng Cao");
    });

    it("FR-46: chặn chuyển sang PROPOSE khi chưa hoàn tất 4 mục checklist", () => {
      // Chưa tick checklist nào
      expect(() => {
        advanceStage(salesActor, oppId);
      }).toThrow(/Chưa hoàn tất checklist/);

      // Tick đầy đủ 4 mục
      setChecklist(salesActor, oppId, "need_confirmed", true);
      setChecklist(presalesActor, oppId, "solution_confirmed", true);
      setChecklist(salesActor, oppId, "stakeholders_confirmed", true);
      setChecklist(salesActor, oppId, "competitors_confirmed", true);

      // Chuyển giai đoạn thành công sang PROPOSE
      const res = advanceStage(salesActor, oppId);
      expect(res.moved).toBe(true);

      const opp = getOpportunity(oppId);
      expect(opp?.stage).toBe("PROPOSE");

      // Kiểm tra lịch sử chuyển giai đoạn
      const hist = stageHistoryOf(oppId);
      expect(hist.length).toBeGreaterThanOrEqual(1);
      expect(hist[0].from_stage).toBe("DEVELOP");
      expect(hist[0].to_stage).toBe("PROPOSE");
    });

    it("FR-47: đóng cơ hội LOST với lý do chuẩn BR-27 và mở lại cơ hội theo BR-17", () => {
      // Đóng LOST với lý do BR-27
      markLost(salesActor, oppId, "Mất vào đối thủ", "Khách chọn sản phẩm của đối thủ do giá thấp hơn");

      const lostOpp = getOpportunity(oppId);
      expect(lostOpp?.stage).toBe("LOST");
      expect(lostOpp?.lost_reason_code).toBe("Mất vào đối thủ");
      expect(lostOpp?.lost_reason).toContain("Mất vào đối thủ");
      expect(lostOpp?.closed_at).toBeDefined();

      // Mở lại cơ hội: Nhân viên bán hàng không có quyền
      expect(() => {
        reopenOpportunity(salesActor, oppId, "Khách liên hệ lại");
      }).toThrow(/Chỉ Quản lý kinh doanh/);

      // Mở lại cơ hội: SALES_MANAGER mở lại trong vòng 90 ngày
      reopenOpportunity(salesMgrActor, oppId, "Khách hàng đổi ý muốn quay lại SMS CRM");

      const reopenedOpp = getOpportunity(oppId);
      expect(reopenedOpp?.stage).toBe("DEVELOP");
      expect(reopenedOpp?.closed_at).toBeNull();
      expect(reopenedOpp?.reopened_at).toBeDefined();
      expect(reopenedOpp?.reopen_reason).toContain("Khách hàng đổi ý");

      const hist = stageHistoryOf(oppId);
      expect(hist[0].to_stage).toBe("DEVELOP");
    });

    it("cung cấp dữ liệu chuẩn cho WP-04 qua getOpportunityForQuote", () => {
      addOpportunityItem(salesActor, oppId, { product_id: testProductId, quantity: 2, unit_price: 40000000 });
      const quoteData = getOpportunityForQuote(oppId);

      expect(quoteData.opportunity.id).toBe(oppId);
      expect(quoteData.items.length).toBe(1);
      expect(quoteData.items[0].product_id).toBe(testProductId);
      expect(quoteData.priceListId).toBe(testPriceListId);
      expect(quoteData.stakeholders.length).toBeGreaterThanOrEqual(1);
    });
  });
});
