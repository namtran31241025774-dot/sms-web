import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getContact, getContactAffiliations } from "@/lib/services/contacts";
import { listAccounts } from "@/lib/services/accounts";
import { SubmitButton } from "@/components/client";
import { Card, CommandBar, CommandLink, Flash, FormField, Grid, PageTitle } from "@/components/ui";
import { changeAffiliationAction, updateContactAction } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await params;
  const c = getContact(Number(p.id));
  return { title: c ? `${c.full_name} · Người liên hệ` : "Chi tiết người liên hệ" };
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireUser();
  const p = await params;
  const sp = await searchParams;
  const contactId = Number(p.id);
  const contact = getContact(contactId);

  if (!contact) notFound();

  const affiliations = getContactAffiliations(contactId);
  const allAccounts = listAccounts();
  const otherAccounts = allAccounts.filter((a) => a.id !== contact.account_id);

  return (
    <>
      <CommandBar>
        <button type="submit" form="update-contact" className="cmd">
          Lưu thay đổi
        </button>
        <CommandLink href="/contacts" icon="arrowLeft">Quay lại danh sách</CommandLink>
        <CommandLink href={`/accounts/${contact.account_id}`} icon="building">
          Xem doanh nghiệp ({contact.account_name})
        </CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title={contact.full_name}
        subtitle={`${contact.title || "Người liên hệ"} · Doanh nghiệp: ${contact.account_name}`}
        icon="contact"
      />

      <div className="grid max-w-5xl gap-6 px-6 pb-8">
        <form id="update-contact" action={updateContactAction} className="grid gap-4">
          <input type="hidden" name="id" value={contact.id} />
          <input type="hidden" name="account_id" value={contact.account_id} />

          <Card title="Thông tin người liên hệ">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Họ và tên" required>
                <input name="full_name" defaultValue={contact.full_name} required className="input" />
              </FormField>
              <FormField label="Chức danh hiện tại">
                <input name="title" defaultValue={contact.title || ""} className="input" />
              </FormField>

              <FormField label="Email làm việc">
                <input name="email" type="email" defaultValue={contact.email || ""} className="input" />
              </FormField>
              <FormField label="Số điện thoại di động">
                <input name="phone" defaultValue={contact.phone || ""} className="input" />
              </FormField>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_primary"
                    defaultChecked={contact.is_primary === 1}
                    className="accent-[var(--brand)]"
                  />
                  Đặt làm người liên hệ chính (Primary Contact) của doanh nghiệp hiện hành
                </label>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <SubmitButton variant="primary" icon="save">Cập nhật thông tin</SubmitButton>
            </div>
          </Card>
        </form>

        {/* Lịch sử công tác (Affiliation History · FR-14, DEC-21) */}
        <Card
          title="Lịch sử công tác và Doanh nghiệp liên kết"
          actions={<span className="text-xs text-ink-3">Bảo toàn liên kết quá khứ</span>}
        >
          <p className="mb-4 text-xs text-ink-2">
            Một người liên hệ có đúng một doanh nghiệp hiện hành. Khi thay đổi nơi làm việc,
            hệ thống tự động đóng liên kết cũ (ghi nhận ngày kết thúc) và mở liên kết mới, giữ nguyên lịch sử giao dịch và tương tác trước đó.
          </p>

          <Grid>
            <thead>
              <tr>
                <th>Doanh nghiệp</th>
                <th>Chức danh / Vị trí</th>
                <th>Từ ngày</th>
                <th>Đến ngày</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {affiliations.map((af) => (
                <tr key={af.id}>
                  <td className="font-medium">
                    <Link className="link" href={`/accounts/${af.account_id}`}>
                      {af.account_name}
                    </Link>
                  </td>
                  <td>{af.job_title || "—"}</td>
                  <td>{af.valid_from ? new Date(af.valid_from).toLocaleDateString("vi-VN") : "—"}</td>
                  <td>{af.valid_to ? new Date(af.valid_to).toLocaleDateString("vi-VN") : "Hiện tại"}</td>
                  <td>
                    {af.is_current ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 font-medium">
                        Hiện hành
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Cựu nhân sự
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Grid>
        </Card>

        {/* Form chuyển đơn vị công tác (FR-14) */}
        <Card title="Chuyển đơn vị công tác mới">
          <form action={changeAffiliationAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={contact.id} />

            <FormField label="Doanh nghiệp tiếp nhận mới" required className="md:col-span-2">
              <select name="new_account_id" required className="select" defaultValue="">
                <option value="" disabled>Chọn doanh nghiệp mới tiếp nhận...</option>
                {otherAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tax_code || "Chưa có MST"})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Chức vụ tại doanh nghiệp mới">
              <input name="new_job_title" className="input" placeholder="Ví dụ: Giám đốc vận hành..." />
            </FormField>

            <FormField label="Lý do chuyển đơn vị">
              <input name="reason" className="input" placeholder="Chuyển công tác, thay đổi nhân sự cấp cao..." />
            </FormField>

            <div className="md:col-span-2 pt-2">
              <SubmitButton variant="secondary" icon="arrowRight">
                Xác nhận chuyển đơn vị công tác
              </SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
