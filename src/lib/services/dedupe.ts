// Dịch vụ phát hiện và xử lý trùng lặp hồ sơ (FR-16, FR-17, BR-21, DEC-04).
import { all, get, run, tx } from "../db";
import { assert, emailDomain, normalizeCompany, normalizeEmail, normalizePhone } from "../domain";
import { actorUserId, audit, type Actor } from "./core";

export type DuplicateHit = {
  kind: "LEAD" | "ACCOUNT" | "CONTACT";
  id: number;
  label: string;
  reason: string;
};

export type DuplicateInput = {
  company_name: string;
  email?: string | null;
  phone?: string | null;
  tax_code?: string | null;
};

/**
 * FR-16 & BR-21: Tự động kiểm tra trùng lặp.
 * Trùng khi: khớp email, hoặc khớp SĐT đã chuẩn hóa, hoặc khớp mã số thuế, hoặc tên công ty đã chuẩn hóa giống hệt.
 */
export function findDuplicates(input: DuplicateInput, excludeLeadId?: number): DuplicateHit[] {
  const hits: DuplicateHit[] = [];
  const norm = normalizeCompany(input.company_name);
  const mail = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const tax = input.tax_code?.trim() || null;
  const domain = emailDomain(input.email);

  // 1. Kiểm tra với bảng LEADS (chỉ xét các lead chưa xoá và chưa bị hợp nhất)
  const leads = all<{
    id: number;
    company_name: string;
    contact_name: string;
    email: string | null;
    phone: string | null;
    company_norm: string;
  }>(
    "SELECT id, company_name, contact_name, email, phone, company_norm FROM leads WHERE id != ? AND deleted_at IS NULL AND merged_into_lead_id IS NULL",
    excludeLeadId ?? 0,
  );

  for (const l of leads) {
    const reasons: string[] = [];
    if (mail && l.email && normalizeEmail(l.email) === mail) reasons.push("trùng email");
    if (phone && l.phone && normalizePhone(l.phone) === phone) reasons.push("trùng số điện thoại");
    if (norm && l.company_norm === norm) reasons.push("trùng tên công ty");
    if (reasons.length) {
      hits.push({
        kind: "LEAD",
        id: l.id,
        label: `${l.company_name} – ${l.contact_name}`,
        reason: reasons.join(", "),
      });
    }
  }

  // 2. Kiểm tra với bảng ACCOUNTS
  const accounts = all<{
    id: number;
    name: string;
    name_norm: string;
    email_domain: string | null;
    tax_code: string | null;
  }>("SELECT id, name, name_norm, email_domain, tax_code FROM accounts WHERE status = 'ACTIVE'");

  for (const a of accounts) {
    const reasons: string[] = [];
    if (tax && a.tax_code && a.tax_code.trim() === tax) reasons.push("trùng mã số thuế");
    if (norm && a.name_norm === norm) reasons.push("trùng tên công ty");
    if (domain && a.email_domain === domain) reasons.push("trùng tên miền email");
    if (reasons.length) {
      hits.push({
        kind: "ACCOUNT",
        id: a.id,
        label: a.name,
        reason: reasons.join(", "),
      });
    }
  }

  // 3. Kiểm tra với bảng CONTACTS
  if (mail || phone) {
    const contacts = all<{
      id: number;
      full_name: string;
      email: string | null;
      phone: string | null;
      account_name: string;
    }>("SELECT c.id, c.full_name, c.email, c.phone, a.name AS account_name FROM contacts c JOIN accounts a ON a.id = c.account_id");

    for (const c of contacts) {
      if ((mail && normalizeEmail(c.email) === mail) || (phone && normalizePhone(c.phone) === phone)) {
        hits.push({
          kind: "CONTACT",
          id: c.id,
          label: `${c.full_name} (${c.account_name})`,
          reason: "trùng email/SĐT liên hệ",
        });
      }
    }
  }

  return hits;
}

/**
 * FR-17: NVKD đề nghị hợp nhất hồ sơ trùng lặp.
 * Tạo bản ghi approvals (kind='MERGE') chờ QLKD duyệt (DEC-04).
 */
export function requestLeadMerge(
  actor: Actor,
  sourceLeadId: number,
  targetLeadId: number,
  reason: string,
) {
  assert(sourceLeadId !== targetLeadId, "Không thể hợp nhất một Lead vào chính nó");
  const source = get<{ id: number; company_name: string; status: string }>(
    "SELECT id, company_name, status FROM leads WHERE id = ? AND deleted_at IS NULL",
    sourceLeadId,
  );
  const target = get<{ id: number; company_name: string; status: string }>(
    "SELECT id, company_name, status FROM leads WHERE id = ? AND deleted_at IS NULL",
    targetLeadId,
  );
  assert(source, "Không tìm thấy Lead nguồn để hợp nhất");
  assert(target, "Không tìm thấy Lead đích để hợp nhất");

  return tx(() => {
    const payload = JSON.stringify({
      sourceLeadId,
      targetLeadId,
      sourceCompany: source.company_name,
      targetCompany: target.company_name,
    });

    const { id } = run(
      `INSERT INTO approvals (kind, entity_type, entity_id, status, reason, payload_json, requested_by)
       VALUES ('MERGE', 'lead', ?, 'PENDING', ?, ?, ?)`,
      sourceLeadId,
      reason.trim() || `Đề nghị hợp nhất Lead #${sourceLeadId} vào Lead #${targetLeadId}`,
      payload,
      actorUserId(actor),
    );

    audit(actor, "lead", sourceLeadId, "MERGE_REQUEST", {
      details: { targetLeadId, approvalId: id, reason },
    });

    return id;
  });
}

