import Link from "next/link";
import { Card, CommandBar, CommandLink, FormField, PageTitle } from "@/components/ui";
import { all } from "@/lib/db";
import { directOrderAllowed } from "@/lib/services/orders";
import { createDirectOrderAction } from "../actions";

export default async function NewOrderPage() {
  const isDirectAllowed = directOrderAllowed();

  const accounts = all<{ id: number; name: string }>(
    "SELECT id, name FROM accounts ORDER BY name ASC",
  );

  const opportunities = all<{ id: number; code: string; name: string; account_name: string }>(
    `SELECT o.id, o.code, o.name, a.name AS account_name
     FROM opportunities o
     JOIN accounts a ON a.id = o.account_id
     WHERE o.stage IN ('PROPOSE', 'CLOSE', 'WON')
     ORDER BY o.id DESC`,
  );

  const products = all<{ id: number; code: string; name: string; type: string }>(
    "SELECT id, code, name, type FROM products WHERE active = 1 ORDER BY name ASC",
  );

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-surface">
      <CommandBar>
        <CommandLink href="/orders" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
        <CommandLink href="/quotes" icon="quote">
          Tạo đơn từ báo giá chấp thuận
        </CommandLink>
      </CommandBar>

      <PageTitle
        icon="order"
        title="Tạo Đơn hàng Trực tiếp"
        subtitle="Dành cho Quản lý kinh doanh hoặc nhân viên được phân quyền trực tiếp (allow_direct_order)"
      />

      <div className="max-w-3xl p-6">
        {!isDirectAllowed ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Tính năng tạo đơn hàng trực tiếp thủ công hiện đang bị tắt bởi cấu hình hệ thống (Setting: allow_direct_order = false).
          </div>
        ) : (
          <Card title="Thông tin đơn hàng trực tiếp">
            <form action={createDirectOrderAction} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Doanh nghiệp khách hàng" required>
                  <select name="accountId" required className="input text-sm">
                    <option value="">-- Chọn khách hàng --</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Liên kết Cơ hội bán hàng (Tùy chọn)">
                  <select name="opportunityId" className="input text-sm">
                    <option value="">-- Không liên kết cơ hội --</option>
                    {opportunities.map((opp) => (
                      <option key={opp.id} value={opp.id}>
                        [{opp.code}] {opp.name} ({opp.account_name})
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="rounded-md border border-stroke p-4 bg-surface-subtle space-y-3">
                <div className="font-semibold text-xs uppercase tracking-wider text-ink-subtle">
                  Hạng mục sản phẩm chính
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="Sản phẩm / Dịch vụ" required>
                    <select name="productId" required className="input text-sm">
                      <option value="">-- Chọn sản phẩm --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code}] {p.name} ({p.type})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Số lượng" required>
                    <input type="number" name="quantity" min={1} defaultValue={1} required className="input text-sm" />
                  </FormField>

                  <FormField label="Đơn giá (VND)" required>
                    <input type="number" name="unitPrice" min={0} step={1000} placeholder="Ví dụ: 20000000" required className="input text-sm" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    label="Chiết khấu (%)"
                    hint="≤ 10% tự duyệt, > 10% đến 30% cần quyền Quản lý kinh doanh, > 30% chặn"
                  >
                    <input type="number" name="discountPct" min={0} max={30} step={0.5} defaultValue={0} className="input text-sm" />
                  </FormField>

                  <FormField label="Thuế suất VAT (%)" hint="Mặc định 10%">
                    <input type="number" name="taxPct" min={0} max={20} defaultValue={10} className="input text-sm" />
                  </FormField>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Điều khoản thanh toán" hint="Ví dụ: Tạm ứng 50%, 50% sau khi nghiệm thu">
                  <input type="text" name="paymentTerms" placeholder="Thanh toán theo tiến độ hợp đồng" className="input text-sm" />
                </FormField>

                <FormField label="Điều khoản bàn giao" hint="Ví dụ: Bàn giao tài liệu và license trong 30 ngày">
                  <input type="text" name="deliveryTerms" placeholder="Bàn giao trong vòng 30 ngày làm việc" className="input text-sm" />
                </FormField>
              </div>

              <FormField label="Ghi chú đơn hàng">
                <textarea name="notes" rows={3} placeholder="Ghi chú nội bộ hoặc yêu cầu nghiệp vụ đặc biệt..." className="input text-sm" />
              </FormField>

              <div className="flex justify-end gap-2 pt-2">
                <Link href="/orders" className="btn btn-secondary text-sm">
                  Hủy
                </Link>
                <button type="submit" className="btn btn-primary text-sm">
                  Khởi tạo và Khóa giá đơn hàng
                </button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
