import { all, get, nextCode, run, tx } from "../db";
import { assert } from "../domain";
import { email } from "../integrations";
import { generateProposalPdf } from "../pdf";
import { actorUserId, addActivity, audit, type Actor } from "./core";
import { getOpportunity, listSolutions } from "./opportunities";
import {assertActorAccess} from './access';
import {can} from '../rbac';

export interface Proposal {
  id: number;
  code: string;
  opportunity_id: number;
  opportunity_code: string;
  account_id: number;
  account_name: string;
  quote_version_id: number | null;
  title: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "SUPERSEDED";
  solution_summary: string | null;
  scope_description: string | null;
  timeline_text: string | null;
  deliverables_text: string | null;
  assumptions: string | null;
  pdf_path: string | null;
  sent_at: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProposalInput {
  opportunityId: number;
  title: string;
  quoteVersionId?: number | null;
  solutionSummary?: string | null;
  scopeDescription?: string | null;
  timelineText?: string | null;
  deliverablesText?: string | null;
  assumptions?: string | null;
  inheritSolutions?: boolean;
}

const SELECT_PROPOSAL = `
  SELECT p.*, o.code AS opportunity_code, a.name AS account_name, u.name AS created_by_name
  FROM proposals p
  JOIN opportunities o ON o.id = p.opportunity_id
  JOIN accounts a ON a.id = p.account_id
  LEFT JOIN users u ON u.id = p.created_by
`;

export function getProposal(id: number): Proposal | undefined {
  return get<Proposal>(`${SELECT_PROPOSAL} WHERE p.id = ?`, id);
}

export function listProposals(filter: { opportunityId?: number; accountId?: number; status?: string } = {}): Proposal[] {
  const conds: string[] = [];
  const params: (string | number | null)[] = [];

  if (filter.opportunityId) {
    conds.push("p.opportunity_id = ?");
    params.push(filter.opportunityId);
  }
  if (filter.accountId) {
    conds.push("p.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.status) {
    conds.push("p.status = ?");
    params.push(filter.status);
  }

  const whereClause = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  return all<Proposal>(`${SELECT_PROPOSAL} ${whereClause} ORDER BY p.id DESC`, ...params);
}

/**
 * FR-48: Lập bản đề xuất giải pháp gửi khách từ nhu cầu và hồ sơ giải pháp nội bộ
 */
export function createProposal(actor: Actor, input: CreateProposalInput): number {
  assert(actor.type==='USER' && can(actor.role,'quote.write'),'Chỉ kinh doanh được lập bản đề xuất gửi khách');
  assertActorAccess(actor,'opportunity',input.opportunityId);
  const o = getOpportunity(input.opportunityId);
  assert(o, "Không tìm thấy cơ hội");

  let summary = input.solutionSummary || "";
  let scope = input.scopeDescription || "";
  let assumptions = input.assumptions || "";

  // Tự động kế thừa từ hồ sơ giải pháp nội bộ nếu được yêu cầu hoặc khi chưa điền
  if (input.inheritSolutions !== false) {
    const internalSolutions = listSolutions(o.id);
    if (internalSolutions.length > 0 && !summary) {
      summary = internalSolutions
        .map((s) => `[${s.title}]\n- Phương án: ${s.technical_approach}\n- Kiến trúc: ${s.architecture}\n- Công chuẩn bị: ${s.estimated_effort_mandays} mandays`)
        .join("\n\n");
    }
    if (o.customer_need && !scope) {
      scope = o.customer_need;
    }
    if (internalSolutions.some((s) => s.risks) && !assumptions) {
      assumptions = internalSolutions
        .filter((s) => s.risks)
        .map((s) => `Rủi ro & ràng buộc: ${s.risks}`)
        .join("; ");
    }
  }

  return tx(() => {
    const code = nextCode("proposals" as "quotes", "PR");
    const { id } = run(
      `INSERT INTO proposals (
        code, opportunity_id, account_id, quote_version_id, title, status,
        solution_summary, scope_description, timeline_text, deliverables_text, assumptions,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      code,
      o.id,
      o.account_id,
      input.quoteVersionId ?? null,
      input.title.trim(),
      summary || null,
      scope || null,
      input.timelineText || "Dự kiến triển khai 4-8 tuần sau khi ký hợp đồng",
      input.deliverablesText || "Bản quyền phần mềm, tài liệu hướng dẫn sử dụng, biên bản nghiệm thu",
      assumptions || null,
      actorUserId(actor),
    );

    audit(actor, "proposal", id, "CREATE", {
      details: { code, opportunityId: o.id, title: input.title },
    });
    return id;
  });
}

/**
 * Cập nhật bản đề xuất khi còn ở trạng thái DRAFT
 */
export function updateProposal(
  actor: Actor,
  id: number,
  input: Partial<Omit<CreateProposalInput, "opportunityId">>,
) {
  const p = getProposal(id);
  assert(p, "Không tìm thấy bản đề xuất");
  assert(p.status === "DRAFT", "Chỉ được sửa bản đề xuất ở trạng thái Nháp");

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.title !== undefined) {
    assert(input.title.trim(), "Tiêu đề bản đề xuất không được để trống");
    fields.push("title = ?");
    params.push(input.title.trim());
  }
  if (input.quoteVersionId !== undefined) {
    fields.push("quote_version_id = ?");
    params.push(input.quoteVersionId);
  }
  if (input.solutionSummary !== undefined) {
    fields.push("solution_summary = ?");
    params.push(input.solutionSummary);
  }
  if (input.scopeDescription !== undefined) {
    fields.push("scope_description = ?");
    params.push(input.scopeDescription);
  }
  if (input.timelineText !== undefined) {
    fields.push("timeline_text = ?");
    params.push(input.timelineText);
  }
  if (input.deliverablesText !== undefined) {
    fields.push("deliverables_text = ?");
    params.push(input.deliverablesText);
  }
  if (input.assumptions !== undefined) {
    fields.push("assumptions = ?");
    params.push(input.assumptions);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  params.push(id);

  run(`UPDATE proposals SET ${fields.join(", ")} WHERE id = ?`, ...params);
  audit(actor, "proposal", id, "UPDATE", { details: input });
}

/**
 * FR-52: Xuất PDF và gửi đề xuất cho khách hàng qua email; khóa đề xuất đã gửi
 */
export function sendProposal(actor: Actor, id: number): { providerRef: string; pdfBuffer: Buffer } {
  assert(actor.type === "USER", "Chỉ nhân viên được gửi đề xuất cho khách hàng");
  const p = getProposal(id);
  assert(p, "Không tìm thấy đề xuất giải pháp");
  assert(p.status === "DRAFT", "Chỉ gửi được đề xuất ở trạng thái Nháp");

  const o = getOpportunity(p.opportunity_id)!;
  const contact = o.primary_contact_id
    ? get<{ email: string | null; full_name: string }>(
        "SELECT email, full_name FROM contacts WHERE id = ?",
        o.primary_contact_id,
      )
    : null;
  assert(contact?.email, "Khách hàng chưa có người liên hệ chính hoặc thiếu email");

  // Tạo PDF nhị phân
  const pdfBuffer = generateProposalPdf({
    proposalCode: p.code,
    title: p.title,
    customerName: p.account_name,
    opportunityCode: p.opportunity_code,
    solutionSummary: p.solution_summary,
    scopeDescription: p.scope_description,
    timelineText: p.timeline_text,
    deliverablesText: p.deliverables_text,
    assumptions: p.assumptions,
    createdAt: p.created_at,
  });

  return tx(() => {
    const subject = `Bản đề xuất giải pháp ${p.code} – ${p.account_name}`;
    const body = `Kính gửi ${contact.full_name},\n\nChúng tôi trân trọng gửi Quý khách bản đề xuất giải pháp "${p.title}" (Mã: ${p.code}) gắn với cơ hội ${p.opportunity_code}.\n\nChi tiết giải pháp, phạm vi và kế hoạch bàn giao đính kèm trong tài liệu PDF.\n\nTrân trọng.`;

    const { providerRef } = email.send({ to: contact.email!, subject, body });

    run(
      `INSERT INTO email_messages (entity_type, entity_id, to_email, subject, body, approved_by, provider_ref, status)
       VALUES ('proposal', ?, ?, ?, ?, ?, ?, 'SENT')`,
      p.id,
      contact.email!,
      subject,
      body,
      actorUserId(actor),
      providerRef,
    );

    addActivity({
      entityType: "opportunity",
      entityId: o.id,
      type: "EMAIL",
      direction: "OUT",
      subject,
      body,
      createdBy: actorUserId(actor),
    });

    run("UPDATE proposals SET status = 'SENT', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", p.id);
    audit(actor, "proposal", p.id, "SEND", {
      from: "DRAFT",
      to: "SENT",
      details: { to: contact.email, providerRef },
    });

    return { providerRef, pdfBuffer };
  });
}
