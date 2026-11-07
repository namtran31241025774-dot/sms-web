import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  createUser,
  updateUser,
  setUserStatus,
  getUser,
  listUsers,
  resetUserPassword,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../src/lib/services/admin";
import {
  listAuditLogs,
  getAuditLog,
  exportAuditLogsCsv,
} from "../src/lib/services/audit-view";
import {
  getPipelineFunnelReport,
  exportPipelineReportCsv,
} from "../src/lib/services/reports";
import { can } from "../src/lib/rbac";
import { canSee, scopeFilterSql } from "../src/lib/scope";
import { verifyPassword } from "../src/lib/password";
import type { Actor } from "../src/lib/services/core";

const adminActor: Actor = {
  type: "USER",
  id: 8,
  name: "Hoàng Gia Khánh",
  role: "ADMIN",
};

describe("WP-09: Quản trị hệ thống & Phân quyền (FR-96 → FR-100)", () => {
  beforeEach(() => {
    // Đảm bảo có dữ liệu nhân viên EMP-001 để liên kết
    const emp = db().prepare("SELECT code FROM employees WHERE code = 'EMP-001'").get();
    if (!emp) {
      db().prepare(`
        INSERT INTO employees (code, full_name, email, title, business_role, status, can_accept_work)
        VALUES ('EMP-001', 'Nguyễn Văn An', 'an.nguyen.emp@sms.local', 'SDR', 'SALES', 'ACTIVE', 1)
      `).run();
    }
  });

  describe("FR-96: Tạo, cập nhật và khóa tài khoản", () => {
    it("FR-96: tạo tài khoản mới với vai trò, kiểm tra trùng email và liên kết hồ sơ nhân viên", () => {
      const email = `test.user.${Date.now()}@sms.local`;
      const empCode = `EMP-TEST-${Date.now()}`;
      db().prepare(`
        INSERT INTO employees (code, full_name, email, title, business_role, status, can_accept_work)
        VALUES (?, 'Nhân viên Thử Nghiệm', ?, 'SDR', 'SALES', 'ACTIVE', 1)
      `).run(empCode, `emp.${Date.now()}@sms.local`);

      const userId = createUser(adminActor, {
        name: "Lê Văn Thử Nghiệm",
        email,
        role: "SALES",
        title: "SDR Chuyên viên",
        employee_id: empCode,
      });

      expect(userId).toBeGreaterThan(0);
      const user = getUser(userId);
      expect(user).not.toBeNull();
      expect(user?.name).toBe("Lê Văn Thử Nghiệm");
      expect(user?.email).toBe(email);
      expect(user?.role).toBe("SALES");
      expect(user?.employee_id).toBe(empCode);
      expect(user?.status).toBe("ACTIVE");
      expect(user?.active).toBe(1);

      // Thử tạo lại với cùng email -> báo lỗi trùng
      expect(() =>
        createUser(adminActor, {
          name: "Lê Văn Khác",
          email,
          role: "SALES",
        }),
      ).toThrow(/đã được sử dụng/);

      // Thử tạo lại với cùng employee_id -> báo lỗi trùng
      expect(() =>
        createUser(adminActor, {
          name: "Người Trùng Mã",
          email: `other.${Date.now()}@sms.local`,
          role: "SALES",
          employee_id: empCode,
        }),
      ).toThrow(/đã được liên kết/);
    });

    it("FR-96: cập nhật thông tin tài khoản người dùng và vai trò", () => {
      const email = `update.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Nguyễn Thị Mới",
        email,
        role: "SALES",
        title: "Thực tập sinh",
      });

      updateUser(adminActor, userId, {
        name: "Nguyễn Thị Cập Nhật",
        role: "SALES_MANAGER",
        title: "Trưởng phòng kinh doanh",
      });

      const updated = getUser(userId);
      expect(updated?.name).toBe("Nguyễn Thị Cập Nhật");
      expect(updated?.role).toBe("SALES_MANAGER");
      expect(updated?.title).toBe("Trưởng phòng kinh doanh");
    });

    it("FR-96: khóa tài khoản người dùng chuyển trạng thái SUSPENDED, giữ nguyên bản ghi lịch sử", () => {
      const email = `lock.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Trần Khóa Tài Khoản",
        email,
        role: "SALES",
      });

      // Khóa tài khoản
      setUserStatus(adminActor, userId, "SUSPENDED");

      let user = getUser(userId);
      expect(user?.status).toBe("SUSPENDED");
      expect(user?.active).toBe(0);

      // Mở khóa lại
      setUserStatus(adminActor, userId, "ACTIVE");
      user = getUser(userId);
      expect(user?.status).toBe("ACTIVE");
      expect(user?.active).toBe(1);

      // Không cho phép tự khóa tài khoản của chính mình
      expect(() =>
        setUserStatus({ type: "USER", id: userId, name: "Self", role: "ADMIN" }, userId, "SUSPENDED"),
      ).toThrow(/tự khóa tài khoản/);
    });

    it("FR-96: danh sách người dùng hỗ trợ tìm kiếm và lọc theo vai trò, trạng thái", () => {
      const email = `search.user.${Date.now()}@sms.local`;
      createUser(adminActor, {
        name: "Đặc Biệt Tìm Kiếm",
        email,
        role: "FINANCE",
      });

      const searchResult = listUsers({ search: "Đặc Biệt Tìm Kiếm" });
      expect(searchResult.length).toBeGreaterThanOrEqual(1);
      expect(searchResult.some((u) => u.email === email)).toBe(true);

      const roleResult = listUsers({ role: "FINANCE" });
      expect(roleResult.every((u) => u.role === "FINANCE")).toBe(true);
    });
  });

  describe("FR-97: Đăng nhập, đăng xuất và đặt lại mật khẩu", () => {
    it("FR-97: tạo tài khoản băm mật khẩu bằng scrypt và xác thực mật khẩu hợp lệ", () => {
      const email = `pwd.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Người Kiểm Tra Pass",
        email,
        role: "SALES",
        password: "MySecurePassword123!",
      });

      const userRow = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as {
        password_hash: string;
      };
      expect(userRow.password_hash).toBeDefined();

      // Mật khẩu đúng
      expect(verifyPassword("MySecurePassword123!", userRow.password_hash)).toBe(true);
      // Mật khẩu sai
      expect(verifyPassword("WrongPassword!", userRow.password_hash)).toBe(false);
    });

    it("FR-97: Quản trị viên đặt lại mật khẩu trực tiếp cho người dùng", () => {
      const email = `reset.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Người Reset Trực Tiếp",
        email,
        role: "SALES",
        password: "OldPassword123!",
      });

      resetUserPassword(adminActor, userId, "NewPassword456!");

      const userRow = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as {
        password_hash: string;
      };
      expect(verifyPassword("NewPassword456!", userRow.password_hash)).toBe(true);
      expect(verifyPassword("OldPassword123!", userRow.password_hash)).toBe(false);
    });

    it("FR-97: Đặt lại mật khẩu tự phục vụ bằng mã xác nhận Token (Self-service reset)", () => {
      const email = `token.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Người Reset Token",
        email,
        role: "SALES",
        password: "InitialPassword123!",
      });

      // 1. Yêu cầu đặt lại mật khẩu
      const token = requestPasswordReset(email);
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(10);

      // 2. Sử dụng token để đặt mật khẩu mới
      resetPasswordWithToken(token, "BrandNewPassword789!");

      const userRow = db().prepare("SELECT password_hash, reset_token FROM users WHERE id = ?").get(userId) as {
        password_hash: string;
        reset_token: string | null;
      };
      expect(verifyPassword("BrandNewPassword789!", userRow.password_hash)).toBe(true);
      expect(userRow.reset_token).toBeNull(); // Token đã bị hủy sau khi dùng
    });

    it("FR-97: Tài khoản bị khóa (SUSPENDED) không được yêu cầu đặt lại mật khẩu", () => {
      const email = `suspended.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Người Bị Khóa",
        email,
        role: "SALES",
      });

      setUserStatus(adminActor, userId, "SUSPENDED");

      expect(() => requestPasswordReset(email)).toThrow(/bị khóa hoặc ngưng hoạt động/);
    });
  });

  describe("FR-98: Phân quyền theo vai trò và nhóm bán hàng", () => {
    it("FR-98: Ma trận RBAC phân định rõ quyền của 6 vai trò hệ thống", () => {
      // ADMIN có quyền quản lý tài khoản
      expect(can("ADMIN", "admin.users")).toBe(true);
      expect(can("SALES_MANAGER", "admin.users")).toBe(false);

      // ADMIN cấu hình Agent, SALES_MANAGER không tự ý ghi đè
      expect(can("ADMIN", "ai.config.write")).toBe(true);
      expect(can("SALES_MANAGER", "ai.config.write")).toBe(false);
      expect(can("SALES", "ai.config.write")).toBe(false);

      // SALES_MANAGER có quyền duyệt hợp nhất Lead và duyệt chiết khấu, SALES chỉ có quyền đề nghị/trình
      expect(can("SALES_MANAGER", "lead.merge.approve")).toBe(true);
      expect(can("SALES", "lead.merge.approve")).toBe(false);
      expect(can("SALES", "lead.merge.request")).toBe(true);

      expect(can("SALES_MANAGER", "quote.approve")).toBe(true);
      expect(can("SALES", "quote.approve")).toBe(false);

      // FINANCE chỉ quản lý hoá đơn, không có quyền duyệt báo giá
      expect(can("FINANCE", "invoice.finance")).toBe(true);
      expect(can("FINANCE", "quote.approve")).toBe(false);
    });

    it("FR-98: Hồ sơ chưa gắn team_id theo nhóm của người phụ trách", () => {
      const record = { owner_id: 1, team_id: null, owner_team_ids: [1] };
      expect(canSee({ id: 4, role: "SALES_MANAGER", teamIds: [1] }, record)).toBe(true);
      expect(canSee({ id: 2, role: "SALES", teamIds: [1] }, record)).toBe(true);
      expect(canSee({ id: 9, role: "SALES_MANAGER", teamIds: [2] }, record)).toBe(false);
      expect(canSee({ id: 9, role: "SALES", teamIds: [2] }, record)).toBe(false);
    });

    it("FR-98: Kiểm soát phạm vi dữ liệu theo nhóm (Data Scope: canSee & scopeFilterSql)", () => {
      // 1. ADMIN và FINANCE luôn thấy toàn bộ dữ liệu
      expect(canSee({ id: 8, role: "ADMIN" }, { owner_id: 1, team_id: 2 })).toBe(true);
      expect(canSee({ id: 6, role: "FINANCE" }, { owner_id: 1, team_id: 2 })).toBe(true);

      // 2. SALES chỉ thấy dữ liệu của chính mình hoặc cùng Sale Pod
      const salesUser = { id: 1, role: "SALES" as const, teamIds: [10] };
      // Hồ sơ do mình phụ trách
      expect(canSee(salesUser, { owner_id: 1, team_id: 99 })).toBe(true);
      // Hồ sơ cùng Sale Pod (team 10)
      expect(canSee(salesUser, { owner_id: 2, team_id: 10 })).toBe(true);
      // Hồ sơ của người khác ở Pod khác (team 20) -> BỊ CHẶN
      expect(canSee(salesUser, { owner_id: 2, team_id: 20 })).toBe(false);

      // 3. scopeFilterSql sinh mệnh đề WHERE phù hợp
      const salesFilter = scopeFilterSql(salesUser);
      expect(salesFilter.sql).toContain("owner_id = ?");
      expect(salesFilter.sql).toContain("team_id IN (?)");
      expect(salesFilter.params).toEqual([1, 10]);

      const adminFilter = scopeFilterSql({ id: 8, role: "ADMIN" });
      expect(adminFilter.sql).toBe("1=1");
    });
  });

  describe("FR-99: Báo cáo cơ hội và dự báo doanh số", () => {
    it("FR-99: tính toán phễu cơ hội và dự báo doanh thu Pipeline chuẩn xác theo BR-14", () => {
      // Dọn dẹp cơ hội cũ để có số liệu kiểm thử chính xác
      db().exec("DELETE FROM opportunities WHERE code LIKE 'TEST-OPP-%'");
      const baseline=getPipelineFunnelReport({owner_id:1});

      const account = db().prepare("SELECT id FROM accounts LIMIT 1").get() as { id: number };
      const accountId = account?.id ?? 1;

      // 1. Tạo 1 cơ hội DEVELOP: 100,000,000 VND -> Trọng số 20% = 20,000,000 VND
      db().prepare(`
        INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
        VALUES ('TEST-OPP-DEV', 'Cơ hội Phát triển', ?, 1, 'DEVELOP', 100000000)
      `).run(accountId);

      // 2. Tạo 1 cơ hội PROPOSE: 200,000,000 VND -> Trọng số 50% = 100,000,000 VND
      db().prepare(`
        INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
        VALUES ('TEST-OPP-PROP', 'Cơ hội Đề xuất', ?, 1, 'PROPOSE', 200000000)
      `).run(accountId);

      // 3. Tạo 1 cơ hội CLOSE: 100,000,000 VND -> Trọng số 80% = 80,000,000 VND
      db().prepare(`
        INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
        VALUES ('TEST-OPP-CLOSE', 'Cơ hội Chốt', ?, 1, 'CLOSE', 100000000)
      `).run(accountId);

      // 4. Tạo 1 cơ hội WON: 50,000,000 VND -> Actual Won
      db().prepare(`
        INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
        VALUES ('TEST-OPP-WON', 'Cơ hội Thắng', ?, 1, 'WON', 50000000)
      `).run(accountId);

      const report = getPipelineFunnelReport({ owner_id: 1 });

      // Dự báo Pipeline mở: 100m * 0.2 + 200m * 0.5 + 100m * 0.8 = 20m + 100m + 80m = 200,000,000 VND
      expect(report.totalPipelineValue-baseline.totalPipelineValue).toBe(400000000);
      expect(report.weightedForecastRevenue-baseline.weightedForecastRevenue).toBe(200000000);
      expect(report.wonValue-baseline.wonValue).toBe(50000000);

      // Kiểm tra trích xuất CSV
      const csv = exportPipelineReportCsv(report);
      expect(csv).toContain("BÁO CÁO PHỄU BÁN HÀNG VÀ DỰ BÁO DOANH THU (BR-14)");
      expect(csv).toContain(String(report.totalPipelineValue));
      expect(csv).toContain(String(report.weightedForecastRevenue));
    });
  });

  describe("FR-100: Ghi và tra cứu nhật ký hoạt động", () => {
    it("FR-100: ghi nhật ký kiểm toán và tra cứu theo nhiều tiêu chí lọc", () => {
      // Tạo một user để sinh nhật ký CREATE
      const email = `audit.user.${Date.now()}@sms.local`;
      const userId = createUser(adminActor, {
        name: "Người Thử Audit",
        email,
        role: "SALES",
      });

      // Lọc theo entity_type = 'user' và entity_id = userId
      const logs = listAuditLogs({
        entity_type: "user",
        entity_id: userId,
      });

      expect(logs.items.length).toBeGreaterThanOrEqual(1);
      const createLog = logs.items.find((l) => l.action === "CREATE");
      expect(createLog).toBeDefined();
      expect(createLog?.actor_label).toBe(adminActor.name);
      expect(createLog?.entity_id).toBe(userId);

      // Đọc chi tiết bằng getAuditLog
      const detail = getAuditLog(createLog!.id);
      expect(detail).not.toBeNull();
      expect(detail?.action).toBe("CREATE");

      // Xuất file CSV
      const csv = exportAuditLogsCsv({ entity_type: "user" });
      expect(csv).toContain("ID,Thời gian,Tác nhân,Loại tác nhân,Đối tượng,Mã ID đối tượng,Hành động");
      expect(csv).toContain("CREATE");
    });
  });
});
