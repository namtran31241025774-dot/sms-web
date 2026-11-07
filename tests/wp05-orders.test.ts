import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createOrderFromQuote,
  createDirectOrder,
  listOrders,
  getOrder,
  orderLines,
  billingMilestones,
  setBillingMilestones,
  lockOrderPrice,
  updateFulfillmentProgress,
  createHandover,
  updateHandoverItem,
  orderHandovers,
  handoverItems,
  completeOrderAndTransitionPostSales,
  getOrderForInvoice,
} from "@/lib/services/orders";
import {
  createQuote,
  addLine,
  submitQuote,
  sendQuote,
  recordCustomerResponse,
} from "@/lib/services/quotes";
import type { Actor } from "@/lib/services/core";

describe("WP-05: Quản lý Đơn hàng (FR-56 → FR-63, HG8)", () => {
  const salesActor: Actor = { type: "USER", id: 1, name: "Sales Rep", role: "SALES" };
  const salesMgrActor: Actor = { type: "USER", id: 2, name: "Sales Manager", role: "SALES_MANAGER" };
  const postSalesActor: Actor = { type: "USER", id: 3, name: "Customer Success", role: "SALES" };

  let testAccountId: number;
  let testContactId: number;
  let testPriceListId: number;
  let testOppId: number;
  let prodSaaSId: number;
  let prodServiceId: number;

  beforeEach(() => {
    // 0. Đảm bảo có users cho tests
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (1, 'Sales Rep', 'sales@example.com', 'SALES')").run();
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (2, 'Sales Manager', 'manager@example.com', 'SALES_MANAGER')").run();
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (3, 'Customer Success', 'cs@example.com', 'SALES')").run();

    // 1. Account & Contact
    const acc = db().prepare("SELECT id FROM accounts LIMIT 1").get() as { id: number } | undefined;
    if (acc) {
      testAccountId = acc.id;
    } else {
      const ins = db().prepare("INSERT INTO accounts (name, name_norm) VALUES ('Tập đoàn Sao Mai', 'tap doan sao mai')").run();
      testAccountId = Number(ins.lastInsertRowid);
    }

    const con = db().prepare("SELECT id FROM contacts WHERE account_id = ? AND email IS NOT NULL LIMIT 1").get(testAccountId) as { id: number } | undefined;
    if (con) {
      testContactId = con.id;
    } else {
      const ins = db().prepare("INSERT INTO contacts (account_id, full_name, email) VALUES (?, 'Nguyễn Giám Đốc', 'ceo@saomai.vn')").run(testAccountId);
      testContactId = Number(ins.lastInsertRowid);
    }

    // 2. Sản phẩm & Bảng giá
    const getOrCreateProduct = (code: string, name: string, type: string) => {
      const existing = db().prepare("SELECT id FROM products WHERE code = ?").get(code) as { id: number } | undefined;
      if (existing) return existing.id;
      const ins = db().prepare(
        "INSERT INTO products (code, name, type, unit, active) VALUES (?, ?, ?, 'Gói', 1)",
      ).run(code, name, type);
      return Number(ins.lastInsertRowid);
    };

    prodSaaSId = getOrCreateProduct("P-SAAS-CORE-05", "B2B SaaS Platform Pro", "SUBSCRIPTION");
    prodServiceId = getOrCreateProduct("P-SRV-ONBOARD-05", "Dịch vụ Onboarding Chuyên sâu", "SERVICE");

    const pl = db().prepare("SELECT id FROM price_lists LIMIT 1").get() as { id: number } | undefined;
    if (pl) {
      testPriceListId = pl.id;
    } else {
      const ins = db().prepare("INSERT INTO price_lists (code, name, currency) VALUES ('PL-TEST-05', 'Bảng giá chuẩn WP05', 'VND')").run();
      testPriceListId = Number(ins.lastInsertRowid);
    }

    db().prepare("INSERT OR IGNORE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, ?, 10)")
      .run(testPriceListId, prodSaaSId, 20000000);
    db().prepare("INSERT OR IGNORE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct) VALUES (?, ?, ?, 10)")
      .run(testPriceListId, prodServiceId, 10000000);

    // 3. Cơ hội bán hàng
    const insOpp = db().prepare(
      `INSERT INTO opportunities (code, account_id, primary_contact_id, price_list_id, owner_id, name, stage, amount, customer_need)
       VALUES (?, ?, ?, ?, 1, 'Cơ hội phần mềm Quản lý B2B', 'PROPOSE', 50000000, 'Nhu cầu triển khai hệ thống toàn diện')`,
    ).run(`OPP-${Date.now()}-${Math.floor(Math.random() * 1000)}`, testAccountId, testContactId, testPriceListId);
    testOppId = Number(insOpp.lastInsertRowid);
  });

  // Helper tạo báo giá và được khách chấp thuận
  function createAndAcceptQuote(): { quoteId: number; versionId: number } {
    db().prepare("UPDATE opportunities SET price_list_id = ? WHERE id = ?").run(testPriceListId, testOppId);

    const { quoteId, versionId } = createQuote(salesActor, testOppId, {
      notes: "Báo giá tiêu chuẩn",
    });

    addLine(salesActor, versionId, prodSaaSId, 2, 5);
    addLine(salesActor, versionId, prodServiceId, 1, 0);

    submitQuote(salesActor, versionId);
    sendQuote(salesActor, versionId);
    recordCustomerResponse(salesActor, versionId, "ACCEPTED", "Khách đồng ý triển khai ngay");

    return { quoteId, versionId };
  }

  describe("FR-56: Tạo đơn hàng từ báo giá được chấp thuận", () => {
    it("tạo đơn hàng thành công từ báo giá được chấp thuận, kế thừa đúng sản phẩm, giá và khóa giá", () => {
      const { versionId } = createAndAcceptQuote();

      const orderId = createOrderFromQuote(salesActor, versionId);
      expect(orderId).toBeGreaterThan(0);

      const order = getOrder(orderId);
      expect(order).toBeDefined();
      expect(order?.code).toMatch(/^SO-\d{4}-\d{4}$/);
      expect(order?.source_quote_version_id).toBe(versionId);
      expect(order?.account_id).toBe(testAccountId);
      expect(order?.status).toBe("ACTIVE");
      expect(order?.price_locked_at).toBeDefined();
      expect(order?.grand_total).toBeGreaterThan(0);

      // Kế thừa đúng dòng sản phẩm
      const lines = orderLines(orderId);
      expect(lines.length).toBe(2);
      expect(lines.some((l) => l.product_id === prodSaaSId)).toBe(true);
      expect(lines.some((l) => l.product_id === prodServiceId)).toBe(true);

      // Không tự đặt điều khoản thanh toán; NVKD xác nhận lịch riêng (BUG-023).
      const milestones = billingMilestones(orderId);
      expect(milestones.length).toBe(0);
      setBillingMilestones(salesActor,orderId,[{name:'Theo hợp đồng',amount:order!.grand_total}]);
      expect(billingMilestones(orderId).reduce((sum,m)=>sum+m.amount,0)).toBe(order?.grand_total);

      const handovers = orderHandovers(orderId);
      expect(handovers.length).toBe(1);
      const items = handoverItems(handovers[0].id);
      expect(items.length).toBe(2);
    });

    it("chặn tạo đơn hàng lần thứ hai từ cùng một phiên bản báo giá (DEC-23)", () => {
      const { versionId } = createAndAcceptQuote();

      // Lần 1: tạo thành công
      createOrderFromQuote(salesActor, versionId);

      // Lần 2: bị chặn theo DEC-23
      expect(() => {
        createOrderFromQuote(salesActor, versionId);
      }).toThrow(/đã được tạo đơn hàng/);
    });

    it("chặn tạo đơn khi báo giá chưa được chấp thuận", () => {
      db().prepare("UPDATE opportunities SET price_list_id = ? WHERE id = ?").run(testPriceListId, testOppId);
      const { versionId } = createQuote(salesActor, testOppId);
      addLine(salesActor, versionId, prodSaaSId, 1, 0);

      expect(() => {
        createOrderFromQuote(salesActor, versionId);
      }).toThrow(/chấp thuận/);
    });

    it("chặn tạo đơn khi đã quá hạn thời gian chấp thuận (BR-09)", () => {
      const { versionId } = createAndAcceptQuote();

      // Giả lập ngày phản hồi là 40 ngày trước (vượt quá 30 ngày)
      const pastDate = new Date(Date.now() - 40 * 86400000).toISOString();
      db().prepare("UPDATE quote_versions SET responded_at = ? WHERE id = ?").run(pastDate, versionId);

      expect(() => {
        createOrderFromQuote(salesActor, versionId);
      }).toThrow(/quá hạn.*ngày.*không thể lập đơn hàng/);
    });
  });

  describe("FR-57: Tạo đơn hàng thủ công (Direct Order)", () => {
    it("cho phép Quản lý kinh doanh tạo đơn hàng trực tiếp với chiết khấu hợp lệ (BR-10, BR-05)", () => {
      const orderId = createDirectOrder(salesMgrActor, {
        accountId: testAccountId,
        opportunityId: testOppId,
        paymentTerms: "Thanh toán 100% khi ký",
        deliveryTerms: "Bàn giao trong 7 ngày",
        notes: "Đơn hàng triển khai trực tiếp gấp",
        lines: [
          {
            productId: prodSaaSId,
            quantity: 3,
            unitPrice: 20000000,
            discountPct: 15, // 15% cần quyền QLKD
            taxPct: 10,
          },
        ],
      });

      expect(orderId).toBeGreaterThan(0);
      const order = getOrder(orderId);
      expect(order).toBeDefined();
      expect(order?.is_manual).toBe(1);
      expect(order?.price_locked_at).toBeDefined();

      const lines = orderLines(orderId);
      expect(lines.length).toBe(1);
      expect(lines[0].quantity).toBe(3);
      expect(lines[0].discount_pct).toBe(15);
    });

    it("chặn NVKD tự ý tạo đơn trực tiếp với chiết khấu vượt thẩm quyền 10% mà không có duyệt (BR-05)", () => {
      expect(() => {
        createDirectOrder(salesActor, {
          accountId: testAccountId,
          lines: [
            {
              productId: prodSaaSId,
              quantity: 1,
              unitPrice: 20000000,
              discountPct: 20, // > 10%
            },
          ],
        });
      }).toThrow(/vượt quyền NVKD/);
    });

    it("chặn tạo đơn có chiết khấu vượt mức tối đa 30% (BR-05)", () => {
      expect(() => {
        createDirectOrder(salesMgrActor, {
          accountId: testAccountId,
          lines: [
            {
              productId: prodSaaSId,
              quantity: 1,
              unitPrice: 20000000,
              discountPct: 35, // > 30%
            },
          ],
        });
      }).toThrow(/vượt quá hạn mức tối đa/i);
    });
  });

  describe("FR-58: Tra cứu và xem đơn hàng", () => {
    it("tra cứu và lọc đơn hàng theo mã, khách hàng và trạng thái", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);
      const order = getOrder(orderId)!;

      const listAll = listOrders();
      expect(listAll.some((o) => o.id === orderId)).toBe(true);

      const listByAccount = listOrders({ accountId: testAccountId });
      expect(listByAccount.some((o) => o.id === orderId)).toBe(true);

      const listBySearch = listOrders({ search: order.code });
      expect(listBySearch.length).toBe(1);
      expect(listBySearch[0].id).toBe(orderId);
    });
  });

  describe("FR-59: Thiết lập điều khoản thanh toán và bàn giao (BR-11)", () => {
    it("cho phép thiết lập các đợt thanh toán khi tổng các đợt bằng chính xác giá trị đơn hàng", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);
      const order = getOrder(orderId)!;
      const total = order.grand_total;

      const half1 = Math.floor(total * 0.4);
      const half2 = total - half1;

      setBillingMilestones(salesActor, orderId, [
        { name: "Đợt 1: Đặt cọc 40%", amount: half1, dueDate: "2026-11-01" },
        { name: "Đợt 2: Nghiệm thu 60%", amount: half2, dueDate: "2026-12-01" },
      ]);

      const milestones = billingMilestones(orderId);
      expect(milestones.length).toBe(2);
      expect(milestones[0].amount).toBe(half1);
      expect(milestones[1].amount).toBe(half2);
      expect(milestones[0].amount + milestones[1].amount).toBe(total);
    });

    it("chặn thiết lập đợt thanh toán khi tổng số tiền bị lệch so với đơn hàng (BR-11)", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);
      const order = getOrder(orderId)!;

      expect(() => {
        setBillingMilestones(salesActor, orderId, [
          { name: "Đợt 1", amount: order.grand_total - 100000 }, // Thiếu 100k
        ]);
      }).toThrow(/không khớp với giá trị đơn hàng/);
    });
  });

  describe("FR-60: Xác nhận và khóa giá đơn hàng (BR-22)", () => {
    it("ghi nhận xác nhận khóa giá đơn hàng và thời điểm khóa giá", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);

      lockOrderPrice(salesActor, orderId);
      const order = getOrder(orderId);
      expect(order?.price_locked_at).toBeDefined();

      const audit = db().prepare("SELECT * FROM audit_log WHERE entity_type = 'order' AND entity_id = ? AND action = 'PRICE_LOCK'").get(orderId);
      expect(audit).toBeDefined();
    });
  });

  describe("FR-61: Theo dõi tiến độ triển khai", () => {
    it("cập nhật tiến độ triển khai, ghi nhận vấn đề vướng mắc tồn đọng", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);

      updateFulfillmentProgress(salesActor, orderId, {
        status: "IN_FULFILLMENT",
        pendingIssues: "Chờ khách bàn giao hạ tầng máy chủ nội bộ",
        notes: "Đã hoàn tất cấu hình bản quyền",
      });

      const order = getOrder(orderId);
      expect(order?.status).toBe("IN_FULFILLMENT");
      expect(order?.fulfillment_status).toBe("IN_PROGRESS");
      expect(order?.pending_issues).toContain("hạ tầng máy chủ");
      expect(order?.notes).toContain("bản quyền");
    });
  });

  describe("FR-62: Bàn giao kỹ thuật và ghi nhận kết quả (DEC-10)", () => {
    it("quản lý hồ sơ bàn giao kỹ thuật và nghiệm thu từng hạng mục", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);

      const handoverId = createHandover(salesActor, orderId, {
        title: "Biên bản nghiệm thu đợt 1",
        scopeSummary: "Bàn giao tài liệu và giấy phép sử dụng",
        items: [
          { category: "LICENSE", itemName: "License Key 50 seats", quantity: 50 },
          { category: "DOCUMENTATION", itemName: "Tài liệu hướng dẫn vận hành", quantity: 1 },
        ],
      });

      const items = handoverItems(handoverId);
      expect(items.length).toBe(2);

      // Nghiệm thu hạng mục 1
      updateHandoverItem(salesActor, handoverId, items[0].id, {
        status: "ACCEPTED",
        acceptanceNotes: "Khách đã kích hoạt thành công",
      });

      // Nghiệm thu hạng mục 2
      updateHandoverItem(salesActor, handoverId, items[1].id, {
        status: "ACCEPTED",
        acceptanceNotes: "Khách đã ký nhận tài liệu",
      });

      // Kiểm tra handover tự động chuyển thành COMPLETED
      const handovers = orderHandovers(orderId);
      const target = handovers.find((h) => h.id === handoverId);
      expect(target?.status).toBe("COMPLETED");
      expect(target?.completed_at).toBeDefined();
    });
  });

  describe("FR-63: Hoàn thành đơn hàng và chuyển tiếp hồ sơ sau bán", () => {
    it("hoàn thành đơn hàng, lưu đầu mối sau bán và không làm thay đổi trạng thái thanh toán", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);
      for(const handover of orderHandovers(orderId)) for(const item of handoverItems(handover.id)) {
        updateHandoverItem(salesActor,handover.id,item.id,{status:'ACCEPTED',acceptanceNotes:'Đã nghiệm thu'});
      }

      completeOrderAndTransitionPostSales(salesActor, orderId, {
        postSalesAssigneeId: postSalesActor.id,
        postSalesContact: "cskh@saomai.vn - SĐT: 0988776655",
        pendingIssues: "Cần lịch đào tạo bổ sung cho chi nhánh Đà Nẵng trong tháng sau",
        notes: "Dự án đã bàn giao kỹ thuật hoàn tất",
      });

      const order = getOrder(orderId);
      expect(order?.status).toBe("FULFILLED");
      expect(order?.fulfillment_status).toBe("COMPLETED");
      expect(order?.completed_at).toBeDefined();
      expect(order?.post_sales_assignee_id).toBe(postSalesActor.id);
      expect(order?.post_sales_contact).toContain("0988776655");
      expect(order?.pending_issues).toContain("chi nhánh Đà Nẵng");

      // Quy tắc FR-63: Hoàn thành đơn hàng không tự đổi trạng thái thanh toán
      expect(order?.payment_status).toBe("UNPAID");
    });
  });

  describe("Hợp đồng cho WP-06: getOrderForInvoice", () => {
    it("cung cấp đầy đủ thông tin đơn hàng, sản phẩm và mốc thanh toán cho dịch vụ hóa đơn", () => {
      const { versionId } = createAndAcceptQuote();
      const orderId = createOrderFromQuote(salesActor, versionId);

      const contract = getOrderForInvoice(orderId);
      expect(contract.order.id).toBe(orderId);
      expect(contract.lines.length).toBeGreaterThan(0);
      expect(contract.milestones.length).toBe(0);
      expect(contract.account.id).toBe(testAccountId);
    });
  });
});
