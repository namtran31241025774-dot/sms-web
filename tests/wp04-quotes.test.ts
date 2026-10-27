import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createQuote,
  addLine,
  updateLine,
  removeLine,
  validateQuoteConfiguration,
  submitQuote,
  applyDiscountDecision,
  sendQuote,
  recordCustomerResponse,
  reviseQuote,
  requestQuoteEsign,
  checkQuoteEsignStatus,
  getAcceptedQuoteVersion,
  getQuote,
  getQuoteVersion,
  quoteLines,
  quoteVersions,
  quoteResponses,
  quoteSignatures,
  listQuotes,
  isQuoteExpired,
} from "@/lib/services/quotes";
import {
  createProposal,
  getProposal,
  sendProposal,
  updateProposal,
} from "@/lib/services/proposals";
import { esign } from "@/lib/integrations/esign";
import type { Actor } from "@/lib/services/core";

describe("WP-04: Đề xuất giải pháp & Báo giá (FR-48 → FR-55, HG7)", () => {
  const salesActor: Actor = { type: "USER", id: 1, name: "Sales Rep", role: "SALES" };
  const salesMgrActor: Actor = { type: "USER", id: 2, name: "Sales Manager", role: "SALES_MANAGER" };

  let testAccountId: number;
  let testContactId: number;
  let testPriceListId: number;
  let testOppId: number;
  let prodSaaSId: number;
  let prodServiceId: number;
  let prodPackageId: number;
  let prodComponentId: number;

  beforeEach(() => {
    // 0. Đảm bảo có users cho tests
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (1, 'Sales Rep', 'sales@example.com', 'SALES')").run();
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (2, 'Sales Manager', 'manager@example.com', 'SALES_MANAGER')").run();

    // 1. Dữ liệu Account & Contact
    const acc = db().prepare("SELECT id FROM accounts LIMIT 1").get() as { id: number } | undefined;
    if (acc) {
      testAccountId = acc.id;
    } else {
      const ins = db().prepare("INSERT INTO accounts (name, name_norm) VALUES ('Tập đoàn Sao Mai', 'tap doan sao mai')").run();
      testAccountId = Number(ins.lastInsertRowid);
    }

    const con = db().prepare("SELECT id FROM contacts WHERE account_id = ? LIMIT 1").get(testAccountId) as { id: number } | undefined;
    if (con) {
      testContactId = con.id;
    } else {
      const ins = db().prepare("INSERT INTO contacts (account_id, full_name, email) VALUES (?, 'Lê Văn C', 'c@saomai.vn')").run(testAccountId);
      testContactId = Number(ins.lastInsertRowid);
    }

    // 2. Bảng giá
    const pl = db().prepare("SELECT id FROM price_lists LIMIT 1").get() as { id: number } | undefined;
    if (pl) {
      testPriceListId = pl.id;
    } else {
      const ins = db().prepare("INSERT INTO price_lists (name, currency) VALUES ('Bảng giá chuẩn 2026', 'VND')").run();
      testPriceListId = Number(ins.lastInsertRowid);
    }

    // 3. Sản phẩm các loại (SUBSCRIPTION, SERVICE, PACKAGE, MODULE)
    function getOrCreateProduct(code: string, name: string, type: string, unit: string, policy?: string) {
      const existing = db().prepare("SELECT id FROM products WHERE code = ?").get(code) as { id: number } | undefined;
      if (existing) return existing.id;
      const ins = db().prepare("INSERT INTO products (code, name, type, unit, license_policy, active) VALUES (?, ?, ?, ?, ?, 1)").run(code, name, type, unit, policy || null);
      return Number(ins.lastInsertRowid);
    }

    prodSaaSId = getOrCreateProduct('SAAS-WP04', 'Cloud CRM Standard', 'SUBSCRIPTION', 'user/tháng', 'PER_USER');
    prodServiceId = getOrCreateProduct('SRV-WP04', 'Dịch vụ Triển khai Onboarding', 'SERVICE', 'gói');
    prodPackageId = getOrCreateProduct('PKG-WP04', 'Gói Toàn diện Doanh nghiệp', 'PACKAGE', 'gói');
    prodComponentId = getOrCreateProduct('MOD-WP04', 'Module Báo cáo Nâng cao', 'MODULE', 'module');

    // Gắn giá vào price_list_items
    db().prepare("INSERT OR REPLACE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, 200000, 10)").run(testPriceListId, prodSaaSId);
    db().prepare("INSERT OR REPLACE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, 20000000, 10)").run(testPriceListId, prodServiceId);
    db().prepare("INSERT OR REPLACE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, 80000000, 10)").run(testPriceListId, prodPackageId);
    db().prepare("INSERT OR REPLACE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, 10000000, 10)").run(testPriceListId, prodComponentId);

    // Thành phần gói bắt buộc
    db().prepare("INSERT OR REPLACE INTO product_components (package_id, component_id, quantity, is_optional) VALUES (?, ?, 1, 0)").run(prodPackageId, prodComponentId);

    // 4. Cơ hội bán hàng ở giai đoạn PROPOSE
    const oppCode = `OPP-WP04-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const oppIns = db().prepare(`
      INSERT INTO opportunities (code, name, account_id, primary_contact_id, price_list_id, stage, customer_need, owner_id)
      VALUES (?, 'Dự án Chuyển đổi số Sao Mai', ?, ?, ?, 'PROPOSE', 'Yêu cầu CRM kết nối ERP và báo cáo thông minh', 1)
    `).run(oppCode, testAccountId, testContactId, testPriceListId);
    testOppId = Number(oppIns.lastInsertRowid);
    db().prepare("INSERT OR IGNORE INTO teams(id,code,name,leader_id) VALUES (994,'QUOTE-REVIEW','Quote review',2)").run();
    db().prepare('UPDATE opportunities SET team_id=994 WHERE id=?').run(testOppId);

    // Giải pháp nội bộ đi kèm cơ hội (WP-03)
    db().prepare(`
      INSERT INTO solutions (opportunity_id, title, technical_approach, architecture, estimated_effort_mandays, integration_required, risks)
      VALUES (?, 'Phương án Cloud SaaS tích hợp API', 'Kiến trúc Multi-tenant microservices', 'AWS Cloud Native', 20, 1, 'Ràng buộc bảo mật dữ liệu khách hàng')
    `).run(testOppId);
  });

  // ===== FR-48: Lập bản đề xuất giải pháp =====
  describe("FR-48: Lập bản đề xuất giải pháp gửi khách hàng", () => {
    it("tạo bản đề xuất giải pháp từ nhu cầu và hồ sơ giải pháp nội bộ", () => {
      const propId = createProposal(salesActor, {
        opportunityId: testOppId,
        title: "Đề xuất Giải pháp CRM & Tích hợp Doanh nghiệp",
        inheritSolutions: true,
      });

      expect(propId).toBeGreaterThan(0);
      const prop = getProposal(propId);
      expect(prop).toBeDefined();
      expect(prop?.title).toBe("Đề xuất Giải pháp CRM & Tích hợp Doanh nghiệp");
      expect(prop?.status).toBe("DRAFT");
      expect(prop?.solution_summary).toContain("Phương án Cloud SaaS tích hợp API");
      expect(prop?.scope_description).toContain("Yêu cầu CRM kết nối ERP");
      expect(prop?.assumptions).toContain("Ràng buộc bảo mật dữ liệu khách hàng");
    });

    it("cập nhật bản đề xuất khi ở trạng thái DRAFT", () => {
      const propId = createProposal(salesActor, {
        opportunityId: testOppId,
        title: "Đề xuất Bản nháp",
      });

      updateProposal(salesActor, propId, {
        title: "Đề xuất Hoàn chỉnh v1",
        timelineText: "Triển khai trong 6 tuần",
      });

      const updated = getProposal(propId);
      expect(updated?.title).toBe("Đề xuất Hoàn chỉnh v1");
      expect(updated?.timeline_text).toBe("Triển khai trong 6 tuần");
    });

    it("xuất PDF và gửi đề xuất cho khách qua email, khóa đề xuất đã gửi", () => {
      const propId = createProposal(salesActor, {
        opportunityId: testOppId,
        title: "Đề xuất Gửi Khách Hàng",
      });

      const res = sendProposal(salesActor, propId);
      expect(res.providerRef).toBeTruthy();
      expect(res.pdfBuffer.length).toBeGreaterThan(0);

      const sentProp = getProposal(propId);
      expect(sentProp?.status).toBe("SENT");
      expect(sentProp?.sent_at).toBeTruthy();

      // Kiểm tra đề xuất đã gửi không cho sửa trực tiếp
      expect(() => {
        updateProposal(salesActor, propId, { title: "Sửa trái phép" });
      }).toThrow("Chỉ được sửa bản đề xuất ở trạng thái Nháp");
    });
  });

  // ===== FR-49: Lập báo giá nháp =====
  describe("FR-49: Lập báo giá nháp và tính toán tài chính", () => {
    it("khởi tạo hồ sơ báo giá và phiên bản v1", () => {
      const { quoteId, versionId } = createQuote(salesActor, testOppId, {
        notes: "Điều khoản thanh toán: 50% tạm ứng, 50% nghiệm thu",
      });

      expect(quoteId).toBeGreaterThan(0);
      expect(versionId).toBeGreaterThan(0);

      const q = getQuote(quoteId);
      expect(q).toBeDefined();
      expect(q?.revision).toBe(1);
      expect(q?.status).toBe("DRAFT");

      const v = getQuoteVersion(versionId);
      expect(v).toBeDefined();
      expect(v?.version_no).toBe(1);
      expect(v?.status).toBe("DRAFT");
    });

    it("thêm các dòng sản phẩm, tính đúng subtotal, chiết khấu và thuế VAT 10% (BR-22)", () => {
      const { quoteId, versionId } = createQuote(salesActor, testOppId);

      // Thêm dòng 1: 10 user SaaS * 200,000 = 2,000,000; CK 5% -> 1,900,000; VAT 10% -> 190,000
      addLine(salesActor, versionId, prodSaaSId, 10, 5, { licenseCount: 10, termMonths: 1 });
      // Thêm dòng 2: 1 gói Dịch vụ * 20,000,000 = 20,000,000; CK 10% -> 18,000,000; VAT 10% -> 1,800,000
      addLine(salesActor, versionId, prodServiceId, 1, 10);

      const lines = quoteLines(versionId);
      expect(lines).toHaveLength(2);

      const v = getQuoteVersion(versionId);
      expect(v?.subtotal).toBe(22000000); // 2tr + 20tr
      expect(v?.discount_total).toBe(2100000); // 100k + 2tr
      expect(v?.tax_amount).toBe(1990000); // 10% của (1.9tr + 18tr) = 1.99tr
      expect(v?.total).toBe(21890000); // 19.9tr + 1.99tr
      expect(v?.max_discount_pct).toBe(10);

      // Kiểm tra đồng bộ lên bản ghi cha quote
      const q = getQuote(quoteId);
      expect(q?.total).toBe(21890000);
      expect(q?.max_discount_pct).toBe(10);
    });

    it("cập nhật và xóa dòng sản phẩm nháp", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodSaaSId, 5, 0);

      const lines = quoteLines(versionId);
      const lineId = lines[0].id;

      updateLine(salesActor, versionId, lineId, 10, 5);
      let v = getQuoteVersion(versionId);
      expect(v?.subtotal).toBe(2000000); // 10 * 200,000

      removeLine(salesActor, versionId, lineId);
      v = getQuoteVersion(versionId);
      expect(v?.subtotal).toBe(0);
      expect(v?.total).toBe(0);
    });
  });

  // ===== FR-50: Kiểm tra cấu hình báo giá =====
  describe("FR-50: Kiểm tra cấu hình báo giá (Gói & Chính sách License)", () => {
    it("phát hiện thiếu thành phần bắt buộc của gói PACKAGE và cảnh báo thiếu license", () => {
      const { versionId } = createQuote(salesActor, testOppId);

      // Thêm gói PACKAGE nhưng chưa thêm MOD-ADV-REP (thành phần bắt buộc)
      addLine(salesActor, versionId, prodPackageId, 1, 0);
      // Thêm sản phẩm SaaS có license policy nhưng không truyền licenseCount
      addLine(salesActor, versionId, prodSaaSId, 1, 0);

      const check = validateQuoteConfiguration(versionId);
      expect(check.valid).toBe(true); // không có lỗi nghiêm trọng làm hỏng cấu trúc
      expect(check.warnings.length).toBeGreaterThanOrEqual(2);

      const hasPackageWarn = check.warnings.some((w) => w.includes("yêu cầu thành phần bắt buộc"));
      const hasLicenseWarn = check.warnings.some((w) => w.includes("quyền sử dụng (license count)"));
      expect(hasPackageWarn).toBe(true);
      expect(hasLicenseWarn).toBe(true);
    });

    it("vượt qua kiểm tra khi cấu hình đầy đủ thành phần bắt buộc và license", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodPackageId, 1, 0);
      addLine(salesActor, versionId, prodComponentId, 1, 0); // Đã bổ sung thành phần bắt buộc
      addLine(salesActor, versionId, prodSaaSId, 10, 0, { licenseCount: 10, termMonths: 12 });

      const check = validateQuoteConfiguration(versionId);
      expect(check.warnings.some((w) => w.includes("yêu cầu thành phần bắt buộc"))).toBe(false);
      expect(check.warnings.some((w) => w.includes("quyền sử dụng (license count)"))).toBe(false);
    });
  });

  // ===== FR-51 & HG7: Phê duyệt giá, chiết khấu =====
  describe("FR-51 & HG7: Phê duyệt giá, chiết khấu theo BR-05", () => {
    it("tự động phê duyệt khi chiết khấu <= 10% (trong thẩm quyền NVKD)", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 8); // 8% <= 10%

      const res = submitQuote(salesActor, versionId);
      expect(res.status).toBe("APPROVED");

      const v = getQuoteVersion(versionId);
      expect(v?.status).toBe("APPROVED");
      expect(v?.approved_at).toBeTruthy();
    });

    it("yêu cầu Quản lý kinh doanh duyệt khi chiết khấu từ trên 10% đến 30% (HG7)", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 25); // 25% > 10%

      const res = submitQuote(salesActor, versionId);
      expect(res.status).toBe("PENDING_APPROVAL");

      const v = getQuoteVersion(versionId);
      expect(v?.status).toBe("PENDING_APPROVAL");

      // Chặn gửi khi chưa được duyệt hợp lệ (HG7)
      expect(() => {
        sendQuote(salesActor, versionId);
      }).toThrow("Báo giá phải được phê duyệt hợp lệ trước khi gửi cho khách hàng (HG7)");

      // QLKD phê duyệt
      applyDiscountDecision(salesMgrActor, versionId, true, "Đồng ý chiết khấu 25% cho khách hàng chiến lược");
      const approvedV = getQuoteVersion(versionId);
      expect(approvedV?.status).toBe("APPROVED");
      expect(approvedV?.approved_by).toBe(2);
    });

    it("chặn hoàn toàn khi chiết khấu vượt mức tối đa 30% (BR-05)", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 35); // 35% > 30%

      expect(() => {
        submitQuote(salesActor, versionId);
      }).toThrow("vượt quá hạn mức tối đa cho phép");
    });

    it("QLKD từ chối phê duyệt chiết khấu", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 20);

      submitQuote(salesActor, versionId);
      applyDiscountDecision(salesMgrActor, versionId, false, "Chiết khấu quá cao, yêu cầu đàm phán lại");

      const v = getQuoteVersion(versionId);
      expect(v?.status).toBe("REJECTED");
    });
  });

  // ===== FR-52: Gửi đề xuất và báo giá cho khách hàng =====
  describe("FR-52: Gửi báo giá cho khách hàng (PDF & Email)", () => {
    it("xuất PDF nhị phân và gửi báo giá qua email sau khi được duyệt, khóa bản đã gửi", () => {
      const { quoteId, versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 5); // Tự duyệt

      submitQuote(salesActor, versionId);

      const sendRes = sendQuote(salesActor, versionId);
      expect(sendRes.providerRef).toBeTruthy();
      expect(sendRes.pdfBuffer.length).toBeGreaterThan(0);

      const v = getQuoteVersion(versionId);
      expect(v?.status).toBe("SENT");
      expect(v?.sent_at).toBeTruthy();

      const q = getQuote(quoteId);
      expect(q?.status).toBe("SENT");

      // Báo giá đã gửi bị khóa, không được sửa trực tiếp
      expect(() => {
        addLine(salesActor, versionId, prodSaaSId, 1, 0);
      }).toThrow("Chỉ được sửa phiên bản báo giá ở trạng thái Nháp");
    });
  });

  // ===== FR-53: Theo dõi hiệu lực và tra cứu báo giá =====
  describe("FR-53: Hiệu lực và tra cứu báo giá (BR-09)", () => {
    it("tìm kiếm và lọc báo giá theo mã, trạng thái và từ khóa", () => {
      const { quoteId } = createQuote(salesActor, testOppId);
      const q = getQuote(quoteId);

      const list1 = listQuotes({ search: q?.code });
      expect(list1.some((item) => item.id === quoteId)).toBe(true);

      const list2 = listQuotes({ status: "DRAFT" });
      expect(list2.some((item) => item.id === quoteId)).toBe(true);
    });

    it("chặn ghi nhận chấp thuận khi báo giá đã hết hạn hiệu lực", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 0);
      submitQuote(salesActor, versionId);
      sendQuote(salesActor, versionId);

      // Ép ngày hết hạn về quá khứ
      db().prepare("UPDATE quote_versions SET valid_until = '2020-01-01' WHERE id = ?").run(versionId);
      const expiredV = getQuoteVersion(versionId)!;
      expect(isQuoteExpired(expiredV)).toBe(true);

      expect(() => {
        recordCustomerResponse(salesActor, versionId, "ACCEPTED", "Đồng ý mua");
      }).toThrow("Báo giá đã hết hạn hiệu lực");
    });
  });

  // ===== FR-54: Ghi nhận phản hồi và điều chỉnh báo giá =====
  describe("FR-54: Phản hồi khách hàng & Điều chỉnh tạo phiên bản mới (DEC-22)", () => {
    it("khách hàng chấp thuận -> cập nhật ACCEPTED và tự động chuyển cơ hội sang CLOSE", () => {
      const { quoteId, versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 5);
      submitQuote(salesActor, versionId);
      sendQuote(salesActor, versionId);

      recordCustomerResponse(salesActor, versionId, "ACCEPTED", "Khách hàng đồng ý ký kết và thực hiện");

      const v = getQuoteVersion(versionId);
      expect(v?.status).toBe("ACCEPTED");

      const q = getQuote(quoteId);
      expect(q?.status).toBe("ACCEPTED");

      const responses = quoteResponses(versionId);
      expect(responses).toHaveLength(1);
      expect(responses[0].response_type).toBe("ACCEPTED");

      // Cơ hội tự động chuyển sang CLOSE (Tạo đơn hàng)
      const opp = db().prepare("SELECT stage FROM opportunities WHERE id = ?").get(testOppId) as { stage: string };
      expect(opp.stage).toBe("CLOSE");
    });

    it("điều chỉnh báo giá -> tạo phiên bản v2, giữ nguyên bản cũ SUPERSEDED (DEC-22)", () => {
      const { quoteId, versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 10);
      submitQuote(salesActor, versionId);
      sendQuote(salesActor, versionId);

      // Tạo phiên bản điều chỉnh mới
      const v2Id = reviseQuote(salesActor, versionId, "Giảm giá thêm 5% theo yêu cầu khách hàng");
      expect(v2Id).toBeGreaterThan(versionId);

      // Bản cũ chuyển thành SUPERSEDED
      const v1 = getQuoteVersion(versionId);
      expect(v1?.status).toBe("SUPERSEDED");

      // Bản mới là v2 ở trạng thái DRAFT
      const v2 = getQuoteVersion(v2Id);
      expect(v2?.version_no).toBe(2);
      expect(v2?.status).toBe("DRAFT");
      expect(v2?.subtotal).toBe(v1?.subtotal); // sao chép dòng sản phẩm

      // Kiểm tra danh sách phiên bản của báo giá
      const allVers = quoteVersions(quoteId);
      expect(allVers).toHaveLength(2);
      expect(allVers[0].id).toBe(v2Id);
      expect(allVers[1].id).toBe(versionId);
    });
  });

  // ===== FR-55: Theo dõi ký điện tử =====
  describe("FR-55: Luồng ký điện tử giả lập (DEC-13)", () => {
    it("khởi tạo yêu cầu ký điện tử và cập nhật trạng thái ký", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 0);
      submitQuote(salesActor, versionId);

      const sig = requestQuoteEsign(salesActor, versionId, "ceo@saomai.vn", "Nguyễn Giám Đốc");
      expect(sig.status).toBe("PENDING");
      expect(sig.external_reference).toContain("ESIGN-");

      // Giả lập webhook ký thành công từ dịch vụ ký số
      esign.simulateWebhook(sig.external_reference, "SIGNED");

      const checkedSig = checkQuoteEsignStatus(salesActor, sig.id);
      expect(checkedSig.status).toBe("SIGNED");
      expect(checkedSig.signed_at).toBeTruthy();

      const sigList = quoteSignatures(versionId);
      expect(sigList).toHaveLength(1);
      expect(sigList[0].status).toBe("SIGNED");
    });
  });

  // ===== Hợp đồng cung cấp cho WP-05 (Đơn hàng) =====
  describe("Hợp đồng cho WP-05: getAcceptedQuoteVersion", () => {
    it("cung cấp đầy đủ thông tin báo giá đã chấp thuận để tạo đơn hàng", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodServiceId, 1, 5);
      submitQuote(salesActor, versionId);
      sendQuote(salesActor, versionId);
      recordCustomerResponse(salesActor, versionId, "ACCEPTED", "Đã chấp thuận");

      const accepted = getAcceptedQuoteVersion(versionId);
      expect(accepted.quoteVersion.id).toBe(versionId);
      expect(accepted.quoteVersion.status).toBe("ACCEPTED");
      expect(accepted.account.id).toBe(testAccountId);
      expect(accepted.opportunity.id).toBe(testOppId);
      expect(accepted.lines).toHaveLength(1);
      expect(accepted.lines[0].line_total).toBeGreaterThan(0);
    });

    it("từ chối khi phiên bản báo giá chưa được khách hàng chấp thuận", () => {
      const { versionId } = createQuote(salesActor, testOppId);
      expect(() => {
        getAcceptedQuoteVersion(versionId);
      }).toThrow("Báo giá chưa được khách hàng chấp thuận hợp lệ");
    });
  });
});
