// Dịch vụ quản lý Doanh nghiệp (Accounts) và Hồ sơ 360 (FR-08, FR-13).
import { all, get, run, tx } from "../db";
import { assert, emailDomain, normalizeCompany } from "../domain";
import { actorUserId, audit, type Actor } from "./core";
import { maps } from "../integrations";
import {requireVietnamAddress} from './address-validation';

export type Account = {
  id: number;
  name: string;
  name_norm: string;
  industry: string | null;
  website: string | null;
  email_domain: string | null;
  tax_code: string | null;
  address: string | null;
  employee_size: string | null;
  status: "ACTIVE" | "INACTIVE";
  email: string | null;
  phone: string | null;
  owner_id: number | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  open_opps?: number;
  contacts_count?: number;
};

export type AccountInput = {
  name: string;
  industry?: string | null;
  website?: string | null;
  tax_code?: string | null;
  address?: string | null;
  employee_size?: string | null;
  email?: string | null;
  phone?: string | null;
  owner_id?: number | null;
};

export function listAccounts(filter: { q?: string; status?: string; industry?: string } = {}) {
  const where: string[] = [];
  const params: string[] = [];

  if (filter.status) {
    where.push("a.status = ?");
    params.push(filter.status);
  }
  if (filter.industry) {
    where.push("a.industry = ?");
    params.push(filter.industry);
  }
  if (filter.q) {
    where.push("(a.name_norm LIKE ? OR a.tax_code LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)");
    params.push(`%${normalizeCompany(filter.q)}%`, `%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }

  const base = `SELECT a.*, u.name AS owner_name,
    (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.id AND o.stage NOT IN ('WON','LOST')) AS open_opps,
    (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id AND c.status = 'ACTIVE') AS contacts_count
    FROM accounts a LEFT JOIN users u ON u.id = a.owner_id`;

  return all<Account>(
    `${base} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.updated_at DESC, a.name`,
    ...params,
  );
}

export function getAccount(id: number) {
  return get<Account>(
    `SELECT a.*, u.name AS owner_name,
     (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.id AND o.stage NOT IN ('WON','LOST')) AS open_opps,
     (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id) AS contacts_count
     FROM accounts a LEFT JOIN users u ON u.id = a.owner_id WHERE a.id = ?`,
    id,
  );
}

export function createAccount(actor: Actor, input: AccountInput): number {
  requireVietnamAddress(input.address);
  assert(input.name?.trim(), "Tên doanh nghiệp không được để trống");
  const norm = normalizeCompany(input.name);
  const tax = input.tax_code?.trim() || null;
  if (tax) {
    const dupTax = get("SELECT id FROM accounts WHERE tax_code = ?", tax);
    assert(!dupTax, `Mã số thuế ${tax} đã tồn tại trong hệ thống`);
  }

  const addr = input.address?.trim() ? maps.normalizeAddress(input.address).normalized : null;
  const domain = input.email ? emailDomain(input.email) : (input.website ? input.website.replace(/^https?:\/\//, "").split("/")[0] : null);

  return tx(() => {
    const { id } = run(
      `INSERT INTO accounts (name, name_norm, industry, website, email_domain, tax_code, address, employee_size, email, phone, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name.trim(),
      norm,
      input.industry?.trim() || null,
      input.website?.trim() || null,
      domain,
      tax,
      addr ?? input.address?.trim() ?? null,
      input.employee_size?.trim() || null,
      input.email?.trim() || null,
      input.phone?.trim() || null,
      input.owner_id ?? actorUserId(actor),
    );

    audit(actor, "account", id, "CREATE", { details: { name: input.name, tax } });
    return id;
  });
}

export function updateAccount(actor: Actor, id: number, input: Partial<AccountInput> & { status?: "ACTIVE" | "INACTIVE" }) {
  const current = getAccount(id);
  assert(current, "Không tìm thấy doanh nghiệp");

  const updates: Record<string, string | number | null> = {};
  if ("name" in input && input.name) {
    updates.name = input.name.trim();
    updates.name_norm = normalizeCompany(input.name);
  }
  if ("industry" in input) updates.industry = input.industry?.trim() || null;
  if ("website" in input) updates.website = input.website?.trim() || null;
  if ("tax_code" in input) updates.tax_code = input.tax_code?.trim() || null;
  if ("address" in input) {
    requireVietnamAddress(input.address);
    updates.address = input.address?.trim() ? maps.normalizeAddress(input.address).normalized : null;
  }
  if ("employee_size" in input) updates.employee_size = input.employee_size?.trim() || null;
  if ("email" in input) {
    updates.email = input.email?.trim() || null;
    if (input.email) updates.email_domain = emailDomain(input.email);
  }
  if ("phone" in input) updates.phone = input.phone?.trim() || null;
  if ("owner_id" in input) updates.owner_id = input.owner_id ?? null;
  if ("status" in input && input.status) updates.status = input.status;

  const keys = Object.keys(updates);
  if (!keys.length) return;

  tx(() => {
    run(
      `UPDATE accounts SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...keys.map((k) => updates[k]),
      id,
    );
    audit(actor, "account", id, "UPDATE", { details: keys });
  });
}

/**
 * Hợp đồng cung cấp cho WP-03 và các module khác:
 * Tìm hoặc tạo mới Account dựa trên thông tin Lead.
 */
export function findOrCreateAccount(
  lead: {
    company_name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    industry?: string | null;
    tax_code?: string | null;
  },
  ownerId?: number,
): number {
  const norm = normalizeCompany(lead.company_name);
  const domain = emailDomain(lead.email);
  const tax = lead.tax_code?.trim() || null;

  // Tìm theo mã số thuế, tên chuẩn hoá hoặc domain email
  const existing = get<{ id: number }>(
    `SELECT id FROM accounts WHERE (? IS NOT NULL AND tax_code = ?) OR name_norm = ? OR (? IS NOT NULL AND email_domain = ?) LIMIT 1`,
    tax,
    tax,
    norm,
    domain,
    domain,
  );

  if (existing) return existing.id;

  const { id } = run(
    `INSERT INTO accounts (name, name_norm, industry, email_domain, tax_code, address, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    lead.company_name.trim(),
    norm,
    lead.industry || null,
    domain,
    tax,
    lead.address || null,
    ownerId ?? null,
  );

  return id;
}

/**
 * FR-13: Tổng quan Doanh nghiệp Account 360 độ (liên kết contacts, opps, orders, invoices).
 */
export function getAccount360(id: number) {
  const account = getAccount(id);
  assert(account, "Không tìm thấy doanh nghiệp");

  const contacts = all(
    "SELECT * FROM contacts WHERE account_id = ? ORDER BY is_primary DESC, full_name",
    id,
  );
  const opportunities = all(
    "SELECT * FROM opportunities WHERE account_id = ? ORDER BY created_at DESC",
    id,
  );
  const orders = all(
    "SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC",
    id,
  );
  const invoices = all(
    "SELECT inv.* FROM invoices inv JOIN orders o ON o.id = inv.order_id WHERE o.account_id = ? ORDER BY inv.created_at DESC",
    id,
  );

  return {
    account,
    contacts,
    opportunities,
    orders,
    invoices,
  };
}
