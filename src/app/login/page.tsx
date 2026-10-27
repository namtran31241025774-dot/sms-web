import type { Metadata } from "next";
import { all } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { Icon } from "@/components/icons";
import { Persona } from "@/components/ui";
import { loginAction, passwordLoginAction } from "./actions";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

const ROLE_DESC: Record<Role, string> = {
  SALES: "Quản lý Lead, Opportunity, báo giá, duyệt đề xuất AI",
  PRESALES: "Xây dựng Proposed Solution, xác nhận kỹ thuật",
  PRESALES_MANAGER: "Rà soát chuyên môn giải pháp (FR-42)",
  SALES_MANAGER: "Giám sát pipeline, duyệt chiết khấu, gate, tiêu chí AI",
  FINANCE: "Phát hành hóa đơn, ghi nhận thanh toán, công nợ",
  LEGAL: "Rà soát điều khoản pháp lý đặc thù",
  DELIVERY: "Cấp license, triển khai kỹ thuật, đào tạo",
  ADMIN: "Quản trị tài khoản, phân quyền, tham số hệ thống",
  AI_MANAGER: "Cấu hình kỹ thuật và giám sát hoạt động AI Agent (DEC-11)",
};

export default function LoginPage() {
  const demoLogin = process.env.SMS_DEMO_LOGIN === "true";
  const users = demoLogin ? all<{ id: number; name: string; email: string; role: Role; title: string | null }>(
    "SELECT id, name, email, role, title FROM users WHERE active = 1 ORDER BY id",
  ) : [];

  return (
    <div className="flex min-h-full items-center justify-center bg-[linear-gradient(135deg,#e8f1fb_0%,#f5f5f5_55%,#eef6ee_100%)] p-4">
      <div className="w-full max-w-[500px] bg-surface p-8 shadow-[0_2px_12px_rgba(0,0,0,0.15)] rounded">
        {/* Logo / Header */}
        <div className="mb-6 flex items-center gap-2 text-[16px] font-semibold text-ink-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-white">
            <Icon name="opportunity" size={20} />
          </span>
          SMS Sales Hub
        </div>

        <h1 className="mb-1 text-2xl font-bold text-ink">Đăng nhập hệ thống</h1>
        <p className="mb-6 text-sm text-ink-3">Hệ thống Quản lý Bán hàng B2B SaaS tích hợp AI Agent.</p>

        {/* Form đăng nhập email + mật khẩu (DEC-14, FR-97) */}
        <form action={async (fd: FormData) => {
          "use server";
          await passwordLoginAction(undefined, fd);
        }} className="mb-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Email</label>
            <input
              name="email"
              type="email"
              placeholder="ten@sms.local"
              required
              className="w-full rounded border border-stroke px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Mật khẩu</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="w-full rounded border border-stroke px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Đăng nhập
          </button>
        </form>

        {/* Hoặc đăng nhập nhanh bằng tài khoản demo */}
        {demoLogin && <><div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stroke"></div></div>
          <span className="relative bg-surface px-2 text-xs font-medium text-ink-3">Hoặc chọn nhanh tài khoản demo</span>
        </div>

        <ul className="-mx-2 max-h-[260px] overflow-y-auto space-y-1 pr-1">
          {users.map((u) => (
            <li key={u.id}>
              <form action={loginAction}>
                <input type="hidden" name="userId" value={u.id} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-[#f0f0f0] transition-colors"
                >
                  <Persona name={u.name} sub={`${ROLE_LABEL[u.role] || u.role} · ${ROLE_DESC[u.role] || u.email}`} size={36} />
                </button>
              </form>
            </li>
          ))}
        </ul></>}

        <div className="mt-6 border-t border-stroke pt-4 text-[11px] text-ink-3">
          Đăng nhập sử dụng mã hoá mật khẩu scrypt (DEC-14), phiên được ký HMAC SHA-256. Kiểm quyền RBAC chặt chẽ ở server.
        </div>
      </div>
    </div>
  );
}
