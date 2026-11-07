"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import {
  createEmployee,
  updateEmployee,
  updateEmployeeWorkStatus,
  createTeam,
  updateTeam,
  addTeamMember,
  removeTeamMember,
  type EmployeeStatus,
  type BusinessRole,
} from "@/lib/services/team";
import { assignInitial, handoverWork } from "@/lib/services/assignments";
import {
  createWorkItem,
  completeWorkItem,
  type WorkItemType,
  type WorkItemPriority,
} from "@/lib/services/work-items";
import {
  setSalesTarget,
  createPerformanceReview,
  type PeriodType,
  type PerformanceRating,
} from "@/lib/services/targets";

export async function createEmployeeAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const code = String(formData.get("code") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim();
  const business_role = String(formData.get("business_role") ?? "SALES") as BusinessRole;
  const status = (String(formData.get("status") ?? "ACTIVE") as EmployeeStatus) || "ACTIVE";
  const can_accept_work = formData.get("can_accept_work") === "1" || formData.get("can_accept_work") === "true";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  try {
    createEmployee(
      {
        code,
        full_name,
        email,
        phone,
        title,
        business_role,
        status,
        can_accept_work,
        notes,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=employees&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=employees&ok=Tạo+hồ+sơ+nhân+viên+thành+công");
}

export async function updateEmployeeAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const id = Number(formData.get("id"));
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim();
  const business_role = String(formData.get("business_role") ?? "SALES") as BusinessRole;
  const status = (String(formData.get("status") ?? "ACTIVE") as EmployeeStatus) || "ACTIVE";
  const can_accept_work = formData.get("can_accept_work") === "1";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  try {
    updateEmployee(
      id,
      {
        full_name,
        email,
        phone,
        title,
        business_role,
        status,
        can_accept_work,
        notes,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team/employees/${id}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  revalidatePath(`/team/employees/${id}`);
  redirect(`/team/employees/${id}?ok=Cập+nhật+hồ+sơ+nhân+viên+thành+công`);
}

export async function updateWorkStatusAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "ACTIVE") as EmployeeStatus;
  const can_accept_work = formData.get("can_accept_work") === "1";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  try {
    updateEmployeeWorkStatus(id, status, can_accept_work, notes, actor.id);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=employees&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=employees&ok=Cập+nhật+trạng+thái+làm+việc+thành+công");
}

export async function createTeamAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const leader_id = formData.get("leader_id") ? Number(formData.get("leader_id")) : null;
  const territory = String(formData.get("territory") ?? "").trim() || null;
  const target_segment = (String(formData.get("target_segment") ?? "ALL") as "ALL" | "SMB" | "ENTERPRISE") || "ALL";
  const product_line = String(formData.get("product_line") ?? "").trim() || null;

  try {
    createTeam(
      {
        code,
        name,
        description,
        leader_id,
        territory,
        target_segment,
        product_line,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=pods&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=pods&ok=Tạo+Sale+Pod+thành+công");
}

export async function updateTeamAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const leader_id = formData.get("leader_id") ? Number(formData.get("leader_id")) : null;
  const territory = String(formData.get("territory") ?? "").trim() || null;
  const target_segment = (String(formData.get("target_segment") ?? "ALL") as "ALL" | "SMB" | "ENTERPRISE") || "ALL";
  const product_line = String(formData.get("product_line") ?? "").trim() || null;
  const active = formData.get("active") === "1";

  try {
    updateTeam(
      id,
      {
        name,
        description,
        leader_id,
        territory,
        target_segment,
        product_line,
        active,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team/pods/${id}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  revalidatePath(`/team/pods/${id}`);
  redirect(`/team/pods/${id}?ok=Cập+nhật+Sale+Pod+thành+công`);
}

export async function addTeamMemberAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const teamId = Number(formData.get("team_id"));
  const userId = Number(formData.get("user_id"));
  const role = String(formData.get("role") ?? "MEMBER") as "LEADER" | "MEMBER";

  try {
    addTeamMember(teamId, userId, role, actor.id);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team/pods/${teamId}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  revalidatePath(`/team/pods/${teamId}`);
  redirect(`/team/pods/${teamId}?ok=Thêm+thành+viên+thành+công`);
}

export async function removeTeamMemberAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const teamId = Number(formData.get("team_id"));
  const userId = Number(formData.get("user_id"));

  try {
    removeTeamMember(teamId, userId, actor.id);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team/pods/${teamId}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  revalidatePath(`/team/pods/${teamId}`);
  redirect(`/team/pods/${teamId}?ok=Đã+cho+thành+viên+rời+nhóm`);
}

export async function assignInitialAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const entityType = String(formData.get("entity_type")) as "lead" | "opportunity";
  const entityId = Number(formData.get("entity_id"));
  const toUserId = Number(formData.get("to_user_id"));
  const teamId = formData.get("team_id") ? Number(formData.get("team_id")) : null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  try {
    assignInitial({
      entityType,
      entityId,
      toUserId,
      teamId,
      assignedBy: actor.id,
      reason,
    });
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=assignments&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=assignments&ok=Phân+bổ+phụ+trách+thành+công");
}

export async function handoverWorkAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const fromUserId = Number(formData.get("from_user_id"));
  const toUserId = Number(formData.get("to_user_id"));
  const teamId = formData.get("team_id") ? Number(formData.get("team_id")) : null;
  const reason = String(formData.get("reason") ?? "").trim();
  const transferLeads = formData.get("transfer_leads") === "1";
  const transferOpportunities = formData.get("transfer_opportunities") === "1";
  const transferTasks = formData.get("transfer_tasks") === "1";

  try {
    const res = handoverWork({
      fromUserId,
      toUserId,
      teamId,
      reason,
      handoverBy: actor.id,
      transferLeads,
      transferOpportunities,
      transferTasks,
    });

    const summary = `Bàn giao thành công ${res.transferredLeads} Lead, ${res.transferredOpportunities} Cơ hội, ${res.transferredTasks} Công việc`;
    revalidatePath("/team");
    redirect(`/team?tab=assignments&ok=${encodeURIComponent(summary)}`);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=assignments&error=${encodeURIComponent(msg)}`);
  }
}

export async function createWorkItemAction(formData: FormData) {
  const actor = await requirePermission("task.write");

  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "TASK") as WorkItemType;
  const description = String(formData.get("description") ?? "").trim() || null;
  const entityType = String(formData.get("entity_type") ?? "").trim() || null;
  const entityId = formData.get("entity_id") ? Number(formData.get("entity_id")) : null;
  const assigneeId = formData.get("assignee_id") ? Number(formData.get("assignee_id")) : actor.id;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const dueAt = String(formData.get("due_at") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "MEDIUM") as WorkItemPriority;

  // Thành viên mời tham gia (SE/Presales)
  const presalesUserId = formData.get("presales_user_id") ? Number(formData.get("presales_user_id")) : null;
  const participants = presalesUserId ? [{ userId: presalesUserId, role: "PRESALES" as const }] : undefined;

  try {
    createWorkItem(
      {
        title,
        type,
        description,
        entityType,
        entityId,
        assigneeId,
        dueDate,
        dueAt,
        priority,
        participants,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=tasks&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=tasks&ok=Tạo+công+việc+thành+công");
}

export async function completeWorkItemAction(formData: FormData) {
  const actor = await requirePermission("task.write");

  const id = Number(formData.get("id"));
  const outcome = String(formData.get("outcome") ?? "").trim() || "Đã hoàn thành";

  try {
    completeWorkItem(id, outcome, actor.id);
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=tasks&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=tasks&ok=Đã+đánh+dấu+hoàn+thành+công+việc");
}

export async function setSalesTargetAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const periodType = String(formData.get("period_type") ?? "QUARTER") as PeriodType;
  const periodName = String(formData.get("period_name") ?? "").trim();
  const targetType = String(formData.get("target_type") ?? "USER");
  const targetAmount = Number(formData.get("target_amount") ?? 0);
  const targetDeals = Number(formData.get("target_deals") ?? 0);

  const userId = targetType === "USER" && formData.get("user_id") ? Number(formData.get("user_id")) : null;
  const teamId = targetType === "TEAM" && formData.get("team_id") ? Number(formData.get("team_id")) : null;

  try {
    setSalesTarget(
      {
        periodType,
        periodName,
        userId,
        teamId,
        targetAmount,
        targetDeals,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=targets&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=targets&ok=Thiết+lập+chỉ+tiêu+thành+công");
}

export async function createPerformanceReviewAction(formData: FormData) {
  const actor = await requirePermission("team.write");

  const employeeId = Number(formData.get("employee_id"));
  const periodName = String(formData.get("period_name") ?? "").trim();
  const actualRevenue = Number(formData.get("actual_revenue") ?? 0);
  const targetRevenue = Number(formData.get("target_revenue") ?? 0);
  const rating = String(formData.get("rating") ?? "GOOD") as PerformanceRating;
  const feedback = String(formData.get("feedback") ?? "").trim() || null;

  try {
    createPerformanceReview(
      {
        employeeId,
        periodName,
        actualRevenue,
        targetRevenue,
        rating,
        feedback,
      },
      actor.id,
    );
  } catch (err: unknown) {
    unstable_rethrow(err);
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/team?tab=targets&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/team");
  redirect("/team?tab=targets&ok=Đánh+giá+hiệu+suất+thành+công");
}
