"use server";

import { act, id, optStr, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { decideStageGate } from "@/lib/services/approvals";
import { userActor } from "@/lib/services/core";

export async function decideStageGateAction(fd: FormData) {
  const approved = str(fd, "decision") === "APPROVED";
  await act(
    "/approvals",
    async () => {
      const u = await requirePermission("opp.manager_review");
      return decideStageGate(userActor(u), id(fd), approved, optStr(fd, "comment") ?? null);
    },
    (stage) =>
      !approved
        ? "Đã từ chối và báo cho người phụ trách cơ hội"
        : stage === "PROPOSE"
          ? "Đã duyệt và chuyển cơ hội sang Đề xuất giải pháp (Propose)"
          : "Đã duyệt, cơ hội chưa chuyển giai đoạn. Mở cơ hội để xem điều kiện còn thiếu",
  );
}
