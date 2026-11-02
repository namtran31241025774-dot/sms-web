import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "@/lib/db/migrations";
import { can } from "@/lib/rbac";
import { canSee } from "@/lib/scope";
import { SETTING_DEFAULTS } from "@/lib/settings-defaults";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ROLE_LABEL, OPP_STAGE, PROCESS_STAGE } from "@/lib/domain";

describe("WP-00: Nền móng và Hợp đồng chung", () => {
  describe("Bộ chạy Migration (schema_migrations & shared schema)", () => {
    it("chạy migration lần đầu và lưu vào bảng schema_migrations", () => {
      const db = new DatabaseSync(":memory:");
      // Tạo bảng users sơ bộ để migration nâng cấp
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL,
          title TEXT,
          active INTEGER NOT NULL DEFAULT 1
        );
      `);

      const result1 = runMigrations(db);
      expect(result1.applied).toContain("wp00_001_shared_schema");

      // Kiểm tra bảng schema_migrations
      const rows = db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[];
      expect(rows.map((r) => r.name)).toContain("wp00_001_shared_schema");

      // Kiểm tra các bảng dùng chung đã được tạo
      const docs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('documents', 'document_links')").all();
      expect(docs.length).toBe(2);

      // Kiểm tra tính lũy thừa (chạy lần 2 không lặp lại)
      const result2 = runMigrations(db);
      expect(result2.applied.length).toBe(0);
    });
  });

  describe("Phân quyền RBAC & Phạm vi Scope (ROLES.md)", () => {
    it("hỗ trợ đầy đủ các vai trò mới và nhãn tiếng Việt", () => {
      expect(ROLE_LABEL.PRESALES).toBe("Chuyên viên tư vấn giải pháp");
      expect(ROLE_LABEL.DELIVERY).toBe("Nhân viên triển khai kỹ thuật");
    });

    it("SALES_MANAGER có quyền rà soát chuyên môn FR-42", () => {
      expect(can("SALES_MANAGER", "opp.expert_review")).toBe(true);
      expect(can("SALES", "opp.expert_review")).toBe(false);
    });

    it("ADMIN có quyền cấu hình Agent nhưng không có quyền bán hàng", () => {
      expect(can("ADMIN", "ai.config.write")).toBe(true);
      expect(can("ADMIN", "ai.config.manage")).toBe(true);
            expect(can("ADMIN", "lead.write")).toBe(false);
      expect(can("ADMIN", "quote.approve")).toBe(false);
    });

    it("SALES_MANAGER có quyền duyệt chiết khấu và duyệt tiêu chí AI", () => {
      expect(can("SALES_MANAGER", "quote.approve")).toBe(true);
      expect(can("SALES_MANAGER", "ai.config.approve")).toBe(true);
      expect(can("SALES_MANAGER", "pricelist.write")).toBe(true);
    });

    it("canSee kiểm tra đúng phạm vi dữ liệu", () => {
      const adminUser = { id: 1, role: "ADMIN" as const };
      const salesUser = { id: 2, role: "SALES" as const, teamIds: [10] };

      // ADMIN thấy tất cả
      expect(canSee(adminUser, { owner_id: 99 })).toBe(true);

      // SALES thấy hồ sơ của mình
      expect(canSee(salesUser, { owner_id: 2 })).toBe(true);
      // SALES thấy hồ sơ trong nhóm của mình
      expect(canSee(salesUser, { owner_id: 5, team_id: 10 })).toBe(true);
      // SALES không thấy hồ sơ của người khác ngoài nhóm
      expect(canSee(salesUser, { owner_id: 99, team_id: 20 })).toBe(false);
    });
  });

  describe("Cấu hình mặc định (BUSINESS-RULES.md & DECISIONS.md)", () => {
    it("chứa đầy đủ các tham số nghiệp vụ bắt buộc", () => {
      expect(SETTING_DEFAULTS.bant_threshold?.value).toBe("60");
      expect(SETTING_DEFAULTS.discount_threshold_pct?.value).toBe("10");
      expect(SETTING_DEFAULTS.discount_max_pct?.value).toBe("30");
      expect(SETTING_DEFAULTS.expert_review_enabled?.value).toBe("true");
      expect(SETTING_DEFAULTS.ai_daily_token_budget?.value).toBe("200000");
      expect(SETTING_DEFAULTS.ai_auto_convert?.value).toBe("false");
    });
  });

  describe("Mã hoá mật khẩu scrypt (DEC-14, FR-97)", () => {
    it("băm và xác thực mật khẩu chính xác", () => {
      const password = "Password123!";
      const hash = hashPassword(password);

      expect(hash).toContain(":");
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("WrongPassword", hash)).toBe(false);
      expect(verifyPassword("", hash)).toBe(false);
    });
  });

  describe("Nhãn quy trình và giai đoạn (DEC-19)", () => {
    it("chuẩn hoá nhãn tiếng Việt theo yêu cầu đồ án", () => {
      expect(OPP_STAGE.DEVELOP).toBe("Phát triển cơ hội");
      expect(OPP_STAGE.PROPOSE).toBe("Đề xuất giải pháp");
      expect(OPP_STAGE.CLOSE).toBe("Tạo đơn hàng");
      expect(OPP_STAGE.WON).toBe("Thành công");
      expect(OPP_STAGE.LOST).toBe("Thất bại");

      expect(PROCESS_STAGE.QUALIFY).toBe("Đánh giá khách hàng");
      expect(PROCESS_STAGE.FULFILL).toBe("Theo dõi hóa đơn và thanh toán");
    });
  });
});
