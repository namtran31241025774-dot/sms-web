"use server";

import { act, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { assert } from "@/lib/domain";
import { userActor } from "@/lib/services/core";
import {
  addLine,
  applyDiscountDecision,
  checkQuoteEsignStatus,
  createQuote,
  recordCustomerFeedback,
  removeLine,
  requestQuoteEsign,
  reviseQuote,
  sendQuote,
  submitQuote,
  updateLine,
  updateQuoteDetails,
} from "@/lib/services/quotes";
import { createProposal, sendProposal } from "@/lib/services/proposals";

export async function createQuoteAction(formData: FormData): Promise<never> {
  const oppId = Number(formData.get("opportunityId"));
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  const validDays = formData.get("validDays") ? Number(formData.get("validDays")) : undefined;

  assert(oppId, "Thiếu mã cơ hội");

  return act(
    `/opportunities/${oppId}`,
    async () => {
      const u = await requirePermission("quote.write");
      const res = createQuote(userActor(u), oppId, { notes, validDays });
      return { redirectTo: `/quotes/${res.quoteId}` };
    },
    "Báo giá đã được khởi tạo thành công",
  );
}

export async function addLineAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const productId = Number(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const discountPct = Number(formData.get("discountPct") || 0);
  const taxPct = formData.get("taxPct") ? Number(formData.get("taxPct")) : undefined;
  const licenseCount = formData.get("licenseCount") ? Number(formData.get("licenseCount")) : undefined;
  const termMonths = formData.get("termMonths") ? Number(formData.get("termMonths")) : undefined;

  assert(versionId && productId, "Thông tin dòng sản phẩm không hợp lệ");

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      addLine(userActor(u), versionId, productId, quantity, discountPct, { taxPct, licenseCount, termMonths });
    },
    "Đã thêm sản phẩm vào báo giá",
  );
}

export async function updateLineAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const lineId = Number(formData.get("lineId"));
  const quantity = Number(formData.get("quantity"));
  const discountPct = Number(formData.get("discountPct") || 0);
  const taxPct = formData.get("taxPct") ? Number(formData.get("taxPct")) : undefined;
  const licenseCount = formData.get("licenseCount") ? Number(formData.get("licenseCount")) : undefined;
  const termMonths = formData.get("termMonths") ? Number(formData.get("termMonths")) : undefined;

  assert(versionId && lineId, "Thông tin dòng sản phẩm không hợp lệ");

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      updateLine(userActor(u), versionId, lineId, quantity, discountPct, { taxPct, licenseCount, termMonths });
    },
    "Đã cập nhật dòng sản phẩm",
  );
}

export async function removeLineAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const lineId = Number(formData.get("lineId"));

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      removeLine(userActor(u), versionId, lineId);
    },
    "Đã xóa dòng sản phẩm",
  );
}

export async function updateQuoteDetailsAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const notes = (formData.get("notes") as string) || null;
  const validUntil = (formData.get("validUntil") as string) || null;

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      updateQuoteDetails(userActor(u), versionId, { notes, validUntil });
    },
    "Đã cập nhật điều khoản và hiệu lực báo giá",
  );
}

export async function submitQuoteAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      const res = submitQuote(userActor(u), versionId);
      return res.message;
    },
    (msg) => msg,
  );
}

export async function decideQuoteDiscountAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const approved = formData.get("approved") === "true";
  const comment = (formData.get("comment") as string)?.trim() || null;

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.approve");
      applyDiscountDecision(userActor(u), versionId, approved, comment);
    },
    approved ? "Đã phê duyệt chiết khấu báo giá" : "Đã từ chối chiết khấu báo giá",
  );
}

export async function sendQuoteAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.send");
      sendQuote(userActor(u), versionId);
    },
    "Báo giá và tài liệu PDF đã được gửi đến khách hàng",
  );
}

export async function recordCustomerResponseAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const responseType = formData.get("responseType") as "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED";
  const note = (formData.get("note") as string)?.trim() || null;

  assert(responseType, "Chưa chọn loại phản hồi");

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.write");
      recordCustomerFeedback(userActor(u),versionId,{responseType,content:note ?? '',respondentName:String(formData.get('respondent_name') ?? ''),contactId:formData.get('contact_id')?Number(formData.get('contact_id')):undefined,respondedAt:String(formData.get('responded_at') ?? new Date().toISOString())});
    },
    "Đã ghi nhận phản hồi của khách hàng thành công",
  );
}

export async function reviseQuoteAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const revisionNote = (formData.get("revisionNote") as string)?.trim() || null;

  return act(
    `/quotes/${quoteId}`,
    async () => {
      const u = await requirePermission("quote.write");
      const newVersionId = reviseQuote(userActor(u), versionId, revisionNote);
      return { redirectTo: `/quotes/${quoteId}?v=${newVersionId}` };
    },
    "Đã tạo phiên bản điều chỉnh mới thành công",
  );
}

export async function requestEsignAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const versionId = Number(formData.get("versionId"));
  const recipientEmail = (formData.get("recipientEmail") as string)?.trim() || undefined;
  const recipientName = (formData.get("recipientName") as string)?.trim() || undefined;

  return act(
    `/quotes/${quoteId}?v=${versionId}`,
    async () => {
      const u = await requirePermission("quote.send");
      requestQuoteEsign(userActor(u), versionId, recipientEmail, recipientName);
    },
    "Đã khởi tạo yêu cầu ký điện tử cho khách hàng",
  );
}

export async function checkEsignStatusAction(formData: FormData): Promise<never> {
  const quoteId = Number(formData.get("quoteId"));
  const signatureId = Number(formData.get("signatureId"));

  return act(
    `/quotes/${quoteId}`,
    async () => {
      const u = await requirePermission("quote.read");
      checkQuoteEsignStatus(userActor(u), signatureId);
    },
    "Đã cập nhật trạng thái ký điện tử từ dịch vụ ký số",
  );
}

// ===== Đề xuất giải pháp (Proposals - FR-48) =====

export async function createProposalAction(formData: FormData): Promise<never> {
  const oppId = Number(formData.get("opportunityId"));
  const title = str(formData, "title");
  const quoteVersionId = formData.get("quoteVersionId") ? Number(formData.get("quoteVersionId")) : null;
  const solutionSummary = (formData.get("solutionSummary") as string)?.trim() || null;
  const scopeDescription = (formData.get("scopeDescription") as string)?.trim() || null;
  const timelineText = (formData.get("timelineText") as string)?.trim() || null;
  const deliverablesText = (formData.get("deliverablesText") as string)?.trim() || null;
  const assumptions = (formData.get("assumptions") as string)?.trim() || null;

  assert(oppId && title, "Tiêu đề và mã cơ hội là bắt buộc");

  return act(
    `/opportunities/${oppId}`,
    async () => {
      const u = await requirePermission("quote.write");
      createProposal(userActor(u), {
        opportunityId: oppId,
        title,
        quoteVersionId,
        solutionSummary,
        scopeDescription,
        timelineText,
        deliverablesText,
        assumptions,
      });
    },
    "Đã tạo bản đề xuất giải pháp thành công",
  );
}

export async function sendProposalAction(formData: FormData): Promise<never> {
  const proposalId = Number(formData.get("proposalId"));
  const oppId = Number(formData.get("opportunityId"));

  return act(
    `/opportunities/${oppId}`,
    async () => {
      const u = await requirePermission("quote.send");
      sendProposal(userActor(u), proposalId);
    },
    "Bản đề xuất giải pháp đã được gửi cho khách hàng",
  );
}
