import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/services/accounts";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, Flash, FormField, MessageBar, PageTitle } from "@/components/ui";
import { createContactAction } from "../actions";

export const metadata: Metadata = { title: "Thêm người liên hệ" };

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  await requireUser();
  const sp = (await searchParams) as { ok?: string; error?: string; account_id?: string };
  const accounts = listAccounts();

  return (
    <>
      <CommandBar>
        <button type="submit" form="new-contact" className="cmd">Lưu và đóng</button>
        <CommandLink href="/contacts" icon="arrowLeft">Quay lại</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle title="Thêm Người liên hệ mới" subtitle="Người liên hệ · Dữ liệu gốc" icon="contact" />

      <form id="new-contact" action={createContactAction} className="grid max-w-4xl gap-4 px-6 pb-8">
        <MessageBar intent="info">
          Mỗi người liên hệ gắn với một doanh nghiệp hiện hành và được tự động ghi nhận vào lịch sử công tác (Affiliation).
        </MessageBar>

        <Card title="Thông tin người liên hệ">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Doanh nghiệp công tác" required className="md:col-span-2">
              <select name="account_id" required className="select" defaultValue={sp.account_id ?? ""}>
                <option value="" disabled>Chọn doanh nghiệp...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Họ và tên" required>
              <input name="full_name" required className="input" placeholder="Nguyễn Văn A..." />
            </FormField>
            <FormField label="Chức danh / Vị trí">
              <input name="title" className="input" placeholder="Giám đốc công nghệ, Trưởng phòng mua hàng..." />
            </FormField>

            <FormField label="Email làm việc">
              <input name="email" type="email" className="input" placeholder="ten@congty.com" />
            </FormField>
            <FormField label="Số điện thoại di động">
              <input name="phone" className="input" placeholder="090..." />
            </FormField>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="is_primary" className="accent-[var(--brand)]" />
                Đặt làm người liên hệ chính (Primary Contact) của doanh nghiệp này
              </label>
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <SubmitButton variant="primary" icon="save">Lưu người liên hệ</SubmitButton>
        </div>
      </form>
    </>
  );
}
