// Chế độ mô phỏng (không cần API key): Agent đi theo kịch bản cố định, dùng ĐÚNG các công cụ
// và kiểm tra quyền như khi chạy bằng Claude, nên luồng kiểm duyệt/log giống hệt bản thật.
import { stripAccents } from "../domain";
import { get } from "../db";
import { invokeTool, type ToolCallLog, type ToolContext } from "./tools";
import type { RuleOutcome } from "./rules";

type Research = { untrusted_data: true; data: { title: string; snippet: string; source: string }[] };
type Wrapped<T> = { data: T };

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

// Mock fixtures cite actual source excerpts, never a paraphrase presented as a quotation.
function groundedMockInput(ctx: ToolContext, input: unknown): unknown {
  if (Array.isArray(input)) return input.map(v=>groundedMockInput(ctx,v));
  if (!input || typeof input !== 'object') return input;
  const data = Object.fromEntries(Object.entries(input).map(([k,v])=>[k,groundedMockInput(ctx,v)]));
  if (typeof data.ref === 'string') {
    if (data.ref === 'web_research') data.ref = ctx.entityType === 'lead' ? 'lead.company_name' : 'opportunity.name';
    const ref = data.ref as string;
    let content = '';
    if (ref.startsWith(ctx.entityType+'.')) {
      const row=get<Record<string,unknown>>(`SELECT * FROM ${ctx.entityType === 'lead' ? 'leads' : 'opportunities'} WHERE id=?`,ctx.entityId);
      content=String(row?.[ref.slice(ctx.entityType.length+1)] ?? '');
    } else if (ref.startsWith('activity:')) {
      const row=get<{subject:string;body:string}>('SELECT subject,body FROM activities WHERE id=?',Number(ref.slice(9)));
      content=`${row?.subject ?? ''}\n${row?.body ?? ''}`;
    } else {
      const source=ctx.webSources?.find(s=>s.source === ref);
      content=source ? `${source.title}\n${source.snippet}` : '';
    }
    data.quote=content.slice(0,180);
  }
  return data;
}

function industryFrom(text: string): string | null {
  if (has(text, "thep")) return "Sản xuất – Thép";
  if (has(text, "duoc")) return "Dược phẩm – Phân phối";
  if (has(text, "logistics", "van tai")) return "Logistics – Vận tải";
  if (has(text, "cntt", "digital", "cong nghe")) return "Dịch vụ CNTT";
  return null;
}

