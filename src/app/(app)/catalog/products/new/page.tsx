import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { listCategories } from "@/lib/services/catalog";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, FormField, MessageBar, PageTitle } from "@/components/ui";
import { createProductAction } from "../../actions";

export const metadata: Metadata = { title: "Thêm sản phẩm mới" };

export default async function NewProductPage() {
  await requirePermission("catalog.write");
  const categories = listCategories();

  return (
    <>
      <CommandBar>
        <button type="submit" form="new-product" className="cmd">
          Lưu và đóng
        </button>
        <CommandLink href="/catalog" icon="arrowLeft">
          Quay lại danh mục
        </CommandLink>
      </CommandBar>

      <PageTitle
        title="Thêm Sản phẩm, Dịch vụ hoặc Mô-đun mới"
        subtitle="Danh mục · Dữ liệu gốc"
        icon="product"
      />

      <form id="new-product" action={createProductAction} className="grid max-w-4xl gap-4 px-6 pb-10">
        <MessageBar intent="info">
          Hệ thống tự động kiểm tra trùng mã sản phẩm. Cập nhật danh mục không tự thay đổi nội dung đã được xác nhận trên các báo giá hoặc đơn hàng đã có.
        </MessageBar>

        <Card title="Thông tin sản phẩm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Mã sản phẩm (Code)" required hint="Mã định danh duy nhất (VD: SC-PRO, MOD-CPQ, SV-IMPL)">
              <input
                name="code"
                required
                className="input uppercase font-mono"
                placeholder="VD: SC-ENT"
              />
            </FormField>

            <FormField label="Loại sản phẩm" required>
              <select name="type" required className="select" defaultValue="SUBSCRIPTION">
                <option value="PACKAGE">Gói giải pháp toàn diện (Package)</option>
                <option value="SUBSCRIPTION">Thuê bao phần mềm (Subscription)</option>
                <option value="MODULE">Mô-đun tính năng (Module)</option>
                <option value="SERVICE">Dịch vụ triển khai (Service)</option>
                <option value="TRAINING">Dịch vụ đào tạo (Training)</option>
              </select>
            </FormField>

            <FormField label="Tên sản phẩm / Dịch vụ" required className="md:col-span-2">
              <input
                name="name"
                required
                className="input"
                placeholder="Ví dụ: Sales Cloud Enterprise, Triển khai và tích hợp ERP..."
              />
            </FormField>

            <FormField label="Nhóm danh mục (Category)" hint="Nhóm sản phẩm để phân loại và lọc">
              <input
                name="category"
                className="input"
                list="category-suggestions"
                placeholder="VD: Core CRM, AI, Integration, Professional Services..."
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </FormField>

            <FormField label="Đơn vị tính (Unit)" required hint="VD: user/năm, gói, man-day, buổi">
              <input
                name="unit"
                required
                className="input"
                placeholder="user/năm, man-day, module..."
                defaultValue="user/năm"
              />
            </FormField>

            <FormField label="Mô tả tóm tắt" className="md:col-span-2">
              <textarea
                name="description"
                className="textarea"
                rows={3}
                placeholder="Mô tả chức năng, đối tượng sử dụng hoặc phạm vi triển khai..."
              />
            </FormField>
          </div>
        </Card>

        <Card title="Chính sách quyền sử dụng (License Policy ·)">
          <div className="space-y-3">
            <p className="text-xs text-ink-3">
              Quy định điều kiện cấp phép quyền sử dụng, số lượng tối thiểu và chu kỳ tính cước làm căn cứ cho cơ hội và báo giá tham chiếu thống nhất.
            </p>
            <FormField label="Cấu hình chính sách (dạng JSON hoặc ghi chú điều kiện)">
              <textarea
                name="license_policy"
                className="textarea font-mono text-xs"
                rows={4}
                defaultValue={`{\n  "license_type": "NAMED_USER",\n  "min_quantity": 5,\n  "billing_cycle": "ANNUAL"\n}`}
              />
            </FormField>
          </div>
        </Card>

        <div className="flex gap-2">
          <SubmitButton variant="primary" icon="save">
            Lưu sản phẩm
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
