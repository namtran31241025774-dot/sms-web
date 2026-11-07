import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createInvoiceDraftFromOrder,
  setupInvoiceSchedule,
  reviewInvoiceDraft,
  issueInvoice,
  listInvoices,
  getInvoice,
  getInvoiceLines,
  getDunningReport,
  sendPaymentReminder,
  requestInvoiceChange,
  processInvoiceChange,
  getInvoiceHistory,
} from "@/lib/services/invoices";
import {
  recordPayment,
  allocatePayment,
  requestOnlinePayment,
  handleOnlinePaymentCallback,
  syncAccountingData,
  getPayment,
} from "@/lib/services/payments";
import {
  createDirectOrder,
  getOrder,
  billingMilestones,
} from "@/lib/services/orders";
import type { Actor } from "@/lib/services/core";

describe("WP-06: Theo dõi Hóa đơn & Thanh toán (FR-64 → FR-74, HG8)", () => {
  const financeActor: Actor = { type: "USER", id: 4, name: "Kế toán viên", role: "FINANCE" };
  const salesActor: Actor = { type: "USER", id: 1, name: "Sales Rep", role: "SALES" };
  const salesMgrActor: Actor = { type: "USER", id: 2, name: "Sales Manager", role: "SALES_MANAGER" };

  let testAccountId: number;
  let testContactId: number;
  let prodSaaSId: number;
  let testOrderId: number;

  beforeEach(() => {
    // 0. Users
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (1, 'Sales Rep', 'sales@example.com', 'SALES')").run();
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (2, 'Sales Manager', 'manager@example.com', 'SALES_MANAGER')").run();
    db().prepare("INSERT OR IGNORE INTO users (id, name, email, role) VALUES (4, 'Kế toán viên', 'finance@example.com', 'FINANCE')").run();

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

    // 2. Sản phẩm
    const existingProd = db().prepare("SELECT id FROM products WHERE code = 'P-SAAS-CORE-06'").get() as { id: number } | undefined;
    if (existingProd) {
      prodSaaSId = existingProd.id;
    } else {
      const ins = db().prepare(
        "INSERT INTO products (code, name, type, unit, active) VALUES ('P-SAAS-CORE-06', 'SaaS WP06 Pro', 'SUBSCRIPTION', 'Gói', 1)",
      ).run();
      prodSaaSId = Number(ins.lastInsertRowid);
    }

    // 3. Tạo cơ hội bán hàng và tạo đơn hàng mẫu
    const insOpp = db().prepare(
      `INSERT INTO opportunities (code, account_id, primary_contact_id, owner_id, name, stage, amount, customer_need)
       VALUES (?, ?, ?, 1, 'Cơ hội dịch vụ đám mây B2B', 'CLOSE', 22000000, 'Triển khai CRM và ERP')`,
    ).run(`OPP-06-${Date.now()}-${Math.floor(Math.random() * 1000)}`, testAccountId, testContactId);
    const testOppId = Number(insOpp.lastInsertRowid);

    testOrderId = createDirectOrder(salesMgrActor, {
      accountId: testAccountId,
      opportunityId: testOppId,
      paymentTerms: "Tạm ứng 50%, thanh toán 50% khi nghiệm thu",
      lines: [
        {
          productId: prodSaaSId,
          quantity: 1,
          unitPrice: 20000000,
          discountPct: 0,
          taxPct: 10,
        },
      ],
    });
  });

  describe("FR-64: Lập hồ sơ hóa đơn từ đơn hàng (BR-12)", () => {
    it("lập hồ sơ hóa đơn nháp thành công từ đơn hàng và đối chiếu mốc thanh toán", () => {
      const milestones = billingMilestones(testOrderId);
      const m1 = milestones[0];

      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneId: m1 ? m1.id : null,
        milestoneName: "Tạm ứng đợt 1",
        amount: 11000000,
        dueDate: "2026-11-15",
      });

      expect(invId).toBeGreaterThan(0);
      const inv = getInvoice(invId);
      expect(inv).toBeDefined();
      expect(inv?.code).toMatch(/^INV-\d{4}-\d{4}$/);
      expect(inv?.status).toBe("DRAFT");
      expect(inv?.amount).toBe(11000000);
      expect(inv?.account_id).toBe(testAccountId);

      // Kế thừa chi tiết dòng sản phẩm
      const lines = getInvoiceLines(invId);
      expect(lines.length).toBeGreaterThan(0);
    });

    it("chặn lập hóa đơn có tổng giá trị vượt quá giá trị đơn hàng (BR-12)", () => {
      const order = getOrder(testOrderId)!;
      const orderTotal = order.grand_total || order.total;

      expect(() => {
        createInvoiceDraftFromOrder(financeActor, testOrderId, {
          milestoneName: "Lập vượt hạn mức",
          amount: orderTotal + 5000000, // Vượt quá giá trị đơn
        });
      }).toThrow(/vượt quá giá trị đơn hàng/i);
    });
  });

  describe("FR-65: Thiết lập lịch lập hóa đơn", () => {
    it("thiết lập hạn thanh toán và ghi chú lịch hóa đơn", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 10000000,
      });

      setupInvoiceSchedule(financeActor, invId, {
        dueDate: "2026-12-01",
        notes: "Gia hạn thanh toán thêm 15 ngày theo văn bản",
      });

      const inv = getInvoice(invId);
      expect(inv?.due_date).toBe("2026-12-01");
      expect(inv?.notes).toContain("Gia hạn thanh toán");
    });
  });

  describe("FR-66: Kiểm tra hóa đơn nháp (DEC-09)", () => {
    it("kiểm tra thông tin bản nháp và chuyển trạng thái sang REVIEWED", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 5000000,
      });

      reviewInvoiceDraft(financeActor, invId, "Đã đối chiếu MST và địa chỉ doanh nghiệp chính xác");

      const inv = getInvoice(invId);
      expect(inv?.reviewed_by).toBe(financeActor.id);
      expect(inv?.reviewed_at).toBeDefined();
      expect(inv?.notes).toContain("đối chiếu MST");
    });
  });

  describe("FR-67 & HG8: Phát hành và gửi hóa đơn theo thẩm quyền (DEC-08)", () => {
    it("đẩy sang ERP phát hành chính thức, nhận mã erp_ref, chuyển ISSUED và gửi email cho khách", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 10000000,
      });
      reviewInvoiceDraft(financeActor, invId);

      const res = issueInvoice(financeActor, invId, { recipientEmail: "ceo@saomai.vn" });
      expect(res.erpRef).toBeDefined();
      expect(res.mailRef).toBeDefined();

      const inv = getInvoice(invId);
      expect(inv?.status).toBe("ISSUED");
      expect(inv?.erp_ref).toBe(res.erpRef);
      expect(inv?.issued_by).toBe(financeActor.id);
      expect(inv?.issued_at).toBeDefined();
    });

    it("chặn phát hành hóa đơn khi chưa ở trạng thái DRAFT hoặc REVIEWED", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 10000000,
      });
      issueInvoice(financeActor, invId);

      // Thử phát hành lại lần nữa khi đã là ISSUED
      expect(() => {
        issueInvoice(financeActor, invId);
      }).toThrow(/Chỉ có thể phát hành hóa đơn ở trạng thái Nháp hoặc Đã kiểm tra/);
    });
  });

  describe("FR-68: Tra cứu trạng thái hóa đơn", () => {
    it("tra cứu và lọc hóa đơn theo mã, đơn hàng và trạng thái", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 5000000,
      });
      const inv = getInvoice(invId)!;

      const listByOrder = listInvoices({ orderId: testOrderId });
      expect(listByOrder.some((i) => i.id === invId)).toBe(true);

      const listBySearch = listInvoices({ search: inv.code });
      expect(listBySearch.length).toBe(1);
      expect(listBySearch[0].id).toBe(invId);
    });
  });

  describe("FR-69: Ghi nhận và đối soát thanh toán (DEC-23)", () => {
    it("ghi nhận thanh toán theo doanh nghiệp, phân bổ vào hóa đơn và cập nhật trạng thái PAID", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 10000000,
      });
      issueInvoice(financeActor, invId);

      // Ghi nhận thanh toán 10,000,000 từ khách hàng
      const payId = recordPayment(financeActor, {
        accountId: testAccountId,
        amount: 10000000,
        paidAt: new Date().toISOString(),
        method: "BANK_TRANSFER",
        reference: `VCB-REF-${Date.now()}`,
      });

      expect(payId).toBeGreaterThan(0);
      let pay = getPayment(payId);
      expect(pay?.reconciliation_status).toBe("UNMATCHED");

      // Phân bổ toàn bộ khoản thanh toán cho hóa đơn
      allocatePayment(financeActor, payId, [{ invoiceId: invId, amount: 10000000 }]);

      // Kiểm tra hóa đơn đã tất toán
      const updatedInv = getInvoice(invId);
      expect(updatedInv?.paid_amount).toBe(10000000);
      expect(updatedInv?.status).toBe("PAID");

      // Kiểm tra payment đã đối soát thành công (MATCHED)
      pay = getPayment(payId);
      expect(pay?.reconciliation_status).toBe("MATCHED");

      // Kiểm tra trạng thái đơn hàng đã cập nhật thanh toán
      const order = getOrder(testOrderId);
      expect(order?.payment_status).toBe("PARTIALLY_PAID"); // Do đơn 22tr, mới trả 10tr
    });

    it("hỗ trợ thanh toán từng phần: hóa đơn chuyển sang PARTIALLY_PAID", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 10000000,
      });
      issueInvoice(financeActor, invId);

      // Thanh toán một phần 4,000,000
      const payId = recordPayment(financeActor, {
        accountId: testAccountId,
        amount: 4000000,
        paidAt: new Date().toISOString(),
        method: "BANK_TRANSFER",
      });

      allocatePayment(financeActor, payId, [{ invoiceId: invId, amount: 4000000 }]);

      const updatedInv = getInvoice(invId);
      expect(updatedInv?.paid_amount).toBe(4000000);
      expect(updatedInv?.status).toBe("PARTIALLY_PAID");
    });
  });

  describe("FR-70: Tiếp nhận kết quả thanh toán trực tuyến qua cổng (DEC-13)", () => {
    it("khởi tạo yêu cầu thanh toán online và tiếp nhận webhook thành công", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 8000000,
      });
      issueInvoice(financeActor, invId);

      const req = requestOnlinePayment(financeActor, invId);
      expect(req.paymentCode).toBeDefined();
      expect(req.checkoutUrl).toContain("mock://payment-gateway");

      // Giả lập webhook callback thanh toán thành công
      const cb = handleOnlinePaymentCallback(req.paymentCode, "SUCCESS");
      expect(cb.success).toBe(true);

      const updatedInv = getInvoice(invId);
      expect(updatedInv?.paid_amount).toBe(0);
      expect(updatedInv?.status).toBe("ISSUED");
      const gatewayPayment = db().prepare("SELECT id,reconciliation_status FROM payments WHERE reference=?").get(`GATEWAY-${req.paymentCode}`) as {id:number;reconciliation_status:string};
      expect(gatewayPayment.reconciliation_status).toBe("UNMATCHED");
      allocatePayment(financeActor,gatewayPayment.id,[{invoiceId:invId,amount:8000000}]);
      expect(getInvoice(invId)?.status).toBe("PAID");
    });
  });

  describe("FR-71: Theo dõi công nợ và nhắc thanh toán (BR-13)", () => {
    it("báo cáo các hóa đơn quá hạn chưa thanh toán đủ", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt nợ",
        amount: 5000000,
        dueDate: "2026-09-01", // Ngày trong quá khứ
      });
      issueInvoice(financeActor, invId);

      const dunning = getDunningReport();
      const target = dunning.find((d) => d.invoice.id === invId);
      expect(target).toBeDefined();
      expect(target?.overdueDays).toBeGreaterThan(0);
      expect(target?.unpaidBalance).toBe(5000000);
    });

    it("gửi nhắc thanh toán và kiểm soát giãn cách theo BR-13 (7 ngày/lần)", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt nợ",
        amount: 5000000,
        dueDate: "2026-09-01",
      });
      issueInvoice(financeActor, invId);

      // Lần 1: gửi thành công
      const res1 = sendPaymentReminder(financeActor, invId, { note: "Kính đề nghị thanh toán" });
      expect(res1.remindedAt).toBeDefined();

      // Lần 2: gửi ngay lập tức -> bị chặn do quy định BR-13
      expect(() => {
        sendPaymentReminder(financeActor, invId);
      }).toThrow(/vui lòng đợi.*ngày nữa theo quy định giãn cách/i);
    });
  });

  describe("FR-72: Đồng bộ dữ liệu với hệ thống kế toán ERP", () => {
    it("thực hiện đồng bộ hóa đơn và ghi nhận nhật ký sync_events", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt sync",
        amount: 6000000,
      });
      issueInvoice(financeActor, invId);

      const sync = syncAccountingData(financeActor);
      expect(sync.syncedCount).toBeGreaterThanOrEqual(0);

      const events = db().prepare("SELECT * FROM sync_events WHERE entity_type = 'INVOICE' AND entity_id = ?").all(invId);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("FR-73: Đề nghị và theo dõi điều chỉnh hóa đơn", () => {
    it("cho phép NVKD đề nghị hủy và TCKT phê duyệt hủy hóa đơn (CANCELLED)", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Hóa đơn lập nhầm",
        amount: 2000000,
      });

      const reqId = requestInvoiceChange(salesActor, invId, {
        type: "CANCELLATION",
        reason: "Khách hàng thay đổi yêu cầu mốc thanh toán",
      });

      expect(reqId).toBeGreaterThan(0);

      // TCKT duyệt hủy
      processInvoiceChange(financeActor, reqId, "APPROVED", "Đồng ý hủy chứng từ nháp");

      const inv = getInvoice(invId);
      expect(inv?.status).toBe("CANCELLED");
    });
  });

  describe("FR-74: Lưu và tra cứu lịch sử hóa đơn", () => {
    it("tra cứu đầy đủ lịch sử chứng từ, kiểm tra, phát hành và thanh toán", () => {
      const invId = createInvoiceDraftFromOrder(financeActor, testOrderId, {
        milestoneName: "Đợt 1",
        amount: 3000000,
      });
      reviewInvoiceDraft(financeActor, invId);
      issueInvoice(financeActor, invId);

      const history = getInvoiceHistory(invId);
      expect(history.invoice.id).toBe(invId);
      expect(history.audits.length).toBeGreaterThan(0);
      expect(history.syncEvents.length).toBeGreaterThan(0);
    });
  });
});
