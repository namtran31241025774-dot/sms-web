import Link from "next/link";
import { Card, CommandBar, CommandLink, FormField, PageTitle } from "@/components/ui";
import { all } from "@/lib/db";
import { settingNumber } from "@/lib/services/core";
import { createQuoteAction } from "../actions";

export default async function NewQuotePage(props: {
  searchParams: Promise<{ oppId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const oppIdParam = searchParams.oppId ? Number(searchParams.oppId) : undefined;
  const defaultValidDays = settingNumber("quote_valid_days");

  // Lấy danh sách cơ hội có thể lập báo giá (PROPOSE, DEVELOP)
  const opportunities = all<{
    id: number;
    code: string;
    title: string;
    stage: string;
    account_name: string;
    price_list_name: string | null;
  }>(
    `SELECT o.id, o.code, o.name AS title, o.stage, a.name AS account_name, pl.name AS price_list_name
     FROM opportunities o
     JOIN accounts a ON a.id = o.account_id
     LEFT JOIN price_lists pl ON pl.id = o.price_list_id
     WHERE o.stage IN ('DEVELOP', 'PROPOSE')
     ORDER BY o.id DESC`,
  );

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/quotes" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
      </CommandBar>

      <PageTitle
        icon="quote"
        title="Lập Báo giá Mới"
        subtitle="Khởi tạo hồ sơ báo giá và phiên bản v1 từ Cơ hội bán hàng"
      />

      <div className="max-w-2xl p-6">
        <Card title="Thông tin khởi tạo báo giá">
          <form action={createQuoteAction} className="space-y-4">
            <FormField label="Chọn cơ hội bán hàng" required hint="Chỉ áp dụng cho cơ hội đang ở giai đoạn Phát triển hoặc Đề xuất">
              <select
                name="opportunityId"
                defaultValue={oppIdParam || (opportunities[0]?.id ?? "")}
                required
                className="input text-sm"
              >
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    [{opp.code}] {opp.title} — {opp.account_name} ({opp.price_list_name || "Chưa có bảng giá"})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Thời hạn hiệu lực (ngày)" hint="Mặc định 30 ngày">
              <input
                type="number"
                name="validDays"
                defaultValue={defaultValidDays}
                min={1}
                max={180}
                className="input text-sm"
              />
            </FormField>

            <FormField label="Ghi chú và Điều khoản thương mại ban đầu">
              <textarea
                name="notes"
                rows={3}
                placeholder="Ví dụ: Đã bao gồm phí triển khai tiêu chuẩn, bảo hành 12 tháng..."
                className="input text-sm"
              />
            </FormField>

            <div className="flex items-center gap-3 pt-3 border-t border-stroke">
              <button type="submit" className="btn btn-primary text-sm">
                Khởi tạo báo giá (Phiên bản v1)
              </button>
              <Link href="/quotes" className="btn btn-secondary text-sm">
                Hủy bỏ
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
