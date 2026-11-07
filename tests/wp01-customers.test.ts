import { describe, it, expect, beforeEach } from "vitest";
import { db, get } from "@/lib/db";
import { seedWp01 } from "@/lib/db/seeds/wp01";
import { onEvent } from "@/lib/events";
import type { Actor } from "@/lib/services/core";
import {
  createLead,
  getLead,
  listLeads,
  softDeleteLead,
  restoreLead,
  calculateLeadRating,
  previewLeadImport,
  executeLeadImport,
  setLeadTags,
  listTags,
} from "@/lib/services/leads";
import {
  createAccount,
  getAccount,
  updateAccount,
  listAccounts,
  getAccount360,
  findOrCreateAccount,
} from "@/lib/services/accounts";
import {
  createContact,
  getContact,
  getContactAffiliations,
  changeContactAffiliation,
  findOrCreateContact,
} from "@/lib/services/contacts";
import {
  findDuplicates,
  requestLeadMerge,
  approveLeadMerge,
  rejectLeadMerge,
} from "@/lib/services/dedupe";
import { addInteraction, listInteractions } from "@/lib/services/interactions";

const salesActor: Actor = {
  type: "USER",
  id: 1,
  name: "Nguyễn Văn Kinh Doanh",
  role: "SALES",
};

const managerActor: Actor = {
  type: "USER",
  id: 2,
  name: "Trần Thị Quản Lý",
  role: "SALES_MANAGER",
};

