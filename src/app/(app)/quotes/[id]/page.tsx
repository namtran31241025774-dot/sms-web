import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CommandBar, CommandLink, PageTitle } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { all } from "@/lib/db";
import { QUOTE_STATUS, SIGNATURE_STATUS } from "@/lib/domain";
import { can } from "@/lib/rbac";
import {
  getLatestQuoteVersion,
  getQuote,
  getQuoteVersion,
  isQuoteExpired,
  quoteLines,
  quoteResponses,
  quoteSignatures,
  quoteVersions,
  validateQuoteConfiguration,
} from "@/lib/services/quotes";
import {
  addLineAction,
  checkEsignStatusAction,
  decideQuoteDiscountAction,
  recordCustomerResponseAction,
  removeLineAction,
  requestEsignAction,
  reviseQuoteAction,
  sendQuoteAction,
  submitQuoteAction,
  updateQuoteDetailsAction,
} from "../actions";

export default async function QuoteDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await requirePermission('quote.read');
  const params = await props.params;
  const searchParams = await props.searchParams;

  const quoteId = Number(params.id);
  const quote = getQuote(quoteId, user);
  if (!quote) notFound();

  const versions = quoteVersions(quoteId);
  const activeVersion = searchParams.v
    ? getQuoteVersion(Number(searchParams.v)) || getLatestQuoteVersion(quoteId)
    : getLatestQuoteVersion(quoteId);

  if (!activeVersion || activeVersion.quote_id !== quoteId) notFound();

  const lines = quoteLines(activeVersion.id);
  const responses = quoteResponses(activeVersion.id);
  const signatures = quoteSignatures(activeVersion.id);
  const configValidation = validateQuoteConfiguration(activeVersion.id);
  const isExpired = isQuoteExpired(activeVersion);

  // Danh mục sản phẩm có trong bảng giá của phiên bản này
  const catalogItems = all<{
    id: number;
    code: string;
    name: string;
    type: string;
    unit: string;
    unit_price: number;
    tax_pct: number;
  }>(
    `SELECT p.id, p.code, p.name, p.type, p.unit, pli.unit_price, COALESCE(pli.tax_pct, 10) AS tax_pct
     FROM price_list_items pli
     JOIN products p ON p.id = pli.product_id
     WHERE pli.price_list_id = ? AND p.active = 1
     ORDER BY p.name`,
    activeVersion.price_list_id,
  );

  const isDraft = activeVersion.status === "DRAFT";
  const isPendingApproval = activeVersion.status === "PENDING_APPROVAL";
  const isApproved = activeVersion.status === "APPROVED";
  const isSent = activeVersion.status === "SENT";

  const userRole = user?.role || "SALES";
  const canWrite = can(userRole, "quote.write");
  const canApprove = can(userRole, "quote.approve");
  const canSend = can(userRole, "quote.send");

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/quotes" icon="arrowLeft">
          Danh sách báo giá
        </CommandLink>
        <CommandLink href={`/opportunities/${quote.opportunity_id}`} icon="opportunity">
          Xem cơ hội
        </CommandLink>
        <a
          href={`/quotes/${quote.id}/pdf?v=${activeVersion.id}`}
          target="_blank"
          rel="noreferrer"
          className="cmd"
        >
          Xuất PDF (v{activeVersion.version_no})
        </a>
      </CommandBar>

      <PageTitle
        icon="quote"
        title={
          <div className="flex items-center gap-3">
            <span>Báo giá {quote.code}</span>
            <span className="rounded bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand">
              Phiên bản v{activeVersion.version_no}
            </span>
            <Badge
              tone={
                activeVersion.status === "APPROVED" || activeVersion.status === "ACCEPTED"
                  ? "success"
                  : activeVersion.status === "PENDING_APPROVAL"
                  ? "warning"
                  : activeVersion.status === "SENT"
                  ? "brand"
                  : activeVersion.status === "REJECTED"
                  ? "danger"
                  : "neutral"
              }
            >
              {QUOTE_STATUS[activeVersion.status] || activeVersion.status}
            </Badge>
            {isExpired && activeVersion.status !== "ACCEPTED" && (
              <Badge tone="danger">Đã hết hiệu lực</Badge>
            )}
          </div>
        }
        subtitle={
          <span>
            Khách hàng: <strong>{quote.account_name}</strong> | Cơ hội: <strong>{quote.opportunity_code}</strong> | Bảng giá: <strong>#{activeVersion.price_list_id}</strong>
          </span>
        }
      />

      {/* Bộ chọn phiên bản (DEC-22) */}
      <div className="flex items-center gap-2 border-b border-stroke bg-surface-subtle px-6 py-2">
        <span className="text-xs font-semibold text-ink-3">Lịch sử phiên bản:</span>
        <div className="flex flex-wrap gap-1">
          {versions.map((ver) => {
            const isCur = ver.id === activeVersion.id;
            return (
              <Link
                key={ver.id}
                href={`/quotes/${quote.id}?v=${ver.id}`}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  isCur
                    ? "bg-brand text-white"
                    : "bg-surface text-ink hover:bg-neutral-light"
                }`}
              >
                <span>v{ver.version_no}</span>
                <span className="text-[10px] opacity-80">({QUOTE_STATUS[ver.status]})</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        {/* Cột chính: Bảng dòng sản phẩm & kiểm tra cấu hình */}
        <div className="space-y-6 lg:col-span-2">
          {/* Cảnh báo kiểm tra cấu hình (FR-50) */}
          {(configValidation.warnings.length > 0 || configValidation.errors.length > 0) && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-ink">
              <div className="font-semibold text-warning flex items-center gap-2">
                <span>Kiểm tra cấu hình gói và quyền sử dụng:</span>
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-ink-3">
                {configValidation.errors.map((err, i) => (
                  <li key={`err-${i}`} className="font-semibold text-danger">
                    {err}
                  </li>
                ))}
                {configValidation.warnings.map((warn, i) => (
                  <li key={`warn-${i}`} className="text-warning">
                    {warn}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bảng sản phẩm */}
          <Card
            title={
              <div className="flex items-center justify-between">
                <span>Dòng sản phẩm và Dịch vụ (Phiên bản v{activeVersion.version_no})</span>
                <span className="text-xs font-normal text-ink-3">
                  {lines.length} sản phẩm
                </span>
              </div>
            }
          >
            {lines.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-3">
                Chưa có sản phẩm nào trong phiên bản báo giá này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stroke text-xs font-semibold text-ink-3">
                    <tr>
                      <th className="pb-2">Sản phẩm / Dịch vụ</th>
                      <th className="pb-2 text-center">SL</th>
                      <th className="pb-2 text-right">Đơn giá</th>
                      <th className="pb-2 text-center">CK (%)</th>
                      <th className="pb-2 text-center">Thuế VAT</th>
                      <th className="pb-2 text-right">Thành tiền</th>
                      {isDraft && canWrite && <th className="pb-2 text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-neutral-light/50">
                        <td className="py-3">
                          <div className="font-semibold text-ink">{line.product_name}</div>
                          <div className="text-xs text-ink-3">
                            Mã: {line.product_code} | Loại: {line.product_type}
                            {line.license_count ? ` | ${line.license_count} users` : ""}
                            {line.term_months ? ` | ${line.term_months} tháng` : ""}
                          </div>
                        </td>
                        <td className="py-3 text-center">{line.quantity} {line.unit}</td>
                        <td className="py-3 text-right">
                          {line.unit_price.toLocaleString("vi-VN")} {activeVersion.currency}
                        </td>
                        <td className="py-3 text-center font-semibold">
                          <span
                            className={
                              line.discount_pct > 10 ? "text-warning" : "text-ink"
                            }
                          >
                            {line.discount_pct}%
                          </span>
                        </td>
                        <td className="py-3 text-center text-xs text-ink-3">
                          {line.tax_pct}%
                        </td>
                        <td className="py-3 text-right font-semibold text-ink">
                          {line.line_total.toLocaleString("vi-VN")} {activeVersion.currency}
                        </td>
                        {isDraft && canWrite && (
                          <td className="py-3 text-right">
                            <form action={removeLineAction} className="inline">
                              <input type="hidden" name="versionId" value={activeVersion.id} />
                              <input type="hidden" name="quoteId" value={quote.id} />
                              <input type="hidden" name="lineId" value={line.id} />
                              <button
                                type="submit"
                                className="text-xs font-semibold text-danger hover:underline"
                              >
                                Xóa
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Form thêm sản phẩm nếu đang ở trạng thái DRAFT */}
            {isDraft && canWrite && (
              <div className="mt-6 rounded-lg border border-stroke bg-surface-subtle p-4">
                <div className="text-xs font-semibold text-ink">Thêm sản phẩm từ bảng giá #{activeVersion.price_list_id}</div>
                <form action={addLineAction} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
                  <input type="hidden" name="versionId" value={activeVersion.id} />
                  <input type="hidden" name="quoteId" value={quote.id} />

                  <div className="md:col-span-2">
                    <label className="text-xs text-ink-3">Sản phẩm / Dịch vụ</label>
                    <select name="productId" required className="input text-xs">
                      {catalogItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit_price.toLocaleString("vi-VN")} đ / {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-ink-3">Số lượng</label>
                    <input
                      type="number"
                      name="quantity"
                      defaultValue={1}
                      min={1}
                      required
                      className="input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-ink-3">Chiết khấu (%)</label>
                    <input
                      type="number"
                      name="discountPct"
                      defaultValue={0}
                      min={0}
                      max={30}
                      step="any"
                      required
                      className="input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-ink-3">Users / Seats</label>
                    <input
                      type="number"
                      name="licenseCount"
                      placeholder="Tùy chọn"
                      className="input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-ink-3">Thời hạn (tháng)</label>
                    <input
                      type="number"
                      name="termMonths"
                      placeholder="12"
                      className="input text-xs"
                    />
                  </div>

                  <div className="md:col-span-6 flex justify-end">
                    <button type="submit" className="btn btn-primary text-xs">
                      + Thêm vào báo giá
                    </button>
                  </div>
                </form>
              </div>
            )}
          </Card>

          {/* Điều khoản thương mại & Ghi chú */}
          <Card title="Ghi chú và Điều khoản thương mại">
            {isDraft && canWrite ? (
              <form action={updateQuoteDetailsAction} className="space-y-3">
                <input type="hidden" name="versionId" value={activeVersion.id} />
                <input type="hidden" name="quoteId" value={quote.id} />
                <div>
                  <label className="text-xs text-ink-3">Hiệu lực đến ngày</label>
                  <input
                    type="date"
                    name="validUntil"
                    defaultValue={activeVersion.valid_until || ""}
                    className="input text-sm max-w-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-3">Nội dung ghi chú và điều khoản</label>
                  <textarea
                    name="notes"
                    defaultValue={activeVersion.notes || ""}
                    rows={3}
                    className="input text-sm"
                  />
                </div>
                <button type="submit" className="btn btn-secondary text-xs">
                  Lưu thay đổi ghi chú
                </button>
              </form>
            ) : (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-ink-3">Hiệu lực đến: </span>
                  <span className="font-semibold text-ink">{activeVersion.valid_until || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-ink-3">Ghi chú: </span>
                  <div className="mt-1 whitespace-pre-wrap text-ink">{activeVersion.notes || "Không có ghi chú"}</div>
                </div>
              </div>
            )}
          </Card>

          {/* Lịch sử phản hồi của khách hàng (FR-54) */}
          {responses.length > 0 && (
            <Card title="Lịch sử phản hồi của khách hàng">
              <div className="divide-y divide-stroke">
                {responses.map((resp) => (
                  <div key={resp.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {resp.response_type === "ACCEPTED"
                            ? "Khách chấp thuận"
                            : resp.response_type === "REJECTED"
                            ? "Khách từ chối"
                            : "Khách yêu cầu điều chỉnh"}
                        </span>
                        {resp.contact_name && (
                          <span className="text-xs text-ink-3">bởi {resp.contact_name}</span>
                        )}
                      </div>
                      <span className="text-xs text-ink-3">{resp.responded_at.slice(0, 16)}</span>
                    </div>
                    {resp.notes && <div className="mt-1 text-xs text-ink-3 italic">&quot;{resp.notes}&quot;</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Cột phải: Tổng kết tài chính, Cổng duyệt & Thao tác quy trình */}
        <div className="space-y-6">
          {/* Tổng kết tài chính */}
          <Card title="Tổng kết tài chính">
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-ink-3">
                <span>Tạm tính (chưa CK):</span>
                <span>{activeVersion.subtotal.toLocaleString("vi-VN")} {activeVersion.currency}</span>
              </div>
              <div className="flex justify-between text-warning">
                <span>Tổng chiết khấu:</span>
                <span>-{activeVersion.discount_total.toLocaleString("vi-VN")} {activeVersion.currency}</span>
              </div>
              <div className="flex justify-between text-ink-3">
                <span>Thuế GTGT (VAT):</span>
                <span>+{activeVersion.tax_amount.toLocaleString("vi-VN")} {activeVersion.currency}</span>
              </div>
              <div className="border-t border-stroke pt-2 flex justify-between font-semibold text-base text-ink">
                <span>Tổng thanh toán:</span>
                <span className="text-brand">{activeVersion.total.toLocaleString("vi-VN")} {activeVersion.currency}</span>
              </div>
              <div className="text-xs text-ink-3">
                Mức chiết khấu cao nhất: <strong>{activeVersion.max_discount_pct}%</strong>
              </div>
            </div>
          </Card>

          {/* Thao tác chuyển bước & Duyệt giá (HG7, BR-05) */}
          <Card title="Hành động và Phê duyệt">
            <div className="space-y-3">
              {/* Bước 1: Trình duyệt từ DRAFT */}
              {isDraft && canWrite && (
                <form action={submitQuoteAction}>
                  <input type="hidden" name="versionId" value={activeVersion.id} />
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <button
                    type="submit"
                    className="btn btn-primary w-full text-sm"
                    disabled={lines.length === 0}
                  >
                    {activeVersion.max_discount_pct > 10
                      ? "Trình Quản lý duyệt giá"
                      : "Duyệt báo giá (Trong thẩm quyền)"}
                  </button>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {activeVersion.max_discount_pct > 10
                      ? "Chiết khấu > 10% sẽ gửi Quản lý kinh doanh phê duyệt"
                      : "Chiết khấu <= 10% tự động duyệt hợp lệ"}
                  </p>
                </form>
              )}

              {/* Bước 2: Quản lý phê duyệt khi PENDING_APPROVAL */}
              {isPendingApproval && canApprove && (
                <div className="rounded border border-warning/30 bg-warning/5 p-3">
                  <div className="text-xs font-semibold text-warning">
                    Quản lý kinh doanh duyệt chiết khấu
                  </div>
                  <div className="mt-2 flex gap-2">
                    <form action={decideQuoteDiscountAction} className="flex-1">
                      <input type="hidden" name="versionId" value={activeVersion.id} />
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="approved" value="true" />
                      <button type="submit" className="btn btn-primary w-full text-xs">
                        Chấp thuận
                      </button>
                    </form>
                    <form action={decideQuoteDiscountAction} className="flex-1">
                      <input type="hidden" name="versionId" value={activeVersion.id} />
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="approved" value="false" />
                      <button type="submit" className="btn btn-secondary w-full text-xs text-danger">
                        Từ chối
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Bước 3: Gửi báo giá cho khách khi APPROVED */}
              {isApproved && canSend && (
                <form action={sendQuoteAction}>
                  <input type="hidden" name="versionId" value={activeVersion.id} />
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <button type="submit" className="btn btn-primary w-full text-sm">
                    Gửi khách hàng (Email và PDF)
                  </button>
                  <p className="mt-1 text-[11px] text-ink-3">
                    Sau khi gửi, phiên bản báo giá này sẽ được khóa (không chỉnh sửa trực tiếp).
                  </p>
                </form>
              )}

              {/* Bước 4: Ghi nhận phản hồi khi SENT */}
              {isSent && canWrite && (
                <div className="space-y-2 rounded border border-brand/20 bg-brand-tint/20 p-3">
                  <div className="text-xs font-semibold text-brand">
                    Ghi nhận phản hồi của khách hàng
                  </div>
                  <form action={recordCustomerResponseAction} className="space-y-2">
                    <input type="hidden" name="versionId" value={activeVersion.id} />
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <select name="responseType" required className="input text-xs">
                      <option value="ACCEPTED">Khách chấp thuận (Tạo đơn hàng)</option>
                      <option value="REVISION_REQUESTED">Khách yêu cầu điều chỉnh giá/cấu hình</option>
                      <option value="REJECTED">Khách từ chối báo giá</option>
                    </select>
                    <input
                      type="text"
                      name="note"
                      placeholder="Ghi chú ý kiến của khách hàng..."
                      className="input text-xs"
                    />
                    <button type="submit" className="btn btn-primary w-full text-xs">
                      Xác nhận phản hồi
                    </button>
                  </form>
                </div>
              )}

              {/* Bước 5: Điều chỉnh tạo phiên bản mới (DEC-22) */}
              {!isDraft && canWrite && (
                <form action={reviseQuoteAction} className="pt-2 border-t border-stroke">
                  <input type="hidden" name="versionId" value={activeVersion.id} />
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input
                    type="text"
                    name="revisionNote"
                    placeholder="Lý do tạo phiên bản v{activeVersion.version_no + 1}..."
                    className="input text-xs mb-2"
                  />
                  <button type="submit" className="btn btn-secondary w-full text-xs">
                    + Tạo phiên bản điều chỉnh mới (v{activeVersion.version_no + 1})
                  </button>
                </form>
              )}
            </div>
          </Card>

          {/* Theo dõi Ký điện tử (FR-55, DEC-13) */}
          <Card title="Ký điện tử E-Signature">
            <div className="space-y-3">
              {signatures.length === 0 ? (
                <div>
                  <div className="text-xs text-ink-3">Chưa có yêu cầu ký điện tử cho phiên bản này.</div>
                  {(isApproved || isSent || activeVersion.status === "ACCEPTED") && canSend && (
                    <form action={requestEsignAction} className="mt-2">
                      <input type="hidden" name="versionId" value={activeVersion.id} />
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <button type="submit" className="btn btn-secondary w-full text-xs">
                        Khởi tạo luồng ký điện tử
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {signatures.map((sig) => (
                    <div key={sig.id} className="rounded border border-stroke p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">Mã ký: {sig.external_reference}</span>
                        <Badge
                          tone={
                            sig.status === "SIGNED"
                              ? "success"
                              : sig.status === "PENDING"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {SIGNATURE_STATUS[sig.status] || sig.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-ink-3">Người nhận: {sig.recipient_email}</div>
                      {sig.signed_at && (
                        <div className="mt-0.5 text-success">Đã ký vào: {sig.signed_at.slice(0, 16)}</div>
                      )}
                      {sig.status === "PENDING" && (
                        <form action={checkEsignStatusAction} className="mt-2">
                          <input type="hidden" name="signatureId" value={sig.id} />
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <button type="submit" className="btn btn-secondary w-full text-[11px]">
                            Kiểm tra trạng thái ký
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
