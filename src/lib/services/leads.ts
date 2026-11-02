import { scoreBant, disqualifyLeadWithReason, convertLeadToOpportunity } from "./qualification";
import { assertActorAccess } from "./access";
// Giai đoạn QUALIFY: tạo/chuẩn hóa Lead, kiểm tra trùng, BANT, chuyển đổi hoặc loại có lý do (WP-01 & WP-03).
import { all, get, run, tx } from "../db";
import {
  assert,
  emailDomain,
  normalizeCompany,
  normalizeEmail,
  normalizePhone,
  type BantKey,
} from "../domain";
import { maps } from "../integrations";
import { actorUserId, audit, settingNumber, type Actor } from "./core";
import { findDuplicates, type DuplicateHit } from "./dedupe";
import { findOrCreateAccount } from "./accounts";
import { findOrCreateContact } from "./contacts";
import { emitEvent } from "../events";
import type { UserScope } from "../scope";
import { recordVisible } from "./access";
import {bantQualified} from '../bant-policy';
import {requireVietnamAddress} from './address-validation';

export type { DuplicateHit };
export { findDuplicates, findOrCreateAccount, findOrCreateContact };

export type LeadRating = "HOT" | "WARM" | "COLD";

export type Lead = {
  id: number;
  company_name: string;
  company_norm: string;
  contact_name: string;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_normalized: string | null;
  source: string;
  industry: string | null;
  notes: string | null;
  topic: string | null;
  status: "OPEN" | "WORKING" | "CONVERTED" | "DISQUALIFIED";
  rating: LeadRating | null;
  account_id: number | null;
  contact_id: number | null;
  deleted_at: string | null;
  merged_into_lead_id: number | null;
  bant_budget: number;
  bant_authority: number;
  bant_need: number;
  bant_timeline: number;
  bant_score: number;
  bant_notes: string | null;
  duplicate_flag: number;
  disqualify_reason: string | null;
  owner_id: number | null;
  owner_name?: string | null;
  converted_account_id: number | null;
  converted_contact_id: number | null;
  converted_opportunity_id: number | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
};

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type LeadInput = {
  company_name: string;
  contact_name: string;
  contact_title?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  source?: string;
  industry?: string | null;
  notes?: string | null;
  topic?: string | null;
  owner_id?: number | null;
  account_id?: number | null;
  contact_id?: number | null;
  tag_ids?: number[];
};

/**
 * FR-10 & BR-02: Tính toán mức phân loại khách hàng tiềm năng.
 * - NÓNG: đạt chuẩn BR-01 (tổng BANT >= 60 và authority > 0) và mua trong tháng hoặc cuối quý (timeline >= 18).
 * - ẤM: tổng BANT 40-59, hoặc đạt chuẩn nhưng mua năm sau.
 * - LẠNH: tổng BANT < 40 hoặc chưa rõ nhu cầu.
 */
export function calculateLeadRating(lead: {
  bant_score?: number;
  bant_authority?: number;
  bant_timeline?: number;
  bant_need?: number;
}): LeadRating {
  const score = lead.bant_score ?? 0;
  const authority = lead.bant_authority ?? 0;
  const timeline = lead.bant_timeline ?? 0;
  const need = lead.bant_need ?? 0;

  const threshold = settingNumber("bant_threshold");
  const warmMin = settingNumber("lead_rating_warm_min");

  if (bantQualified(score,authority,threshold) && timeline===25) {
    return "HOT";
  }

  if (score >= warmMin && need > 0) {
    return "WARM";
  }

  return "COLD";
}

/**
 * FR-04: Danh sách và tìm kiếm lọc Lead đa tiêu chí.
 */
