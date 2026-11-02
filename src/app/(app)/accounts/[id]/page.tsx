import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getAccount } from "@/lib/services/accounts";
import { listContacts } from "@/lib/services/contacts";
import { listInteractions } from "@/lib/services/interactions";
import { all } from "@/lib/db";
import { users } from "@/lib/services/core";
import { formatDate, OPP_STAGE } from "@/lib/domain";
import { SubmitButton } from "@/components/client";
import { Timeline } from "@/components/record";
import {
  Card, CommandBar, CommandLink, Flash, FormField, HeaderField, PageTitle, Persona, Tabs, Grid, Empty,
} from "@/components/ui";
import { updateAccountAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/accounts/[id]">): Promise<Metadata> {
  const account = getAccount(Number((await params).id));
  return { title: account?.name ?? "Doanh nghiệp" };
}

export default async function AccountDetailPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const user = await requireUser();
  const accountId = Number((await params).id);
  const sp = (await searchParams) as { tab?: string; ok?: string; error?: string };
  const account = getAccount(accountId);
  if (!account) notFound();

  const tab = sp.tab ?? "summary";
  const canWrite = can(user.role, "account.write");
  const owners = [...users("SALES"), ...users("SALES_MANAGER")];
  const contacts = listContacts({ accountId: account.id });
  const interactions = listInteractions("account", account.id);

  // Lấy các cơ hội của account
  const opportunities = all<{
    id: number;
    code: string;
    name: string;
    stage: string;
    amount: number;
    close_date: string | null;
  }>("SELECT id, code, name, stage, amount, close_date FROM opportunities WHERE account_id = ? ORDER BY id DESC", account.id);

  const base = `/accounts/${account.id}`;

  return (
    <>
      <CommandBar>
        {canWrite && <button type="submit" form="acc-form" className="cmd">Lưu thay đổi</button>}
        <CommandLink href="/accounts" icon="arrowLeft">Danh sách doanh nghiệp</CommandLink>
        <CommandLink href={`/leads/new?account_id=${account.id}`} icon="lead">Tạo Lead cho khách này</CommandLink>
        <CommandLink href={`/contacts/new?account_id=${account.id}`} icon="contact">Thêm người liên hệ</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        icon="account"
        title={account.name}
        subtitle={`Hồ sơ Doanh nghiệp 360° · MST: ${account.tax_code || "Chưa có"}`}
        right={
          <>
            <HeaderField label="Ngành nghề">{account.industry || "—"}</HeaderField>
            <HeaderField label="Quy mô">{account.employee_size || "—"}</HeaderField>
            <HeaderField label="Cơ hội mở">{account.open_opps ?? 0}</HeaderField>
            <HeaderField label="Phụ trách"><Persona name={account.owner_name} size={24} /></HeaderField>
          </>
        }
      />

      <Tabs
        base={base}
        current={tab}
        tabs={[
          { key: "summary", label: "Tổng quan và 360°" },
          { key: "contacts", label: "Người liên hệ", count: contacts.length },
          { key: "opportunities", label: "Cơ hội bán hàng", count: opportunities.length },
          { key: "activities", label: "Lịch sử tương tác", count: interactions.length },
        ]}
      />

      <div className="px-6 py-4 pb-10">
        {tab === "summary" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Thông tin chi tiết" className="xl:col-span-2">
              <form id="acc-form" action={updateAccountAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={account.id} />
                <fieldset disabled={!canWrite} className="contents">
                  <FormField label="Tên doanh nghiệp" required>
                    <input name="name" defaultValue={account.name} required className="input" />
                  </FormField>
                  <FormField label="Mã số thuế">
                    <input name="tax_code" defaultValue={account.tax_code ?? ""} className="input" />
                  </FormField>
                  <FormField label="Ngành nghề">
                    <input name="industry" defaultValue={account.industry ?? ""} className="input" />
                  </FormField>
                  <FormField label="Quy mô">
                    <input name="employee_size" defaultValue={account.employee_size ?? ""} className="input" />
                  </FormField>
                  <FormField label="Website">
                    <input name="website" defaultValue={account.website ?? ""} className="input" />
                  </FormField>
                  <FormField label="Email">
                    <input name="email" type="email" defaultValue={account.email ?? ""} className="input" />
                  </FormField>
                  <FormField label="Số điện thoại">
                    <input name="phone" defaultValue={account.phone ?? ""} className="input" />
                  </FormField>
                  <FormField label="Người phụ trách">
                    <select name="owner_id" defaultValue={account.owner_id ?? ""} className="select">
                      {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Địa chỉ trụ sở" className="md:col-span-2">
                    <input name="address" defaultValue={account.address ?? ""} className="input" />
                  </FormField>
                </fieldset>
                {canWrite && (
                  <div className="md:col-span-2">
                    <SubmitButton icon="save">Lưu cập nhật</SubmitButton>
                  </div>
                )}
              </form>
            </Card>

            <div className="space-y-4">
              <Card title="Người liên hệ chính">
                {contacts.length > 0 ? (
                  <div className="space-y-2">
                    {contacts.slice(0, 3).map((c) => (
                      <div key={c.id} className="flex items-center justify-between border-b border-[#f0f0f0] pb-2 text-sm">
                        <div>
                          <Link className="link font-semibold" href={`/contacts/${c.id}`}>{c.full_name}</Link>
                          <span className="block text-xs text-ink-3">{c.title || "—"}</span>
                        </div>
                        {!!c.is_primary && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Chính</span>
                        )}
                      </div>
                    ))}
                    <Link className="link block text-xs pt-1 text-center" href={`${base}?tab=contacts`}>
                      Xem tất cả ({contacts.length})
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-ink-3">Chưa có người liên hệ nào.</p>
                )}
              </Card>

              <Card title="Chỉ số khách hàng (Account 360)">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded bg-[#f8f9fa] p-2.5">
                    <span className="block text-xl font-bold text-brand">{opportunities.length}</span>
                    <span className="text-[11px] text-ink-3">Tổng số Cơ hội</span>
                  </div>
                  <div className="rounded bg-[#f8f9fa] p-2.5">
                    <span className="block text-xl font-bold text-success">{account.open_opps ?? 0}</span>
                    <span className="text-[11px] text-ink-3">Đang đàm phán</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "contacts" && (
          <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-4)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Danh sách Người liên hệ</h3>
              <Link className="btn btn-sm btn-primary" href={`/contacts/new?account_id=${account.id}`}>
                Thêm người liên hệ
              </Link>
            </div>
            {contacts.length ? (
              <Grid>
                <thead>
                  <tr>
                    <th>Họ và tên</th>
                    <th>Chức danh</th>
                    <th>Email</th>
                    <th>Điện thoại</th>
                    <th>Vai trò</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link className="link font-semibold" href={`/contacts/${c.id}`}>{c.full_name}</Link>
                      </td>
                      <td>{c.title || "—"}</td>
                      <td>{c.email || "—"}</td>
                      <td>{c.phone || "—"}</td>
                      <td>
                        {c.is_primary ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 font-medium">Liên hệ chính</span>
                        ) : (
                          <span className="text-xs text-ink-3">Thành viên</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Grid>
            ) : (
              <Empty icon="contact">Chưa có người liên hệ nào</Empty>
            )}
          </div>
        )}

        {tab === "opportunities" && (
          <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-4)]">
            <h3 className="mb-3 font-semibold text-sm">Danh sách Cơ hội bán hàng</h3>
            {opportunities.length ? (
              <Grid>
                <thead>
                  <tr>
                    <th>Mã cơ hội</th>
                    <th>Tên cơ hội</th>
                    <th>Giai đoạn</th>
                    <th>Doanh thu ước tính</th>
                    <th>Ngày chốt</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="link font-semibold" href={`/opportunities/${o.id}`}>{o.code}</Link>
                      </td>
                      <td>{o.name}</td>
                      <td>{OPP_STAGE[o.stage] ?? o.stage}</td>
                      <td className="font-semibold text-brand">
                        {new Intl.NumberFormat("vi-VN").format(o.amount)} ₫
                      </td>
                      <td>{formatDate(o.close_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </Grid>
            ) : (
              <Empty icon="opportunity">Chưa có cơ hội nào</Empty>
            )}
          </div>
        )}

        {tab === "activities" && (
          <Card title="Dòng thời gian tương tác với Doanh nghiệp">
            <Timeline items={interactions} />
          </Card>
        )}
      </div>
    </>
  );
}