export function mockQualificationAgent(ctx: ToolContext, log: ToolCallLog[]): string {
  const call = (name: string, input: unknown = {}) => invokeTool(ctx, name, groundedMockInput(ctx,input), log);

  const lead = call("get_lead") as {
    company_name: string; contact_title: string | null; email: string | null; industry: string | null;
    address: string | null; notes: Wrapped<string | null>;
  };
  const criteria = call("get_admin_criteria") as { bant_threshold: number };
  const activities = call("list_lead_activities") as Wrapped<{ subject: string; body: string | null; ref: string }[]>;
  const dups = call("find_duplicates") as { kind: string; label: string; reason: string }[];
  const addr = call("normalize_address") as { normalized: string | null; confidence: number };
  const web = (call("web_research", { query: lead.company_name }) as Research).data;

  const notes = stripAccents((lead.notes.data ?? "").toLowerCase());
  const acts = stripAccents(activities.data.map((a) => `${a.subject} ${a.body ?? ""}`).join(" ").toLowerCase());
  const webText = stripAccents(web.map((w) => w.snippet).join(" ").toLowerCase());
  const title = stripAccents((lead.contact_title ?? "").toLowerCase());
  const all = `${notes} ${acts} ${webText}`;
  const evidence: { ref: string; detail: string; quote: string }[] = [];
  const negative = has(webText, "cat giam", "tam dung");

  // --- Need
  let need = 8;
  if (has(all, "crm", "pipeline", "quan ly ban hang", "doi sales", "doi kinh doanh", "nhan vien kinh doanh", "trinh duoc vien", "bang tinh")) {
    need = 20;
    const ref = lead.notes.data ? "lead.notes" : web[0]?.source ?? "web_research";
    evidence.push({ ref, detail: "Có nhu cầu quản lý bán hàng / đội sales", quote: "Nhu cầu quản lý bán hàng" });
  }
  // --- Budget
  let budget = 8;
  if (has(all, "ngan sach", "budget", "trieu", "ty dong", "goi von", "mo rong")) {
    budget = 18;
    const ref = web[0]?.source ?? (lead.notes.data ? "lead.notes" : "web_research");
    evidence.push({ ref, detail: "Tín hiệu có ngân sách / đang mở rộng", quote: "Có ngân sách mở rộng" });
  }
  if (negative) {
    budget = 3;
    evidence.push({ ref: web[0]?.source ?? "web_research", detail: "Đang cắt giảm chi phí / tạm dừng dự án CNTT", quote: "Cắt giảm chi phí" });
  }
  // --- Authority
  let authority = 6;
  if (has(title, "giam doc", "ceo", "cio", "cto", "director", "founder", "chu tich", "pho tong")) authority = 22;
  else if (has(title, "truong", "head", "manager", "quan ly")) authority = 14;
  if (lead.contact_title) {
    evidence.push({ ref: "lead.contact_title", detail: `Chức danh: ${lead.contact_title}`, quote: lead.contact_title });
  }
  // --- Timeline
  let timeline = 8;
  if (has(all, "q1", "q2", "quy 1", "quy 2", "2027", "trong thang", "ngay")) {
    timeline = 17;
    evidence.push({ ref: web[0]?.source ?? (lead.notes.data ? "lead.notes" : "web_research"), detail: "Có mốc thời gian triển khai", quote: "Kế hoạch triển khai" });
  }
  if (negative) timeline = 3;

  // Đảm bảo luôn có ít nhất 1 evidence từ lead
  if (evidence.length === 0) {
    if (lead.notes.data) evidence.push({ ref: "lead.notes", detail: "Ghi chú từ Lead", quote: "Ghi chú" });
    else if (lead.company_name) evidence.push({ ref: "lead.company_name", detail: "Tên công ty", quote: lead.company_name });
    else evidence.push({ ref: "web_research", detail: "Nghiên cứu web", quote: "Thông tin doanh nghiệp" });
  }

  // --- Làm giàu dữ liệu (chỉ đề xuất trường trống)
  const fields: Record<string, string> = {};
  const ind = industryFrom(`${notes} ${webText} ${stripAccents(lead.company_name.toLowerCase())}`);
  if (!lead.industry && ind) fields.industry = ind;
  if (addr.normalized && addr.normalized !== lead.address && addr.confidence >= 0.8) fields.address = addr.normalized;
  if (web.length) fields.notes = `Nghiên cứu: ${web[0].snippet}`;
  if (Object.keys(fields).length) {
    call("propose_enrichment", {
      fields,
      evidence: web.map((w) => ({ ref: w.source, detail: w.title, quote: w.title })),
    });
  }

  const rationale =
    `Need ${need}/25, Budget ${budget}/25, Authority ${authority}/25, Timeline ${timeline}/25. ` +
    (web.length ? `Nguồn web: ${web[0].title}. ` : "Không tìm thấy thông tin công khai. ") +
    (dups.length ? `Cảnh báo trùng: ${dups.map((d) => `${d.label} (${d.reason})`).join("; ")}.` : "");

  const timelineBucket = timeline >= 15 ? "END_OF_QUARTER" : "UNKNOWN";
  const confidence = authority >= 14 && need >= 15 ? 0.85 : 0.65;

  const scored = call("propose_bant_score", {
    budget: { score: budget, evidence },
    authority: { score: authority, evidence },
    need: { score: need, evidence },
    timeline: { score: timeline, evidence },
    timeline_bucket: timelineBucket,
    confidence,
    rationale,
    evidence,
  }) as { total: number; outcome: string };
  const total = scored.total;

  let next: string;
  if (total >= criteria.bant_threshold) {
    call("propose_conversion", {
      handoff_summary: `${lead.company_name}: ${rationale}`,
      evidence,
    });
    next = "đề xuất chuyển đổi";
  } else if (negative || total < 35) {
    call("propose_disqualify", {
      reason: negative ? "Doanh nghiệp đang cắt giảm chi phí, tạm dừng dự án CNTT (không có ngân sách)" : "BANT thấp, chưa thấy nhu cầu và ngân sách rõ ràng",
      evidence,
    });
    next = "đề xuất loại Lead";
  } else {
    const missing = [budget < 15 && "ngân sách dự kiến", authority < 15 && "người ra quyết định", timeline < 15 && "thời điểm dự kiến triển khai"].filter(Boolean);
    if (lead.email) {
      call("draft_email", {
        to: lead.email,
        subject: `Trao đổi thêm về nhu cầu quản lý bán hàng của ${lead.company_name}`,
        body: `Kính gửi Anh/Chị,\n\nCảm ơn Anh/Chị đã quan tâm đến giải pháp Sales Cloud. Để đề xuất phương án phù hợp, Anh/Chị có thể chia sẻ thêm về ${missing.join(", ") || "kế hoạch triển khai"} không ạ?\n\nNếu thuận tiện, chúng tôi xin hẹn một cuộc gọi 20 phút trong tuần này.\n\nTrân trọng.`,
        purpose: "Bổ sung thông tin BANT còn thiếu",
        facts_used: evidence,
      });
    }
    next = "soạn email hỏi thêm thông tin";
  }
  if (dups.length) call("create_follow_up_task", { title: "Kiểm tra bản ghi có thể trùng trước khi chuyển đổi", due_in_days: 1 });

  return `Đã đánh giá ${lead.company_name}: BANT đề xuất ${total}/100 (ngưỡng ${criteria.bant_threshold}); ${next}.` +
    (dups.length ? ` Phát hiện ${dups.length} bản ghi có thể trùng (chỉ cảnh báo, không gộp).` : "");
}

