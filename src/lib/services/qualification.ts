import { assertActorAccess } from "./access";
import { get, nextCode, run, tx } from "../db";
import { assert, type Role } from "../domain";
import { actorUserId, audit, settingBool, settingNumber, type Actor } from "./core";
import { findOrCreateAccount } from "./accounts";
import { findOrCreateContact } from "./contacts";
import { emitEvent } from "../events";
import {bantQualified,requireBantLevel} from '../bant-policy';

export type TimelineFrame = "IN_MONTH" | "END_OF_QUARTER" | "NEXT_YEAR" | "UNKNOWN";
export type LeadRating = "HOT" | "WARM" | "COLD";

export interface SurveyInput {
  business_problem?: string;
  user_scale?: number;
  current_software?: string;
  notes?: string;
}

export interface BantScoresInput {
  budget: number; // 0 - 25
  authority: number; // 0 - 25
  need: number; // 0 - 25
  timeline: number; // 0 - 25
  timeline_frame?: TimelineFrame;
  missing_info?: string;
  notes?: string;
}

export interface LeadAssessment {
  id: number;
  lead_id: number;
  business_problem: string | null;
  user_scale: number | null;
  current_software: string | null;
  bant_budget: number;
  bant_authority: number;
  bant_need: number;
  bant_timeline: number;
  bant_score: number;
  timeline_frame: TimelineFrame | null;
  rating: LeadRating | null;
  missing_info: string | null;
  assessed_by: number | null;
  status: "DRAFT" | "CONFIRMED";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tính toán xếp hạng Lead theo BR-01 và BR-02:
 * - Đạt chuẩn khi: Tổng BANT >= bant_threshold (mặc định 60) VÀ authority > 0.
 * - Nóng (HOT): Đạt chuẩn VÀ mua trong tháng hoặc cuối quý.
 * - Ấm (WARM): Tổng 40-59, hoặc đạt chuẩn nhưng mua năm sau.
 * - Lạnh (COLD): Tổng < 40 hoặc chưa rõ nhu cầu/thời gian.
 */
export function calculateLeadRating(
  totalScore: number,
  authorityScore: number,
  timelineFrame: TimelineFrame = "UNKNOWN",
  threshold = 60,
  warmMin = 40,
): LeadRating {
  const isQualified = bantQualified(totalScore,authorityScore,threshold);

  if (isQualified && (timelineFrame === "IN_MONTH" || timelineFrame === "END_OF_QUARTER")) {
    return "HOT";
  }

  if ((totalScore >= warmMin && totalScore < threshold) || (isQualified && timelineFrame === "NEXT_YEAR")) {
    return "WARM";
  }

  return "COLD";
}

/**
 * Ghi nhận kết quả khảo sát sơ bộ nhu cầu khách hàng (FR-30).
 */
export function recordSurvey(actor: Actor, leadId: number, data: SurveyInput) {
  assertActorAccess(actor, "lead", leadId);
  const lead = get<{ id: number; status: string }>("SELECT id, status FROM leads WHERE id = ?", leadId);
  assert(lead, "Không tìm thấy khách hàng tiềm năng (Lead)");
  assert(lead.status !== "CONVERTED" && lead.status !== "DISQUALIFIED", "Lead đã đóng hoặc đã chuyển đổi");

  const existing = get<{ id: number }>("SELECT id FROM lead_assessments WHERE lead_id = ? ORDER BY id DESC LIMIT 1", leadId);

  if (existing) {
    run(
      `UPDATE lead_assessments 
       SET business_problem = ?, user_scale = ?, current_software = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      data.business_problem?.trim() || null,
      data.user_scale ?? null,
      data.current_software?.trim() || null,
      data.notes?.trim() || null,
      existing.id,
    );
  } else {
    run(
      `INSERT INTO lead_assessments (lead_id, business_problem, user_scale, current_software, notes, assessed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      leadId,
      data.business_problem?.trim() || null,
      data.user_scale ?? null,
      data.current_software?.trim() || null,
      data.notes?.trim() || null,
      actorUserId(actor),
    );
  }

  // Cập nhật trạng thái lead sang WORKING nếu đang OPEN
  if (lead.status === "OPEN") {
    run("UPDATE leads SET status = 'WORKING', updated_at = datetime('now') WHERE id = ?", leadId);
  }

  audit(actor, "lead", leadId, "SURVEY_RECORD", {
    reason: "Ghi nhận kết quả khảo sát sơ bộ nhu cầu",
    details: data,
  });
}

/**
 * Đánh giá sàng lọc theo tiêu chí BANT (FR-31, BR-01, BR-02).
 */
export function scoreBant(actor: Actor, leadId: number, input: BantScoresInput): { totalScore: number; rating: LeadRating } {
  assertActorAccess(actor, "lead", leadId);
  const lead = get<{ id: number; status: string }>("SELECT id, status FROM leads WHERE id = ?", leadId);
  assert(lead, "Không tìm thấy khách hàng tiềm năng");
  assert(lead.status !== "CONVERTED" && lead.status !== "DISQUALIFIED", "Lead đã đóng");

  const clamp = requireBantLevel;
  const b = clamp(input.budget);
  const a = clamp(input.authority);
  const n = clamp(input.need);
  const t = clamp(input.timeline);
  const totalScore = b + a + n + t;

  const threshold = settingNumber("bant_threshold");
  const warmMin = settingNumber("lead_rating_warm_min");
  const frame = input.timeline_frame || "UNKNOWN";
  const rating = calculateLeadRating(totalScore, a, frame, threshold, warmMin);

  // Cập nhật hoặc thêm mới bản đánh giá lead_assessments
  const existing = get<{ id: number }>("SELECT id FROM lead_assessments WHERE lead_id = ? ORDER BY id DESC LIMIT 1", leadId);
  if (existing) {
    run(
      `UPDATE lead_assessments
       SET bant_budget = ?, bant_authority = ?, bant_need = ?, bant_timeline = ?,
           bant_score = ?, timeline_frame = ?, rating = ?, missing_info = ?, notes = ?,
           assessed_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
      b,
      a,
      n,
      t,
      totalScore,
      frame,
      rating,
      input.missing_info?.trim() || null,
      input.notes?.trim() || null,
      actorUserId(actor),
      existing.id,
    );
  } else {
    run(
      `INSERT INTO lead_assessments 
       (lead_id, bant_budget, bant_authority, bant_need, bant_timeline, bant_score, timeline_frame, rating, missing_info, notes, assessed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      leadId,
      b,
      a,
      n,
      t,
      totalScore,
      frame,
      rating,
      input.missing_info?.trim() || null,
      input.notes?.trim() || null,
      actorUserId(actor),
    );
  }

  // Đồng bộ sang bảng leads
  run(
    `UPDATE leads 
     SET bant_budget = ?, bant_authority = ?, bant_need = ?, bant_timeline = ?,
         bant_score = ?, rating = ?, status = CASE WHEN status = 'OPEN' THEN 'WORKING' ELSE status END,
         updated_at = datetime('now')
     WHERE id = ?`,
    b,
    a,
    n,
    t,
    totalScore,
    rating,
    leadId,
  );

  audit(actor, "lead", leadId, "BANT_SCORE", {
    reason: `Chấm điểm BANT: ${totalScore}/100 · Xếp hạng: ${rating}`,
    details: { budget: b, authority: a, need: n, timeline: t, totalScore, rating, frame },
  });

  return { totalScore, rating };
}

/**
 * Lấy thông tin đánh giá sàng lọc hiện tại của Lead (FR-30, FR-31).
 */
export function getLeadAssessment(leadId: number): LeadAssessment | null {
  return get<LeadAssessment>("SELECT * FROM lead_assessments WHERE lead_id = ? ORDER BY id DESC LIMIT 1", leadId) ?? null;
}

export interface ConvertOpportunityInput {
  accountId?: number | null;
  contactId?: number | null;
  ownerId?: number;
  opportunityName?: string;
  amount?: number;
  closeDate?: string | null;
  priceListId?: number | null;
  // Hỗ trợ cả định dạng snake_case
  account_id?: number | null;
  contact_id?: number | null;
  owner_id?: number;
  opportunity_name?: string;
  close_date?: string | null;
  price_list_id?: number | null;
  account_action?: "new" | "reuse";
  contact_action?: "new" | "reuse";
}

/**
 * Chuyển đổi Lead thành Cơ hội bán hàng (FR-33, Cổng HG3).
 * - Agent không được tự chuyển đổi nếu ai_auto_convert = false (DEC-03).
 * - Kiểm tra điểm BANT đạt ngưỡng.
 * - Tự động tìm hoặc tạo Account & Contact theo WP-01.
 * - Phát sự kiện opportunity.converted.
 */
export function convertLeadToOpportunity(
  actor: Actor,
  leadId: number,
  input: ConvertOpportunityInput,
): { opportunityId: number; opportunity_id: number; accountId: number; account_id: number; contactId: number; contact_id: number; code: string } {
  assertActorAccess(actor, "lead", leadId);
  // Cổng HG3: Kiểm tra quyền kích hoạt chuyển đổi của con người
  if (actor.type === "AI") {
    assert(settingBool("ai_auto_convert"), "DEC-03: AI Agent không được phép tự động chuyển đổi Lead thành Cơ hội khi chưa có phê duyệt của con người");
  }

  const lead = get<{
    id: number;
    company_name: string;
    company_norm: string;
    contact_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    status: string;
    bant_score: number;
    bant_authority: number;
    team_id: number | null;
  }>("SELECT * FROM leads WHERE id = ?", leadId);

  assert(lead, "Không tìm thấy khách hàng tiềm năng");
  assert(lead.status === "OPEN" || lead.status === "WORKING", "Lead không ở trạng thái mở");
  assert(lead.bant_authority===25, "Chưa xác định người quyết định: Authority phải đạt mức 25 để chuyển đổi");

  // Kiểm tra ngưỡng BANT
  const threshold = settingNumber("bant_threshold");
  assert(
    lead.bant_score >= threshold,
    `Lead có điểm BANT ${lead.bant_score} chưa đạt ngưỡng tối thiểu ${threshold} điểm để chuyển đổi`,
  );

  const ownerId = input.ownerId ?? input.owner_id ?? actorUserId(actor) ?? 1;

  // Xác thực nhân viên kinh doanh nhận cơ hội
  const owner = get<{ id: number; role: Role }>(
    "SELECT id, role FROM users WHERE id = ? AND active = 1 AND role IN ('SALES', 'SALES_MANAGER')",
    ownerId,
  );
  assert(owner, "Nhân viên kinh doanh nhận cơ hội không hợp lệ");

  return tx(() => {
    // 1. Tìm hoặc tạo Doanh nghiệp (Account) theo hợp đồng WP-01
    let accountId = input.accountId ?? input.account_id ?? null;
    if (accountId) {
      assert(get("SELECT id FROM accounts WHERE id = ?", accountId), "Doanh nghiệp không tồn tại");
    } else {
      accountId = findOrCreateAccount(lead as unknown as Parameters<typeof findOrCreateAccount>[0], ownerId);
      audit(actor, "account", accountId, "CREATE", { reason: `Tự động tạo từ chuyển đổi Lead #${leadId}` });
    }

    // 2. Tìm hoặc tạo Người liên hệ (Contact) theo hợp đồng WP-01
    let contactId = input.contactId ?? input.contact_id ?? null;
    if (contactId) {
      const c = get<{ account_id: number }>("SELECT account_id FROM contacts WHERE id = ?", contactId);
      assert(c && c.account_id === accountId, "Người liên hệ không thuộc Doanh nghiệp đã chọn");
    } else {
      contactId = findOrCreateContact(lead as unknown as Parameters<typeof findOrCreateContact>[0], accountId);
    }

    // 3. Chọn bảng giá áp dụng
    let priceListId = input.priceListId ?? input.price_list_id ?? null;
    if (!priceListId) {
      const defaultPl = get<{ id: number }>("SELECT id FROM price_lists WHERE active = 1 ORDER BY is_default DESC, id ASC LIMIT 1");
      priceListId = defaultPl?.id ?? null;
    }

    // 4. Tạo cơ hội bán hàng (Opportunity)
    const code = nextCode("opportunities", "OPP");
    const oppName = (input.opportunityName ?? input.opportunity_name)?.trim() || `${lead.company_name} – Triển khai SMS`;
    const amount = input.amount ?? 0;
    const closeDate = input.closeDate ?? input.close_date ?? null;

    run(
      `INSERT INTO opportunities 
       (code, name, account_id, primary_contact_id, owner_id, team_id, lead_id, stage, amount, close_date, price_list_id, customer_need, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DEVELOP', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      code,
      oppName,
      accountId,
      contactId,
      ownerId,
      lead.team_id ?? null,
      leadId,
      amount,
      closeDate,
      priceListId,
      `Chuyển đổi từ Lead: ${lead.company_name}`,
    );

    const oppId = get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id;

    // 5. Cập nhật trạng thái Lead sang CONVERTED
    run(
      "UPDATE leads SET status = 'CONVERTED', account_id = ?, contact_id = ?, converted_opportunity_id = ?, converted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      accountId,
      contactId,
      oppId,
      leadId,
    );

    // 6. Ghi nhận lịch sử chuyển giai đoạn
    run(
      "INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, moved_by, reason) VALUES (?, 'QUALIFY', 'DEVELOP', ?, 'Chuyển đổi từ Lead')",
      oppId,
      actorUserId(actor),
    );

    audit(actor, "lead", leadId, "CONVERT", {
      from: lead.status,
      to: "CONVERTED",
      reason: `Chuyển đổi thành Cơ hội ${code}`,
      details: { opportunity_id: oppId, code, account_id: accountId, contact_id: contactId },
    });

    audit(actor, "opportunity", oppId, "CREATE", {
      reason: `Khởi tạo từ Lead #${leadId} (${lead.company_name})`,
      details: { lead_id: leadId, code, amount },
    });

    // Phát sự kiện kích hoạt tác nhân AI (WP-08)
    emitEvent("opportunity.converted", {
      opportunityId: oppId,
      code,
      leadId,
      accountId,
      actorUserId: actorUserId(actor),
    });

    return {
      opportunityId: oppId,
      opportunity_id: oppId,
      accountId,
      account_id: accountId,
      contactId,
      contact_id: contactId,
      code,
    };
  });
}

/**
 * Chuyển đổi hàng loạt khách hàng tiềm năng đủ điều kiện (FR-33, Cổng HG3).
 */
export function batchConvertLeads(
  actor: Actor,
  leadIds: number[],
  defaultOwnerId?: number,
): { converted: number; successCount: number; skipped: number; results: { leadId: number; opportunityCode?: string; error?: string }[] } {
  assert(actor.type === "USER", "Chỉ nhân viên kinh doanh mới được kích hoạt chuyển đổi hàng loạt (HG3)");

  let converted = 0;
  let skipped = 0;
  const results: { leadId: number; opportunityCode?: string; error?: string }[] = [];
  const ownerId = defaultOwnerId ?? actorUserId(actor) ?? 1;

  for (const leadId of leadIds) {
    try {
      const res = convertLeadToOpportunity(actor, leadId, { ownerId });
      converted++;
      results.push({ leadId, opportunityCode: res.code });
    } catch (err: unknown) {
      skipped++;
      results.push({ leadId, error: err instanceof Error ? err.message : "Chưa đủ điều kiện chuyển đổi" });
    }
  }

  return { converted, successCount: converted, skipped, results };
}

/**
 * Loại khách hàng tiềm năng không đạt tiêu chuẩn (FR-34, Cổng HG2).
 * - Bắt buộc phải có lý do loại.
 * - Đề xuất loại từ Agent chỉ có hiệu lực sau khi con người xác nhận.
 */
export function disqualifyLeadWithReason(actor: Actor, leadId: number, reason: string, note?: string) {
  assertActorAccess(actor, "lead", leadId);
  assert(actor.type === "USER", "Chỉ con người mới có quyền xác nhận loại khách hàng (Cổng HG2)");
  assert(reason?.trim(), "Bắt buộc phải nhập lý do loại khách hàng");

  if (reason.trim() === "Khác") {
    assert(note?.trim(), "Trường hợp lý do 'Khác' bắt buộc phải nhập ghi chú giải thích");
  }

  const finalReason = note?.trim() ? `${reason.trim()}: ${note.trim()}` : reason.trim();

  const lead = get<{ id: number; status: string }>("SELECT id, status FROM leads WHERE id = ?", leadId);
  assert(lead, "Không tìm thấy khách hàng tiềm năng");
  assert(lead.status === "OPEN" || lead.status === "WORKING", "Lead không ở trạng thái mở");

  run(
    "UPDATE leads SET status = 'DISQUALIFIED', disqualify_reason = ?, updated_at = datetime('now') WHERE id = ?",
    finalReason,
    leadId,
  );

  audit(actor, "lead", leadId, "DISQUALIFY", {
    from: lead.status,
    to: "DISQUALIFIED",
    reason: finalReason,
  });
}

/**
 * Tái kích hoạt khách hàng tiềm năng đã bị loại (FR-34).
 * Giữ nguyên lịch sử, không tự khôi phục hồ sơ đã xóa.
 */
export function reactivateDisqualifiedLead(actor: Actor, leadId: number, reason: string = "Tái kích hoạt khách hàng tiềm năng") {
  assertActorAccess(actor, "lead", leadId);
  assert(reason?.trim(), "Bắt buộc phải nhập lý do tái kích hoạt khách hàng");

  const lead = get<{ id: number; status: string; deleted_at: string | null }>(
    "SELECT id, status, deleted_at FROM leads WHERE id = ?",
    leadId,
  );
  assert(lead, "Không tìm thấy khách hàng tiềm năng");
  assert(!lead.deleted_at, "Hồ sơ khách hàng này đã bị xóa, không thể tái kích hoạt");
  assert(lead.status === "DISQUALIFIED", "Chỉ có thể tái kích hoạt khách hàng ở trạng thái Đã loại");

  run(
    "UPDATE leads SET status = 'WORKING', disqualify_reason = NULL, updated_at = datetime('now') WHERE id = ?",
    leadId,
  );

  audit(actor, "lead", leadId, "REACTIVATE", {
    from: "DISQUALIFIED",
    to: "WORKING",
    reason: reason.trim(),
  });
}
