"use server";

import { act, id, optStr, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import { createAccount, updateAccount, type AccountInput } from "@/lib/services/accounts";

function accountInput(fd: FormData): AccountInput {
  return {
    name: str(fd, "name"),
    industry: optStr(fd, "industry"),
    website: optStr(fd, "website"),
    tax_code: optStr(fd, "tax_code"),
    address: optStr(fd, "address"),
    employee_size: optStr(fd, "employee_size"),
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    owner_id: fd.get("owner_id") ? Number(fd.get("owner_id")) : null,
  };
}

export async function createAccountAction(fd: FormData) {
  let newId = 0;
  await act(
    "/accounts/new",
    async () => {
      const u = await requirePermission("account.write");
      newId = createAccount(userActor(u), accountInput(fd));
      return { redirectTo: `/accounts/${newId}` };
    },
    "Đã tạo doanh nghiệp mới",
  );
}

export async function updateAccountAction(fd: FormData) {
  const accountId = id(fd);
  await act(
    `/accounts/${accountId}`,
    async () => {
      const u = await requirePermission("account.write");
      updateAccount(userActor(u), accountId, accountInput(fd));
    },
    "Đã cập nhật thông tin doanh nghiệp",
  );
}
