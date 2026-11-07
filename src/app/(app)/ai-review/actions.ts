"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import { approveSuggestion, rejectSuggestion, editSuggestion } from "@/lib/services/ai-review";

export async function approveSuggestionAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const note = (formData.get("note") as string) || null;

  // Thu thập các trường sửa đổi edits
  const edits: Record<string, string> = {};
  const editsRaw = formData.get("edits") as string;
  if (editsRaw) {
    try {
      const parsed = JSON.parse(editsRaw);
      Object.assign(edits, parsed);
    } catch {
      // Ignored
    }
  }

  // Thu thập trực tiếp từ các trường form nếu có
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("edit_") && typeof v === "string") {
      edits[k.slice(5)] = v;
    }
  }

  try {
    const result = approveSuggestion(userActor(user), id, edits, note);
    revalidatePath("/ai-review");
    redirect(`/ai-review?ok=${encodeURIComponent(result)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/ai-review?error=${encodeURIComponent(error)}`);
  }
}

export async function rejectSuggestionAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const note = formData.get("note") as string;

  if (!note || note.trim().length === 0) {
    redirect(`/ai-review?error=${encodeURIComponent("Bắt buộc nhập lý do từ chối")}`);
  }

  try {
    const result = rejectSuggestion(userActor(user), id, note.trim());
    revalidatePath("/ai-review");
    redirect(`/ai-review?ok=${encodeURIComponent(result)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/ai-review?error=${encodeURIComponent(error)}`);
  }
}

export async function editSuggestionAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const note = (formData.get("note") as string) || null;
  const updatesRaw = formData.get("updates") as string;

  let updates: Record<string, unknown> = {};
  try {
    updates = JSON.parse(updatesRaw);
  } catch {
    updates = {};
  }

  try {
    const result = editSuggestion(userActor(user), id, updates, note);
    revalidatePath("/ai-review");
    redirect(`/ai-review?ok=${encodeURIComponent(result)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/ai-review?error=${encodeURIComponent(error)}`);
  }
}
