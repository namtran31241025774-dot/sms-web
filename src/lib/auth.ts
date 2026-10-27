import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get } from "./db";
import { DomainError, type Role } from "./domain";
import { can, type Permission } from "./rbac";
import { verifyPassword } from "./password";

export type User = { id: number; name: string; email: string; role: Role; title: string | null };

const COOKIE = "sms_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET chưa được cấu hình");
  return "dev-only-session-secret";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function signIn(userId: number) {
  const store = await cookies();
  store.set(COOKIE, `${userId}.${sign(String(userId))}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  const expected = sign(id);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  return get<User>("SELECT id, name, email, role, title FROM users WHERE id = ? AND active = 1", Number(id)) ?? null;
}

/**
 * Xác thực người dùng bằng Email và Mật khẩu (DEC-14, FR-97).
 */
export async function authenticateWithPassword(email: string, password: string): Promise<User | null> {
  const normEmail = email.trim().toLowerCase();
  const row = get<{
    id: number;
    name: string;
    email: string;
    role: Role;
    title: string | null;
    password_hash: string | null;
    status: string;
    active: number;
  }>("SELECT id, name, email, role, title, password_hash, status, active FROM users WHERE LOWER(email) = ?", normEmail);

  if (!row || row.active !== 1 || (row.status && row.status !== "ACTIVE")) {
    return null;
  }

  // Xác thực mật khẩu qua scrypt
  if (!row.password_hash || !verifyPassword(password, row.password_hash)) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
  };
}

/** Dùng trong page/layout: chưa đăng nhập thì chuyển về /login. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Dùng trong Server Action: kiểm tra đăng nhập + quyền ở server. */
export async function requirePermission(permission: Permission): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!can(u.role, permission)) throw new DomainError("Vai trò của bạn không có quyền thực hiện thao tác này.");
  return u;
}
