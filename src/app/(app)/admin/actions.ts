"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import {
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
  setSetting,
} from "@/lib/services/admin";
import type { Role } from "@/lib/domain";

export async function createUserAction(formData: FormData) {
  const user = await requirePermission("admin.users");
  const actor = userActor(user);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "SALES") as Role;
  const title = String(formData.get("title") ?? "").trim() || undefined;
  const employee_id = String(formData.get("employee_id") ?? "").trim() || undefined;
  const team_id_raw = formData.get("team_id");
  const team_id = team_id_raw ? Number(team_id_raw) : undefined;
  const password = String(formData.get("password") ?? "").trim() || undefined;

  let newId: number;
  try {
    newId = createUser(actor, {
      name,
      email,
      role,
      title,
      employee_id,
      team_id,
      password,
    });
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : "Không thể tạo tài khoản";
    redirect(`/admin/users/new?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin/users/${newId}?ok=${encodeURIComponent("Tạo tài khoản người dùng thành công")}`);
}

export async function updateUserAction(formData: FormData) {
  const user = await requirePermission("admin.users");
  const actor = userActor(user);

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const title = String(formData.get("title") ?? "").trim();
  const employee_id = String(formData.get("employee_id") ?? "").trim() || null;
  const team_id_raw = formData.get("team_id");
  const team_id = team_id_raw ? Number(team_id_raw) : null;

  try {
    updateUser(actor, id, {
      name,
      role: role || undefined,
      title,
      employee_id,
      team_id,
    });
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : "Không thể cập nhật tài khoản";
    redirect(`/admin/users/${id}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?ok=${encodeURIComponent("Cập nhật thông tin tài khoản thành công")}`);
}

export async function setUserStatusAction(formData: FormData) {
  const user = await requirePermission("admin.users");
  const actor = userActor(user);

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "INACTIVE" | "SUSPENDED";
  const returnTo = String(formData.get("return_to") ?? `/admin/users/${id}`);

  try {
    setUserStatus(actor, id, status);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : "Không thể thay đổi trạng thái tài khoản";
    redirect(`${returnTo}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent("Cập nhật trạng thái tài khoản thành công")}`);
}

export async function resetPasswordAction(formData: FormData) {
  const user = await requirePermission("admin.users");
  const actor = userActor(user);

  const id = Number(formData.get("id"));
  const newPassword = String(formData.get("new_password") ?? "").trim();

  try {
    const result = resetUserPassword(actor, id, newPassword || undefined);
    const msg = result.token
      ? `Đã tạo mã đặt lại mật khẩu: ${result.token}`
      : "Đặt lại mật khẩu thành công";
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?ok=${encodeURIComponent(msg)}`);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : "Không thể đặt lại mật khẩu";
    redirect(`/admin/users/${id}?error=${encodeURIComponent(msg)}`);
  }
}

export async function updateSettingAction(formData: FormData) {
  const user = await requirePermission("admin.settings");
  const actor = userActor(user);

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();

  try {
    setSetting(actor, key, value);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : "Không thể lưu cài đặt";
    redirect(`/admin?tab=settings&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?tab=settings&ok=${encodeURIComponent("Cập nhật cấu hình thành công")}`);
}
