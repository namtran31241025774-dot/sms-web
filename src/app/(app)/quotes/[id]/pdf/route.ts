import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { assert } from "@/lib/domain";
import { generateQuotePdf } from "@/lib/pdf";
import { getOpportunity } from "@/lib/services/opportunities";
import { getQuote, getQuoteVersion, getLatestQuoteVersion, quoteLines } from "@/lib/services/quotes";
import { get } from "@/lib/db";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await requirePermission("quote.read");

  const params = await props.params;
  const quoteId = Number(params.id);
  const q = getQuote(quoteId, user);
  assert(q, "Không tìm thấy báo giá");

  const { searchParams } = new URL(request.url);
  const versionIdParam = searchParams.get("v");
  const version = versionIdParam ? getQuoteVersion(Number(versionIdParam)) : getLatestQuoteVersion(quoteId);
  assert(version, "Không tìm thấy phiên bản báo giá");
  assert(version.quote_id === quoteId, "Phiên bản không thuộc báo giá");

  const o = getOpportunity(q.opportunity_id)!;
  const contact = o.primary_contact_id
    ? get<{ email: string | null; full_name: string }>(
        "SELECT email, full_name FROM contacts WHERE id = ?",
        o.primary_contact_id,
      )
    : null;

  const lines = quoteLines(version.id);

  const pdfBuffer = generateQuotePdf({
    quoteCode: q.code,
    versionNo: version.version_no,
    customerName: q.account_name || "Khách hàng",
    contactName: contact?.full_name,
    contactEmail: contact?.email,
    opportunityCode: q.opportunity_code || o.code,
    currency: version.currency,
    validUntil: version.valid_until,
    createdAt: version.created_at,
    lines: lines.map((l) => ({
      productCode: l.product_code,
      productName: l.product_name,
      productType: l.product_type,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discountPct: l.discount_pct,
      taxPct: l.tax_pct,
      lineTotal: l.line_total,
    })),
    subtotal: version.subtotal,
    discountTotal: version.discount_total,
    taxAmount: version.tax_amount,
    total: version.total,
    notes: version.notes,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${q.code}-v${version.version_no}.pdf"`,
    },
  });
}
