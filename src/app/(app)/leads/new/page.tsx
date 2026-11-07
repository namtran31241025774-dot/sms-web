import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { LEAD_SOURCE } from "@/lib/domain";
import { users } from "@/lib/services/core";
import { listAccounts } from "@/lib/services/accounts";
import { listContacts } from "@/lib/services/contacts";
import { listTags } from "@/lib/services/leads";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, Flash, FormField, MessageBar, PageTitle } from "@/components/ui";
import { createLeadAction } from "../actions";

export const metadata: Metadata = { title: "Lead mới" };

export default async function NewLeadPage({ searchParams }: PageProps<"/leads/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as { ok?: string; error?: string; account_id?: string };
  const owners = [...users("SALES"), ...users("SALES_MANAGER")];
  const accounts = listAccounts();
  const contacts = listContacts();
  const allTags = listTags();

  return (
    <>
      <CommandBar>
        <button type="submit" form="new-lead" className="cmd">Lưu và đóng</button>
        <CommandLink href="/leads" icon="arrowLeft">Quay lại</CommandLink>
      </CommandBar>
      <Flash sp={sp} />
      <PageTitle title="Tạo Lead mới" subtitle="Khách hàng tiềm năng · Qualify" icon="lead" />
      <form id="new-lead" action={createLeadAction} className="grid max-w-5xl gap-4 px-6 pb-8">
        <MessageBar intent="info">
          Hệ thống tự chuẩn hóa email/SĐT/địa chỉ và cảnh báo nếu phát hiện trùng lặp. Bản ghi trùng chỉ được gắn cờ cảnh báo, không tự ý gộp.
        </MessageBar>

        {/* FR-11: Liên kết Account / Contact có sẵn để tự động điền */}
        <Card title="Liên kết doanh nghiệp / Người liên hệ có sẵn (Tùy chọn)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Chọn Doanh nghiệp (Account) có sẵn">
              <select name="account_id" className="select" defaultValue={sp.account_id ?? ""}>
                <option value="">— Nhập doanh nghiệp mới —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.industry || "Chưa rõ ngành"})</option>
                ))}
              </select>
            </FormField>
            <FormField label="Chọn Người liên hệ (Contact) có sẵn">
              <select name="contact_id" className="select" defaultValue="">
                <option value="">— Nhập người liên hệ mới —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name} – {c.account_name}</option>
                ))}
              </select>
            </FormField>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Khi chọn Account hoặc Contact có sẵn, hệ thống sẽ tự động điền các thông tin liên kết nếu để trống.
          </p>
        </Card>

        <Card title="Thông tin khách hàng và Nhu cầu">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Tên công ty" required>
              <input name="company_name" required className="input" placeholder="Tên doanh nghiệp..." />
            </FormField>
            <FormField label="Ngành nghề">
              <input name="industry" className="input" placeholder="VD: Sản xuất, Phân phối, Dịch vụ CNTT…" />
            </FormField>
            <FormField label="Chủ đề / Nhu cầu chính">
              <input name="topic" className="input" placeholder="VD: Cần triển khai CRM cho đội sales 20 người…" />
            </FormField>
            <FormField label="Nguồn Lead">
              <select name="source" className="select" defaultValue="MANUAL">
                {Object.entries(LEAD_SOURCE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Người liên hệ" required>
              <input name="contact_name" required className="input" placeholder="Họ và tên..." />
            </FormField>
            <FormField label="Chức danh">
              <input name="contact_title" className="input" placeholder="Giám đốc kinh doanh, IT Manager…" />
            </FormField>
            <FormField label="Email">
              <input name="email" type="email" className="input" placeholder="email@congty.com" />
            </FormField>
            <FormField label="Số điện thoại">
              <input name="phone" className="input" placeholder="0912..." />
            </FormField>

            <FormField label="Địa chỉ" className="md:col-span-2">
              <input name="address" className="input" placeholder="Số nhà, đường, quận/huyện, tỉnh/thành phố..." />
            </FormField>

            <FormField label="Người phụ trách">
              <select name="owner_id" className="select" defaultValue={user.id}>
                {owners.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </FormField>

            {/* FR-07: Gắn nhãn Tags */}
            {allTags.length > 0 && (
              <FormField label="Gắn nhãn phân nhóm" className="md:col-span-2">
                <div className="flex flex-wrap gap-2 pt-1">
                  {allTags.map((t) => (
                    <label key={t.id} className="inline-flex items-center gap-1.5 rounded border border-stroke px-2.5 py-1 text-xs hover:bg-[#f5f5f5] cursor-pointer">
                      <input type="checkbox" name="tag_ids" value={t.id} className="accent-[var(--brand)]" />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </FormField>
            )}

            <FormField label="Ghi chú chi tiết" className="md:col-span-2">
              <textarea name="notes" className="textarea" placeholder="Nội dung trao đổi ban đầu, yêu cầu tính năng..." />
            </FormField>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="run_agent" defaultChecked /> Cho Sales Qualification Agent nghiên cứu nền sau khi lưu (kết quả là đề xuất chờ duyệt)
          </label>
        </Card>

        <div className="flex gap-2">
          <SubmitButton variant="primary" icon="save">Lưu Lead</SubmitButton>
        </div>
      </form>
    </>
  );
}
