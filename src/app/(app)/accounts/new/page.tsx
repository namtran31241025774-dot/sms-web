import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { users } from "@/lib/services/core";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, Flash, FormField, MessageBar, PageTitle } from "@/components/ui";
import { createAccountAction } from "../actions";

export const metadata: Metadata = { title: "Tạo doanh nghiệp mới" };

export default async function NewAccountPage({ searchParams }: PageProps<"/accounts/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as { ok?: string; error?: string };
  const owners = [...users("SALES"), ...users("SALES_MANAGER")];

  return (
    <>
      <CommandBar>
        <button type="submit" form="new-acc" className="cmd">Lưu và đóng</button>
        <CommandLink href="/accounts" icon="arrowLeft">Quay lại</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle title="Tạo Doanh nghiệp mới (Account)" subtitle="Dữ liệu gốc" icon="account" />

      <form id="new-acc" action={createAccountAction} className="grid max-w-4xl gap-4 px-6 pb-8">
        <MessageBar intent="info">
          Doanh nghiệp (Account) là thực thể pháp nhân trung tâm, liên kết với các người liên hệ (Contacts) và các cơ hội bán hàng (Opportunities).
        </MessageBar>

        <Card title="Thông tin pháp nhân và Hoạt động">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Tên doanh nghiệp" required>
              <input name="name" required className="input" placeholder="Công ty CP / TNHH..." />
            </FormField>
            <FormField label="Mã số thuế (MST)">
              <input name="tax_code" className="input" placeholder="0101234567..." />
            </FormField>

            <FormField label="Ngành nghề">
              <input name="industry" className="input" placeholder="Sản xuất, Bán lẻ, CNTT, Dược phẩm..." />
            </FormField>
            <FormField label="Quy mô nhân sự">
              <select name="employee_size" className="select" defaultValue="100–200">
                <option value="Dưới 50">Dưới 50 nhân sự</option>
                <option value="50–100">50–100 nhân sự</option>
                <option value="100–200">100–200 nhân sự (SMB)</option>
                <option value="200–500">200–500 nhân sự (Enterprise)</option>
                <option value="500+">Trên 500 nhân sự (Enterprise)</option>
              </select>
            </FormField>

            <FormField label="Website">
              <input name="website" className="input" placeholder="https://congty.com" />
            </FormField>
            <FormField label="Email doanh nghiệp">
              <input name="email" type="email" className="input" placeholder="contact@congty.com" />
            </FormField>

            <FormField label="Số điện thoại tổng đài">
              <input name="phone" className="input" placeholder="028..." />
            </FormField>
            <FormField label="Người phụ trách (Account Owner)">
              <select name="owner_id" className="select" defaultValue={user.id}>
                {owners.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Địa chỉ trụ sở" className="md:col-span-2">
              <input name="address" className="input" placeholder="Địa chỉ chi tiết..." />
            </FormField>
          </div>
        </Card>

        <div className="flex gap-2">
          <SubmitButton variant="primary" icon="save">Lưu doanh nghiệp</SubmitButton>
        </div>
      </form>
    </>
  );
}
