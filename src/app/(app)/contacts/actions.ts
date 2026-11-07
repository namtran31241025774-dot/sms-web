"use server";

import { act, id, optStr, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import {
  changeContactAffiliation,
  createContact,
  updateContact,
  type ContactInput,
} from "@/lib/services/contacts";

function contactInput(fd: FormData): ContactInput {
  return {
    account_id: Number(fd.get("account_id")),
    full_name: str(fd, "full_name"),
    title: optStr(fd, "title"),
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    is_primary: fd.get("is_primary") === "on",
  };
}

export async function createContactAction(fd: FormData) {
  let newId = 0;
  await act(
    "/contacts/new",
    async () => {
      const u = await requirePermission("contact.write");
      newId = createContact(userActor(u), contactInput(fd));
      return { redirectTo: `/contacts/${newId}` };
    },
    "Đã tạo người liên hệ mới",
  );
}

export async function updateContactAction(fd: FormData) {
  const contactId = id(fd);
  await act(
    `/contacts/${contactId}`,
    async () => {
      const u = await requirePermission("contact.write");
      updateContact(userActor(u), contactId, contactInput(fd));
    },
    "Đã cập nhật thông tin người liên hệ",
  );
}

export async function changeAffiliationAction(fd: FormData) {
  const contactId = id(fd);
  const newAccountId = Number(fd.get("new_account_id"));
  const newJobTitle = optStr(fd, "new_job_title");
  const reason = optStr(fd, "reason");

  await act(
    `/contacts/${contactId}`,
    async () => {
      const u = await requirePermission("contact.write");
      changeContactAffiliation(userActor(u), contactId, newAccountId, newJobTitle ?? undefined, reason ?? undefined);
    },
    "Đã cập nhật doanh nghiệp công tác mới và lưu lịch sử liên kết (FR-14)",
  );
}
