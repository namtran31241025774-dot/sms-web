import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/domain";
import { approvalTarget, pendingExpertReviews } from "@/lib/services/approvals";
import { SubmitButton } from "@/components/client";
import { CommandBar, CommandLink, Empty, Flash, PageTitle } from "@/components/ui";
import { approveMergeAction, rejectMergeAction } from "../leads/actions";
import { decideStageGateAction } from "./actions";

export const metadata: Metadata = { title: "Danh sách phê duyệt" };

type ApprovalRow = {
  id: number;
  kind: string;
  entity_type: string;
  entity_id: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  payload_json: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  decision_comment: string | null;
  created_at: string;
  decided_at: string | null;
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const statusFilter = sp.status || "PENDING";

  const approvals = all<ApprovalRow>(
    `SELECT a.*, u1.name AS requested_by_name, u2.name AS decided_by_name
     FROM approvals a
     LEFT JOIN users u1 ON u1.id = a.requested_by
     LEFT JOIN users u2 ON u2.id = a.decided_by
     WHERE a.status = ?
     ORDER BY a.created_at DESC`,
    statusFilter,
  );

  const canApproveMerge = can(user.role, "lead.merge.approve");
  const canDecideGate = can(user.role, "opp.manager_review");
  const expertReviews = statusFilter === "PENDING" && can(user.role, "opp.expert_review") ? pendingExpertReviews(user) : [];
  const total = approvals.length + expertReviews.length;

  return (
    <>
      <CommandBar>
        <CommandLink href="/approvals?status=PENDING" icon="refresh">
          Đang chờ duyệt
        </CommandLink>
        <CommandLink href="/approvals?status=APPROVED" icon="check">Đã duyệt</CommandLink>
        <CommandLink href="/approvals?status=REJECTED" icon="dismiss">Đã từ chối</CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title="Danh sách phê duyệt (Approvals)"
        subtitle="Quản lý phê duyệt các cổng kiểm soát và hợp nhất hồ sơ trùng lặp"
        icon="approval"
      />

      <div className="px-6 pb-8">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/approvals?status=PENDING"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              statusFilter === "PENDING" ? "bg-[var(--brand)] text-white" : "bg-gray-100 text-ink-2"
            }`}
          >
            Chờ xử lý ({statusFilter === "PENDING" ? total : "..."})
          </Link>
          <Link
            href="/approvals?status=APPROVED"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              statusFilter === "APPROVED" ? "bg-emerald-600 text-white" : "bg-gray-100 text-ink-2"
            }`}
          >
            Đã duyệt
          </Link>
          <Link
            href="/approvals?status=REJECTED"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              statusFilter === "REJECTED" ? "bg-rose-600 text-white" : "bg-gray-100 text-ink-2"
            }`}
          >
            Đã từ chối
          </Link>
        </div>

        <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
          <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2 text-sm text-ink-3">
            <span>Danh sách yêu cầu phê duyệt</span>
            <span>{total} bản ghi</span>
          </div>

          {total ? (
            <div className="divide-y divide-[#f0f0f0]">
              {expertReviews.map((o) => (
                <div key={`expert-${o.id}`} className="p-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">DUYỆT CHUYÊN MÔN</span>
                        <span className="text-xs text-ink-3">· {formatDate(o.updated_at, true)}</span>
                      </div>
                      <div className="text-sm font-medium text-ink-1">Hồ sơ giải pháp chờ duyệt chuyên môn</div>
                      <Link className="link text-xs font-semibold" href={`/opportunities/${o.id}?tab=solution`}>{o.code} · {o.name}</Link>
                      <div className="text-xs text-ink-3">Người phụ trách: <span className="font-medium text-ink-2">{o.owner_name || "Chưa có"}</span></div>
                    </div>
                    <Link className="btn btn-sm" href={`/opportunities/${o.id}?tab=solution`}>Xem chi tiết và duyệt</Link>
                  </div>
                </div>
              ))}
              {approvals.map((appr) => {
                let parsedPayload: {
                  sourceLeadId?: number;
                  sourceCompany?: string;
                  targetLeadId?: number;
                  targetCompany?: string;
                } | null = null;
                try {
                  if (appr.payload_json) parsedPayload = JSON.parse(appr.payload_json);
                } catch {
                  // ignore
                }
                const target = approvalTarget(appr.kind, appr.entity_id);

                return (
                  <div key={appr.id} className="p-4 hover:bg-gray-50/60 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              appr.kind === "MERGE"
                                ? "bg-purple-100 text-purple-800"
                                : appr.kind === "QUOTE_DISCOUNT"
                                ? "bg-amber-100 text-amber-800"
                                : appr.kind === "OPP_STAGE_GATE"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {appr.kind === "MERGE"
                              ? "HỢP NHẤT HỒ SƠ"
                              : appr.kind === "QUOTE_DISCOUNT"
                              ? "CHIẾT KHẤU BÁO GIÁ"
                              : appr.kind === "OPP_STAGE_GATE"
                              ? "CỔNG GIAI ĐOẠN"
                              : appr.kind}
                          </span>
                          <span className="text-xs text-ink-3">#{appr.id}</span>
                          <span className="text-xs text-ink-3">· {formatDate(appr.created_at, true)}</span>
                        </div>

                        <div className="text-sm font-medium text-ink-1">
                          {appr.reason || "Không có nội dung mô tả"}
                        </div>

                        {appr.kind === "MERGE" && parsedPayload && (
                          <div className="text-xs text-ink-2">
                            Hợp nhất từ{" "}
                            <Link className="link font-semibold" href={`/leads/${parsedPayload.sourceLeadId}`}>
                              Lead #{parsedPayload.sourceLeadId} ({parsedPayload.sourceCompany})
                            </Link>{" "}
                            vào{" "}
                            <Link className="link font-semibold" href={`/leads/${parsedPayload.targetLeadId}`}>
                              Lead #{parsedPayload.targetLeadId} ({parsedPayload.targetCompany})
                            </Link>
                          </div>
                        )}

                        {target && (
                          <Link className="link text-xs font-semibold" href={target.href}>{target.label}</Link>
                        )}

                        <div className="text-xs text-ink-3">
                          Người gửi yêu cầu: <span className="font-medium text-ink-2">{appr.requested_by_name || "Hệ thống"}</span>
                          {appr.decided_by_name && (
                            <>
                              {" "}· Người xử lý: <span className="font-medium text-ink-2">{appr.decided_by_name}</span> lúc{" "}
                              {formatDate(appr.decided_at, true)}
                            </>
                          )}
                          {appr.decision_comment && (
                            <div className="italic text-ink-2 mt-0.5">“{appr.decision_comment}”</div>
                          )}
                        </div>
                      </div>

                      {target && appr.kind !== "OPP_STAGE_GATE" && (
                        <Link className="btn btn-sm" href={target.href}>
                          {appr.status === "PENDING" ? "Xem chi tiết và duyệt" : "Xem chi tiết"}
                        </Link>
                      )}

                      {/* Nút thao tác khi PENDING */}
                      {appr.status === "PENDING" && (
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                          {appr.kind === "OPP_STAGE_GATE" && target && <Link className="btn btn-sm" href={target.href}>Xem chi tiết</Link>}
                          {appr.kind === "OPP_STAGE_GATE" && canDecideGate && (
                            <>
                              <form action={decideStageGateAction} className="inline-flex items-center gap-1.5">
                                <input type="hidden" name="id" value={appr.id} />
                                <input type="hidden" name="decision" value="APPROVED" />
                                <input name="comment" placeholder="Ý kiến duyệt..." className="input !h-7 !py-0 text-xs w-36" />
                                <SubmitButton size="sm" variant="primary">Duyệt</SubmitButton>
                              </form>
                              <form action={decideStageGateAction} className="inline-flex items-center gap-1.5">
                                <input type="hidden" name="id" value={appr.id} />
                                <input type="hidden" name="decision" value="REJECTED" />
                                <input name="comment" placeholder="Lý do từ chối..." required className="input !h-7 !py-0 text-xs w-36" />
                                <SubmitButton size="sm" variant="danger">Từ chối</SubmitButton>
                              </form>
                            </>
                          )}
                          {appr.kind === "MERGE" && canApproveMerge && (
                            <>
                              <form action={approveMergeAction} className="inline-flex items-center gap-1.5">
                                <input type="hidden" name="id" value={appr.id} />
                                <input
                                  name="comment"
                                  placeholder="Ý kiến duyệt..."
                                  className="input !h-7 !py-0 text-xs w-36"
                                />
                                <SubmitButton size="sm" variant="primary">
                                  Duyệt
                                </SubmitButton>
                              </form>

                              <form action={rejectMergeAction} className="inline-flex items-center gap-1.5">
                                <input type="hidden" name="id" value={appr.id} />
                                <input
                                  name="comment"
                                  placeholder="Lý do từ chối..."
                                  required
                                  className="input !h-7 !py-0 text-xs w-36"
                                />
                                <SubmitButton size="sm" variant="danger">
                                  Từ chối
                                </SubmitButton>
                              </form>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon="approval">Không có yêu cầu phê duyệt nào</Empty>
          )}
        </div>
      </div>
    </>
  );
}
