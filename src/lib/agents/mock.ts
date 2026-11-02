// Chế độ mô phỏng (không cần API key): Agent đi theo kịch bản cố định, dùng ĐÚNG các công cụ
// và kiểm tra quyền như khi chạy bằng Claude, nên luồng kiểm duyệt/log giống hệt bản thật.
import { stripAccents } from "../domain";
import { get } from "../db";
import { invokeTool, type ToolCallLog, type ToolContext } from "./tools";
import type { RuleOutcome } from "./rules";
import type { opportunityResearchContext } from './research-context';
import type { InsightItem, OpportunityResearch } from './schemas';

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
  const criteria=call("get_admin_criteria") as {bant_threshold:number};
  const activities = call("list_lead_activities") as Wrapped<{ subject: string; body: string | null; ref: string }[]>;
  const dups = call("find_duplicates") as { kind: string; label: string; reason: string }[];
  const addr = call("normalize_address") as { normalized: string | null; confidence: number };
  const web = (call("web_research", { query: lead.company_name }) as Research).data;

  const notes = stripAccents((lead.notes.data ?? "").toLowerCase());
  const acts = stripAccents(activities.data.map((a) => `${a.subject} ${a.body ?? ""}`).join(" ").toLowerCase());
  const webText = stripAccents(web.map((w) => w.snippet).join(" ").toLowerCase());
  const title = stripAccents((lead.contact_title ?? "").toLowerCase());
  const evidence: { ref: string; detail: string; quote: string }[] = [];
  const negative = has(webText, "cat giam", "tam dung");

  // Scores reflect customer statements, not speculative public financing news.
  const customerText=`${notes} ${acts}`;
  const need=has(customerText,'pham vi','so nguoi dung','users') && has(customerText,'crm','phan mem') ? 25 : has(customerText,'crm','pipeline','quan ly ban hang','excel','bang tinh') ? 15 : has(customerText,'nhu cau','phan mem') ? 8 : 0;
  const budget=has(customerText,'ngan sach da duyet','da phe duyet ngan sach') ? 25 : /(?:ngan sach|budget)[^.!?]{0,80}\d/.test(customerText) ? 15 : has(customerText,'ngan sach','budget') ? 8 : 0;
  const authority=!has(customerText,'chua gap','chua xac dinh','can xac dinh','thieu nguoi quyet dinh') && has(customerText,'nguoi quyet dinh','quyet dinh cuoi cung','nguoi ky quyet dinh') ? 25 : has(title,'giam doc','ceo','truong','head','manager','quan ly') ? 15 : title ? 8 : 0;
  const timeline=has(customerText,'trong thang','cuoi quy') ? 25 : has(customerText,'nam sau') ? 8 : has(customerText,'trong nam','nam nay') ? 15 : 0;
  const source=lead.notes.data ? {ref:'lead.notes',quote:lead.notes.data.slice(0,180),detail:'Thông tin khách cung cấp'} : activities.data[0] ? {ref:activities.data[0].ref,quote:(activities.data[0].body ?? activities.data[0].subject).slice(0,180),detail:'Trao đổi với khách'} : {ref:'lead.company_name',quote:lead.company_name,detail:'Hồ sơ mới, chưa đủ dữ liệu chấm điểm'};
  evidence.push(source);
  if(lead.contact_title) evidence.push({ref:'lead.contact_title',quote:lead.contact_title,detail:'Chức danh chưa tự chứng minh thẩm quyền quyết định'});

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

  const timelineBucket = timeline===25 ? "END_OF_QUARTER" : timeline===8 ? "NEXT_YEAR" : "UNKNOWN";
  const confidence = authority >= 14 && need >= 15 ? 0.85 : 0.65;

  const scored = call("propose_bant_score", {
    budget: { score: budget, reason: budget ? "Mức ngân sách từ ghi chú/trao đổi của khách" : "Chưa có thông tin ngân sách", evidence: budget ? [source] : [] },
    authority: { score: authority, reason: authority===25 ? "Khách xác định người quyết định" : authority ? "Mới có chức danh, chưa xác nhận người quyết định" : "Chưa có thông tin thẩm quyền", evidence: authority ? evidence : [] },
    need: { score: need, reason: need ? "Độ rõ nhu cầu theo thông tin khách cung cấp" : "Chưa rõ nhu cầu", evidence: need ? [source] : [] },
    timeline: { score: timeline, reason: timeline ? "Mốc mua hàng khách đã nêu" : "Chưa có mốc mua hàng", evidence: timeline ? [source] : [] },
    timeline_bucket: timelineBucket,
    confidence,
    rationale,
    evidence,
  }) as { total: number; outcome: string };
  const total = scored.total;

  let next: string;
  if (scored.outcome === "QUALIFIED") {
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
    context: ReturnType<typeof opportunityResearchContext>;
    research_phase: 'INITIAL'|'POST_SURVEY';
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
  const sources: { ref: string; detail: string; quote: string }[] = [];

  emailsData.emails.slice(0, 3).forEach((e) => sources.push({ ref: e.ref, detail: e.subject, quote: e.subject }));
  meetings.slice(0, 3).forEach((m) => sources.push({ ref: m.ref, detail: m.subject, quote: m.subject }));
  web.forEach((w) => sources.push({ ref: w.source, detail: w.title, quote: w.title }));

  if (sources.length === 0) {
    sources.push({ ref: "opportunity.code", detail: "Hồ sơ cơ hội", quote: o.code });
  }

  const c=o.context;
  const no=(reason:string):InsightItem=>({status:'NO_INSIGHT',reason});
  const info=(text:string,refs:string[]):InsightItem=>({text:text.slice(0,1000),sources:refs.map(ref=>({ref}))});
  const opp=c.opportunity;
  const surveyKeys=['business_goals','current_process','pain_points','software_needs','expected_outcomes','technical_requirements'];
  const survey=surveyKeys.filter(k=>opp[k]).map(k=>`${k}: ${String(opp[k])}`);
  const budgetRule=rules.evaluations.find(e=>e.rule_id==='OPP-R07')!;
  const missing=[!opp.budget && 'Chưa có ngân sách khách xác nhận',!c.bant && 'Chưa có kết quả BANT từ Lead nguồn',!c.interactions.length && 'Chưa có lịch sử tương tác',...surveyKeys.filter(k=>!opp[k]).map(k=>`Cần làm rõ ${k}`)].filter((v):v is string=>!!v);
  const insights:NonNullable<OpportunityResearch['insights']>={
    account_overview:c.account ? info(`Doanh nghiệp: ${String(c.account.name)}; ngành: ${String(c.account.industry ?? 'chưa ghi')}; quy mô: ${String(c.account.employee_size ?? 'chưa ghi')}.`,['account.name']) : no('Chưa có doanh nghiệp được liên kết'),
    opportunity_info:info(`Chủ đề: ${String(opp.name)}; nguồn: ${String(c.lead?.source ?? 'chưa ghi')}; doanh thu dự kiến: ${String(opp.amount)}; thời điểm dự kiến: ${String(opp.close_date ?? 'chưa ghi')}.`,['opportunity.code','opportunity.amount']),
    bant_result:c.bant ? info(`BANT đã ghi: Budget ${c.bant.bant_budget}/25, Authority ${c.bant.bant_authority}/25, Need ${c.bant.bant_need}/25, Timeline ${c.bant.bant_timeline}/25. Trạng thái: ${c.bant.status}. ${String(c.bant.notes ?? '')}`,[`bant:${c.bant.id}`]) : no('Cơ hội chưa có đánh giá BANT từ Lead nguồn; cần NVKD bổ sung, không suy đoán điểm'),
    interaction_history:c.interactions.length ? info(c.interactions.slice(0,6).map(a=>`${a.occurred_at}: ${a.subject}. ${a.body ?? ''}`).join('\n'),c.interactions.slice(0,6).map(a=>`activity:${a.id}`)) : no('Chưa có tương tác đã ghi nhận hoặc đồng bộ cho cơ hội và Lead nguồn'),
    pain_need:opp.customer_need ? info(`Nhu cầu: ${String(opp.customer_need)}. ${survey.join('; ')}`,['opportunity.customer_need']) : no('Chưa có nhu cầu khách được ghi nhận'),
    scope_summary:survey.length ? info(`Tổng hợp để NVKD đối chiếu biên bản phạm vi, không tự xác nhận: ${survey.join('; ')}. Tài liệu đã đọc: ${c.documents.filter(d=>d.fields_json).map(d=>d.name).join(', ') || 'chưa có'}.`,surveyKeys.filter(k=>!!opp[k]).map(k=>`opportunity.${k}`)) : no('Cần hoàn thành khảo sát trước khi tổng hợp phạm vi và ràng buộc'),
    product:c.products.length ? info(c.products.map(p=>`${p.name}: số lượng ${p.quantity}. ${p.description ?? 'Chưa có đặc tả năng lực; chuyên viên phải kiểm tra khả năng đáp ứng'}`).join('; '),c.products.map(p=>`product:${p.id}`)) : no('Chưa có cấu hình dự kiến; không khẳng định sản phẩm phù hợp khi thiếu căn cứ'),
    stakeholder:o.stakeholders.length ? info(`Đã ghi: ${o.stakeholders.map(s=>`${s.name} (${s.role})`).join('; ')}. Cần đối chiếu người dùng trực tiếp, IT, mua hàng/pháp chế, người kiểm soát ngân sách và người quyết định cuối; không suy đoán vai trò chưa được xác nhận.`,['opportunity.stakeholders']) : no('Chưa thiết lập bên liên quan; cần làm rõ người quyết định, đánh giá kỹ thuật, mua kinh tế, người ủng hộ và người dùng cuối'),
    competitor:o.competitors.length ? info(o.competitors.map(x=>`${x.name}; điểm mạnh đã ghi: ${x.strengths ?? 'chưa có nguồn'}. Cần kiểm chứng sản phẩm, giá, tính năng, tích hợp, chi phí, thời gian triển khai và hỗ trợ trước khi kết luận lợi thế.`).join('; '),['opportunity.competitors']) : no('Chưa có đối thủ được ghi nhận; dữ liệu công khai trong mock chưa đủ để khẳng định khách đang so sánh với nhà cung cấp nào'),
    budget_check:info(`${budgetRule.rationale}. ${budgetRule.status==='HIT' ? 'Khuyến nghị xem lại mô-đun, số người dùng hoặc phạm vi dịch vụ.' : budgetRule.status==='NOT_EVALUABLE' ? 'Đây là thông tin còn thiếu cần hỏi khách.' : 'Không có cờ không thay thế việc NVKD tự kiểm tra ngân sách.'}`,budgetRule.evidence_refs),
    health:info(`Giai đoạn ${o.stage}; ${risks.length} đề xuất rủi ro, chưa ghi vào hồ sơ.`,['opportunity.stage']),
  };

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
    insights,
    missing_info:missing,
    risks: [], // rủi ro của quy tắc do server tự thêm khi lưu; mock không có rủi ro ngoài quy tắc
    next_actions: [], // Backend derives recommendations, rule IDs and evidence together.
    additional_actions: [],
    email_insight_status: emailsData.email_insight_status,
    sources,
  });

  if (risks.some((r) => r.severity === "HIGH")) {
    call("notify_owner", { message: `Có ${risks.filter((r) => r.severity === "HIGH").length} rủi ro mức Cao cần xử lý` });
  }

  return `Đã tạo bản nghiên cứu ${o.research_phase==='INITIAL' ? 'lần 1' : 'lần 2'} cho ${o.code}: mức ${importance}, ${risks.length} đề xuất rủi ro, ${rules.next_actions.length} hành động ưu tiên. Chờ nhân viên xác minh.`;
}
