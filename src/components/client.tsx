"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "./icons";

export function NavLink({ href, icon, children, badge }: { href: string; icon: IconName; children: ReactNode; badge?: number }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors ${
        active ? "bg-brand font-semibold text-white shadow-[0_0_18px_rgba(15,108,189,0.55)]" : "text-[#b4c3df] hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon name={icon} size={19} className={active ? "text-white" : "text-[#7f93bb]"} />
      <span className="flex-1 truncate">{children}</span>
      {!!badge && <span className={`rounded-full px-1.5 text-[11px] font-semibold leading-4 ${active ? "bg-white text-brand" : "bg-brand text-white"}`}>{badge}</span>}
    </Link>
  );
}

export function SubmitButton({
  children,
  variant = "secondary",
  icon,
  size,
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "subtle" | "danger";
  icon?: IconName;
  size?: "sm";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const cls = { primary: "btn btn-primary", secondary: "btn", subtle: "btn btn-subtle", danger: "btn btn-danger" }[variant];
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`${cls} ${size === "sm" ? "btn-sm" : ""} ${className}`}>
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon && <Icon name={icon} size={size === "sm" ? 14 : 18} />
      )}
      {children}
    </button>
  );
}

export function ConfirmSubmitButton({ children, message }: { children: ReactNode; message: string }) {
  return (
    <button
      type="submit"
      className="btn btn-sm"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
