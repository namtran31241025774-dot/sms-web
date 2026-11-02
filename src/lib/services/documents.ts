// Tài liệu trên cơ hội: lưu có phiên bản, Agent đọc thành đề xuất, người xác nhận mới ghi vào hồ sơ.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { all, get, run, tx } from "../db";
import { assert, DomainError } from "../domain";
import { can } from "../rbac";
import { getLlmProvider } from "../llm";
import { assertActorAccess } from "./access";
import { checkPreRunConstraints, getActiveAgentConfig } from "./ai-admin";
import { audit, setting, type Actor } from "./core";
import {
  documentExtractPrompt, documentFullText, DOCUMENT_EXTRACT_SYSTEM, DOC_FIELDS, matchCatalogItems, mergeAiResult, missingFields,
  parseLabeledFields, parseVndAmount, readDocx, readPdf, validateFields, type CatalogProduct, type DocFieldKey, type ExtractedField, type ProposedItem,
} from "./document-extract";
import { addOpportunityItem, createScopeDocument, createSolution, getOpportunity, getScopeDocument, listSolutions, updateOpportunity, updateScopeDocument, updateSolution } from "./opportunities";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const FILE_TYPES: Record<string, { mime: string; magic: string }> = {
  ".docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: "PK" },
  ".pdf": { mime: "application/pdf", magic: "%PDF" },
};

export type OpportunityDocument = {
  id: number; name: string; file_size: number; version_no: number; created_at: string; uploader_name: string | null;
  document_kind:DocumentKind; solution_id:number|null;
};
export type DocumentKind='SURVEY'|'SCOPE'|'SOLUTION'|'COMPETITOR'|'OTHER';

export type DocumentExtraction = {
  id: number; document_id: number; document_name: string; opportunity_id: number; mode: string;
  status: "PENDING_REVIEW" | "APPLIED" | "REJECTED"; fields: ExtractedField[]; created_at: string;
  items: ProposedItem[]; unmatched: string[]; solution_status: "NONE" | "PENDING" | "CREATED" | "SKIPPED";
};

const TECH_KEYS: DocFieldKey[] = ["technical_approach", "architecture", "effort", "tech_risks"];

function uploadDir(): string {
  const db = process.env.SMS_DB_PATH;
  const base = db && db !== ":memory:" ? path.dirname(db) : path.join(process.cwd(), "data");
  return process.env.SMS_UPLOAD_DIR ?? path.join(base, "uploads");
}

function requireUser(actor: Actor) {
  assert(actor.type === "USER", "Chỉ người dùng mới được thực hiện thao tác này");
  return actor;
}

export function listOpportunityDocuments(opportunityId: number): OpportunityDocument[] {
  return all<OpportunityDocument>(
    `SELECT d.id, d.name, d.file_size, d.version_no, d.created_at, d.document_kind, l.solution_id, u.name AS uploader_name
     FROM documents d
     JOIN document_links l ON l.document_id = d.id AND l.entity_type = 'opportunity'
     LEFT JOIN users u ON u.id = d.created_by
     WHERE l.entity_id = ? ORDER BY d.id DESC`,
    opportunityId,
  );
}

