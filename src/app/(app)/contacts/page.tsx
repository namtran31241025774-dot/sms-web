import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/lib/services/contacts";
import { CommandBar, CommandLink, Empty, Flash, Grid, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Người liên hệ (Contacts)" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  await requireUser();
  const sp = (await searchParams) as { q?: string; ok?: string; error?: string };
  const contacts = listContacts({ q: sp.q });

  return (
    <>
      <CommandBar>
        <CommandLink href="/contacts/new" icon="add">Mới</CommandLink>
        <CommandLink href="/contacts" icon="refresh">Làm mới</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title="Người liên hệ (Contacts)"
        subtitle="Quản lý thông tin đầu mối liên hệ và lịch sử công tác"
        icon="contact"
      />

      <div className="px-6 pb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {sp.q && (
            <span className="text-sm text-ink-3">
              Kết quả cho “{sp.q}” · <Link className="link" href="/contacts">Xóa tìm kiếm</Link>
            </span>
          )}
        </div>

        <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
          <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2 text-sm text-ink-3">
            <span>Danh sách người liên hệ</span>
            <span>{contacts.length} bản ghi</span>
          </div>

          {contacts.length ? (
            <Grid>
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Chức danh</th>
                  <th>Doanh nghiệp hiện tại</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="link font-semibold" href={`/contacts/${c.id}`}>
                        {c.full_name}
                      </Link>
                    </td>
                    <td>{c.title || "—"}</td>
                    <td>
                      <Link className="link" href={`/accounts/${c.account_id}`}>
                        {c.account_name}
                      </Link>
                    </td>
                    <td>{c.email || "—"}</td>
                    <td>{c.phone || "—"}</td>
                    <td>
                      {c.is_primary ? (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 font-medium">
                          Liên hệ chính
                        </span>
                      ) : (
                        <span className="text-xs text-ink-3">Thành viên</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Grid>
          ) : (
            <Empty icon="contact">Không có người liên hệ nào</Empty>
          )}
        </div>
      </div>
    </>
  );
}