/**
 * FR-17 & DEC-04: Quản lý kinh doanh (SALES_MANAGER) duyệt hợp nhất hồ sơ trùng.
 */
export function approveLeadMerge(actor: Actor, approvalId: number, decisionComment?: string) {
  const approval = get<{
    id: number;
    kind: string;
    entity_id: number;
    status: string;
    payload_json: string | null;
    requested_by: number|null;
  }>("SELECT * FROM approvals WHERE id = ?", approvalId);

  assert(approval, "Không tìm thấy yêu cầu duyệt hợp nhất");
  assert(actor.type === 'USER' && actor.role === 'SALES_MANAGER','Chỉ Quản lý kinh doanh được duyệt hợp nhất');
  assert(actor.id !== approval.requested_by,'Người đề nghị không được tự duyệt hợp nhất');
  assert(approval.kind === "MERGE", "Yêu cầu không phải là duyệt hợp nhất");
  assert(approval.status === "PENDING", "Yêu cầu đã được xử lý");
  assert(approval.payload_json, "Dữ liệu hợp nhất không hợp lệ");

  const { sourceLeadId, targetLeadId } = JSON.parse(approval.payload_json) as {
    sourceLeadId: number;
    targetLeadId: number;
  };

  return tx(() => {
    // 1. Chuyển các hoạt động tương tác từ source sang target
    for(const table of ['email_messages','ai_suggestions','ai_runs','assignments','tasks']) {
      run(`UPDATE ${table} SET entity_id=? WHERE entity_type='lead' AND entity_id=?`,targetLeadId,sourceLeadId);
    }
    run('UPDATE lead_assessments SET lead_id=? WHERE lead_id=?',targetLeadId,sourceLeadId);
    run("UPDATE OR IGNORE document_links SET entity_id=? WHERE entity_type='lead' AND entity_id=?",targetLeadId,sourceLeadId);
    const sourceOpp=get<{id:number}>('SELECT id FROM opportunities WHERE lead_id=?',sourceLeadId);
    if(sourceOpp) {
      assert(!get('SELECT id FROM opportunities WHERE lead_id=?',targetLeadId),'Hai hồ sơ đều có cơ hội, cần xử lý liên kết trước khi hợp nhất');
      run('UPDATE opportunities SET lead_id=? WHERE id=?',targetLeadId,sourceOpp.id);
    }
    run(
      "UPDATE activities SET entity_id = ? WHERE entity_type = 'lead' AND entity_id = ?",
      targetLeadId,
      sourceLeadId,
    );

    // 2. Chuyển các tags sang target nếu chưa có
    const sourceTags = all<{ tag_id: number }>("SELECT tag_id FROM lead_tags WHERE lead_id = ?", sourceLeadId);
    for (const t of sourceTags) {
      run("INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)", targetLeadId, t.tag_id);
    }

    // 3. Đánh dấu source lead là đã gộp và loại bỏ
    run(
      `UPDATE leads SET merged_into_lead_id = ?, updated_at = datetime('now') WHERE id = ?`,
      targetLeadId,
      sourceLeadId,
    );

    // 4. Cập nhật bản ghi phê duyệt
    run(
      `UPDATE approvals SET status = 'APPROVED', decided_by = ?, decision_comment = ?, decided_at = datetime('now')
       WHERE id = ?`,
      actorUserId(actor),
      decisionComment || "Đồng ý hợp nhất hồ sơ",
      approvalId,
    );

    // 5. Ghi audit log
    audit(actor, "lead", targetLeadId, "MERGE_APPROVED", {
      details: { sourceLeadId, approvalId },
    });
    audit(actor, "lead", sourceLeadId, "MERGED", {
      details: { targetLeadId, approvalId },
    });

    return true;
  });
}

/**
 * FR-17: Từ chối yêu cầu hợp nhất.
 */
export function rejectLeadMerge(actor: Actor, approvalId: number, decisionComment: string) {
  assert(decisionComment?.trim(), "Vui lòng nhập lý do từ chối hợp nhất");
  const approval = get<{ id: number; kind: string; status: string }>(
    "SELECT * FROM approvals WHERE id = ?",
    approvalId,
  );
  assert(approval && approval.kind === "MERGE", "Không tìm thấy yêu cầu hợp nhất");
  assert(approval.status === "PENDING", "Yêu cầu đã được xử lý");

  return tx(() => {
    run(
      `UPDATE approvals SET status = 'REJECTED', decided_by = ?, decision_comment = ?, decided_at = datetime('now')
       WHERE id = ?`,
      actorUserId(actor),
      decisionComment.trim(),
      approvalId,
    );
    audit(actor, "approval", approvalId, "REJECT", { reason: decisionComment });
    return true;
  });
}
