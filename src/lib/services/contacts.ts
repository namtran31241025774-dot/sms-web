// Dịch vụ quản lý Người liên hệ (Contacts) và Lịch sử công tác (FR-09, FR-14, DEC-21).
import { all, get, run, tx } from "../db";
import { assert, normalizeEmail, normalizePhone } from "../domain";
import { audit, type Actor } from "./core";

export type Contact = {
  id: number;
  account_id: number;
  account_name?: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
};

export type Affiliation = {
  id: number;
  contact_id: number;
  account_id: number;
  account_name: string;
  job_title: string | null;
  valid_from: string;
  valid_to: string | null;
  is_current: number;
  created_at: string;
};

export type ContactInput = {
  account_id: number;
  full_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
};

export function listContacts(filter: { q?: string; accountId?: number } = {}) {
  const where: string[] = ["c.status = 'ACTIVE'"];
  const params: (string | number)[] = [];

  if (filter.accountId) {
    where.push("c.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.q) {
    where.push("(c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR a.name LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }

  return all<Contact>(
    `SELECT c.*, a.name AS account_name FROM contacts c
     JOIN accounts a ON a.id = c.account_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.is_primary DESC, c.full_name`,
    ...params,
  );
}

export function getContact(id: number) {
  return get<Contact>(
    `SELECT c.*, a.name AS account_name FROM contacts c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.id = ?`,
    id,
  );
}

export function getContactAffiliations(contactId: number): Affiliation[] {
  return all<Affiliation>(
    `SELECT af.*, a.name AS account_name FROM affiliations af
     JOIN accounts a ON a.id = af.account_id
     WHERE af.contact_id = ?
     ORDER BY af.is_current DESC, af.valid_from DESC`,
    contactId,
  );
}

export function createContact(actor: Actor, input: ContactInput): number {
  assert(input.full_name?.trim(), "Họ và tên người liên hệ không được để trống");
  assert(input.account_id, "Phải chọn doanh nghiệp liên kết");
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  if (email) {
    const dup = get("SELECT id FROM contacts WHERE email = ? AND status = 'ACTIVE'", email);
    assert(!dup, `Email ${email} đã được sử dụng cho một người liên hệ khác`);
  }

  return tx(() => {
    // Nếu đặt là primary, hủy primary của các contact khác trong cùng account
    if (input.is_primary) {
      run("UPDATE contacts SET is_primary = 0 WHERE account_id = ?", input.account_id);
    }

    const { id } = run(
      `INSERT INTO contacts (account_id, full_name, title, email, phone, is_primary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.account_id,
      input.full_name.trim(),
      input.title?.trim() || null,
      email,
      phone,
      input.is_primary ? 1 : 0,
    );

    // Tạo bản ghi affiliation đầu tiên (FR-14, DEC-21)
    run(
      `INSERT INTO affiliations (contact_id, account_id, job_title, valid_from, is_current)
       VALUES (?, ?, ?, datetime('now'), 1)`,
      id,
      input.account_id,
      input.title?.trim() || "Nhân sự",
    );

    audit(actor, "contact", id, "CREATE", { details: { name: input.full_name, accountId: input.account_id } });
    return id;
  });
}

export function updateContact(actor: Actor, id: number, input: Partial<ContactInput>) {
  const current = getContact(id);
  assert(current, "Không tìm thấy người liên hệ");

  const updates: Record<string, string | number | null> = {};
  if ("full_name" in input && input.full_name) updates.full_name = input.full_name.trim();
  if ("title" in input) updates.title = input.title?.trim() || null;
  if ("email" in input) updates.email = normalizeEmail(input.email);
  if ("phone" in input) updates.phone = normalizePhone(input.phone);
  if ("is_primary" in input) updates.is_primary = input.is_primary ? 1 : 0;

  const keys = Object.keys(updates);
  if (!keys.length) return;

  tx(() => {
    if (updates.is_primary === 1) {
      run("UPDATE contacts SET is_primary = 0 WHERE account_id = ? AND id != ?", current.account_id, id);
    }

    run(
      `UPDATE contacts SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...keys.map((k) => updates[k]),
      id,
    );

    audit(actor, "contact", id, "UPDATE", { details: keys });
  });
}

/**
 * FR-14 & DEC-21: Thay đổi doanh nghiệp công tác của người liên hệ.
 * Một người liên hệ có đúng một doanh nghiệp hiện hành (`contacts.account_id`).
 * Khi chuyển công ty: đóng liên kết cũ (valid_to) và mở liên kết mới trong affiliations.
 */
export function changeContactAffiliation(
  actor: Actor,
  contactId: number,
  newAccountId: number,
  newJobTitle?: string,
  reason?: string,
) {
  const contact = getContact(contactId);
  assert(contact, "Không tìm thấy người liên hệ");
  assert(contact.account_id !== newAccountId, "Người liên hệ đang thuộc doanh nghiệp này");

  const targetAccount = get("SELECT id, name FROM accounts WHERE id = ?", newAccountId);
  assert(targetAccount, "Không tìm thấy doanh nghiệp mới");

  return tx(() => {
    // 1. Đóng liên kết hiện tại
    run(
      `UPDATE affiliations SET valid_to = datetime('now'), is_current = 0
       WHERE contact_id = ? AND is_current = 1`,
      contactId,
    );

    // 2. Mở liên kết mới
    run(
      `INSERT INTO affiliations (contact_id, account_id, job_title, valid_from, is_current)
       VALUES (?, ?, ?, datetime('now'), 1)`,
      contactId,
      newAccountId,
      newJobTitle?.trim() || contact.title || "Nhân sự",
    );

    // 3. Cập nhật doanh nghiệp hiện hành trên bảng contacts
    run(
      "UPDATE contacts SET account_id = ?, title = ?, is_primary = 0 WHERE id = ?",
      newAccountId,
      newJobTitle?.trim() || contact.title,
      contactId,
    );

    // 4. Ghi audit log
    audit(actor, "contact", contactId, "AFFILIATION_CHANGE", {
      from: String(contact.account_id),
      to: String(newAccountId),
      reason: reason || "Chuyển đơn vị công tác",
    });

    return true;
  });
}

/**
 * Hợp đồng cung cấp cho WP-03: Tìm hoặc tạo Contact từ Lead.
 */
export function findOrCreateContact(
  lead: { contact_name: string; email?: string | null; phone?: string | null; contact_title?: string | null },
  accountId: number,
): number {
  const mail = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);

  const existing = get<{ id: number }>(
    `SELECT id FROM contacts WHERE account_id = ? AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?)) LIMIT 1`,
    accountId,
    mail,
    mail,
    phone,
    phone,
  );

  if (existing) return existing.id;

  const hasPrimary = get("SELECT id FROM contacts WHERE account_id = ? AND is_primary = 1", accountId);

  const { id } = run(
    `INSERT INTO contacts (account_id, full_name, title, email, phone, is_primary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    lead.contact_name.trim(),
    lead.contact_title || null,
    mail,
    phone,
    hasPrimary ? 0 : 1,
  );

  run(
    `INSERT INTO affiliations (contact_id, account_id, job_title, valid_from, is_current)
     VALUES (?, ?, ?, datetime('now'), 1)`,
    id,
    accountId,
    lead.contact_title || "Người liên hệ",
  );

  return id;
}