export function mockOpportunityAgent(ctx: ToolContext, log: ToolCallLog[]): string {
  const call = (name: string, input: unknown = {}) => invokeTool(ctx, name, groundedMockInput(ctx,input), log);

  const o = call("get_opportunity") as {
    code: string; account: string; stage: string; amount_vnd: number; close_date: string | null;
    customer_need: Wrapped<string | null>;
    checklist: Record<string, boolean>;
    stakeholders: { name: string; role: string }[];
    competitors: { name: string; strengths: string | null }[];
  };
  call("get_admin_criteria");
  const emailRes = call("get_recent_emails") as {
    email_insight_status?: "OK" | "NO_INSIGHT";
    window_days?: number;
    emails?: { subject: string; ref: string }[];
    untrusted_data?: boolean;
    data?: { email_insight_status: "OK" | "NO_INSIGHT"; window_days: number; emails: { subject: string; ref: string }[] };
  };
  const emailsData = emailRes.data ?? (emailRes.emails ? { email_insight_status: emailRes.email_insight_status || "OK", window_days: emailRes.window_days || 30, emails: emailRes.emails } : { email_insight_status: "NO_INSIGHT" as const, window_days: 30, emails: [] });

  const meetings = (call("get_meeting_notes") as Wrapped<{ subject: string; ref: string }[]>).data;
  const web = (call("web_research", { query: o.account }) as Research).data;
  call("get_win_history");

  // Mức quan trọng, rủi ro và thứ tự hành động lấy từ rule engine (BR-28) — mock không tự đặt ngưỡng.
  const rules = call("evaluate_opportunity_rules") as RuleOutcome;
  const risks = rules.risks.map(({ category, severity, description }) => ({ category, severity, description }));
  const actions = [...rules.next_actions, ...rules.additional_actions].map(({ action, owner_role, why }) => ({ action, owner_role, why }));
  const sources: { ref: string; detail: string; quote: string }[] = [];

  emailsData.emails.slice(0, 3).forEach((e) => sources.push({ ref: e.ref, detail: e.subject, quote: e.subject }));
  meetings.slice(0, 3).forEach((m) => sources.push({ ref: m.ref, detail: m.subject, quote: m.subject }));
  web.forEach((w) => sources.push({ ref: w.source, detail: w.title, quote: w.title }));

  if (sources.length === 0) {
    sources.push({ ref: "web_research", detail: "Nghiên cứu thị trường", quote: o.account });
  }

  const importance = rules.importance;
  const importanceReason = rules.importance_reason;

  const summary =
    `${o.account} – giá trị dự kiến ${o.amount_vnd.toLocaleString("vi-VN")} ₫, mức quan trọng ${importance}. ` +
    (web.length ? `Bối cảnh: ${web[0].snippet} ` : "") +
    `Phát hiện ${risks.length} rủi ro; ${emailsData.emails.length} email và ${meetings.length} ghi chú họp được xem xét.`;

  call("save_opportunity_research", {
    importance,
    importance_reason: importanceReason,
    summary,
    changes_since_last: null,
    insights: {
      stakeholder: o.stakeholders.length > 0
        ? { text: `Đã xác định ${o.stakeholders.length} bên liên quan`, sources }
        : { status: "NO_INSIGHT", reason: "Chưa thiết lập bên liên quan" },
      competitor: o.competitors.length > 0
        ? { text: `Cạnh tranh với ${o.competitors.map((c) => c.name).join(", ")}`, sources }
        : { status: "NO_INSIGHT", reason: "Chưa phát hiện đối thủ cạnh tranh" },
      account_overview: web.length > 0
        ? { text: `Tổng quan doanh nghiệp: ${web[0].title}`, sources }
        : { status: "NO_INSIGHT", reason: "Chưa có thông tin công khai về tài khoản" },
      health: { text: `Giai đoạn ${o.stage}, ${risks.length} rủi ro được phát hiện`, sources },
      pain_need: o.customer_need.data
        ? { text: `Nhu cầu khách hàng: ${String(o.customer_need.data)}`, sources: [{ ref: "opportunity.customer_need", quote: "Nhu cầu", detail: "Nhu cầu" }] }
        : { status: "NO_INSIGHT", reason: "Chưa ghi nhận nhu cầu chi tiết" },
      product: { text: "Giải pháp SaaS B2B và dịch vụ triển khai phù hợp", sources },
    },
    risks: [], // rủi ro của quy tắc do server tự thêm khi lưu; mock không có rủi ro ngoài quy tắc
    next_actions: actions.slice(0, 3),
    additional_actions: actions.slice(3),
    email_insight_status: emailsData.email_insight_status,
    sources,
  });

  if (risks.some((r) => r.severity === "HIGH")) {
    call("notify_owner", { message: `Có ${risks.filter((r) => r.severity === "HIGH").length} rủi ro mức Cao cần xử lý` });
  }

  return `Đã cập nhật Opportunity Research cho ${o.code}: mức ${importance}, ${risks.length} rủi ro, ${Math.min(actions.length, 3)} hành động ưu tiên. Chờ AE xác minh.`;
}
