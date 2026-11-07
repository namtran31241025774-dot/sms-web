import { ConfirmSubmitButton, SubmitButton } from "@/components/client";
import { Badge, Card, Empty, FormField, MessageBar } from "@/components/ui";
import { formatDate, formatVnd } from "@/lib/domain";
import type { DocumentExtraction, OpportunityDocument } from "@/lib/services/documents";
import type { ExtractedField } from "@/lib/services/document-extract";
import { applyExtractionAction, applySolutionExtractionAction, extractDocumentAction, removeDocumentAction, uploadDocumentAction } from "@/app/(app)/opportunities/actions";

const SOURCE_LABEL = { FORM: "Từ form", AI: "Agent đọc" } as const;
const TECH_KEYS = ["technical_approach", "architecture", "effort", "tech_risks"];

function FieldInput({ field, disabled }: { field: ExtractedField; disabled: boolean }) {
  return (
    <FormField label={field.label}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {field.source ? <Badge tone="brand">{SOURCE_LABEL[field.source]}</Badge> : <Badge tone="warning">Thiếu</Badge>}
        {field.source === "AI" && field.quote && <span>Căn cứ: “{field.quote}”</span>}
        {field.note && <span className="text-[#bc4b09]">{field.note}</span>}
      </div>
      <textarea name={`field_${field.key}`} defaultValue={field.value ?? ""} rows={2} className="textarea" disabled={disabled} />
    </FormField>
  );
}

