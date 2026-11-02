import type { Metadata } from "next";
import { all } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { Icon } from "@/components/icons";
import { Persona } from "@/components/ui";
import { loginAction, passwordLoginAction } from "./actions";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

// Thứ tự và mô tả theo bảng các bên liên quan đã chốt (DEC-30).
const ROLE_ORDER: Role[] = ["SALES", "SALES_MANAGER", "PRESALES", "FINANCE", "DELIVERY", "ADMIN"];

const ROLE_DESC: Record<Role, string> = {
  SALES: "Khách hàng, cơ hội, báo giá, đơn hàng",
  SALES_MANAGER: "Giám sát đội ngũ, rà soát giải pháp, duyệt giao dịch",
  PRESALES: "Khảo sát nhu cầu, hồ sơ giải pháp, kiểm tra cấu hình",
  FINANCE: "Hóa đơn, thanh toán, công nợ",
  DELIVERY: "Nhận bàn giao, cập nhật tiến độ và kết quả triển khai",
  ADMIN: "Tài khoản, phân quyền, cấu hình và giám sát AI Agent",
};

export default function LoginPage() {
  const demoLogin = process.env.SMS_DEMO_LOGIN === "true";
  const users = demoLogin ? all<{ id: number; name: string; email: string; role: Role; title: string | null }>(
    "SELECT id, name, email, role, title FROM users WHERE active = 1 AND status = 'ACTIVE' ORDER BY id",
  ) : [];
  const sorted = [...users].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

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

        {/* Chọn nhân viên là vào thẳng giao diện của vai trò đó */}
        {demoLogin && (
          <ul className="-mx-2 mb-4 space-y-1">
            {sorted.map((u) => (
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
          </ul>
        )}

        <details open={!demoLogin}>
          <summary className="mb-3 cursor-pointer text-xs font-medium text-ink-3">Đăng nhập bằng email và mật khẩu</summary>
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

        </details>

        <div className="mt-6 border-t border-stroke pt-4 text-[11px] text-ink-3">
          Đăng nhập sử dụng mã hoá mật khẩu scrypt, phiên được ký HMAC SHA-256. Kiểm quyền RBAC chặt chẽ ở server.
        </div>
      </div>
    </div>
  );
}
