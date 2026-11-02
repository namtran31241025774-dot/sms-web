import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/services/accounts";
import { CommandBar, CommandLink, Empty, Flash, Grid, PageTitle, Persona } from "@/components/ui";

export const metadata: Metadata = { title: "Doanh nghiệp (Accounts)" };

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  await requireUser();
  const sp = (await searchParams) as { q?: string; status?: string; industry?: string; ok?: string; error?: string };
  const accounts = listAccounts({ q: sp.q, status: sp.status, industry: sp.industry });

  return (
    <>
      <CommandBar>
        <CommandLink href="/accounts/new" icon="add">Mới</CommandLink>
        <CommandLink href="/accounts" icon="refresh">Làm mới</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title="Doanh nghiệp (Accounts)"
        subtitle="Quản lý hồ sơ khách hàng doanh nghiệp"
        icon="account"
      />

      <div className="px-6 pb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {sp.q && (
            <span className="text-sm text-ink-3">
              Kết quả cho “{sp.q}” · <Link className="link" href="/accounts">Xóa tìm kiếm</Link>
            </span>
          )}
        </div>

        <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
          <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2 text-sm text-ink-3">
            <span>Danh sách khách hàng doanh nghiệp</span>
            <span>{accounts.length} bản ghi</span>
          </div>

          {accounts.length ? (
            <Grid>
              <thead>
                <tr>
                  <th>Tên doanh nghiệp</th>
                  <th>Mã số thuế</th>
                  <th>Ngành nghề</th>
                  <th>Quy mô</th>
                  <th>Người liên hệ</th>
                  <th>Cơ hội mở</th>
                  <th>Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="link font-semibold" href={`/accounts/${a.id}`}>
                        {a.name}
                      </Link>
                      {a.email_domain && (
                        <span className="block text-xs text-ink-3">@{a.email_domain}</span>
                      )}
                    </td>
                    <td>{a.tax_code || "—"}</td>
                    <td>{a.industry || "—"}</td>
                    <td>{a.employee_size || "—"}</td>
                    <td>
                      <span className="font-semibold">{a.contacts_count ?? 0}</span>
                    </td>
                    <td>
                      <span className={Number(a.open_opps) > 0 ? "font-semibold text-brand" : "text-ink-3"}>
                        {a.open_opps ?? 0}
                      </span>
                    </td>
                    <td>
                      <Persona name={a.owner_name} size={24} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Grid>
          ) : (
            <Empty icon="account">Không có doanh nghiệp nào</Empty>
          )}
        </div>
      </div>
    </>
  );
}