export function listLeads(filter: {
  status?: string;
  source?: string;
  owner_id?: number;
  rating?: string;
  tag_id?: number;
  q?: string;
  view?: string; // "trash" để xem hồ sơ đã xoá mềm
  user?: UserScope;
} = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  // Lọc theo trạng thái xoá mềm (FR-05, FR-18)
  if (filter.view === "trash") {
    where.push("l.deleted_at IS NOT NULL");
  } else {
    where.push("l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL");
  }

  if (filter.status && filter.status !== "all") {
    where.push("l.status = ?");
    params.push(filter.status);
  }
  if (filter.source) {
    where.push("l.source = ?");
    params.push(filter.source);
  }
  if (filter.owner_id) {
    where.push("l.owner_id = ?");
    params.push(filter.owner_id);
  }
  if (filter.rating) {
    where.push("l.rating = ?");
    params.push(filter.rating);
  }
  if (filter.tag_id) {
    where.push("EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = ?)");
    params.push(filter.tag_id);
  }

  if (filter.q) {
    where.push("(l.company_norm LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.topic LIKE ?)");
    params.push(`%${normalizeCompany(filter.q)}%`, `%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }

  const leads = all<Lead>(
    `SELECT l.*, u.name AS owner_name FROM leads l
     LEFT JOIN users u ON u.id = l.owner_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY l.updated_at DESC, l.id DESC`,
    ...params,
  );

  return leads.filter(r=>!filter.user || recordVisible(filter.user,'lead',r.id));
}

export function getLead(id: number, user?: UserScope): Lead | undefined {
  if(user && !recordVisible(user,'lead',id)) return undefined;
  const lead = get<Lead>(
    "SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE l.id = ?",
    id,
  );
  if (!lead) return undefined;

  // Lấy danh sách tags gắn với lead
  lead.tags = all<Tag>(
    `SELECT t.* FROM tags t
     JOIN lead_tags lt ON lt.tag_id = t.id
     WHERE lt.lead_id = ?`,
    id,
  );

  return lead;
}

/**
 * FR-01 & FR-11: Tạo Lead thủ công, tự động điền khi chọn Account hoặc Contact có sẵn.
 */
export function createLead(actor: Actor, input: LeadInput): number {
  requireVietnamAddress(input.address);
  let companyName = input.company_name?.trim();
  let contactName = input.contact_name?.trim();
  let email = normalizeEmail(input.email);
  let phone = normalizePhone(input.phone);
  let address = input.address?.trim() || null;
  let industry = input.industry?.trim() || null;

  // FR-11: Tự động điền nếu có account_id
  if (input.account_id) {
    const acc = get<{ name: string; address: string | null; industry: string | null }>(
      "SELECT name, address, industry FROM accounts WHERE id = ?",
      input.account_id,
    );
    if (acc) {
      if (!companyName) companyName = acc.name;
      if (!address) address = acc.address;
      if (!industry) industry = acc.industry;
    }
  }

  // FR-11: Tự động điền nếu có contact_id
  if (input.contact_id) {
    const con = get<{ full_name: string; title: string | null; email: string | null; phone: string | null }>(
      "SELECT full_name, title, email, phone FROM contacts WHERE id = ?",
      input.contact_id,
    );
    if (con) {
      if (!contactName) contactName = con.full_name;
      if (!email && con.email) email = normalizeEmail(con.email);
      if (!phone && con.phone) phone = normalizePhone(con.phone);
      if (!input.contact_title && con.title) input.contact_title = con.title;
    }
  }

  assert(companyName, "Thiếu tên công ty");
  assert(contactName, "Thiếu tên người liên hệ");
  assert(!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "Email không hợp lệ");

  // FR-12: Chuẩn hoá địa chỉ
  const addr = address ? maps.normalizeAddress(address) : null;

  // FR-16: Kiểm tra trùng
  const dups = findDuplicates({ company_name: companyName, email, phone });

  // FR-10: Tính mức phân loại ban đầu
  const initialRating = calculateLeadRating({
    bant_score: 0,
    bant_authority: 0,
    bant_timeline: 0,
    bant_need: 0,
  });

  return tx(() => {
    const { id } = run(
      `INSERT INTO leads (company_name, company_norm, contact_name, contact_title, email, phone, address, address_normalized,
         source, industry, notes, topic, owner_id, account_id, contact_id, rating, duplicate_flag, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      companyName,
      normalizeCompany(companyName),
      contactName,
      input.contact_title?.trim() || null,
      email,
      phone,
      address,
      addr?.normalized ?? null,
      input.source ?? "MANUAL",
      industry,
      input.notes?.trim() || null,
      input.topic?.trim() || null,
      input.owner_id ?? actorUserId(actor),
      input.account_id ?? null,
      input.contact_id ?? null,
      initialRating,
      dups.length ? 1 : 0,
      actorUserId(actor),
    );

    // Gắn nhãn nếu có (FR-07)
    if (input.tag_ids && input.tag_ids.length > 0) {
      for (const tid of input.tag_ids) {
        run("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)", id, tid);
      }
    }

    audit(actor, "lead", id, "CREATE", { to: "OPEN", details: { duplicates: dups } });
    emitEvent('lead.created',{leadId:id,actorUserId:actorUserId(actor)});
    return id;
  });
}

const EDITABLE = [
  "company_name",
  "contact_name",
  "contact_title",
  "email",
  "phone",
  "address",
  "industry",
  "notes",
  "topic",
  "owner_id",
  "account_id",
  "contact_id",
  "rating",
] as const;