export function OpportunityDocuments({ opportunityId, documents, extraction, pendingSolution, canWrite, canSolution, agentLive }: {
  opportunityId: number;
  documents: OpportunityDocument[];
  extraction?: DocumentExtraction;
  pendingSolution?: DocumentExtraction & { existingSolutionIds: number[]; requiresChoice: boolean };
  canWrite: boolean;
  canSolution: boolean;
  agentLive: boolean;
}) {
  const missing = extraction?.fields.filter((f) => !f.value) ?? [];
  const general = extraction?.fields.filter((f) => !TECH_KEYS.includes(f.key)) ?? [];
  const tech = extraction?.fields.filter((f) => TECH_KEYS.includes(f.key)) ?? [];
  return (
    <div className="space-y-4">
      {!agentLive && (
        <MessageBar intent="info" title="AI đang ở chế độ giả lập:">
          Chỉ đọc được các ô có nhãn rõ ràng như trong form mẫu. Tài liệu viết tự do cần bật OpenAI mới đọc được.
        </MessageBar>
      )}

      {pendingSolution && (
        <Card title={`Hồ sơ kỹ thuật chờ xác nhận: ${pendingSolution.document_name}`}>
          {canSolution ? (
            <form action={applySolutionExtractionAction} className="space-y-3">
              <input type="hidden" name="id" value={opportunityId} />
              <input type="hidden" name="extraction_id" value={pendingSolution.id} />
              {pendingSolution.fields.filter((f) => TECH_KEYS.includes(f.key)).map((f) => <FieldInput key={f.key} field={f} disabled={false} />)}
              {pendingSolution.requiresChoice ? (
                <div className="space-y-2 rounded border border-[#f0f0f0] bg-[#fafafa] p-3 text-sm">
                  <p className="font-semibold">Cơ hội đã có hồ sơ kỹ thuật. Chọn cách xử lý tệp này:</p>
                  <label className="flex items-center gap-2"><input type="radio" name="solution_choice" value="SKIP" defaultChecked /> Bỏ qua, giữ hồ sơ hiện có</label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="solution_choice" value="REPLACE" /> Thay thế hồ sơ
                    <select name="solution_id" className="select !w-auto" defaultValue={pendingSolution.existingSolutionIds[0]}>
                      {pendingSolution.existingSolutionIds.map((sid) => <option key={sid} value={sid}>Hồ sơ #{sid}</option>)}
                    </select>
                  </label>
                  <SubmitButton variant="primary" icon="check">Xác nhận lựa chọn</SubmitButton>
                </div>
              ) : (
                <SubmitButton variant="primary" icon="check">Xác nhận và tạo hồ sơ kỹ thuật</SubmitButton>
              )}
            </form>
          ) : (
            <p className="text-sm text-ink-3">Phần này chờ Chuyên viên tư vấn giải pháp được phân công vào cơ hội xác nhận.</p>
          )}
        </Card>
      )}

      {extraction && (
        <Card title={`Kết quả đọc: ${extraction.document_name}`}>
          <p className="mb-3 text-sm text-ink-3">
            Dữ liệu chưa vào hồ sơ. Kiểm tra từng ô, sửa nếu cần rồi xác nhận. Ô để trống sẽ được bỏ qua.
          </p>
          {missing.length > 0 && (
            <div className="mb-3">
              <MessageBar intent="warning" title={`Thiếu ${missing.length} thông tin:`}>{missing.map((f) => f.label).join("; ")}</MessageBar>
            </div>
          )}
          <form action={applyExtractionAction} className="space-y-4">
            <input type="hidden" name="id" value={opportunityId} />
            <input type="hidden" name="extraction_id" value={extraction.id} />

            <div>
              <h3 className="mb-2 text-sm font-semibold">Sản phẩm sẽ thêm vào cơ hội</h3>
              {extraction.items.length === 0 ? (
                <p className="text-sm text-ink-3">Không tìm thấy sản phẩm nào khớp danh mục.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke text-left text-xs text-ink-3">
                      <th className="py-2 pr-2">Thêm</th>
                      <th className="py-2 pr-2">Sản phẩm</th>
                      <th className="py-2 pr-2">Trong tệp ghi</th>
                      <th className="py-2 pr-2">Số lượng</th>
                      <th className="py-2 text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.items.map((i) => (
                      <tr key={i.product_id} className="border-b border-stroke last:border-0">
                        <td className="py-2 pr-2"><input type="checkbox" name={`item_on_${i.product_id}`} defaultChecked={i.quantity !== null} disabled={!canWrite} aria-label={`Thêm ${i.name}`} /></td>
                        <td className="py-2 pr-2">{i.name}</td>
                        <td className="py-2 pr-2 text-ink-3">{i.source}</td>
                        <td className="py-2 pr-2">
                          <input name={`item_qty_${i.product_id}`} type="number" min={1} defaultValue={i.quantity ?? ""} placeholder="Thiếu" disabled={!canWrite} className="input !min-h-7 w-24 !py-0.5 text-right" aria-label={`Số lượng ${i.name}`} />
                        </td>
                        <td className="py-2 text-right">{formatVnd(i.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {extraction.unmatched.length > 0 && (
                <div className="mt-2">
                  <MessageBar intent="warning" title="Không khớp danh mục, chưa thêm:">{extraction.unmatched.join("; ")}</MessageBar>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Nhu cầu và phạm vi</h3>
              {general.map((f) => <FieldInput key={f.key} field={f} disabled={!canWrite} />)}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Hồ sơ kỹ thuật</h3>
              {!canSolution && canWrite && (
                <p className="text-xs text-ink-3">Sau khi bạn xác nhận, phần này được chuyển cho Chuyên viên tư vấn giải pháp xác nhận lần cuối.</p>
              )}
              {tech.map((f) => <FieldInput key={f.key} field={f} disabled={!canWrite} />)}
            </div>

            {canWrite && (
              <div className="flex gap-2">
                <SubmitButton variant="primary" icon="check">Xác nhận và cập nhật hồ sơ</SubmitButton>
                <SubmitButton name="op" value="reject" icon="dismiss">Bỏ qua kết quả này</SubmitButton>
              </div>
            )}
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card title="Tài liệu của cơ hội" pad={false}>
          {documents.length === 0 ? (
            <Empty icon="info">Chưa có tài liệu nào.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stroke text-left text-xs text-ink-3">
                  <th className="px-4 py-2">Tên tệp</th>
                  <th className="px-4 py-2">Phiên bản</th>
                  <th className="px-4 py-2">Người tải</th>
                  <th className="px-4 py-2">Thời điểm</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-stroke last:border-0">
                    <td className="px-4 py-2"><a className="text-brand hover:underline" href={`/api/documents/${d.id}`}>{d.name}</a></td>
                    <td className="px-4 py-2">v{d.version_no}</td>
                    <td className="px-4 py-2">{d.uploader_name ?? "—"}</td>
                    <td className="px-4 py-2">{formatDate(d.created_at, true)}</td>
                    <td className="px-4 py-2 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-2">
                          <form action={extractDocumentAction}>
                            <input type="hidden" name="id" value={opportunityId} />
                            <input type="hidden" name="document_id" value={d.id} />
                            <SubmitButton size="sm" icon="sparkle">Agent đọc tệp</SubmitButton>
                          </form>
                          <form action={removeDocumentAction}>
                            <input type="hidden" name="id" value={opportunityId} />
                            <input type="hidden" name="document_id" value={d.id} />
                            <ConfirmSubmitButton message={`Xóa ${d.name} (v${d.version_no}) khỏi cơ hội này?`}>Xóa</ConfirmSubmitButton>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Tải tài liệu lên">
          <p className="mb-3 text-sm">
            Dùng <a className="text-brand hover:underline" href="/templates/phieu-khao-sat-nhu-cau.docx">Phiếu khảo sát nhu cầu (mẫu Word)</a> để Agent đọc chính xác nhất.
          </p>
          {canWrite ? (
            <form action={uploadDocumentAction} className="space-y-3">
              <input type="hidden" name="id" value={opportunityId} />
              <FormField label="Tệp Word (.docx) hoặc PDF, tối đa 5 MB" required>
                <input
                  name="file"
                  type="file"
                  required
                  accept=".docx,.pdf"
                  className="block w-full cursor-pointer rounded border border-stroke text-sm text-ink-2 file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-stroke file:bg-[#f0f0f0] file:px-3 file:py-2 file:text-sm file:font-semibold hover:file:bg-[#e0e0e0]"
                />
              </FormField>
              <FormField label="Loại tài liệu">
                <select name="document_kind" className="select" defaultValue="SURVEY">
                  <option value="SURVEY">Biên bản khảo sát</option>
                  <option value="SCOPE">Biên bản xác nhận phạm vi</option>
                  <option value="SOLUTION">Hồ sơ giải pháp kỹ thuật</option>
                  <option value="COMPETITOR">Tài liệu đối thủ</option>
                  <option value="OTHER">Khác</option>
                </select>
              </FormField>
              <SubmitButton variant="primary" icon="add">Tải lên</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-ink-3">Vai trò của bạn chỉ được xem tài liệu.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
