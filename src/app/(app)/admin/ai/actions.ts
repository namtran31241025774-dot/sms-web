"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import {
  setAiEmergencyStatus,
  cleanTimedOutRuns,
  prepareRetryRun,
  activateConfig,
  rollbackConfig,
  createConfigDraft,
  submitAiFeedback,
} from "@/lib/services/ai-admin";
import { runAgent } from "@/lib/agents/runtime";

export async function toggleKillSwitchAction(formData: FormData) {
  const user = await requireUser();
  const currentStatus = (formData.get("currentStatus") as string) || "ACTIVE";
  const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";

  try {
    const msg = setAiEmergencyStatus(userActor(user), newStatus);
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function cleanTimeoutRunsAction() {
  await requireUser();
  try {
    const { cleanedCount } = cleanTimedOutRuns();
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(`Đã quét và huỷ ${cleanedCount} lần chạy bị treo quá thời gian`)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function retryRunAction(formData: FormData) {
  const user = await requireUser();
  const runId = Number(formData.get("runId"));

  try {
    const retryPlan = prepareRetryRun(userActor(user), runId);
    // Kích hoạt chạy lại
    await runAgent(
      retryPlan.agent,
      { type: retryPlan.entityType, id: retryPlan.entityId },
      retryPlan.trigger,
      user.id,
    );
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(`Đã chạy lại thành công cho ${retryPlan.agent} #${runId}`)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function activateConfigAction(formData: FormData) {
  const user = await requireUser();
  const configId = Number(formData.get("configId"));

  try {
    const msg = activateConfig(userActor(user), configId);
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function rollbackConfigAction(formData: FormData) {
  const user = await requireUser();
  const agentId = formData.get("agentId") as "QUALIFICATION" | "OPPORTUNITY";
  const versionNo = Number(formData.get("versionNo"));

  try {
    const msg = rollbackConfig(userActor(user), agentId, versionNo);
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function createConfigDraftAction(formData: FormData) {
  const user = await requireUser();
  const agentId = formData.get("agentId") as "QUALIFICATION" | "OPPORTUNITY";
  const instructions = formData.get("instructions") as string;
  const modelReference = formData.get("modelReference") as string;
  const budgetLimit = Number(formData.get("budgetLimit")) || 200000;

  try {
    const { versionNo } = createConfigDraft(userActor(user), {
      agentId,
      instructions,
      modelReference,
      budgetLimit,
    });
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent(`Đã tạo bản nháp cấu hình v${versionNo}`)}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}

export async function submitAiFeedbackAction(formData: FormData) {
  const user = await requireUser();
  const runId = formData.get("runId") ? Number(formData.get("runId")) : undefined;
  const rating = (formData.get("rating") as "POSITIVE" | "NEGATIVE" | "NEUTRAL") || "POSITIVE";
  const comment = (formData.get("comment") as string) || "";
  const feedbackType = (formData.get("feedbackType") as string) || "GENERAL";

  try {
    submitAiFeedback(userActor(user), {
      runId,
      rating,
      comment,
      feedbackType,
    });
    revalidatePath("/admin/ai");
    redirect(`/admin/ai?ok=${encodeURIComponent("Đã gửi phản hồi chất lượng thành công")}`);
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof Error ? e.message : String(e);
    redirect(`/admin/ai?error=${encodeURIComponent(error)}`);
  }
}
