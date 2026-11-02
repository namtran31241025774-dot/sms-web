import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { all } from "@/lib/db";
import { CommandBar, CommandLink, PageTitle, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createUserAction } from "../../actions";

export const metadata: Metadata = { title: "Tạo tài khoản người dùng mới" };

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("admin.users");
  const sp = await searchParams;

  // Lấy danh sách hồ sơ nhân viên để liên kết (FR-96, FR-75)
  const employees = all<{ code: string; full_name: string; title: string; business_role: string }>(
    `SELECT code, full_name, title, business_role 
     FROM employees 
     WHERE status = 'ACTIVE' 
     ORDER BY code ASC`,
  );

  // Lấy danh sách các nhóm bán hàng (Sale Pods)
  const teams = all<{ id: number; name: string; code: string }>(
    "SELECT id, name, code FROM teams WHERE active = 1 ORDER BY name ASC",
  );

  return (
    <>
      <CommandBar>
        <CommandLink href="/admin?tab=users" icon="back">
          Quay lại danh sách
        </CommandLink>
      </CommandBar>

      <PageTitle
        title="Tạo tài khoản người dùng mới"
        subtitle="Cấp phát tài khoản đăng nhập hệ thống · Liên kết hồ sơ nhân sự (FR-96) · Phân quyền vai trò (FR-98)"
        icon="person"
      />

      <div className="max-w-2xl px-6 pb-12">
        {sp.error && (
          <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {sp.error}
          </div>
        )}

        <Card title="Thông tin tài khoản đăng nhập">
          <form action={createUserAction} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Họ và tên người dùng (Bắt buộc)</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="vd: Nguyễn Văn An"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Email đăng nhập (Bắt buộc, duy nhất)</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="vd: an.nguyen@sms.local"
                  className="input font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Vai trò phân quyền hệ thống (FR-98)</label>
                <select name="role" className="select" defaultValue="SALES" required>
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
                  placeholder="vd: SDR, Account Executive, Lead Solution Engineer"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Liên kết hồ sơ nhân viên (FR-96, FR-75)</label>
                <select name="employee_id" className="select" defaultValue="">
                  <option value="">-- Không liên kết --</option>
                  {employees.map((emp) => (
                    <option key={emp.code} value={emp.code}>
                      {emp.code} - {emp.full_name} ({emp.title})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-3 mt-1">
                  Liên kết tài khoản với hồ sơ nhân sự trong module Đội ngũ (WP-07).
                </p>
              </div>

              <div>
                <label className="label">Gán vào Sale Pod (Phạm vi dữ liệu - FR-98)</label>
                <select name="team_id" className="select" defaultValue="">
                  <option value="">-- Chưa gán nhóm --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-3 mt-1">
                  Quyết định phạm vi dữ liệu theo nhóm bán hàng (Data Scope).
                </p>
              </div>
            </div>

            <div>
              <label className="label">Mật khẩu ban đầu</label>
              <input
                type="password"
                name="password"
                placeholder="Mặc định: Password123! (nếu để trống)"
                className="input font-mono"
              />
              <p className="text-[11px] text-ink-3 mt-1">
                Mật khẩu sẽ được mã hóa an toàn bằng thuật toán scrypt (DEC-14, FR-97).
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <Link href="/admin?tab=users" className="btn-secondary">
                Hủy
              </Link>
              <SubmitButton>Tạo tài khoản</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
