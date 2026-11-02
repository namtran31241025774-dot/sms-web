import { describe, it, expect, beforeEach } from "vitest";
import { all, get, run } from "@/lib/db";
import { userActor } from "@/lib/services/core";
import {
  approveSuggestion,
  rejectSuggestion,
  createSuggestion,
  getSuggestion,
} from "@/lib/services/ai-review";
import {
  cleanTimedOutRuns,
  prepareRetryRun,
  createConfigDraft,
  activateConfig,
  rollbackConfig,
  setAiEmergencyStatus,
  checkPreRunConstraints,
  submitAiFeedback,
  getAiEffectivenessReport,
} from "@/lib/services/ai-admin";
import {
  invokeTool,
  TOOLS,
  type ToolContext,
  type ToolCallLog,
} from "@/lib/agents/tools";
import { validateEvidence } from "@/lib/agents/evidence";
import { runAgent } from "@/lib/agents/runtime";

describe("WP-08: AI Agent (FR-06, FR-19, FR-20, FR-32, FR-36, FR-44, FR-88, FR-89, FR-90, FR-91, FR-92, FR-93, FR-94, FR-95, HG1, HG2, HG3, HG4, HG5)", () => {
  // Setup users và dữ liệu test
  const salesUserA = { id: 101, name: "Sales User A", role: "SALES" as const };
  const salesUserB = { id: 102, name: "Sales User B", role: "SALES" as const };
  const salesManager = { id: 103, name: "Sales Manager", role: "SALES_MANAGER" as const };
  const aiManager = { id: 104, name: "AI Manager", role: "ADMIN" as const };
  const deliveryUser = { id: 105, name: "Delivery User", role: "DELIVERY" as const };

  beforeEach(() => {
    // Đảm bảo users tồn tại
    run("INSERT OR IGNORE INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, 1)", salesUserA.id, salesUserA.name, "salesA@sms.local", salesUserA.role);
    run("INSERT OR IGNORE INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, 1)", salesUserB.id, salesUserB.name, "salesB@sms.local", salesUserB.role);
    run("INSERT OR IGNORE INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, 1)", salesManager.id, salesManager.name, "manager@sms.local", salesManager.role);
    run("INSERT OR IGNORE INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, 1)", aiManager.id, aiManager.name, "aimanager@sms.local", aiManager.role);
    run("INSERT OR IGNORE INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, 1)", deliveryUser.id, deliveryUser.name, "delivery@sms.local", deliveryUser.role);

    // Reset settings
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_status', 'ACTIVE')");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('agent_qualification_enabled', 'true')");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('agent_opportunity_enabled', 'true')");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('bant_threshold', '60')");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_daily_token_budget', '200000')");
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_run_timeout_sec', '300')");
  });

  // =========================================================================
  // 1. BUG-001, BUG-002, BUG-005: Workspace Kiểm duyệt AI (/ai-review, HG1, HG2)
  // =========================================================================
  describe("BUG-001, BUG-002, BUG-005: Kiểm duyệt AI & Phân quyền bảo mật", () => {
    it("BUG-002: Chặn người dùng không có quyền ai.review (DELIVERY)", () => {
      // Tạo Lead do salesUserA quản lý
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, 'OPEN')",
        "Cty An Toàn A", "cty an toan a", "Nguyễn Văn A", "a@antoan.vn", salesUserA.id,
      );

      const sugId = createSuggestion({
        runId: 1,
        agent: "QUALIFICATION",
        kind: "DISQUALIFY",
        entityType: "lead",
        entityId: leadId,
        title: "Đề xuất loại",
        payload: { reason: "Không phù hợp" },
        evidence: [{ ref: "lead.notes" }],
      });

      // DELIVERY không có quyền ai.review -> Bị ném lỗi
      expect(() => {
        approveSuggestion(userActor(deliveryUser), sugId);
      }).toThrow(/Bạn không có quyền duyệt đề xuất AI/);
    });

    it("BUG-002: Chặn NVKD A duyệt hồ sơ thuộc phạm vi của NVKD B ở nhóm khác (Scope check)", () => {
      run("INSERT OR IGNORE INTO teams (id, code, name) VALUES (99, 'TEAM-99', 'Team 99')");

      run("UPDATE teams SET leader_id=? WHERE id=99",salesManager.id);
      // Lead do Sales B sở hữu, gắn team 99
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, team_id, status) VALUES (?, LOWER(?), ?, ?, ?, ?, 'OPEN')",
        "Cty Bảo Mật B", "cty bao mat b", "Trần Văn B", "b@baomat.vn", salesUserB.id, 99,
      );

      const sugId = createSuggestion({
        runId: 1,
        agent: "QUALIFICATION",
        kind: "DISQUALIFY",
        entityType: "lead",
        entityId: leadId,
        title: "Đề xuất loại",
        payload: { reason: "Không có ngân sách" },
        evidence: [{ ref: "lead.notes" }],
      });

      // NVKD A (không cùng team, không sở hữu) cố duyệt đề xuất của B
      expect(() => {
        approveSuggestion(userActor(salesUserA), sugId);
      }).toThrow(/Bạn không có quyền thao tác trên Lead ngoài phạm vi quản lý/);

      // QLKD (SALES_MANAGER) có quyền duyệt
      expect(() => {
        approveSuggestion(userActor(salesManager), sugId);
      }).not.toThrow();

      const updated = getSuggestion(sugId);
      expect(updated?.status).toBe("APPROVED");
    });

    it("BUG-005 & HG1: Duyệt Email nháp ghi nhận APPROVED trước và gửi email ngoài transaction", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, 'OPEN')",
        "Cty Email Client", "cty email client", "Lê Văn C", "client.c@example.com", salesUserA.id,
      );

      const sugId = createSuggestion({
        runId: 2,
        agent: "QUALIFICATION",
        kind: "EMAIL_DRAFT",
        entityType: "lead",
        entityId: leadId,
        title: "Email nháp",
        payload: {
          to: "client.c@example.com",
          subject: "Giới thiệu giải pháp",
          body: "Kính gửi anh C, giải pháp của chúng tôi...",
        },
        evidence: [{ ref: "lead.email" }],
      });

      // Duyệt email có chỉnh sửa tiêu đề (edits)
      const res = approveSuggestion(
        userActor(salesUserA),
        sugId,
        { subject: "Giới thiệu giải pháp B2B Cloud (Đã chỉnh sửa)" },
        "Duyệt sau khi sửa tiêu đề",
      );

      expect(res).toContain("thành công");

      // Kiểm tra đề xuất đã được cập nhật
      const sug = getSuggestion(sugId);
      expect(sug?.status).toBe("EDITED");

      // Kiểm tra bảng email_messages đã được lưu đầy đủ content_snapshot và edited_by_human = 1
      const emailMsg = get<{ status: string; subject: string; edited_by_human: number; approved_by: number }>(
        "SELECT * FROM email_messages WHERE suggestion_id = ?", sugId,
      );
      expect(emailMsg?.status).toBe("SENT");
      expect(emailMsg?.subject).toBe("Giới thiệu giải pháp B2B Cloud (Đã chỉnh sửa)");
      expect(emailMsg?.edited_by_human).toBe(1);
      expect(emailMsg?.approved_by).toBe(salesUserA.id);
    });

    it("HG2: Từ chối đề xuất loại Lead yêu cầu bắt buộc ghi chú lý do", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, 'OPEN')",
        "Cty Disqualify Test", "cty disqualify test", "Đỗ Văn D", "d@test.vn", salesUserA.id,
      );

      const sugId = createSuggestion({
        runId: 3,
        agent: "QUALIFICATION",
        kind: "DISQUALIFY",
        entityType: "lead",
        entityId: leadId,
        title: "Đề xuất loại",
        payload: { reason: "Khách chưa có nhu cầu" },
        evidence: [{ ref: "lead.notes" }],
      });

      // Từ chối không có note -> bị ném lỗi
      expect(() => {
        rejectSuggestion(userActor(salesUserA), sugId, "");
      }).toThrow(/Bắt buộc có lý do từ chối/);

      // Từ chối có note -> thành công
      rejectSuggestion(userActor(salesUserA), sugId, "Khách hàng vẫn còn tiềm năng trong Q4");
      const sug = getSuggestion(sugId);
      expect(sug?.status).toBe("REJECTED");
      expect(sug?.review_note).toBe("Khách hàng vẫn còn tiềm năng trong Q4");

      // Trạng thái Lead vẫn là OPEN, không bị loại nhầm
      const lead = get<{ status: string }>("SELECT status FROM leads WHERE id = ?", leadId);
      expect(lead?.status).toBe("OPEN");
    });
  });

  // =========================================================================
  // 2. BUG-006, BUG-007, BUG-008: Chống bịa thông tin & Xác thực căn cứ Server
  // =========================================================================
  describe("BUG-006, BUG-007, BUG-008: Server-side Evidence Grounding", () => {
    it("BUG-006: Server từ chối căn cứ không tồn tại (activity không có trong DB)", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, 'OPEN')",
        "Cty Fake Evidence", "cty fake evidence", "Bùi E", "e@fake.vn", salesUserA.id,
      );

      const ctx: ToolContext = { agent: "QUALIFICATION", runId: 10, entityType: "lead", entityId: leadId };

      // Gọi với ref activity:999999 không tồn tại
      expect(() => {
        validateEvidence(ctx, [{ ref: "activity:999999", quote: "Cuộc gọi giả mạo" }]);
      }).toThrow(/Hoạt động activity:999999 không tồn tại/);
    });

    it("BUG-007: propose_bant_score bắt buộc ít nhất 1 căn cứ hợp lệ (min >= 1)", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, 'OPEN')",
        "Cty Empty Evidence", "cty empty evidence", "Vũ F", "f@empty.vn", salesUserA.id,
      );

      const ctx: ToolContext = { agent: "QUALIFICATION", runId: 11, entityType: "lead", entityId: leadId };

      // Chạy công cụ propose_bant_score với mảng rỗng -> Ném lỗi bắt buộc căn cứ
      expect(() => {
        invokeTool(ctx, "propose_bant_score", {
          budget: 20,
          authority: 20,
          need: 20,
          timeline: 20,
          rationale: "Chấm điểm không căn cứ",
          evidence: [],
        }, []);
      }).toThrow(/Bắt buộc có ít nhất 1 căn cứ hợp lệ/);
    });

    it("BUG-008: draft_email yêu cầu và ghi nhận facts_used trỏ tới dữ liệu có thật", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, notes, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, ?, 'OPEN')",
        "Cty Facts Check", "cty facts check", "Phan G", "g@facts.vn", "Khách hàng muốn triển khai ERP và CRM trong tháng 11", salesUserA.id,
      );

      const ctx: ToolContext = { agent: "QUALIFICATION", runId: 12, entityType: "lead", entityId: leadId };

      const out = invokeTool(ctx, "draft_email", {
        subject: "Trao đổi về dự án CRM & ERP",
        body: "Chào anh G, được biết quý công ty đang có kế hoạch triển khai...",
        purpose: "Tiếp cận khách hàng",
        facts_used: [{ ref: "lead.notes", quote: "triển khai ERP và CRM" }],
      }, []) as { suggestion_id: number; status: string };

      expect(out.suggestion_id).toBeGreaterThan(0);
      expect(out.status).toBe("PENDING_REVIEW");

      // Kiểm tra ai_evidence đã lưu ref
      const evRows = all<{ ref: string; quote: string }>(
        "SELECT ref, quote FROM ai_evidence WHERE suggestion_id = ?", out.suggestion_id,
      );
      expect(evRows.length).toBeGreaterThan(0);
      expect(evRows[0].ref).toBe("lead.notes");
    });
  });

  // =========================================================================
  // 3. BUG-003, BUG-004, BUG-009, BUG-010: Tool Scoping & Rich Schemas
  // =========================================================================
  describe("BUG-003, BUG-004, BUG-009, BUG-010: Bảo mật dữ liệu công cụ & Schema đầy đủ", () => {
    it("BUG-003: get_win_history không làm lộ mã và số tiền cơ hội của khách hàng khác", () => {
      // Tạo account 1 và opp WON của account 1
      const { id: acc1 } = run("INSERT INTO accounts (name, name_norm, industry) VALUES ('Account Một', 'account mot', 'Công nghệ')");
      run("INSERT INTO opportunities (code, name, account_id, stage, amount) VALUES ('OPP-SECRET-1', 'Cơ hội bảo mật 1', ?, 'WON', 999000000)", acc1);

      // Tạo account 2 và opp đang xử lý của account 2
      const { id: acc2 } = run("INSERT INTO accounts (name, name_norm, industry) VALUES ('Account Hai', 'account hai', 'Công nghệ')");
      const { id: opp2 } = run("INSERT INTO opportunities (code, name, account_id, stage, amount) VALUES ('OPP-TARGET-2', 'Cơ hội đang chạy AI', ?, 'DEVELOP', 200000000)", acc2);

      const ctx: ToolContext = { agent: "OPPORTUNITY", runId: 20, entityType: "opportunity", entityId: opp2 };

      const history = invokeTool(ctx, "get_win_history", {}, []) as {
        account_win_history: { won: Array<{ code: string }> };
        industry_aggregate: unknown;
      };

      // Không chứa mã của account 1!
      const wonCodes = history.account_win_history.won.map((w) => w.code);
      expect(wonCodes).not.toContain("OPP-SECRET-1");
    });

    it("BUG-004: get_recent_emails trả NO_INSIGHT nếu không có email IN từ liên hệ đã liên kết", () => {
      const { id: acc } = run("INSERT INTO accounts (name, name_norm) VALUES ('Account Email Test', 'account email test')");
      const { id: contactLinked } = run("INSERT INTO contacts (account_id, full_name, email) VALUES (?, 'Liên Hệ Chuẩn', 'chuan@khach.vn')", acc);
      const { id: oppId } = run(
        "INSERT INTO opportunities (code, name, account_id, primary_contact_id, stage, amount) VALUES ('OPP-MAIL-1', 'Opp Mail', ?, ?, 'DEVELOP', 100000000)",
        acc, contactLinked,
      );

      // Thêm email IN từ địa chỉ lạ KHÔNG phải contact đã liên kết
      run(`
        INSERT INTO activities (entity_type, entity_id, type, direction, subject, body, occurred_at)
        VALUES ('opportunity', ?, 'EMAIL', 'IN', 'Thư từ người lạ', 'Chào bạn từ stranger@other.vn', datetime('now'))
      `, oppId);

      const ctx: ToolContext = { agent: "OPPORTUNITY", runId: 21, entityType: "opportunity", entityId: oppId };

      const res = invokeTool(ctx, "get_recent_emails", {}, []) as {
        email_insight_status: string;
        reason?: string;
      };

      // Phải trả về NO_INSIGHT kèm lý do rõ ràng
      expect(res.email_insight_status).toBe("NO_INSIGHT");
      expect(res.reason).toContain("Chưa có email nhận");
    });

    it("BUG-010: propose_bant_score ép outcome về NEED_INFO khi confidence < 0.6", () => {
      const { id: leadId } = run(
        "INSERT INTO leads (company_name, company_norm, contact_name, email, notes, owner_id, status) VALUES (?, LOWER(?), ?, ?, ?, ?, 'OPEN')",
        "Cty Low Confidence", "cty low confidence", "Hoàng H", "h@low.vn", "Thông tin mơ hồ", salesUserA.id,
      );

      const ctx: ToolContext = { agent: "QUALIFICATION", runId: 22, entityType: "lead", entityId: leadId };

      const res = invokeTool(ctx, "propose_bant_score", {
        budget: 20,
        authority: 20,
        need: 20,
        timeline: 20,
        confidence: 0.45, // < 0.6
        outcome: "QUALIFIED", // Model đề xuất đạt chuẩn
        rationale: "Điểm cao nhưng dữ liệu mơ hồ",
        evidence: [{ ref: "lead.notes", quote: "Thông tin" }],
      }, []) as { outcome: string; confidence: number };

      // Server bắt buộc ép về NEED_INFO
      expect(res.outcome).toBe("NEED_INFO");
      expect(res.confidence).toBe(0.45);
    });

    it("BUG-009: save_opportunity_research lưu đầy đủ 6 danh mục insight và rủi ro", () => {
      const { id: acc } = run("INSERT INTO accounts (name, name_norm) VALUES ('Cty Research Test', 'cty research test')");
      const { id: oppId } = run(
        "INSERT INTO opportunities (code, name, account_id, stage, amount) VALUES ('OPP-RES-1', 'Opp Research', ?, 'DEVELOP', 300000000)",
        acc,
      );

      const ctx: ToolContext = { agent: "OPPORTUNITY", runId: 23, entityType: "opportunity", entityId: oppId };

      const out = invokeTool(ctx, "save_opportunity_research", {
        importance: "MEDIUM",
        importance_reason: "Doanh thu 300 triệu",
        summary: "Nghiên cứu cơ hội toàn diện",
        insights: {
          stakeholder: { status: "NO_INSIGHT", reason: "Chưa xác định stakeholder" },
          competitor: { status: "NO_INSIGHT", reason: "Chưa có đối thủ" },
          account_overview: { text: "Doanh nghiệp tiềm năng", sources: [{ ref: "opportunity.name", quote: "Opp Research" }] },
          health: { text: "Tốt", sources: [{ ref: "opportunity.code", quote: "OPP-RES-1" }] },
          pain_need: { status: "NO_INSIGHT", reason: "Chưa rõ nhu cầu" },
          product: { text: "Phù hợp giải pháp", sources: [{ ref: "opportunity.name", quote: "Opp" }] },
        },
        risks: [{ category: "TECH_CONSTRAINT", severity: "MEDIUM", description: "Ràng buộc tích hợp" }],
        next_actions: ["Họp kỹ thuật", "Làm rõ nhu cầu"],
        sources: [{ ref: "opportunity.code", quote: "OPP-RES-1" }],
        email_insight_status: "NO_INSIGHT",
      }, []) as { research_id: number; status: string };

      expect(out.research_id).toBeGreaterThan(0);
      expect(out.status).toBe("PENDING_REVIEW");

      const row = get<{ importance_reason: string; email_insight_status: string; insights_json: string }>(
        "SELECT importance_reason, email_insight_status, insights_json FROM opportunity_research WHERE id = ?",
        out.research_id,
      );
      // BR-28: lý do mức quan trọng do rule OPP-R01 (BR-08) khóa, không lấy chữ của LLM
      expect(row?.importance_reason).toContain("(BR-08)");
      expect(row?.email_insight_status).toBe("NO_INSIGHT");
      expect(row?.insights_json).toContain("NO_INSIGHT");
    });
  });

  // =========================================================================
  // 4. Giới hạn quyền Agent & Human Gates (HG1 - HG6)
  // =========================================================================
  describe("Giới hạn quyền tác nhân & Human Gates", () => {
    it("Agent gọi công cụ không thuộc danh sách của mình bị DENIED và ghi log tool_calls", () => {
      // Đảm bảo có bản ghi ai_runs trước
      run("INSERT OR REPLACE INTO ai_runs (id, agent, trigger, entity_type, entity_id, model) VALUES (30, 'QUALIFICATION', 'MANUAL', 'lead', 1, 'gpt-4o')");

      const ctx: ToolContext = { agent: "QUALIFICATION", runId: 30, entityType: "lead", entityId: 1 };
      const log: ToolCallLog[] = [];

      // Qualification Agent gọi save_opportunity_research (chỉ dành cho OPPORTUNITY)
      expect(() => {
        invokeTool(ctx, "save_opportunity_research", {}, log);
      }).toThrow(/không có quyền dùng save_opportunity_research/);

      expect(log.length).toBe(1);
      expect(log[0].outcome).toBe("DENIED");

      // Kiểm tra trong DB tool_calls có dòng DENIED
      const tc = get<{ outcome: string; tool_name: string }>(
        "SELECT outcome, tool_name FROM tool_calls WHERE run_id = 30 AND tool_name = 'save_opportunity_research'",
      );
      expect(tc?.outcome).toBe("DENIED");
    });

    it("Agent KHÔNG thể tự sửa amount, stage hay close_date của Cơ hội", () => {
      // Xác nhận bộ công cụ của Agent không có bất kỳ công cụ nào ghi đè trường lõi
      const allTools = Object.keys(TOOLS);
      expect(allTools).not.toContain("update_amount");
      expect(allTools).not.toContain("change_stage");
      expect(allTools).not.toContain("set_close_date");
      expect(allTools).not.toContain("convert_lead");
    });
  });

  // =========================================================================
  // 5. FR-88 -> FR-95: Quản trị & Vận hành Agent
  // =========================================================================
  describe("FR-88 -> FR-95: Vận hành, Quản trị, Ngân sách & Kill switch", () => {
    it("FR-93: Công tắc khẩn cấp (Kill Switch) chặn ngay lần chạy mới", async () => {
      setAiEmergencyStatus(userActor(aiManager), "PAUSED");

      const check = checkPreRunConstraints("QUALIFICATION");
      expect(check.ok).toBe(false);
      expect(check.reason).toContain("PAUSED");

      // Chạy runAgent ném lỗi
      await expect(
        runAgent("QUALIFICATION", { type: "lead", id: 1 }, "TEST_EVENT", salesUserA.id),
      ).rejects.toThrow(/tạm dừng khẩn cấp/);
    });

    it("FR-91 & BR-16: Chặn lần chạy mới khi vượt 100% ngân sách token ngày", () => {
      // Đặt ngân sách 5000 tokens
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_daily_token_budget', '5000')");

      // Giả lập các lần chạy đã dùng 6000 tokens hôm nay
      run(`
        INSERT INTO ai_runs (agent, trigger, entity_type, entity_id, model, input_tokens, output_tokens, status, started_at)
        VALUES ('QUALIFICATION', 'TRIG', 'lead', 1, 'gpt-4o', 4000, 2000, 'SUCCEEDED', datetime('now'))
      `);

      const check = checkPreRunConstraints("QUALIFICATION");
      expect(check.ok).toBe(false);
      expect(check.reason).toContain("hết ngân sách token");
    });

    it("FR-94 & BR-23: Quét và dọn các lần chạy treo (RUNNING) quá thời gian timeout", () => {
      // Tạo một lần chạy RUNNING bắt đầu từ 10 phút trước
      const { id: hungRunId } = run(`
        INSERT INTO ai_runs (agent, trigger, entity_type, entity_id, model, status, started_at)
        VALUES ('OPPORTUNITY', 'CRON', 'opportunity', 10, 'gpt-4o', 'RUNNING', datetime('now', '-600 seconds'))
      `);

      const { cleanedCount } = cleanTimedOutRuns();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      const runRow = get<{ status: string; error: string }>("SELECT status, error FROM ai_runs WHERE id = ?", hungRunId);
      expect(runRow?.status).toBe("FAILED");
      expect(runRow?.error).toContain("Quá thời gian");
    });

    it("FR-94: prepareRetryRun chỉ chấp nhận lần chạy FAILED và lưu liên kết retry_of_run_id", () => {
      const { id: failedRunId } = run(`
        INSERT INTO ai_runs (agent, trigger, entity_type, entity_id, model, status)
        VALUES ('QUALIFICATION', 'MANUAL_RUN', 'lead', 5, 'gpt-4o', 'FAILED')
      `);

      const plan = prepareRetryRun(userActor(salesUserA), failedRunId);
      expect(plan.retryOfRunId).toBe(failedRunId);
      expect(plan.agent).toBe("QUALIFICATION");
      expect(plan.trigger).toContain(`RETRY_OF_#${failedRunId}`);
    });

    it("FR-91 & BR-25: Không kích hoạt được cấu hình chưa qua kiểm thử eval (eval_passed = 0)", () => {
      const { configId } = createConfigDraft(userActor(aiManager), {
        agentId: "QUALIFICATION",
        instructions: "Prompt thử nghiệm chưa eval",
        modelReference: "gpt-4o-2024-08-06",
      });

      // Kích hoạt khi eval_passed = 0 -> Ném lỗi
      expect(() => {
        activateConfig(userActor(aiManager), configId);
      }).toThrow(/chưa vượt qua bài đánh giá/);
    });

    it("DEC-27: Rollback cấu hình trả về đúng phiên bản chỉ định", () => {
      // Tạo v2 và cho qua eval
      const { configId: v2Id } = createConfigDraft(userActor(aiManager), {
        agentId: "QUALIFICATION",
        instructions: "Prompt v2 cải tiến",
        modelReference: "gpt-4o-2024-08-06",
      });
      run("UPDATE agent_configs SET eval_passed = 1 WHERE id = ?", v2Id);
      activateConfig(userActor(aiManager), v2Id);

      // Rollback về v1
      const res = rollbackConfig(userActor(aiManager), "QUALIFICATION", 1);
      expect(res).toContain("v1");

      const activeConfig = get<{ version_no: number }>(
        "SELECT version_no FROM agent_configs WHERE agent_id = 'QUALIFICATION' AND status = 'ACTIVE'",
      );
      expect(activeConfig?.version_no).toBe(1);
    });

    it("FR-90 & FR-95: Ghi nhận phản hồi chất lượng (ai_feedback) và báo cáo tỷ lệ con người sửa", () => {
      const { feedbackId } = submitAiFeedback(userActor(salesUserA), {
        runId: 1,
        rating: "POSITIVE",
        feedbackType: "ACCURACY",
        comment: "BANT chấm rất chuẩn",
      });
      expect(feedbackId).toBeGreaterThan(0);

      const report = getAiEffectivenessReport();
      expect(report.email).toBeDefined();
      expect(report.suggestions).toBeDefined();
      expect(report.misclassification).toBeDefined();
    });
  });
});
