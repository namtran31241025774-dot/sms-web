import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/domain";
import { getNavForRole } from "@/lib/nav";
import { unreadCount } from "@/lib/services/admin";
import { pendingExpertReviews } from "@/lib/services/approvals";
import { NavLink } from "@/components/client";
import { Icon } from "@/components/icons";
import { Persona } from "@/components/ui";
import { logoutAction } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = unreadCount(user.id);
  const pendingApprovals =
    user.role === "SALES_MANAGER"
      ? (get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM approvals WHERE status='PENDING' AND kind IN (" + "'QUOTE_DISCOUNT','OPP_STAGE_GATE'" + ")",
        )?.n ?? 0) + pendingExpertReviews(user).length
      : 0;
  const pendingAi = get<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM ai_suggestions WHERE status='PENDING_REVIEW') + (SELECT COUNT(*) FROM opportunity_research WHERE status='PENDING_REVIEW') AS n",
  )?.n ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* App header (kiểu Microsoft 365 / Dynamics 365) */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-stroke bg-[var(--header)] px-5 text-ink">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white shadow-[0_4px_10px_rgba(15,108,189,0.3)]">S</span>
          <span className="leading-tight">
            <span className="block text-[16px] font-bold text-brand-ink">SMS Sales Hub</span>
            <span className="block text-[11px] text-ink-3">Quản lý bán hàng B2B SaaS</span>
          </span>
        </Link>
        <form action="/leads" className="mx-auto hidden w-full max-w-lg md:block">
          <label className="flex h-10 items-center gap-2 rounded-full border border-stroke bg-surface-2 px-4 text-ink transition focus-within:border-brand focus-within:bg-white focus-within:shadow-[0_0_0_3px_var(--brand-tint-2)]">
            <Icon name="search" size={16} className="text-ink-3" />
            <input name="q" placeholder="Tìm Lead theo công ty, người liên hệ, email" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
          </label>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/" className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-brand-tint hover:text-brand" title="Thông báo">
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 min-w-4 rounded-full bg-[#c50f1f] px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread}</span>
            )}
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-stroke py-1 pl-1 pr-3 sm:flex">
            <Persona name={user.name} size={30} />
            <span className="text-xs leading-4 text-ink-3">{ROLE_LABEL[user.role]}</span>
          </div>
          <form action={logoutAction}>
            <button className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-brand-tint hover:text-brand" title="Đổi tài khoản / Đăng xuất">
              <Icon name="signOut" size={18} />
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Site map (left navigation - phân quyền theo vai trò) */}
        <nav className="hidden w-[244px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-stroke bg-surface px-3 py-3 md:flex">
          {getNavForRole(user.role).map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <NavGroup>{group.label}</NavGroup>
              {group.items.map((item) => {
                const badge =
                  item.badgeKey === "ai"
                    ? pendingAi
                    : item.badgeKey === "approvals"
                      ? pendingApprovals
                      : undefined;
                return (
                  <NavLink key={item.href} href={item.href} icon={item.icon} badge={badge}>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="mt-auto rounded-xl bg-surface-2 px-3 py-2.5">
            <Persona name={user.name} sub={ROLE_LABEL[user.role]} size={30} />
          </div>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 pt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{children}</div>;
}