export function saveOpportunityDocument(actor: Actor, opportunityId: number, file: { name: string; bytes: Buffer },options:{kind?:DocumentKind;solutionId?:number}={}): number {
  const user = requireUser(actor);
  assert(can(user.role,'document.write'),'Không có quyền tải tài liệu');
  assertActorAccess(actor, "opportunity", opportunityId);
  assert(['SURVEY','SCOPE','SOLUTION','COMPETITOR','OTHER'].includes(options.kind ?? 'OTHER'),'Loại tài liệu không hợp lệ');
  if(options.solutionId) {
    assert(can(user.role,'opp.solution'),'Chỉ người có quyền hồ sơ kỹ thuật được gắn tài liệu giải pháp');
    assert(get('SELECT id FROM solutions WHERE id=? AND opportunity_id=?',options.solutionId,opportunityId),'Hồ sơ giải pháp không thuộc cơ hội này');
  }
  const name = path.basename(file.name.replace(/\\/g, "/")).trim();
  const ext = path.extname(name).toLowerCase();
  const type = FILE_TYPES[ext];
  assert(type, "Chỉ nhận tệp Word (.docx) hoặc PDF");
  assert(file.bytes.length > 0, "Tệp rỗng");
  assert(file.bytes.length <= MAX_DOCUMENT_BYTES, "Tệp vượt quá 5 MB");
  assert(file.bytes.subarray(0, type.magic.length).toString("latin1") === type.magic, "Nội dung tệp không đúng định dạng");

  const dir = uploadDir();
  mkdirSync(dir, { recursive: true });
  const stored = `${randomUUID()}${ext}`;
  writeFileSync(path.join(dir, stored), file.bytes);

  const previous = get<{ id: number; version_no: number }>(
    `SELECT d.id, d.version_no FROM documents d
     JOIN document_links l ON l.document_id = d.id AND l.entity_type = 'opportunity'
     WHERE l.entity_id = ? AND d.name = ? ORDER BY d.version_no DESC LIMIT 1`,
    opportunityId, name,
  );
  return tx(() => {
    const { id } = run(
      `INSERT INTO documents (name, file_path, file_size, mime_type, version_no, previous_version_id, checksum, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      name, stored, file.bytes.length, type.mime, (previous?.version_no ?? 0) + 1, previous?.id ?? null,
      createHash("sha256").update(file.bytes).digest("hex"), user.id,
    );
    run("INSERT INTO document_links (document_id, entity_type, entity_id) VALUES (?, 'opportunity', ?)", id, opportunityId);
    run('UPDATE documents SET document_kind=? WHERE id=?',options.kind ?? (options.solutionId?'SOLUTION':'OTHER'),id);
    if(options.solutionId) run("UPDATE document_links SET solution_id=? WHERE document_id=? AND entity_type='opportunity' AND entity_id=?",options.solutionId,id,opportunityId);
    audit(actor, "opportunity", opportunityId, "DOCUMENT_UPLOAD", { details: { document_id: id, name } });
    return id;
  });
}

export function readDocumentFile(actor: Actor, documentId: number) {
  assertActorAccess(actor, "document", documentId);
  const d = get<{ name: string; file_path: string; mime_type: string | null }>(
    "SELECT name, file_path, mime_type FROM documents WHERE id = ?", documentId,
  );
  assert(d, "Không tìm thấy tài liệu");
  // file_path do hệ thống sinh, basename để chắc chắn không ra ngoài thư mục lưu.
  return { name: d.name, mime: d.mime_type ?? "application/octet-stream", bytes: readFileSync(path.join(uploadDir(), path.basename(d.file_path))) };
}

/** Gỡ tài liệu khỏi cơ hội. Tệp vẫn được giữ trong kho và nhật ký để hậu kiểm, không xóa vật lý. */
export function removeOpportunityDocument(actor: Actor, documentId: number) {
  requireUser(actor);
  assertActorAccess(actor, "document", documentId);
  const opportunityId = linkedOpportunity(documentId);
  const d = get<{ name: string; version_no: number }>("SELECT name, version_no FROM documents WHERE id = ?", documentId);
  tx(() => {
    run(
      "UPDATE document_extractions SET status='REJECTED', review_note='Tài liệu đã bị xóa khỏi cơ hội' WHERE document_id=? AND status='PENDING_REVIEW'",
      documentId,
    );
    run("DELETE FROM document_links WHERE document_id = ? AND entity_type = 'opportunity' AND entity_id = ?", documentId, opportunityId);
    audit(actor, "opportunity", opportunityId, "DOCUMENT_REMOVE", { details: { document_id: documentId, name: d?.name, version_no: d?.version_no } });
  });
}

function linkedOpportunity(documentId: number): number {
  const l = get<{ entity_id: number }>("SELECT entity_id FROM document_links WHERE document_id = ? AND entity_type = 'opportunity'", documentId);
  assert(l, "Tài liệu không gắn với cơ hội nào");
  return l.entity_id;
}

async function askAgent(actor: Actor & { type: "USER" }, documentId: number, fields: ExtractedField[], text: string): Promise<{ fields: ExtractedField[]; runId: number }> {
  const check = checkPreRunConstraints("OPPORTUNITY");
  if (!check.ok) throw new DomainError(check.reason || "Agent đang tạm dừng");
  const config = getActiveAgentConfig("OPPORTUNITY");
  const model = config?.model_reference || setting("llm_allowed_models").split(",")[0]?.trim() || "";
  const started = Date.now();
  const { id: runId } = run(
    `INSERT INTO ai_runs (agent, trigger, entity_type, entity_id, model, config_id, triggered_by, status, started_at)
     VALUES ('OPPORTUNITY','DOCUMENT_EXTRACT','document',?,?,?,?, 'RUNNING', datetime('now'))`,
    documentId, model, config?.id ?? null, actor.id,
  );
  try {
    const res = await getLlmProvider().chat(
      [{ role: "system", content: DOCUMENT_EXTRACT_SYSTEM }, { role: "user", content: documentExtractPrompt(fields, text) }],
      undefined,
      { model, maxTokens: 2000, temperature: 0, timeoutMs: 60000 },
    );
    run(
      `UPDATE ai_runs SET status='SUCCEEDED', summary='Đọc tài liệu', input_tokens=?, output_tokens=?, latency_ms=?, finished_at=datetime('now') WHERE id=?`,
      res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0, Date.now() - started, runId,
    );
    return { fields: mergeAiResult(fields, res.content, text), runId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    run("UPDATE ai_runs SET status='FAILED', error=?, latency_ms=?, finished_at=datetime('now') WHERE id=?", message, Date.now() - started, runId);
    throw new DomainError("Agent chưa đọc được tài liệu lúc này, vui lòng thử lại");
  }
}

/** Đọc tài liệu thành một đề xuất chờ duyệt. Không ghi vào hồ sơ cơ hội. */
export async function extractDocument(actor: Actor, documentId: number, opts: { useAi: boolean }): Promise<DocumentExtraction> {
  const user = requireUser(actor);
  assertActorAccess(actor, "document", documentId);
  const opportunityId = linkedOpportunity(documentId);
  const file = readDocumentFile(actor, documentId);
  const doc = file.name.toLowerCase().endsWith(".pdf") ? await readPdf(file.bytes) : readDocx(file.bytes);

  let fields = parseLabeledFields(doc);
  let mode = "FORM";
  let runId: number | null = null;
  if (opts.useAi && missingFields(fields).length) {
    const r = await askAgent(user, documentId, fields, documentFullText(doc));
    fields = r.fields;
    runId = r.runId;
    mode = fields.some((f) => f.source === "AI") ? "FORM+AI" : "FORM";
  }

  const o = getOpportunity(opportunityId);
  const catalog = all<CatalogProduct>(
    `SELECT p.id, p.code, p.name, p.type, COALESCE(i.unit_price, 0) AS unit_price
     FROM products p LEFT JOIN price_list_items i ON i.product_id = p.id AND i.price_list_id = ?`,
    o?.price_list_id ?? null,
  );
  const { items, unmatched } = matchCatalogItems(fields, catalog);
  fields = validateFields(fields, items.reduce((sum, i) => sum + (i.quantity ?? 0) * i.unit_price, 0));

  const id = tx(() => {
    run(
      "UPDATE document_extractions SET status='REJECTED', review_note='Thay bằng lần đọc mới' WHERE opportunity_id=? AND status='PENDING_REVIEW'",
      opportunityId,
    );
    const r = run(
      "INSERT INTO document_extractions (document_id, opportunity_id, mode, run_id, fields_json, items_json, unmatched_json, created_by) VALUES (?,?,?,?,?,?,?,?)",
      documentId, opportunityId, mode, runId, JSON.stringify(fields), JSON.stringify(items), JSON.stringify(unmatched), user.id,
    );
    audit(actor, "opportunity", opportunityId, "DOCUMENT_EXTRACT", {
      details: { document_id: documentId, mode, missing: missingFields(fields).map((f) => f.key) },
    });
    return r.id;
  });
  return getExtraction(id)!;
}

type ExtractionRow = Omit<DocumentExtraction, "fields" | "items" | "unmatched"> & { fields_json: string; items_json: string; unmatched_json: string };
const EXTRACTION_SELECT = `SELECT e.id, e.document_id, d.name AS document_name, e.opportunity_id, e.mode, e.status, e.fields_json, e.items_json, e.unmatched_json, e.solution_status, e.created_at
  FROM document_extractions e JOIN documents d ON d.id = e.document_id`;
const toExtraction = ({ fields_json, items_json, unmatched_json, ...r }: ExtractionRow): DocumentExtraction => ({
  ...r,
  fields: JSON.parse(fields_json) as ExtractedField[],
  items: JSON.parse(items_json) as ProposedItem[],
  unmatched: JSON.parse(unmatched_json) as string[],
});

export function getExtraction(id: number): DocumentExtraction | undefined {
  const r = get<ExtractionRow>(`${EXTRACTION_SELECT} WHERE e.id = ?`, id);
  return r && toExtraction(r);
}

export function pendingExtraction(opportunityId: number): DocumentExtraction | undefined {
  const r = get<ExtractionRow>(`${EXTRACTION_SELECT} WHERE e.opportunity_id = ? AND e.status = 'PENDING_REVIEW' ORDER BY e.id DESC LIMIT 1`, opportunityId);
  return r && toExtraction(r);
}

function pendingForReview(actor: Actor, extractionId: number): DocumentExtraction {
  requireUser(actor);
  const e = getExtraction(extractionId);
  assert(e, "Không tìm thấy kết quả đọc tài liệu");
  assertActorAccess(actor, "opportunity", e.opportunity_id);
  assert(e.status === "PENDING_REVIEW", "Kết quả này đã được xử lý");
  return e;
}

/** Chỉ thêm dòng chưa có (không phân biệt hoa thường), để xác nhận lại cùng tệp không làm lặp nội dung. */
function appendNewLines(existing: string | null, added: string, separator: string): string {
  const key = (line: string) => line.trim().toLowerCase();
  const seen = new Set((existing ?? "").split("\n").map(key));
  const fresh = added.split("\n").filter((line) => key(line) && !seen.has(key(line)));
  return [existing, fresh.join("\n")].filter(Boolean).join(separator);
}

/** Người dùng xác nhận (có thể sửa) từng ô, chỉ khi đó dữ liệu mới vào hồ sơ. Ô để trống thì bỏ qua. */
export function applyExtraction(
  actor: Actor,
  extractionId: number,
  values: Partial<Record<DocFieldKey, string>>,
  items: { product_id: number; quantity: number }[] = [],
): { solution: "NONE" | "PENDING" | "CREATED" } {
  const e = pendingForReview(actor, extractionId);
  const v = (k: DocFieldKey) => values[k]?.trim() || "";
  const o = getOpportunity(e.opportunity_id);
  assert(o, "Không tìm thấy cơ hội");

  let budget: number | undefined;
  if (v("budget")) {
    const parsed = parseVndAmount(v("budget"));
    if (parsed === null) throw new DomainError("Ngân sách không đọc được thành số tiền, vui lòng sửa lại");
    budget = parsed;
  }
  const scopeKeys: DocFieldKey[] = ["scope", "modules", "user_count", "term", "integration", "constraints", "timeline"];
  const label = (k: DocFieldKey) => DOC_FIELDS.find((f) => f.key === k)!.label;
  const scopeText = scopeKeys.filter((k) => v(k)).map((k) => `${label(k)}: ${v(k)}`).join("\n");

  for (const item of items) {
    assert(e.items.some((i) => i.product_id === item.product_id), "Sản phẩm không thuộc kết quả đọc tệp");
    assert(Number.isInteger(item.quantity) && item.quantity > 0, "Số lượng sản phẩm phải là số nguyên lớn hơn 0");
  }
  const hasTech = TECH_KEYS.some((k) => v(k));
  const canSolution = actor.type === "USER" && can(actor.role, "opp.solution");
  const edited = e.fields.map((f) => ({ ...f, value: values[f.key] !== undefined ? v(f.key) || null : f.value }));

  return tx(() => {
    for (const item of items) {
      const exists = get("SELECT id FROM opportunity_items WHERE opportunity_id = ? AND product_id = ?", o.id, item.product_id);
      if (!exists) addOpportunityItem(actor, o.id, item);
    }
    const technicalApplied=hasTech && canSolution ? createSolutionFromValues(actor,o.id,e,v) : false;
    if (v("need") || budget !== undefined) {
      updateOpportunity(actor, o.id, { ...(v("need") ? { customer_need: v("need") } : {}), ...(budget !== undefined ? { budget } : {}) });
    }
    if (scopeText || v("services")) {
      const existing = getScopeDocument(o.id);
      if (existing) {
        const content = appendNewLines(existing.content, scopeText, "\n\n");
        const deliverables = appendNewLines(existing.deliverables, v("services"), "\n");
        if (content !== (existing.content ?? "") || deliverables !== (existing.deliverables ?? "")) {
          updateScopeDocument(actor, existing.id, { content, deliverables: deliverables || undefined });
        }
      } else {
        createScopeDocument(actor, o.id, { title: `Phạm vi theo ${e.document_name}`, content: scopeText, deliverables: v("services") || undefined });
      }
    }
    const solution = !hasTech ? "NONE" : technicalApplied ? "CREATED" : "PENDING";
    run(
      "UPDATE document_extractions SET status='APPLIED', solution_status=?, fields_json=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?",
      solution, JSON.stringify(edited), actor.type === "USER" ? actor.id : null, e.id,
    );
    audit(actor, "opportunity", o.id, "DOCUMENT_EXTRACT_APPLY", { details: { extraction_id: e.id, items: items.length, solution } });
    return { solution };
  });
}

function createSolutionFromValues(actor: Actor, opportunityId: number, e: DocumentExtraction, v: (k: DocFieldKey) => string,replaceId?:number):boolean {
  const effort = v("effort").match(/\d+/);
  const input = {
    title: v("modules") ? `Giải pháp ${v("modules")}` : `Giải pháp theo ${e.document_name}`,
    technical_approach: v("technical_approach") || undefined,
    architecture: v("architecture") || undefined,
    estimated_effort_mandays: effort ? Number(effort[0]) : undefined,
    integration_required: Boolean(v("integration")) && !/^(khong|khong co)$/.test(v("integration").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
    risks: v("tech_risks") || undefined,
  };
  // Hồ sơ giống hệt bản đã có thì không tạo thêm, nên cũng không làm mất kết quả duyệt chuyên môn.
  const existing=listSolutions(opportunityId);
  const duplicate = existing.some((s) =>
    s.title === input.title
    && (s.technical_approach ?? "") === (input.technical_approach ?? "")
    && (s.architecture ?? "") === (input.architecture ?? "")
    && s.estimated_effort_mandays === (input.estimated_effort_mandays ?? 0)
    && Boolean(s.integration_required) === input.integration_required
    && (s.risks ?? "") === (input.risks ?? ""));
  if(duplicate) return true;
  if(replaceId) {
    assert(existing.some(s=>s.id===replaceId),'Hồ sơ thay thế phải thuộc cùng cơ hội');
    updateSolution(actor,replaceId,{...input,technical_approach:input.technical_approach ?? '',architecture:input.architecture ?? '',risks:input.risks ?? '',estimated_effort_mandays:input.estimated_effort_mandays ?? 0});
    return true;
  }
  if(existing.length) return false;
  createSolution(actor,opportunityId,input);
  return true;
}

/** Hồ sơ kỹ thuật do NVKD chuyển từ tệp, chờ tư vấn giải pháp xác nhận. */
export function pendingSolutionExtraction(opportunityId: number): (DocumentExtraction & {existingSolutionIds:number[];requiresChoice:boolean}) | undefined {
  const r = get<ExtractionRow>(`${EXTRACTION_SELECT} WHERE e.opportunity_id = ? AND e.solution_status = 'PENDING' ORDER BY e.id DESC LIMIT 1`, opportunityId);
  const ids=listSolutions(opportunityId).map(s=>s.id);
  return r && {...toExtraction(r),existingSolutionIds:ids,requiresChoice:ids.length>0};
}

export function applySolutionExtraction(actor: Actor, extractionId: number, values: Partial<Record<DocFieldKey, string>>,choice?:{action:'SKIP'|'REPLACE';solutionId?:number}) {
  const user=requireUser(actor);
  assert(can(user.role,'opp.solution'),'Không có quyền xác nhận hồ sơ kỹ thuật');
  const e = getExtraction(extractionId);
  assert(e, "Không tìm thấy kết quả đọc tài liệu");
  assertActorAccess(actor, "opportunity", e.opportunity_id);
  assert(e.solution_status === "PENDING", "Hồ sơ kỹ thuật này đã được xử lý");
  const stored = (k: DocFieldKey) => e.fields.find((f) => f.key === k)?.value ?? "";
  const v = (k: DocFieldKey) => (values[k] !== undefined ? values[k]!.trim() : stored(k));
  tx(() => {
    if(choice?.action==='SKIP') {
      run("UPDATE document_extractions SET solution_status='SKIPPED' WHERE id=?",e.id);
      audit(actor,'opportunity',e.opportunity_id,'DOCUMENT_SOLUTION_SKIP',{details:{extraction_id:e.id}});
      return;
    }
    if(choice?.action==='REPLACE') assert(choice.solutionId,'Chọn hồ sơ cần thay thế');
    assert(createSolutionFromValues(actor, e.opportunity_id, e, v,choice?.solutionId),'Đã có hồ sơ kỹ thuật; chọn bỏ qua hoặc thay thế một hồ sơ cụ thể');
    run("UPDATE document_extractions SET solution_status='CREATED' WHERE id=?", e.id);
    audit(actor, "opportunity", e.opportunity_id, "DOCUMENT_SOLUTION_APPLY", { details: { extraction_id: e.id } });
  });
}

export function rejectExtraction(actor: Actor, extractionId: number) {
  const e = pendingForReview(actor, extractionId);
  tx(() => {
    run("UPDATE document_extractions SET status='REJECTED', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?", actor.type === "USER" ? actor.id : null, e.id);
    audit(actor, "opportunity", e.opportunity_id, "DOCUMENT_EXTRACT_REJECT", { details: { extraction_id: e.id } });
  });
}
