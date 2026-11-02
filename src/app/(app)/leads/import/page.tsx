"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandBar, CommandLink, PageTitle, Card, FormField, MessageBar, Grid, Badge } from "@/components/ui";
import type { ImportPreviewRow } from "@/lib/services/leads";
import { importLeadsAction, previewImportAction } from "../actions";

const SAMPLE_CSV = `Công ty,Người liên hệ,Chức danh,Email,Số điện thoại,Địa chỉ,Nhu cầu
Công ty TNHH Nhựa Đại Phát,Nguyễn Minh Hoàng,Giám đốc điều hành,hoang.nguyen@nhuadaiphat.vn,0903123456,KCN Tân Bình, TP.HCM,Cần CRM tích hợp kế toán
Công ty CP Cơ khí Đông Á,Trần Thu Hà,Trưởng phòng kinh doanh,ha.tran@cokhidonga.com,0918765432,Số 15 Phố Huế, Hà Nội,15 nhân viên bán hàng
Công ty TNHH Bao bì Hòa Phát Nam,Đỗ Thị Hạnh,Giám đốc Kinh doanh,hanh.do@baobihpn.vn,0918555666,Bình Dương,Trùng với khách hàng có sẵn`;

export default function LeadImportPage() {
  const router = useRouter();
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<{
    rows: ImportPreviewRow[];
    total: number;
    validCount: number;
    duplicateCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await previewImportAction(csvText);
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const validData = preview.rows.filter((r) => r.valid).map((r) => r.data);
      if (validData.length === 0) {
        setError("Không có dòng dữ liệu hợp lệ nào để nhập.");
        setLoading(false);
        return;
      }

      const result = await importLeadsAction(JSON.stringify(validData));
      router.push(`/leads?ok=${encodeURIComponent(`Đã nhập thành công ${result.count} Lead từ tệp!`)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <>
      <CommandBar>
        <CommandLink href="/leads" icon="arrowLeft">Quay lại danh sách</CommandLink>
      </CommandBar>

      <PageTitle
        title="Nhập khách hàng tiềm năng từ CSV"
        subtitle="Hỗ trợ ánh xạ cột, kiểm tra lỗi và phát hiện trùng lặp trước khi lưu"
        icon="copy"
      />

      <div className="max-w-5xl space-y-4 px-6 pb-10">
        {error && <MessageBar intent="error">{error}</MessageBar>}

        <Card title="Dữ liệu CSV">
          <FormField label="Dán nội dung CSV (Dòng 1 là tiêu đề)">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              className="textarea font-mono text-xs"
              placeholder="Công ty,Người liên hệ,Email,Số điện thoại..."
            />
          </FormField>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handlePreview}
              className="btn btn-primary"
            >
              Kiểm tra và Xem trước
            </button>
          </div>
        </Card>

        {preview && (
          <Card title={`Kết quả kiểm tra: ${preview.validCount}/${preview.total} dòng hợp lệ`}>
            {preview.duplicateCount > 0 && (
              <div className="mb-3">
                <MessageBar intent="warning">
                  Có {preview.duplicateCount} dòng phát hiện nghi vấn trùng lặp. Bản ghi vẫn có thể nhập và sẽ được gắn cờ để xử lý sau.
                </MessageBar>
              </div>
            )}

            <div className="max-h-[350px] overflow-auto border border-stroke rounded">
              <Grid>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Trạng thái</th>
                    <th>Tên công ty</th>
                    <th>Người liên hệ</th>
                    <th>Email / SĐT</th>
                    <th>Cảnh báo trùng / Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className={!r.valid ? "bg-red-50/50" : undefined}>
                      <td>#{r.rowNumber}</td>
                      <td>
                        {r.valid ? (
                          <Badge tone="success">Hợp lệ</Badge>
                        ) : (
                          <Badge tone="danger">Lỗi</Badge>
                        )}
                      </td>
                      <td className="font-medium">{r.data.company_name || "—"}</td>
                      <td>{r.data.contact_name || "—"}</td>
                      <td className="text-xs">{r.data.email || r.data.phone || "—"}</td>
                      <td>
                        {r.errors.length > 0 && (
                          <span className="text-xs text-red-600 font-medium">
                            {r.errors.join(", ")}
                          </span>
                        )}
                        {r.duplicateHits.length > 0 && (
                          <span className="text-xs text-amber-700 block">
                            ⚠️ Nghi trùng: {r.duplicateHits.map((h) => h.reason).join("; ")}
                          </span>
                        )}
                        {r.valid && r.duplicateHits.length === 0 && (
                          <span className="text-xs text-green-700">Sẵn sàng nhập</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Grid>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-ink-3">
                Nhập xong sẽ phát sự kiện <code className="bg-gray-100 px-1 py-0.5 rounded">lead.imported</code> để kích hoạt AI Agent.
              </span>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={loading || preview.validCount === 0}
                className="btn btn-primary"
              >
                {loading ? "Đang nhập..." : `Xác nhận nhập ${preview.validCount} Lead`}
              </button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