describe("WP-01: Quản lý khách hàng tiềm năng & Doanh nghiệp", () => {
  beforeEach(() => {
    seedWp01(db());
  });
  // FR-08: Account CRUD & Chuẩn hoá tên
  describe("FR-08: Quản lý Doanh nghiệp (Accounts CRUD)", () => {
    it("tạo mới, cập nhật và tìm kiếm Doanh nghiệp với tên chuẩn hoá", () => {
      const accId = createAccount(salesActor, {
        name: "  Công ty Cổ phần Công nghệ ABC  ",
        tax_code: "0109998888",
        industry: "Công nghệ thông tin",
        website: "https://abctech.vn",
        address: "123 Phố Huế, Hai Bà Trưng, Hà Nội",
      });

      expect(accId).toBeGreaterThan(0);
      const acc = getAccount(accId);
      expect(acc).toBeDefined();
      expect(acc?.name).toBe("Công ty Cổ phần Công nghệ ABC");
      expect(acc?.name_norm).toBe("cong nghe abc");
      expect(acc?.email_domain).toBe("abctech.vn");

      // Cập nhật
      updateAccount(salesActor, accId, { phone: "02439998888" });
      const updated = getAccount(accId);
      expect(updated?.phone).toBe("02439998888");

      // Tìm kiếm theo từ khóa
      const searchRes = listAccounts({ q: "0109998888" });
      expect(searchRes.some((a) => a.id === accId)).toBe(true);
    });

    it("FR-12: findOrCreateAccount tái sử dụng account theo mã số thuế hoặc tên chuẩn hóa", () => {
      const accId1 = findOrCreateAccount({
        company_name: "Công ty Cổ phần Giải pháp Số XYZ",
        tax_code: "0301112222",
        industry: "Phần mềm",
      });

      const accId2 = findOrCreateAccount({
        company_name: "Công ty Giải pháp Số XYZ",
        tax_code: "0301112222",
      });

      expect(accId1).toBe(accId2);
    });
  });

  // FR-09 & FR-14: Contact CRUD & Lịch sử công tác (Affiliations - DEC-21)
  describe("FR-09 & FR-14: Người liên hệ và Lịch sử công tác (DEC-21)", () => {
    it("tạo Contact mới và tự động mở bản ghi liên kết công tác đầu tiên", () => {
      const accId = createAccount(salesActor, { name: "Tập đoàn Vận tải Biển Đông" });
      const contactId = createContact(salesActor, {
        account_id: accId,
        full_name: "Phạm Hùng Cường",
        title: "Trưởng phòng Mua sắm",
        email: "cuong.pham@biendong.com",
        phone: "0912345678",
        is_primary: true,
      });

      const contact = getContact(contactId);
      expect(contact).toBeDefined();
      expect(contact?.full_name).toBe("Phạm Hùng Cường");
      expect(contact?.is_primary).toBe(1);

      // Kiểm tra affiliation ban đầu
      const affs = getContactAffiliations(contactId);
      expect(affs.length).toBe(1);
      expect(affs[0].account_id).toBe(accId);
      expect(affs[0].is_current).toBe(1);
      expect(affs[0].valid_to).toBeNull();
    });

    it("FR-14: Chuyển công tác đóng liên kết cũ và mở liên kết mới, bảo toàn lịch sử", () => {
      const acc1 = createAccount(salesActor, { name: "Doanh nghiệp A Corp" });
      const acc2 = createAccount(salesActor, { name: "Tập đoàn B Holdings" });

      const contactId = createContact(salesActor, {
        account_id: acc1,
        full_name: "Lê Hoàng Nam",
        title: "Chuyên viên IT",
        email: "nam.le@acorp.vn",
      });

      // Thực hiện chuyển công tác sang B Holdings
      changeContactAffiliation(
        salesActor,
        contactId,
        acc2,
        "Giám đốc Công nghệ (CTO)",
        "Chuyển công tác bổ nhiệm vị trí mới",
      );

      const contactAfter = getContact(contactId);
      expect(contactAfter?.account_id).toBe(acc2);
      expect(contactAfter?.title).toBe("Giám đốc Công nghệ (CTO)");

      const affs = getContactAffiliations(contactId);
      expect(affs.length).toBe(2);

      const currentAff = affs.find((a) => a.is_current === 1);
      const pastAff = affs.find((a) => a.is_current === 0);

      expect(currentAff?.account_id).toBe(acc2);
      expect(currentAff?.job_title).toBe("Giám đốc Công nghệ (CTO)");

      expect(pastAff?.account_id).toBe(acc1);
      expect(pastAff?.valid_to).not.toBeNull();
    });

    it("FR-12: findOrCreateContact tìm lại hoặc tạo người liên hệ", () => {
      const accId = createAccount(salesActor, { name: "Công ty May Mặc An Phú" });
      const cid1 = findOrCreateContact(
        {
          contact_name: "Nguyễn Thị Mai",
          email: "mai.nguyen@anphu.vn",
          contact_title: "Kế toán trưởng",
        },
        accId,
      );

      const cid2 = findOrCreateContact(
        {
          contact_name: "Nguyễn Thị Mai",
          email: "mai.nguyen@anphu.vn",
        },
        accId,
      );

      expect(cid1).toBe(cid2);
    });
  });

  // FR-01, FR-02, FR-11: Lead creation & auto-fill
  describe("FR-01, FR-02 & FR-11: Quản lý Khách hàng tiềm năng (Leads CRUD)", () => {
    it("tạo Lead mới với đầy đủ thông tin và tính năng tự điền (FR-11)", () => {
      const accId = createAccount(salesActor, {
        name: "Công ty Dược phẩm Minh Đức",
        industry: "Dược phẩm",
        address: "78 Nguyễn Trãi, Thanh Xuân, Hà Nội",
      });
      const contactId = createContact(salesActor, {
        account_id: accId,
        full_name: "Bác sĩ Minh Đức",
        title: "Giám đốc chuyên môn",
        email: "duc@minhducpharma.com",
        phone: "0988776655",
      });

      const leadId = createLead(salesActor, {
        company_name: "Công ty Dược phẩm Minh Đức",
        contact_name: "Bác sĩ Minh Đức",
        account_id: accId,
        contact_id: contactId,
        topic: "Tư vấn phần mềm quản lý kho GSP",
      });

      const lead = getLead(leadId);
      expect(lead).toBeDefined();
      expect(lead?.email).toBe("duc@minhducpharma.com");
      expect(lead?.phone).toBe("0988776655");
      expect(lead?.address).toBe("78 Nguyễn Trãi, Thanh Xuân, Hà Nội");
      expect(lead?.industry).toBe("Dược phẩm");
    });

    it("FR-02: Tạo Lead từ nguồn biểu mẫu (FORM)", () => {
      const leadId = createLead(salesActor, {
        company_name: "Khách hàng Web Form",
        contact_name: "Trần Văn C",
        email: "c.tran@gmail.com",
        source: "FORM",
      });

      const lead = getLead(leadId);
      expect(lead?.source).toBe("FORM");
    });
  });

  // FR-10: Lead Rating (HOT, WARM, COLD - BR-02)
  describe("FR-10: Phân loại Lead Rating theo BR-02", () => {
    it("phân loại HOT khi BANT >= 60, có thẩm quyền và tiến độ nhanh", () => {
      const rating = calculateLeadRating({
        bant_score: 70,
        bant_authority: 25,
        bant_need: 15,
        bant_timeline: 25, // trong tháng hoặc cuối quý
      });
      expect(rating).toBe("HOT");
    });

    it("phân loại WARM khi BANT 40-59 và có nhu cầu rõ ràng", () => {
      const rating = calculateLeadRating({
        bant_score: 50,
        bant_authority: 15,
        bant_need: 10,
        bant_timeline: 10,
      });
      expect(rating).toBe("WARM");
    });

    it("phân loại COLD khi BANT < 40 hoặc không rõ nhu cầu", () => {
      const rating1 = calculateLeadRating({
        bant_score: 35,
        bant_authority: 10,
        bant_need: 5,
        bant_timeline: 10,
      });
      expect(rating1).toBe("COLD");

      const rating2 = calculateLeadRating({
        bant_score: 65,
        bant_authority: 25,
        bant_need: 0, // Nhu cầu bằng 0
        bant_timeline: 15,
      });
      expect(rating2).toBe("COLD");
    });
  });

  // FR-05 & FR-18: Soft delete & Restore
  describe("FR-05 & FR-18: Xóa mềm và khôi phục Lead", () => {
    it("chuyển Lead vào thùng rác và khôi phục lại nguyên vẹn", () => {
      const leadId = createLead(salesActor, {
        company_name: "Công ty Cần Xóa Thử",
        contact_name: "Người liên hệ test",
      });

      // Xóa mềm
      softDeleteLead(salesActor, leadId);
      const deleted = getLead(leadId);
      expect(deleted?.deleted_at).not.toBeNull();

      // Kiểm tra danh sách mặc định không hiển thị lead đã xóa
      const normalList = listLeads();
      expect(normalList.some((l) => l.id === leadId)).toBe(false);

      // Khôi phục
      restoreLead(salesActor, leadId);
      const restored = getLead(leadId);
      expect(restored?.deleted_at).toBeNull();
      expect(restored?.status).toBe("OPEN");
    });
  });

  // FR-07: Tags
  describe("FR-07: Nhãn (Tags) phân loại Lead", () => {
    it("gắn và gỡ nhãn cho Lead", () => {
      const tags = listTags();
      expect(tags.length).toBeGreaterThan(0);
      const tagId = tags[0].id;

      const leadId = createLead(salesActor, {
        company_name: "Công ty Gắn Thẻ VIP",
        contact_name: "VIP Contact",
        tag_ids: [tagId],
      });

      const lead = getLead(leadId);
      expect(lead?.tags?.some((t) => t.id === tagId)).toBe(true);

      // Gỡ bỏ tag
      setLeadTags(leadId, []);
      const leadNoTag = getLead(leadId);
      expect(leadNoTag?.tags?.length).toBe(0);
    });
  });

  // FR-03: CSV Import & Event `lead.imported`
  describe("FR-03: Nhập tệp CSV và phát sự kiện lead.imported", () => {
    it("kiểm tra xem trước và nhập tệp thành công, phát sự kiện kích hoạt", async () => {
      const csvContent = `Tên công ty,Người liên hệ,Email,Điện thoại,Ghi chú
Công ty Nhập Khẩu 1,Nguyễn Văn Nhập 1,nhap1@import.vn,0911223344,Khách hàng tiềm năng
Công ty Nhập Khẩu 2,Trần Thị Nhập 2,nhap2@import.vn,0922334455,Cần báo giá ngay
Công ty Lỗi Không Tên,,loi@test.com,,Thiếu tên`;

      const preview = previewLeadImport(csvContent);
      expect(preview.rows.length).toBe(3);
      expect(preview.validCount).toBe(2);
      expect(preview.errorCount).toBe(1);

      // Đăng ký nghe sự kiện
      let emittedPayload: { leadIds: number[]; count: number } | null = null;
      onEvent<{ leadIds: number[]; count: number }>("lead.imported", (payload) => {
        emittedPayload = payload;
      });

      const validRows = preview.rows.filter((r) => r.isValid).map((r) => r.data);
      const result = executeLeadImport(salesActor, validRows);

      expect(result.imported).toBe(2);
      expect(emittedPayload).toBeDefined();
      const payload = emittedPayload as unknown as { leadIds: number[]; count: number };
      expect(payload.count).toBe(2);
      expect(payload.leadIds.length).toBe(2);
    });
  });

  // FR-04: Filter & Search Leads
  describe("FR-04: Lọc và tìm kiếm danh sách Lead", () => {
    it("lọc chính xác theo trạng thái, từ khóa và rating", () => {
      const id1 = createLead(salesActor, {
        company_name: "Tập đoàn Bất động sản Thịnh Vượng",
        contact_name: "Trịnh Văn Thịnh",
        email: "thinh@thinhvuongland.vn",
      });

      const results = listLeads({ q: "Thịnh Vượng" });
      expect(results.some((l) => l.id === id1)).toBe(true);

      const emptyResults = listLeads({ q: "Từ Khóa Không Thể Tồn Tại 99999" });
      expect(emptyResults.length).toBe(0);
    });
  });

  // FR-13: Account 360
  describe("FR-13: Tổng quan Doanh nghiệp Account 360", () => {
    it("truy vấn đầy đủ các liên kết trong hệ thống của doanh nghiệp", () => {
      const accId = createAccount(salesActor, { name: "Công ty Cổ phần Toàn Cầu 360" });
      createContact(salesActor, { account_id: accId, full_name: "Lãnh đạo 360" });

      const overview = getAccount360(accId);
      expect(overview).toBeDefined();
      expect(overview.account.id).toBe(accId);
      expect(overview.contacts.length).toBe(1);
      expect(overview.opportunities).toEqual([]);
      expect(overview.orders).toEqual([]);
      expect(overview.invoices).toEqual([]);
    });
  });

  // FR-15: Interactions timeline
  describe("FR-15: Ghi nhận và truy vấn dòng thời gian tương tác", () => {
    it("thêm tương tác và đọc lại trên Lead và Account", () => {
      const leadId = createLead(salesActor, {
        company_name: "Công ty Khảo Sát Tương Tác",
        contact_name: "Anh Tương Tác",
      });

      addInteraction(salesActor, {
        entity_type: "lead",
        entity_id: leadId,
        type: "CALL",
        subject: "Cuộc gọi tư vấn lần 1",
        body: "Khách quan tâm tới gói SaaS Enterprise",
      });

      const timeline = listInteractions("lead", leadId);
      expect(timeline.length).toBe(1);
      expect(timeline[0].subject).toBe("Cuộc gọi tư vấn lần 1");
      expect(timeline[0].type).toBe("CALL");
    });
  });

  // FR-16 & FR-17: Dedupe & Merge approval (BR-21, DEC-04)
  describe("FR-16 & FR-17: Phát hiện trùng lặp và Phê duyệt hợp nhất Lead (DEC-04, BR-21)", () => {
    it("FR-16: phát hiện trùng lặp theo email, điện thoại, tên công ty và mã số thuế", () => {
      const originalLeadId = createLead(salesActor, {
        company_name: "Công ty Viễn Thông Á Châu",
        contact_name: "Nguyễn Văn A",
        email: "chau@achau.com",
        phone: "0903112233",
      });

      // Tìm trùng với email
      const dupByEmail = findDuplicates(
        {
          company_name: "Khác Tên",
          email: "chau@achau.com",
        },
        0,
      );
      expect(dupByEmail.some((d) => d.kind === "LEAD" && d.id === originalLeadId)).toBe(true);

      // Tìm trùng với SĐT chuẩn hoá (+84)
      const dupByPhone = findDuplicates(
        {
          company_name: "Khác Tên Hoàn Toàn",
          phone: "+84903112233",
        },
        0,
      );
      expect(dupByPhone.some((d) => d.kind === "LEAD" && d.id === originalLeadId)).toBe(true);
    });

    it("FR-17: Quy trình đề nghị và Quản lý duyệt hợp nhất Lead trùng lặp", () => {
      const leadSource = createLead(salesActor, {
        company_name: "Công ty Sao Mai Chi Nhánh 1",
        contact_name: "Nguyễn Sao Mai 1",
        email: "saomai1@saomai.vn",
      });
      const leadTarget = createLead(salesActor, {
        company_name: "Công ty Cổ phần Sao Mai",
        contact_name: "Trần Sao Mai 2",
        email: "saomai2@saomai.vn",
      });

      // Thêm tương tác vào leadSource
      addInteraction(salesActor, {
        entity_type: "lead",
        entity_id: leadSource,
        type: "MEETING",
        subject: "Họp demo ban đầu",
      });

      // 1. Nhân viên gửi đề nghị hợp nhất
      const approvalId = requestLeadMerge(
        salesActor,
        leadSource,
        leadTarget,
        "Hai chi nhánh chung một công ty mẹ, gộp về lead đích",
      );

      const approval = get<{ status: string; kind: string }>("SELECT * FROM approvals WHERE id = ?", approvalId);
      expect(approval?.status).toBe("PENDING");
      expect(approval?.kind).toBe("MERGE");

      // 2. Quản lý kinh doanh duyệt hợp nhất
      approveLeadMerge(managerActor, approvalId, "Đồng ý gộp hồ sơ");

      const approvalAfter = get<{ status: string }>("SELECT * FROM approvals WHERE id = ?", approvalId);
      expect(approvalAfter?.status).toBe("APPROVED");

      // Kiểm tra lead nguồn bị đóng và gộp
      const sourceAfter = getLead(leadSource);
      expect(sourceAfter?.status).toBe("OPEN");
      expect(sourceAfter?.merged_into_lead_id).toBe(leadTarget);

      // Kiểm tra interaction đã được chuyển sang leadTarget
      const targetTimeline = listInteractions("lead", leadTarget);
      expect(targetTimeline.some((i) => i.subject === "Họp demo ban đầu")).toBe(true);
    });

    it("FR-17: Quản lý từ chối đề nghị hợp nhất", () => {
      const leadA = createLead(salesActor, {
        company_name: "Công ty Độc Lập A",
        contact_name: "Liên Hệ A",
      });
      const leadB = createLead(salesActor, {
        company_name: "Công ty Độc Lập B",
        contact_name: "Liên Hệ B",
      });

      const approvalId = requestLeadMerge(salesActor, leadA, leadB, "Nghi ngờ trùng");
      rejectLeadMerge(managerActor, approvalId, "Không trùng, hai pháp nhân độc lập");

      const approval = get<{ status: string; decision_comment: string }>(
        "SELECT * FROM approvals WHERE id = ?",
        approvalId,
      );
      expect(approval?.status).toBe("REJECTED");
      expect(approval?.decision_comment).toBe("Không trùng, hai pháp nhân độc lập");

      // Lead A không bị đóng
      const leadAAfter = getLead(leadA);
      expect(leadAAfter?.status).toBe("OPEN");
      expect(leadAAfter?.merged_into_lead_id).toBeNull();
    });
  });
});
