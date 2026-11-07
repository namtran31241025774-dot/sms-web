import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, FormField, MessageBar, PageTitle } from "@/components/ui";
import { createPriceListAction } from "../../actions";

export const metadata: Metadata = { title: "Tạo bảng giá mới" };

export default async function NewPriceListPage() {
  await requirePermission("pricelist.write");

  return (
    <>
      <CommandBar>
        <button type="submit" form="new-pricelist" className="cmd">
          Lưu và tiếp tục
        </button>
        <CommandLink href="/catalog?tab=price_lists" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
      </CommandBar>

      <PageTitle
        title="Tạo Bảng giá mới"
        subtitle="Bảng giá · Dữ liệu gốc"
        icon="money"
      />

      <form id="new-pricelist" action={createPriceListAction} className="grid max-w-3xl gap-4 px-6 pb-10">
        <MessageBar intent="info">
          Mỗi bảng giá sử dụng duy nhất một loại tiền tệ (VND, USD...). Bảng giá có thể áp dụng chung hoặc gắn theo phân khúc khách hàng SMB / Enterprise.
        </MessageBar>

        <Card title="Thông tin bảng giá">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Tên bảng giá" required className="md:col-span-2">
              <input
                name="name"
                required
                className="input"
                placeholder="Ví dụ: Bảng giá Chuẩn 2026, Bảng giá Doanh nghiệp lớn..."
              />
            </FormField>

            <FormField label="Phân khúc khách hàng áp dụng" required>
              <select name="customer_segment" required className="select" defaultValue="ALL">
                <option value="ALL">Áp dụng toàn bộ (ALL)</option>
                <option value="SMB">Doanh nghiệp vừa và nhỏ (SMB &lt; 200 nhân sự)</option>
                <option value="ENTERPRISE">Doanh nghiệp lớn (Enterprise ≥ 200 nhân sự)</option>
              </select>
            </FormField>

            <FormField label="Loại tiền tệ" required>
              <select name="currency" required className="select font-mono" defaultValue="VND">
                <option value="VND">VND (Việt Nam Đồng)</option>
                <option value="USD">USD (Đô la Mỹ)</option>
              </select>
            </FormField>

            <FormField label="Ngày bắt đầu hiệu lực (valid_from)">
              <input name="valid_from" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
            </FormField>

            <FormField label="Ngày kết thúc hiệu lực (valid_to)" hint="Để trống nếu không có thời hạn kết thúc">
              <input name="valid_to" type="date" className="input" />
            </FormField>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="is_default" className="accent-[var(--brand)]" />
                Đặt làm bảng giá mặc định cho phân khúc này
              </label>
            </div>

            <FormField label="Mô tả / Ghi chú" className="md:col-span-2">
              <textarea
                name="description"
                className="textarea"
                rows={3}
                placeholder="Ghi chú điều kiện áp dụng, chính sách thanh toán kèm theo..."
              />
            </FormField>
          </div>
        </Card>

        <div className="flex gap-2">
          <SubmitButton variant="primary" icon="save">
            Tạo bảng giá
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
