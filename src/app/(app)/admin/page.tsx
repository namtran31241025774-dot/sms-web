import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listUsers, listSettings } from "@/lib/services/admin";
import { listAuditLogs } from "@/lib/services/audit-view";
import { formatDate, type Role } from "@/lib/domain";
import { Card, CommandBar, CommandLink, Empty, Flash, PageTitle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { RoleBadge, UserStatusBadge } from "@/components/admin/badges";
import { RbacMatrixView } from "@/components/admin/rbac-matrix";
import { setUserStatusAction, updateSettingAction } from "./actions";

export const metadata: Metadata = { title: "Quản trị hệ thống và Phân quyền" };

const TABS: { key: string; label: string; hint: string; icon: IconName }[] = [
  { key: "users", label: "Tài khoản người dùng", hint: "Tạo, khóa, đặt lại mật khẩu", icon: "people" },
  { key: "rbac", label: "Phân quyền và phạm vi", hint: "Vai trò được làm gì, thấy gì", icon: "shield" },
  { key: "audit", label: "Nhật ký kiểm toán", hint: "Ai đã làm gì, lúc nào", icon: "history" },
  { key: "settings", label: "Tham số quy tắc", hint: "Ngưỡng, trọng số, giới hạn AI", icon: "settings" },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    role?: string;
    status?: string;
    team_id?: string;
    actor_type?: string;
    entity_type?: string;
    action?: string;
    from_date?: string;
    to_date?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab || "users";

  const canManageUsers = can(user.role, "admin.users");
  const canManageSettings = can(user.role, "admin.settings");

  // Dữ liệu cho tab Tài khoản
  const usersList = listUsers({
    role: sp.role as Role | undefined,
    status: sp.status,
    team_id: sp.team_id ? Number(sp.team_id) : undefined,
    search: sp.search,
  });

  // Dữ liệu cho tab Nhật ký kiểm toán
  const auditResult = listAuditLogs({
    actor_type: sp.actor_type,
    entity_type: sp.entity_type,
    action: sp.action,
    from_date: sp.from_date,
    to_date: sp.to_date,
    limit: 60,
  });

  // Dữ liệu cho tab Cấu hình hệ thống
  const settingsList = listSettings();

  return (
    <>
      <CommandBar>
        {canManageUsers && (
          <CommandLink href="/admin/users/new" icon="add">
            Thêm tài khoản mới
          </CommandLink>
        )}
        <CommandLink href="/reports" icon="opportunity">
          Xem báo cáo phễu và Dự báo
        </CommandLink>
        <CommandLink href={`/admin?tab=${tab}`} icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title="Quản trị hệ thống và Phân quyền"
        subtitle="Quản lý tài khoản người dùng · Phân quyền RBAC và Phạm vi dữ liệu · Kiểm toán hệ thống"
        icon="settings"
      />

      <div className="grid grid-cols-1 gap-6 px-6 pb-12 lg:grid-cols-[250px_1fr]">
        {/* Điều hướng cài đặt dạng cột dọc */}
        <aside className="h-fit rounded-2xl border border-stroke bg-surface p-2 shadow-[var(--shadow-4)] lg:sticky lg:top-16">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin?tab=${t.key}`}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${tab === t.key ? "bg-brand-tint" : "hover:bg-surface-2"}`}
            >
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tab === t.key ? "bg-brand text-white" : "bg-surface-2 text-ink-3"}`}>
                <Icon name={t.icon} size={16} />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${tab === t.key ? "font-semibold text-brand-ink" : "text-ink"}`}>{t.label}</span>
                <span className="block text-xs text-ink-3">{t.hint}</span>
              </span>
            </Link>
          ))}
        </aside>
        <div className="min-w-0 space-y-6">

        {/* TAB 1: TÀI KHOẢN NGƯỜI DÙNG (FR-96, FR-97) */}
        {tab === "users" && (
          <div className="space-y-4">
            {/* Bộ lọc tìm kiếm tài khoản */}
            <Card title="Bộ lọc tài khoản">
              <form method="GET" action="/admin" className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <input type="hidden" name="tab" value="users" />

                <div>
                  <label className="label">Tìm kiếm</label>
                  <input
                    type="text"
                    name="search"
                    defaultValue={sp.search ?? ""}
                    placeholder="Tên, email, mã nhân viên..."
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Vai trò hệ thống</label>
                  <select name="role" defaultValue={sp.role ?? ""} className="select">
                    <option value="">-- Tất cả vai trò --</option>
                    <option value="ADMIN">Người quản trị hệ thống (ADMIN)</option>
                    <option value="SALES_MANAGER">Quản lý kinh doanh (SALES_MANAGER)</option>
                    <option value="SALES">Nhân viên kinh doanh (SALES)</option>
                    <option value="PRESALES">Chuyên viên tư vấn giải pháp (PRESALES)</option>
                    <option value="FINANCE">Nhân viên Tài chính – Kế toán (FINANCE)</option>
                    <option value="DELIVERY">Nhân viên triển khai kỹ thuật (DELIVERY)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Trạng thái tài khoản</label>
                  <select name="status" defaultValue={sp.status ?? ""} className="select">
                    <option value="">-- Tất cả trạng thái --</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="SUSPENDED">Đã khóa</option>
                    <option value="INACTIVE">Ngưng hoạt động</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button type="submit" className="btn-secondary w-full">
                    Lọc tài khoản
                  </button>
                  <Link href="/admin?tab=users" className="btn-ghost text-xs">
                    Đặt lại
                  </Link>
                </div>
              </form>
            </Card>

            {/* Danh sách tài khoản */}
            <Card title={`Danh sách tài khoản người dùng (${usersList.length} tài khoản)`}>
              {usersList.length === 0 ? (
                <Empty>Không tìm thấy tài khoản người dùng phù hợp với bộ lọc</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-[#fcfcfc] border-b border-stroke text-xs font-semibold text-ink-2">
                      <tr>
                        <th className="px-4 py-2.5">Họ tên và Email</th>
                        <th className="px-4 py-2.5">Vai trò hệ thống</th>
                        <th className="px-4 py-2.5">Hồ sơ nhân viên</th>
                        <th className="px-4 py-2.5">Nhóm Sale Pod</th>
                        <th className="px-4 py-2.5">Trạng thái</th>
                        <th className="px-4 py-2.5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke text-xs">
                      {usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-[#fafafa]">
                          <td className="px-4 py-2.5 font-medium text-ink">
                            <Link href={`/admin/users/${u.id}`} className="hover:text-primary hover:underline font-semibold">
                              {u.name}
                            </Link>
                            <div className="text-[11px] text-ink-3 font-mono">{u.email}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <RoleBadge role={u.role} />
                            {u.title && <div className="text-[11px] text-ink-3 mt-0.5">{u.title}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">
                            {u.employee_id ? (
                              <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                                {u.employee_id} {u.employee_name ? `· ${u.employee_name}` : ""}
                              </span>
                            ) : (
                              <span className="text-zinc-400 italic">Chưa liên kết</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">
                            {u.team_name ? (
                              <div>
                                <span className="font-medium">{u.team_name}</span>
                                <span className="text-[10px] text-ink-3 font-mono block">({u.team_code})</span>
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <UserStatusBadge status={u.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right space-x-2">
                            <Link
                              href={`/admin/users/${u.id}`}
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              Chi tiết
                            </Link>
                            {canManageUsers && u.id !== user.id && (
                              <form action={setUserStatusAction} className="inline">
                                <input type="hidden" name="id" value={u.id} />
                                <input type="hidden" name="return_to" value="/admin?tab=users" />
                                {u.status === "ACTIVE" ? (
                                  <>
                                    <input type="hidden" name="status" value="SUSPENDED" />
                                    <button
                                      type="submit"
                                      className="text-xs text-rose-600 hover:text-rose-800 font-medium hover:underline"
                                    >
                                      Khóa tài khoản
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <input type="hidden" name="status" value="ACTIVE" />
                                    <button
                                      type="submit"
                                      className="text-xs text-emerald-600 hover:text-emerald-800 font-medium hover:underline"
                                    >
                                      Mở khóa
                                    </button>
                                  </>
                                )}
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: MA TRẬN PHÂN QUYỀN RBAC (FR-98) */}
        {tab === "rbac" && (
          <div className="space-y-4">
            <Card title="Ma trận Phân quyền và Kiểm soát truy cập (RBAC)">
              <RbacMatrixView />
            </Card>
          </div>
        )}

        {/* TAB 3: NHẬT KÝ KIỂM TOÁN (FR-100) */}
        {tab === "audit" && (
          <div className="space-y-4">
            {/* Bộ lọc nhật ký */}
            <Card title="Bộ lọc nhật ký kiểm toán">
              <form method="GET" action="/admin" className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <input type="hidden" name="tab" value="audit" />

                <div>
                  <label className="label">Loại tác nhân</label>
                  <select name="actor_type" defaultValue={sp.actor_type ?? ""} className="select">
                    <option value="">-- Tất cả tác nhân --</option>
                    <option value="USER">Người dùng (USER)</option>
                    <option value="AI">Tác nhân AI (AI)</option>
                    <option value="INTEGRATION">Hệ thống ngoài (INTEGRATION)</option>
                    <option value="SYSTEM">Hệ thống nội bộ (SYSTEM)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Loại đối tượng nghiệp vụ</label>
                  <input
                    type="text"
                    name="entity_type"
                    defaultValue={sp.entity_type ?? ""}
                    placeholder="user, lead, opportunity, quote..."
                    className="input font-mono"
                  />
                </div>

                <div>
                  <label className="label">Hành động</label>
                  <input
                    type="text"
                    name="action"
                    defaultValue={sp.action ?? ""}
                    placeholder="CREATE, UPDATE, CONVERT, SUSPEND..."
                    className="input font-mono"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <button type="submit" className="btn-secondary w-full">
                    Lọc nhật ký
                  </button>
                  <Link href="/admin?tab=audit" className="btn-ghost text-xs">
                    Đặt lại
                  </Link>
                </div>
              </form>
            </Card>

            {/* Danh sách nhật ký */}
            <Card title={`Nhật ký hoạt động kiểm toán (${auditResult.items.length} bản ghi gần nhất)`}>
              {auditResult.items.length === 0 ? (
                <Empty>Chưa có bản ghi nhật ký kiểm toán nào phù hợp</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#fcfcfc] border-b border-stroke text-ink-2 font-semibold">
                      <tr>
                        <th className="px-3 py-2.5">Thời điểm</th>
                        <th className="px-3 py-2.5">Tác nhân</th>
                        <th className="px-3 py-2.5">Hành động</th>
                        <th className="px-3 py-2.5">Đối tượng</th>
                        <th className="px-3 py-2.5">Chuyển trạng thái</th>
                        <th className="px-3 py-2.5">Lý do và Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke">
                      {auditResult.items.map((log) => (
                        <tr key={log.id} className="hover:bg-[#fafafa]">
                          <td className="px-3 py-2 font-mono text-ink-3 whitespace-nowrap">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-ink">{log.actor_label}</div>
                            <span
                              className={`text-[10px] px-1 rounded font-semibold ${
                                log.actor_type === "AI"
                                  ? "bg-purple-100 text-purple-700"
                                  : log.actor_type === "USER"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {log.actor_type}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-ink">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-ink-2 font-semibold">{log.entity_type}</span>
                            <span className="text-ink-3 ml-1">#{log.entity_id}</span>
                          </td>
                          <td className="px-3 py-2">
                            {log.from_status || log.to_status ? (
                              <div className="flex items-center gap-1 font-mono text-[11px]">
                                <span className="text-zinc-500">{log.from_status || "—"}</span>
                                <span>→</span>
                                <span className="font-semibold text-emerald-700">{log.to_status || "—"}</span>
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-ink-2">
                            <div>{log.reason || "—"}</div>
                            {log.details_json && (
                              <pre className="mt-1 text-[10px] text-ink-3 bg-slate-50 p-1.5 rounded border border-slate-200 overflow-x-auto max-w-xs font-mono">
                                {log.details_json}
                              </pre>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 4: CẤU HÌNH HỆ THỐNG (SETTINGS) */}
        {tab === "settings" && (
          <div className="space-y-4">
            {settingGroups(settingsList).map(([group, items]) => (
              <Card key={group} title={group} pad={false}>
                <ul className="divide-y divide-[#eef1f5]">
                  {items.map((st) => (
                    <li key={st.key} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_320px] md:items-center">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink">{st.description || st.key}</div>
                        <code className="text-[11px] text-ink-3">{st.key}</code>
                      </div>
                      {canManageSettings ? (
                        <form action={updateSettingAction} className="flex items-center gap-2">
                          <input type="hidden" name="key" value={st.key} />
                          <input type="text" name="value" defaultValue={st.value} className="input font-mono text-xs" />
                          <button type="submit" className="btn btn-sm">Lưu</button>
                        </form>
                      ) : (
                        <span className="font-mono text-sm font-semibold text-ink">{st.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>
    </>
  );
}

const GROUPS: [string, string][] = [
  ["ai_", "AI Agent"], ["llm_", "AI Agent"], ["opp_", "AI Agent"], ["bant", "Đánh giá khách hàng"], ["lead_", "Đánh giá khách hàng"],
  ["importance", "Phát triển cơ hội"], ["manager_gate", "Phát triển cơ hội"], ["expert_review", "Phát triển cơ hội"], ["forecast_", "Dự báo doanh thu"],
  ["discount", "Báo giá và chiết khấu"], ["quote", "Báo giá và chiết khấu"], ["order", "Đơn hàng"], ["invoice", "Hóa đơn và thanh toán"], ["payment", "Hóa đơn và thanh toán"], ["dunning", "Hóa đơn và thanh toán"],
];
function settingGroups<T extends { key: string }>(list: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const st of list) {
    const g = GROUPS.find(([prefix]) => st.key.startsWith(prefix))?.[1] ?? "Khác";
    map.set(g, [...(map.get(g) ?? []), st]);
  }
  return [...map.entries()];
}
