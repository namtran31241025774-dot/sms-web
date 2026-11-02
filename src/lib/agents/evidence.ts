import { all, get, run } from "../db";
import type { ToolContext } from "./tools";
import type { Ref } from "./schemas";

export class InvalidEvidenceError extends Error {}

/**
 * Kiểm tra tính hợp lệ của danh sách căn cứ (evidence/sources) ở phía SERVER (BUG-006, BUG-007).
 * Mỗi ref bắt buộc phải trỏ đến:
 * - Trường dữ liệu có thật và có giá trị của hồ sơ hiện tại (`lead.<cột>` hoặc `opportunity.<cột>`)
 * - Bản ghi tương tác thuộc hồ sơ hiện tại (`activity:<id>`)
 * - Hoặc nguồn thông tin web đã trích dẫn (`web:*`, `http://*`, `https://*`, `mock://*`)
 */
export function validateEvidence(
  ctx: ToolContext,
  refs: Ref[],
  options: { min?: number; required?: boolean; allowMissingSnapshot?: boolean } = {},
): Ref[] {
  const minRequired = options.min ?? (options.required ? 1 : 0);

  if (minRequired > 0 && (!refs || refs.length < minRequired)) {
    throw new InvalidEvidenceError(
      `Bắt buộc có ít nhất ${minRequired} căn cứ hợp lệ (hiện có: ${refs ? refs.length : 0})`,
    );
  }

  if (!refs || refs.length === 0) return [];

  // Đọc dữ liệu hồ sơ để đối chiếu
  const lead = ctx.entityType === "lead"
    ? get<Record<string, unknown>>("SELECT * FROM leads WHERE id = ?", ctx.entityId)
    : null;
  const opp = ctx.entityType === "opportunity"
    ? get<Record<string, unknown>>("SELECT * FROM opportunities WHERE id = ?", ctx.entityId)
    : null;
  const verifyQuote = (quote: string | undefined, content: unknown) => {
    if (quote && !String(content).replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' '))) throw new InvalidEvidenceError("Trích dẫn không có trong nội dung nguồn");
  };

  for (const item of refs) {
    const ref = item.ref.trim();
    if (!ref) {
      throw new InvalidEvidenceError("Ref căn cứ không được để trống");
    }

    const sourceTables: Record<string,string> = {account:'accounts',contact:'contacts'};
    const prefix=ref.split('.')[0];
    if(opp && sourceTables[prefix]) {
      const row=get<Record<string,unknown>>(`SELECT * FROM ${sourceTables[prefix]} WHERE id=?`,Number(prefix==='account' ? opp.account_id : opp.primary_contact_id ?? 0));
      const value=row?.[ref.slice(prefix.length+1)];
      if(value===undefined || value===null || value==='') throw new InvalidEvidenceError('Trường nguồn không có dữ liệu');
      verifyQuote(item.quote,value);continue;
    }
    if(ref.startsWith('bant:')) {
      const row=get<Record<string,unknown>>('SELECT * FROM lead_assessments WHERE id=? AND lead_id=?',Number(ref.slice(5)),Number(lead?.id ?? opp?.lead_id ?? 0));
      if(!row) throw new InvalidEvidenceError('Đánh giá BANT không thuộc hồ sơ');
      verifyQuote(item.quote,JSON.stringify(row));continue;
    }
    if(opp && ref.startsWith('document:')) {
      const row=get<{name:string;fields_json:string|null}>(`SELECT d.name,(SELECT fields_json FROM document_extractions e WHERE e.document_id=d.id ORDER BY e.id DESC LIMIT 1) fields_json FROM documents d
        JOIN document_links l ON l.document_id=d.id WHERE d.id=? AND l.entity_type='opportunity' AND l.entity_id=?`,Number(ref.slice(9)),ctx.entityId);
      if(!row) throw new InvalidEvidenceError('Tài liệu không thuộc cơ hội');
      verifyQuote(item.quote,`${row.name}\n${row.fields_json ?? ''}`);continue;
    }
    if(opp && ref.startsWith('product:')) {
      const row=get<{name:string;description:string|null}>('SELECT p.name,p.description FROM products p JOIN opportunity_items i ON i.product_id=p.id WHERE p.id=? AND i.opportunity_id=?',Number(ref.slice(8)),ctx.entityId);
      if(!row) throw new InvalidEvidenceError('Sản phẩm không thuộc cấu hình cơ hội');
      verifyQuote(item.quote,`${row.name}\n${row.description ?? ''}`);continue;
    }
    const aggregateQueries:Record<string,string>={
      'opportunity.stakeholders':'SELECT name,role FROM stakeholders WHERE opportunity_id=?',
      'opportunity.competitors':'SELECT c.name FROM competitors c JOIN opportunity_competitors x ON x.competitor_id=c.id WHERE x.opportunity_id=?',
      'opportunity.risks':'SELECT description,status FROM opportunity_risks WHERE opportunity_id=?',
      'activities.email':"SELECT subject,body FROM activities WHERE entity_type='opportunity' AND entity_id=? AND type='EMAIL'",
      'solution.integration_required':'SELECT integration_required FROM solutions WHERE opportunity_id=? ORDER BY id DESC LIMIT 1',
    };
    if(opp && aggregateQueries[ref]) {
      const rows=all(aggregateQueries[ref],ctx.entityId);
      if(!rows.length && !options.allowMissingSnapshot) throw new InvalidEvidenceError('Nguồn chưa có dữ liệu');
      verifyQuote(item.quote,JSON.stringify(rows));continue;
    }
    // 1. Trường Lead: lead.<field>
    if (ref.startsWith("lead.")) {
      if (ctx.entityType !== "lead" || !lead) {
        throw new InvalidEvidenceError(`Không thể dùng căn cứ ${ref} khi đang xử lý ${ctx.entityType}`);
      }
      const field = ref.slice(5);
      const val = lead[field];
      if (val === undefined || val === null || val === "") {
        if(options.allowMissingSnapshot && field in lead && !item.quote) continue;
        throw new InvalidEvidenceError(`Trường ${field} của Lead #${ctx.entityId} không tồn tại hoặc không có dữ liệu`);
      }
      verifyQuote(item.quote, val);
      continue;
    }

    // 2. Trường Opportunity: opportunity.<field>
    if (ref.startsWith("opportunity.")) {
      if (ctx.entityType !== "opportunity" || !opp) {
        throw new InvalidEvidenceError(`Không thể dùng căn cứ ${ref} khi đang xử lý ${ctx.entityType}`);
      }
      const field = ref.slice(12);
      const val = opp[field];
      if (val === undefined || val === null || val === "") {
        if(options.allowMissingSnapshot && field in opp && !item.quote) continue;
        throw new InvalidEvidenceError(`Trường ${field} của Opportunity #${ctx.entityId} không tồn tại hoặc không có dữ liệu`);
      }
      verifyQuote(item.quote, val);
      continue;
    }

    // 3. Bản ghi tương tác: activity:<id>
    if (ref.startsWith("activity:")) {
      const actIdStr = ref.slice(9);
      const actId = parseInt(actIdStr, 10);
      if (isNaN(actId)) {
        throw new InvalidEvidenceError(`Mã activity không hợp lệ: ${ref}`);
      }
      const act = get<{ id: number; subject:string; body:string|null }>(
        "SELECT id,subject,body FROM activities WHERE id = ? AND ((entity_type = ? AND entity_id = ?) OR (entity_type='lead' AND entity_id=?))",
        actId, ctx.entityType, ctx.entityId,Number(opp?.lead_id ?? 0),
      );
      if (!act) {
        throw new InvalidEvidenceError(
          `Hoạt động ${ref} không tồn tại hoặc không thuộc ${ctx.entityType} #${ctx.entityId}`,
        );
      }
      verifyQuote(item.quote, `${act.subject}\n${act.body ?? ''}`);
      continue;
    }

    // 4. Nguồn Web / Mock / External URL / web_research
    if (
      ref.startsWith("http://") ||
      ref.startsWith("https://") ||
      ref.startsWith("mock://") ||
      ref.startsWith("web:") ||
      ref === "web_research" ||
      ref.includes("web_research")
    ) {
      const cached = ctx.webSources?.find(r=>r.source === ref);
      const saved = get<{quote:string}>("SELECT quote FROM ai_evidence WHERE run_id=? AND source_type='WEB_SOURCE' AND ref=?",ctx.runId,ref);
      if (!cached && !saved) throw new InvalidEvidenceError("URL không có trong kết quả web của lần chạy hiện tại");
      verifyQuote(item.quote, cached ? `${cached.title}\n${cached.snippet}` : saved!.quote);
      continue;
    }

    // Nếu không khớp định dạng nào cho phép
    throw new InvalidEvidenceError(`Căn cứ không hợp lệ hoặc không xác thực được: ${ref}`);
  }

  return refs;
}

/**
 * Ghi nhận căn cứ vào bảng ai_evidence sau khi đề xuất hoặc bản nghiên cứu được tạo
 */
export function recordAiEvidence(params: {
  runId?: number | null;
  suggestionId?: number | null;
  researchId?: number | null;
  refs: Ref[];
}) {
  if (!params.refs || params.refs.length === 0) return;

  const validRunId = params.runId && get<{ id: number }>("SELECT id FROM ai_runs WHERE id = ?", params.runId)
    ? params.runId
    : null;

  for (const r of params.refs) {
    let sourceType = "OTHER";
    if (r.ref.startsWith("lead.") || r.ref.startsWith("opportunity.")) sourceType = "ENTITY_FIELD";
    else if (r.ref.startsWith("activity:")) sourceType = "ACTIVITY";
    else if (r.ref.startsWith("http") || r.ref.startsWith("mock://") || r.ref.includes("web")) sourceType = "WEB";

    run(
      `INSERT INTO ai_evidence (run_id, suggestion_id, research_id, source_type, ref, quote, verified)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      validRunId,
      params.suggestionId ?? null,
      params.researchId ?? null,
      sourceType,
      r.ref,
      r.quote || r.detail || null,
    );
  }
}
