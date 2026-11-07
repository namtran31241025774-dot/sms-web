import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  createEmployee,
  updateEmployee,
  updateEmployeeWorkStatus,
  getEmployeeWorkload,
  listEmployees,
  createTeam,
  updateTeam,
  addTeamMember,
  removeTeamMember,
  listTeamMembers,
  listTeams,
} from "../src/lib/services/team";
import {
  assignInitial,
  handoverWork,
  listAssignments,
} from "../src/lib/services/assignments";
import {
  createWorkItem,
  completeWorkItem,
  respondInvitation,
  listWorkItems,
} from "../src/lib/services/work-items";
import {
  setSalesTarget,
  getPerformanceSummary,
  createPerformanceReview,
  listPerformanceReviews,
} from "../src/lib/services/targets";

describe("WP-07: Quản lý đội ngũ Sales (FR-75 → FR-87)", () => {
  beforeEach(() => {
    // Reset database trạng thái sạch cho các bảng của WP-07
    db().exec("DELETE FROM performance_reviews");
    db().exec("DELETE FROM sales_targets");
    db().exec("DELETE FROM work_participants");
    db().exec("DELETE FROM assignments");
    db().exec("UPDATE users SET team_id = NULL");
    db().exec('UPDATE leads SET team_id=NULL; UPDATE opportunities SET team_id=NULL');
    db().exec("DELETE FROM team_members");
    db().exec("DELETE FROM teams");
    db().exec("DELETE FROM employees");
    db().exec("DELETE FROM tasks");
  });

  // ====================================================
  // FR-75: Tạo hồ sơ nhân viên bán hàng
  // ====================================================
  it("FR-75: tạo hồ sơ nhân viên nghiệp vụ và kiểm tra trùng mã", () => {
    const emp = createEmployee({
      code: "EMP-TEST-01",
      full_name: "Hoàng Minh Đức",
      email: "duc.hoang@test.sms",
      phone: "0911223344",
      title: "Account Executive (AE)",
      business_role: "SALES",
      status: "ACTIVE",
      can_accept_work: true,
      notes: "Kinh nghiệm 3 năm B2B SaaS",
    }, 1);

    expect(emp.id).toBeDefined();
    expect(emp.code).toBe("EMP-TEST-01");
    expect(emp.full_name).toBe("Hoàng Minh Đức");
    expect(emp.business_role).toBe("SALES");
    expect(emp.can_accept_work).toBe(1);

    // Không được trùng mã nhân viên
    expect(() => {
      createEmployee({
        code: "EMP-TEST-01",
        full_name: "Người Khác",
        email: "khac@test.sms",
        title: "SDR",
        business_role: "SALES",
      }, 1);
    }).toThrow("đã tồn tại");
  });

  // ====================================================
  // FR-76: Tra cứu, xem và cập nhật hồ sơ nhân viên
  // ====================================================
  it("FR-76: tìm kiếm và cập nhật thông tin hồ sơ nhân viên", () => {
    const emp = createEmployee({
      code: "EMP-TEST-02",
      full_name: "Nguyễn Thu Thủy",
      email: "thuy.nguyen@test.sms",
      phone: "0988776655",
      title: "SDR",
      business_role: "SALES",
    }, 1);

    const updated = updateEmployee(emp.id, {
      title: "Senior SDR",
      phone: "0988112233",
      notes: "Thăng chức quý 4",
    }, 1);

    expect(updated.title).toBe("Senior SDR");
    expect(updated.phone).toBe("0988112233");
    expect(updated.notes).toBe("Thăng chức quý 4");

    const found = listEmployees({ query: "Thu Thủy" });
    expect(found.length).toBe(1);
    expect(found[0].code).toBe("EMP-TEST-02");
  });

  // ====================================================
  // FR-77: Quản lý chức danh và vai trò nghiệp vụ
  // ====================================================
  it("FR-77: thiết lập vai trò nghiệp vụ và chức danh rõ ràng", () => {
    const se = createEmployee({
      code: "EMP-TEST-SE",
      full_name: "Đặng Quang Huy",
      email: "huy.dang@test.sms",
      title: "Solution Engineer (SE)",
      business_role: "PRESALES",
      notes: "Chuyên trách tư vấn giải pháp kỹ thuật và tích hợp API",
    }, 1);

    expect(se.business_role).toBe("PRESALES");
    expect(se.title).toBe("Solution Engineer (SE)");

    const presalesList = listEmployees({ businessRole: "PRESALES" });
    expect(presalesList.some((e) => e.code === "EMP-TEST-SE")).toBe(true);
  });

  // ====================================================
  // FR-78: Cập nhật trạng thái làm việc và kiểm tra khối lượng việc
  // ====================================================
  it("FR-78: cập nhật trạng thái làm việc, khả năng nhận việc và kiểm tra tải công việc", () => {
    const emp = createEmployee({
      code: "EMP-TEST-03",
      full_name: "Lê Văn Tùng",
      email: "tung.le@test.sms",
      title: "Account Executive",
      business_role: "SALES",
      status: "ACTIVE",
      can_accept_work: true,
    }, 1);

    // Cập nhật sang nghỉ phép (ON_LEAVE) và ngưng nhận việc
    const off = updateEmployeeWorkStatus(emp.id, "ON_LEAVE", false, "Nghỉ phép 2 tuần", 1);
    expect(off.status).toBe("ON_LEAVE");
    expect(off.can_accept_work).toBe(0);

    // Tra cứu tải việc trước khi bàn giao
    const workload = getEmployeeWorkload(emp.code);
    expect(workload).toBeDefined();
    expect(Array.isArray(workload.assignedLeads)).toBe(true);
    expect(Array.isArray(workload.assignedOpportunities)).toBe(true);
  });

  // ====================================================
  // FR-79: Tạo và cập nhật nhóm bán hàng (Sale Pod)
  // ====================================================
  it("FR-79: tạo nhóm bán hàng, kiểm tra trùng mã nhóm", () => {
    const pod = createTeam({
      code: "POD-CORP-HN",
      name: "Sale Pod Khách hàng Doanh nghiệp Hà Nội",
      description: "Tập trung các tập đoàn lớn khu vực phía Bắc",
      territory: "Miền Bắc",
      target_segment: "ENTERPRISE",
      product_line: "Enterprise Suite",
    }, 1);

    expect(pod.id).toBeDefined();
    expect(pod.code).toBe("POD-CORP-HN");
    expect(pod.territory).toBe("Miền Bắc");
    expect(pod.target_segment).toBe("ENTERPRISE");

    expect(() => {
      createTeam({
        code: "POD-CORP-HN",
        name: "Nhóm trùng mã",
      }, 1);
    }).toThrow("đã tồn tại");
  });

  // ====================================================
  // FR-80: Phân công trưởng nhóm và thành viên nhóm bán hàng
  // ====================================================
  it("FR-80: chỉ định trưởng nhóm và thêm/bớt thành viên theo thời gian", () => {
    const pod = createTeam({
      code: "POD-TEST-MEM",
      name: "Sale Pod Thử nghiệm Thành viên",
    }, 1);

    // Thêm trưởng nhóm (leader) và thành viên (member)
    // Dùng user ID 1 (Quản lý) và user ID 2 (AE) có sẵn từ users seed
    addTeamMember(pod.id, 1, "LEADER", 1);
    addTeamMember(pod.id, 2, "MEMBER", 1);

    let members = listTeamMembers(pod.id, true);
    expect(members.length).toBe(2);
    expect(members.find((m) => m.user_id === 1)?.role).toBe("LEADER");
    expect(members.find((m) => m.user_id === 2)?.role).toBe("MEMBER");

    // Cho thành viên rời nhóm
    removeTeamMember(pod.id, 2, 1);

    members = listTeamMembers(pod.id, true);
    expect(members.length).toBe(1);
    expect(members[0].user_id).toBe(1);

    // Nhưng danh sách toàn bộ lịch sử vẫn lưu lại bản ghi cũ với valid_to
    const allHistory = listTeamMembers(pod.id, false);
    expect(allHistory.length).toBe(2);
    expect(allHistory.find((m) => m.user_id === 2)?.is_active).toBe(0);
  });

  // ====================================================
  // FR-81: Thiết lập phạm vi phụ trách của nhóm bán hàng
  // ====================================================
  it("FR-81: cấu hình phân khúc, khu vực và sản phẩm phụ trách của nhóm", () => {
    const pod = createTeam({
      code: "POD-FIN-HCM",
      name: "Sale Pod Tài chính Ngân hàng TP.HCM",
      territory: "Miền Nam",
      target_segment: "ENTERPRISE",
      product_line: "Core CRM, AI & ERP Integration",
    }, 1);

    const updated = updateTeam(pod.id, {
      territory: "Toàn quốc",
      target_segment: "ALL",
      description: "Mở rộng phụ trách trên toàn quốc",
    }, 1);

    expect(updated.territory).toBe("Toàn quốc");
    expect(updated.target_segment).toBe("ALL");

    const teams = listTeams({ territory: "Toàn quốc" });
    expect(teams.length).toBe(1);
    expect(teams[0].code).toBe("POD-FIN-HCM");
  });

  // ====================================================
  // FR-82: Phân bổ khách hàng và cơ hội lần đầu
  // ====================================================
  it("FR-82: phân bổ Lead/Cơ hội lần đầu, lưu vết lịch sử trong assignments", () => {
    // Tạo 1 Lead chưa gán
    const leadRes = db().prepare(`
      INSERT INTO leads (company_name, company_norm, contact_name, status, bant_score, created_by)
      VALUES ('Công ty Phân Phối Alpha', 'cong ty phan phoi alpha', 'Nguyễn Văn A', 'OPEN', 65, 1)
    `).run();
    const leadId = Number(leadRes.lastInsertRowid);

    // Gán lần đầu cho user 2
    const assignment = assignInitial({
      entityType: "lead",
      entityId: leadId,
      toUserId: 2,
      assignedBy: 1,
      reason: "Lead phân khúc sản xuất phù hợp năng lực",
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.assignment_type).toBe("INITIAL");
    expect(assignment.to_user_id).toBe(2);

    // Lead phải được cập nhật owner_id
    const updatedLead = db().prepare("SELECT owner_id FROM leads WHERE id = ?").get(leadId) as { owner_id: number };
    expect(updatedLead.owner_id).toBe(2);

    // Lịch sử assignments
    const hist = listAssignments({ entityType: "lead", entityId: leadId });
    expect(hist.length).toBe(1);
    expect(hist[0].to_user_id).toBe(2);
  });

  // ====================================================
  // FR-83: Giao việc, lịch hẹn và theo dõi tiến độ
  // ====================================================
  it("FR-83: tạo lịch hẹn cơ hội, mời chuyên viên tư vấn kỹ thuật tham gia và hoàn thành việc", () => {
    // Tạo lịch hẹn tư vấn giải pháp
    const item = createWorkItem({
      title: "Họp Demo kiến trúc giải pháp cho Giám đốc CNTT",
      type: "APPOINTMENT",
      description: "Thuyết trình mô hình triển khai hybrid và tích hợp ERP",
      entityType: "opportunity",
      entityId: 1,
      assigneeId: 2, // AE chủ trì
      dueAt: "2026-11-05 14:00:00",
      priority: "HIGH",
      participants: [
        { userId: 3, role: "PRESALES" }, // Mời Chuyên viên tư vấn kỹ thuật
      ],
    }, 1);

    expect(item.id).toBeDefined();
    expect(item.type).toBe("APPOINTMENT");
    expect(item.priority).toBe("HIGH");
    expect(item.participants?.length).toBe(1);
    expect(item.participants?.[0].user_id).toBe(3);
    expect(item.participants?.[0].status).toBe("INVITED");

    // Chuyên viên tư vấn phản hồi chấp nhận
    respondInvitation(item.id, 3, "ACCEPTED", "Tôi sẽ chuẩn bị sẵn bản demo tích hợp");

    // Hoàn thành công việc kèm ghi nhận kết quả
    const doneItem = completeWorkItem(item.id, "Khách hàng hài lòng, đồng ý sang bước đề xuất báo giá", 2);
    expect(doneItem.status).toBe("DONE");
    expect(doneItem.outcome).toContain("hài lòng");
    expect(doneItem.completed_at).toBeDefined();

    const taskList = listWorkItems({ type: "APPOINTMENT", status: "DONE" });
    expect(taskList.length).toBe(1);
    expect(taskList[0].id).toBe(item.id);
  });

  // ====================================================
  // FR-84: Điều phối và bàn giao khách hàng, cơ hội
  // ====================================================
  it("FR-84: điều phối và bàn giao khách hàng, cơ hội khi nhân sự thay đổi", () => {
    // Giả sử user 2 đang phụ trách 1 lead và 1 cơ hội
    const lRes = db().prepare(`
      INSERT INTO leads (company_name, company_norm, contact_name, status, owner_id)
      VALUES ('Công ty Logistics Biển Đông', 'cong ty logistics bien dong', 'Trần B', 'WORKING', 2)
    `).run();
    const lId = Number(lRes.lastInsertRowid);

    const oRes = db().prepare(`
      INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
      VALUES ('OPP-TEST-HD', 'Dự án Cloud CRM Logistics', 1, 2, 'DEVELOP', 450000000)
    `).run();
    const oId = Number(oRes.lastInsertRowid);

    // Điều phối từ user 2 sang user 1 với lý do bắt buộc (theo danh sách cụ thể)
    const result = handoverWork({
      fromUserId: 2,
      toUserId: 1,
      reason: "Bàn giao do nhân sự phụ trách đi công tác dài hạn",
      handoverBy: 1,
      specificLeadIds: [lId],
      specificOpportunityIds: [oId],
      transferTasks: false,
    });

    expect(result.transferredLeads).toBe(1);
    expect(result.transferredOpportunities).toBe(1);

    // Kiểm tra owner_id đã chuyển sang user 1
    const lCheck = db().prepare("SELECT owner_id FROM leads WHERE id = ?").get(lId) as { owner_id: number };
    const oCheck = db().prepare("SELECT owner_id FROM opportunities WHERE id = ?").get(oId) as { owner_id: number };
    expect(lCheck.owner_id).toBe(1);
    expect(oCheck.owner_id).toBe(1);

    // Kiểm tra bản ghi bàn giao trong assignments
    const hist = listAssignments({ entityType: "opportunity", entityId: oId });
    expect(hist.length).toBe(1);
    expect(hist[0].assignment_type).toBe("HANDOVER");
    expect(hist[0].reason).toContain("đi công tác dài hạn");
  });

  // ====================================================
  // FR-85: Thiết lập chỉ tiêu cá nhân và nhóm
  // ====================================================
  it("FR-85: thiết lập chỉ tiêu doanh số cho cá nhân và nhóm bán hàng", () => {
    const pod = createTeam({
      code: "POD-TARGET-01",
      name: "Sale Pod Chỉ Tiêu",
    }, 1);

    // Chỉ tiêu cá nhân
    const userTarget = setSalesTarget({
      periodType: "QUARTER",
      periodName: "2026-Q4",
      userId: 2,
      targetAmount: 600_000_000,
      targetDeals: 3,
    }, 1);

    expect(userTarget.id).toBeDefined();
    expect(userTarget.user_id).toBe(2);
    expect(userTarget.team_id).toBeNull();
    expect(userTarget.target_amount).toBe(600_000_000);

    // Chỉ tiêu nhóm
    const teamTarget = setSalesTarget({
      periodType: "QUARTER",
      periodName: "2026-Q4",
      teamId: pod.id,
      targetAmount: 1_800_000_000,
      targetDeals: 10,
    }, 1);

    expect(teamTarget.id).toBeDefined();
    expect(teamTarget.team_id).toBe(pod.id);
    expect(teamTarget.user_id).toBeNull();

    // Ràng buộc: Không được gán cả hai hoặc không gán cái nào
    expect(() => {
      setSalesTarget({
        periodType: "QUARTER",
        periodName: "2026-Q4",
        userId: 2,
        teamId: pod.id,
        targetAmount: 500_000_000,
      }, 1);
    }).toThrow("đúng một trong hai");
  });

  // ====================================================
  // FR-86: Theo dõi mức hoàn thành chỉ tiêu & Dự báo BR-14
  // ====================================================
  it("FR-86: tính toán mức hoàn thành chỉ tiêu và dự báo theo quy tắc BR-14", () => {
    // Tạo user riêng cho bài test để tính toán biệt lập không lẫn seed
    const uRes = db().prepare(`
      INSERT INTO users (name, email, role, title, active)
      VALUES ('Nhân viên KPI Thử nghiệm', 'kpi.isolated@sms.local', 'SALES', 'AE', 1)
    `).run();
    const testUserId = Number(uRes.lastInsertRowid);

    // Đặt chỉ tiêu 500 triệu cho testUserId
    setSalesTarget({
      periodType: "QUARTER",
      periodName: "2027-Q1",
      userId: testUserId,
      targetAmount: 500_000_000,
      targetDeals: 2,
    }, 1);

    // Tạo cơ hội đã thắng (WON) 250 triệu cho testUserId
    db().prepare(`
      INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
      VALUES ('OPP-WON-TEST', 'Hợp đồng ERP Đã Chốt', 1, ?, 'WON', 250000000)
    `).run(testUserId);

    // Tạo các cơ hội đang mở ở các giai đoạn:
    db().prepare("UPDATE opportunities SET closed_at='2027-02-15' WHERE code='OPP-WON-TEST'").run();
    db().prepare("INSERT INTO orders(code,opportunity_id,account_id,total,grand_total,price_locked_at) SELECT 'SO-KPI-TEST',id,account_id,250000000,250000000,datetime('now') FROM opportunities WHERE code='OPP-WON-TEST'").run();
    // DEVELOP (20%): 100tr -> forecast = 20tr
    // PROPOSE (50%): 200tr -> forecast = 100tr
    // CLOSE (80%): 100tr -> forecast = 80tr
    // Tổng forecast mở = 200tr
    db().prepare(`
      INSERT INTO opportunities (code, name, account_id, owner_id, stage, amount)
      VALUES
        ('OPP-DEV-TEST', 'Cơ hội Giai đoạn Phát triển', 1, ?, 'DEVELOP', 100000000),
        ('OPP-PROP-TEST', 'Cơ hội Giai đoạn Đề xuất', 1, ?, 'PROPOSE', 200000000),
        ('OPP-CLS-TEST', 'Cơ hội Giai đoạn Chốt', 1, ?, 'CLOSE', 100000000)
    `).run(testUserId, testUserId, testUserId);

    const summary = getPerformanceSummary({
      periodName: "2027-Q1",
      userId: testUserId,
    });

    expect(summary.targetAmount).toBe(500_000_000);
    expect(summary.actualRevenue).toBe(250_000_000);
    expect(summary.completionPct).toBe(50); // 250 / 500 = 50%
    expect(summary.actualWonDeals).toBe(1);
    expect(summary.pipelineForecastAmount).toBe(200_000_000); // 100*0.2 + 200*0.5 + 100*0.8 = 200tr
  });

  // ====================================================
  // FR-87: Đánh giá hiệu suất bán hàng
  // ====================================================
  it("FR-87: ghi nhận xét đánh giá hiệu suất nhân viên theo kỳ", () => {
    const emp = createEmployee({
      code: "EMP-TEST-REV",
      full_name: "Ngô Quốc Huy",
      email: "huy.ngo@test.sms",
      title: "Account Executive",
      business_role: "SALES",
    }, 1);

    const review = createPerformanceReview({
      employeeId: emp.id,
      periodName: "2026-Q3",
      actualRevenue: 520_000_000,
      targetRevenue: 500_000_000,
      rating: "EXCELLENT",
      feedback: "Vượt chỉ tiêu doanh số 104%, kỹ năng chốt cơ hội lớn rất tốt",
    }, 1);

    expect(review.id).toBeDefined();
    expect(review.rating).toBe("EXCELLENT");
    expect(review.completion_pct).toBe(104);
    expect(review.feedback).toContain("Vượt chỉ tiêu");

    const history = listPerformanceReviews({ employeeId: emp.id });
    expect(history.length).toBe(1);
    expect(history[0].rating).toBe("EXCELLENT");
  });
});
