import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getUser } from "@/lib/services/admin";
import { all } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { CommandBar, CommandLink, PageTitle, Card, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { RoleBadge, UserStatusBadge } from "@/components/admin/badges";
import {
  updateUserAction,
  setUserStatusAction,
  resetPasswordAction,
} from "../../actions";

export const metadata: Metadata = { title: "Chi tiết tài khoản người dùng" };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const currentUser = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const targetUser = getUser(Number(id));
  if (!targetUser) notFound();

  const canManage = can(currentUser.role, "admin.users");

  // Danh sách hồ sơ nhân viên để liên kết
  const employees = all<{ code: string; full_name: string; title: string; business_role: string }>(
    `SELECT code, full_name, title, business_role 
     FROM employees 
     WHERE status = 'ACTIVE' 
     ORDER BY code ASC`,
  );

  // Danh sách Sale Pods
  const teams = all<{ id: number; name: string; code: string }>(
    "SELECT id, name, code FROM teams WHERE active = 1 ORDER BY name ASC",
  );

  // Lịch sử kiểm toán liên quan đến người dùng này
  const auditLogs = all<{
    id: number;
    action: string;
    from_status: string | null;
    to_status: string | null;
    actor_label: string;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT id, action, from_status, to_status, actor_label, reason, created_at 
     FROM audit_log 
     WHERE (entity_type = 'user' AND entity_id = ?) OR (actor_type = 'USER' AND actor_id = ?)
     ORDER BY id DESC 
     LIMIT 20`,
    targetUser.id,
    targetUser.id,
  );

  return (
    <>
      <CommandBar>
        <CommandLink href="/admin?tab=users" icon="back">
          Quay lại danh sách
        </CommandLink>
        <CommandLink href={`/admin/users/${id}`} icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title={`${targetUser.name} (${targetUser.email})`}
        subtitle={`Trạng thái: ${targetUser.status} · Vai trò: ${targetUser.role} · Khởi tạo lúc: ${formatDate(targetUser.created_at)}`}
        icon="person"
      />

      <div className="px-6 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CỘT 1: CẬP NHẬT THÔNG TIN & PHÂN QUYỀN (FR-96, FR-98) */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Thông tin tài khoản và Phân quyền hệ thống">
            <form action={updateUserAction} className="space-y-4 text-xs">
              <input type="hidden" name="id" value={targetUser.id} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Họ và tên người dùng</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={targetUser.name}
                    required
                    disabled={!canManage}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Email đăng nhập (Không thể thay đổi)</label>
                  <input
                    type="email"
                    defaultValue={targetUser.email}
                    disabled
                    className="input bg-slate-50 font-mono text-zinc-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Vai trò phân quyền (RBAC)</label>
                  <select
                    name="role"
                    defaultValue={targetUser.role}
                    disabled={!canManage}
                    className="select"
                  >
                    <option value="SALES">Nhân viên kinh doanh (SALES)</option>
                    <option value="PRESALES">Chuyên viên tư vấn giải pháp (PRESALES)</option>
                    <option value="SALES_MANAGER">Quản lý kinh doanh (SALES_MANAGER)</option>
                    <option value="FINANCE">Nhân viên Tài chính – Kế toán (FINANCE)</option>
                    <option value="ADMIN">Người quản trị hệ thống (ADMIN)</option>
                    <option value="DELIVERY">Nhân viên triển khai kỹ thuật (DELIVERY)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Chức danh hiển thị</label>
                  <input
                    type="text"
                    name="title"
                    defaultValue={targetUser.title ?? ""}
                    disabled={!canManage}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Liên kết hồ sơ nhân sự</label>
                  <select
                    name="employee_id"
                    defaultValue={targetUser.employee_id ?? ""}
                    disabled={!canManage}
                    className="select"
                  >
                    <option value="">-- Chưa liên kết --</option>
                    {employees.map((emp) => (
                      <option key={emp.code} value={emp.code}>
                        {emp.code} - {emp.full_name} ({emp.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Sale Pod phụ trách (phạm vi dữ liệu)</label>
                  <select
                    name="team_id"
                    defaultValue={targetUser.team_id ?? ""}
                    disabled={!canManage}
                    className="select"
                  >
                    <option value="">-- Không thuộc nhóm nào --</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {canManage && (
                <div className="pt-2 flex justify-end">
                  <SubmitButton>Lưu thay đổi thông tin</SubmitButton>
                </div>
              )}
            </form>
          </Card>

          {/* Lịch sử hoạt động và kiểm toán liên quan */}
          <Card title="Nhật ký thao tác liên quan ">
            {auditLogs.length === 0 ? (
              <div className="text-zinc-500 text-xs italic">Chưa có bản ghi nhật ký nào</div>
            ) : (
              <div className="divide-y divide-stroke text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{log.action}</span>
                        {log.from_status && log.to_status && (
                          <span className="text-[11px] font-mono text-zinc-500">
                            {log.from_status} → {log.to_status}
                          </span>
                        )}
                      </div>
                      <div className="text-ink-3 text-[11px] mt-0.5">
                        Thực hiện bởi: <span className="text-ink-2 font-medium">{log.actor_label}</span>
                        {log.reason && ` · Lý do: ${log.reason}`}
                      </div>
                    </div>
                    <div className="text-ink-3 font-mono text-[11px] whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* CỘT 2: TRẠNG THÁI & ĐẶT LẠI MẬT KHẨU (FR-96, FR-97) */}
        <div className="space-y-6">
          {/* Card trạng thái tài khoản */}
          <Card title="Trạng thái tài khoản">
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Tình trạng hiện tại:</span>
                <UserStatusBadge status={targetUser.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Vai trò:</span>
                <RoleBadge role={targetUser.role} />
              </div>

              {canManage && targetUser.id !== currentUser.id && (
                <div className="pt-2 border-t border-stroke space-y-2">
                  <p className="text-[11px] text-ink-3">
                    Khi khóa tài khoản, người dùng sẽ không thể đăng nhập vào hệ thống. Mọi lịch sử giao dịch và phân bổ được bảo toàn nguyên vẹn.
                  </p>
                  <form action={setUserStatusAction}>
                    <input type="hidden" name="id" value={targetUser.id} />
                    <input type="hidden" name="return_to" value={`/admin/users/${targetUser.id}`} />
                    {targetUser.status === "ACTIVE" ? (
                      <>
                        <input type="hidden" name="status" value="SUSPENDED" />
                        <button
                          type="submit"
                          className="w-full btn-secondary text-rose-700 border-rose-300 hover:bg-rose-50"
                        >
                          Khóa tài khoản này
                        </button>
                      </>
                    ) : (
                      <>
                        <input type="hidden" name="status" value="ACTIVE" />
                        <button
                          type="submit"
                          className="w-full btn-secondary text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        >
                          Kích hoạt / Mở khóa tài khoản
                        </button>
                      </>
                    )}
                  </form>
                </div>
              )}
            </div>
          </Card>

          {/* Card đặt lại mật khẩu */}
          {canManage && (
            <Card title="Đặt lại mật khẩu">
              <form action={resetPasswordAction} className="space-y-3 text-xs">
                <input type="hidden" name="id" value={targetUser.id} />

                <div>
                  <label className="label">Mật khẩu mới (Tùy chọn)</label>
                  <input
                    type="password"
                    name="new_password"
                    placeholder="Nhập mật khẩu mới hoặc để trống để sinh mã"
                    className="input font-mono"
                  />
                  <p className="text-[11px] text-ink-3 mt-1">
                    Nếu để trống, hệ thống sẽ sinh mã xác nhận đặt lại mật khẩu (Token tự phục vụ).
                  </p>
                </div>

                <SubmitButton className="w-full">
                  Xác nhận đặt lại mật khẩu
                </SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