export function updateLead(actor: Actor, id: number, input: Partial<LeadInput>) {
  if('address' in input) requireVietnamAddress(input.address);
  assertActorAccess(actor, "lead", id);
  const lead = getLead(id);
  assert(lead, "Không tìm thấy Lead");
  assert(lead.status !== "CONVERTED", "Lead đã chuyển đổi, không sửa được");

  const next: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in input) next[k] = input[k as keyof LeadInput] ?? null;
  if ("email" in next) next.email = normalizeEmail(next.email as string);
  if ("phone" in next) next.phone = normalizePhone(next.phone as string);
  if ("company_name" in next) next.company_norm = normalizeCompany(String(next.company_name));
  if ("address" in next) next.address_normalized = next.address ? maps.normalizeAddress(String(next.address)).normalized : null;

  const keys = Object.keys(next);
  if (!keys.length && !input.tag_ids) return;

  tx(() => {
    if (keys.length > 0) {
      run(
        `UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
        ...keys.map((k) => next[k] as string | number | null),
        id,
      );
      const dups = findDuplicates(
        {
          company_name: String(next.company_name ?? lead.company_name),
          email: (next.email as string) ?? lead.email,
          phone: (next.phone as string) ?? lead.phone,
        },
        id,
      );
      run("UPDATE leads SET duplicate_flag = ? WHERE id = ?", dups.length ? 1 : 0, id);
      audit(actor, "lead", id, "UPDATE", { details: { fields: keys } });
    }

    if (input.tag_ids) {
      run("DELETE FROM lead_tags WHERE lead_id = ?", id);
      for (const tid of input.tag_ids) {
        run("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)", id, tid);
      }
    }
  });
}

/**
 * FR-05: Xoá mềm Lead (chuyển sang trạng thái Đã xoá).
 */
export function softDeleteLead(actor: Actor, id: number) {
  assertActorAccess(actor, "lead", id);
  const lead = getLead(id);
  assert(lead, "Không tìm thấy Lead");
  assert(!lead.deleted_at, "Lead này đã nằm trong thùng rác");

  tx(() => {
    run("UPDATE leads SET deleted_at = datetime('now') WHERE id = ?", id);
    audit(actor, "lead", id, "DELETE_SOFT", { from: lead.status, to: "DELETED" });
  });
}

/**
 * FR-18: Khôi phục Lead đã xoá mềm.
 */
export function restoreLead(actor: Actor, id: number) {
  assertActorAccess(actor, "lead", id);
  const lead = getLead(id);
  assert(lead, "Không tìm thấy Lead");
  assert(lead.deleted_at, "Lead này không nằm trong thùng rác");

  tx(() => {
    run("UPDATE leads SET deleted_at = NULL WHERE id = ?", id);
    audit(actor, "lead", id, "RESTORE", { from: "DELETED", to: lead.status });
  });
}

/**
 * FR-07: Quản lý nhãn (Tags) gắn với Lead.
 */
export function addLeadTags(leadId: number, tagIds: number[]) {
  tx(() => {
    for (const tid of tagIds) {
      run("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)", leadId, tid);
    }
  });
}

export function removeLeadTag(leadId: number, tagId: number) {
  run("DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?", leadId, tagId);
}

export function setLeadTags(leadId: number, tagIds: number[]) {
  tx(() => {
    run("DELETE FROM lead_tags WHERE lead_id = ?", leadId);
    for (const tid of tagIds) {
      run("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)", leadId, tid);
    }
  });
}

export function listTags(): Tag[] {
  return all<Tag>("SELECT * FROM tags ORDER BY name");
}

/**
 * FR-03: Xem trước dữ liệu nhập hàng loạt từ tệp CSV (Preview).
 */
export type ImportPreviewRow = {
  rowNumber: number;
  data: LeadInput;
  valid: boolean;
  isValid: boolean;
  errors: string[];
  duplicateHits: DuplicateHit[];
};

export function parseCsvText(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export function previewLeadImport(input: Record<string, string>[] | string): {
  rows: ImportPreviewRow[];
  total: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
} {
  const records = typeof input === "string" ? parseCsvText(input) : input;
  const rows: ImportPreviewRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;

  records.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    const errors: string[] = [];

    const company_name = (raw.company_name || raw["Tên công ty"] || raw["Công ty"] || "").trim();
    const contact_name = (raw.contact_name || raw["Họ tên"] || raw["Người liên hệ"] || "").trim();
    const email = normalizeEmail(raw.email || raw["Email"] || null);
    const phone = normalizePhone(raw.phone || raw["Số điện thoại"] || raw["SĐT"] || null);
    const address = (raw.address || raw["Địa chỉ"] || "").trim() || null;
    const topic = (raw.topic || raw["Nhu cầu"] || raw["Chủ đề"] || "").trim() || null;
    const source = (raw.source || raw["Nguồn"] || "IMPORT").trim();
    const notes = (raw.notes || raw["Ghi chú"] || "").trim() || null;

    if (!company_name) errors.push("Thiếu tên công ty");
    if (!contact_name) errors.push("Thiếu tên người liên hệ");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Email không hợp lệ");

    const dups = company_name ? findDuplicates({ company_name, email, phone }) : [];
    if (dups.length > 0) duplicateCount++;

    const valid = errors.length === 0;
    if (valid) validCount++;

    rows.push({
      rowNumber,
      data: {
        company_name,
        contact_name,
        email,
        phone,
        address,
        topic,
        source,
        notes,
      },
      valid,
      isValid: valid,
      errors,
      duplicateHits: dups,
    });
  });

  return {
    rows,
    total: records.length,
    validCount,
    errorCount: records.length - validCount,
    duplicateCount,
  };
}

/**
 * FR-03: Thực thi nhập Lead hàng loạt từ tệp.
 * Phát sự kiện lead.imported kích hoạt Agent (theo thỏa thuận hợp đồng).
 */
export function executeLeadImport(actor: Actor, validRows: LeadInput[]): { importedIds: number[]; count: number; imported: number } {
  return tx(() => {
    const importedIds: number[] = [];

    for (const r of validRows) {
      const id = createLead(actor, {
        ...r,
        source: r.source || "IMPORT",
      });
      importedIds.push(id);
    }

    // Phát sự kiện lead.imported
    emitEvent("lead.imported", {
      leadIds: importedIds,
      count: importedIds.length,
      actorUserId: actorUserId(actor),
    });

    return { importedIds, count: importedIds.length, imported: importedIds.length };
  });
}

export function updateBant(actor: Actor, id: number, scores: Record<BantKey, number>, notes: string | null) {
  return scoreBant(actor,id,{...scores,notes:notes ?? undefined}).totalScore;
}

export function disqualifyLead(actor: Actor, id: number, reason: string) {
  return disqualifyLeadWithReason(actor,id,reason);
}

export function reactivateLead(actor: Actor, id: number, reason: string) {
  assertActorAccess(actor, "lead", id);
  const lead = getLead(id);
  assert(lead, "Không tìm thấy Lead");
  assert(lead.status === "DISQUALIFIED", "Chỉ tái kích hoạt Lead đã loại");
  tx(() => {
    run("UPDATE leads SET status='WORKING', updated_at=datetime('now') WHERE id=?", id);
    audit(actor, "lead", id, "REACTIVATE", { from: "DISQUALIFIED", to: "WORKING", reason });
  });
}

export function conversionCandidates(lead: Lead) {
  const domain = emailDomain(lead.email);
  const accounts = all<{ id: number; name: string; reason: string }>(
    `SELECT id, name, CASE WHEN name_norm = ? THEN 'trùng tên' ELSE 'trùng tên miền email' END AS reason
     FROM accounts WHERE name_norm = ? OR (? IS NOT NULL AND email_domain = ?)`,
    lead.company_norm,
    lead.company_norm,
    domain,
    domain,
  );
  const contacts = all<{ id: number; full_name: string; account_id: number; account_name: string }>(
    `SELECT c.id, c.full_name, c.account_id, a.name AS account_name FROM contacts c JOIN accounts a ON a.id = c.account_id
     WHERE (? IS NOT NULL AND c.email = ?) OR (? IS NOT NULL AND c.phone = ?)`,
    lead.email,
    lead.email,
    lead.phone,
    lead.phone,
  );
  return { accounts, contacts };
}

export type ConvertInput = {
  accountId?: number | null;
  contactId?: number | null;
  ownerId: number;
  opportunityName?: string;
  amount?: number;
  closeDate?: string | null;
};

export function convertLead(actor: Actor, id: number, input: ConvertInput) {
  return convertLeadToOpportunity(actor,id,input);
}

export function bulkConvert(actor: Actor, ids: number[], ownerId: number) {
  assert(actor.type === "USER", "Chuyển đổi hàng loạt phải do nhân viên kích hoạt");
  const results: { id: number; ok: boolean; message: string }[] = [];
  for (const id of ids) {
    try {
      const lead = getLead(id);
      assert(lead, "Không tìm thấy");
      const cand = conversionCandidates(lead);
      const accountId = cand.accounts[0]?.id ?? null;
      const contactId = cand.contacts.find((c) => c.account_id === accountId)?.id ?? null;
      const r = convertLead(actor, id, { accountId, contactId, ownerId });
      results.push({ id, ok: true, message: `Đã tạo Opportunity #${r.opportunityId}` });
    } catch (e) {
      results.push({ id, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
