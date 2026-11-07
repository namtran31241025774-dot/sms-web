"use server";

import { redirect } from "next/navigation";
import { signIn, signOut, authenticateWithPassword } from "@/lib/auth";
import { get } from "@/lib/db";

export type LoginState = {
  error?: string;
};

/**
 * Đăng nhập bằng Email + Mật khẩu (DEC-14, FR-97).
 */
export async function passwordLoginAction(_prevState: LoginState | undefined, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") || "");
  const password = String(fd.get("password") || "");

  if (!email || !password) {
    return { error: "Vui lòng nhập đầy đủ Email và Mật khẩu." };
  }

  const user = await authenticateWithPassword(email, password);
  if (!user) {
    return { error: "Email hoặc mật khẩu không chính xác." };
  }

  await signIn(user.id);
  redirect("/");
}

/**
 * Đăng nhập demo nhanh (chọn tài khoản đại diện vai trò).
 */
export async function loginAction(fd: FormData) {
  if (process.env.SMS_DEMO_LOGIN !== "true") redirect("/login");
  const id = Number(fd.get("userId"));
  if (!get("SELECT id FROM users WHERE id = ? AND active = 1 AND status = 'ACTIVE'", id)) redirect("/login");
  await signIn(id);
  redirect("/");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}
