// Khung "Luồng xử lý" trên trang cơ hội: 9 bước Develop hoặc 6 bước Propose,
// trạng thái lấy từ opportunityFlow / proposeFlow (src/lib/services/sales-flow.ts).

import Link from "next/link";
import type { StageGateStatus } from "@/lib/services/approvals";
import type { FlowState, ProcessFlow } from "@/lib/services/sales-flow";
import { Icon } from "./icons";
import { cx } from "./ui";

const LINK_LABEL: Record<string, string> = {
  initial_research: "Xem nghiên cứu",
  discovery_appointment: "Hẹn lịch",
  survey: "Nhập khảo sát",
  post_survey_research: "Xem phân tích",
  scope: "Biên bản phạm vi",
  solution: "Hồ sơ kỹ thuật",
  stakeholders: "Bên liên quan",
  competitors: "Đối thủ",
  advance: "Chuyển giai đoạn",
  configuration: "Xem cấu hình",
  draft: "Báo giá",
  discount: "Duyệt chiết khấu",
  negotiation: "Gửi khách",
  response: "Ghi phản hồi",
  close_ready: "Tạo đơn hàng",
};

const STATE: Record<FlowState, { label: string; box: string; dot: string; tag: string }> = {
  DONE: { label: "Hoàn thành", box: "border-[#b5e0b5] bg-[#f7fcf6]", dot: "bg-success text-white", tag: "bg-success-tint text-success" },
  CURRENT: { label: "Đang làm", box: "border-brand bg-[#f5f9fe] ring-2 ring-brand/20", dot: "bg-brand text-white", tag: "bg-brand-tint text-brand font-semibold" },
  UPCOMING: { label: "Chưa tới", box: "border-stroke bg-[#fafafa] text-ink-3", dot: "bg-[#e5e5e5] text-ink-3", tag: "bg-stroke text-ink-3" },
  NOT_APPLICABLE: { label: "Không áp dụng", box: "border-dashed border-stroke bg-surface text-ink-3", dot: "bg-[#f0f0f0] text-ink-3", tag: "bg-[#f0f0f0] text-ink-3" },
};

export function OpportunityProcessFlow({
  flow,
  gateStatus,
  canReviewGate,
  expertReviewRequired,
  expertReviewStatus,
  expertReviewReason,
  canExpertReview,
  solutionHref,
}: {
  flow: ProcessFlow;
  gateStatus?: StageGateStatus;
  canReviewGate?: boolean;
  expertReviewRequired: boolean;
  expertReviewStatus: string;
  expertReviewReason?: string;
  canExpertReview?: boolean;
  solutionHref: string;
}) {
  const develop = flow.stage === "DEVELOP";
  const steps = flow.steps.map((s, i) => ({ ...s, number: i + 1 }));
  const current = steps.find((s) => s.id === flow.nextStepId);

  return (
    <section className="mx-6 mb-4 rounded-xl border border-stroke bg-surface p-4 shadow-[var(--shadow-4)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand">
              <Icon name="arrowRight" size={14} />
            </span>
            <h2 className="text-[15px] font-semibold text-ink">
              {develop ? "Luồng Phát triển cơ hội" : "Luồng Đề xuất giải pháp"}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            {develop ? "9 bước, từ Agent nghiên cứu bối cảnh tới rà soát chuyển giai đoạn" : "6 bước, từ chốt cấu hình tới quyết định của khách hàng"}
          </p>
        </div>
        {current ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/20 bg-brand-tint px-3 py-1.5 text-xs text-brand">
            <span className="font-semibold">Việc tiếp theo:</span>
            <span>Bước {current.number}. {current.title} · {current.actor}</span>
            <Link href={current.href} className="ml-1 font-semibold underline">{LINK_LABEL[current.id] ?? "Thực hiện"} →</Link>
          </div>
        ) : (
          <span className="rounded-lg bg-success-tint px-3 py-1.5 text-xs font-medium text-success">Đã xong các bước của giai đoạn này</span>
        )}
      </div>

      <ol className={cx("mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3", develop ? "xl:grid-cols-9" : "xl:grid-cols-6")}>
        {steps.map((s) => {
          const st = STATE[s.status];
          return (
            <li key={s.id} className={cx("flex flex-col justify-between rounded-lg border p-2.5", st.box)}>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", st.dot)}>
                    {s.status === "DONE" ? <Icon name="check" size={12} strokeWidth={2.5} /> : s.number}
                  </span>
                  <span className={cx("rounded px-1 py-0.5 text-[10px] font-medium", st.tag)}>{st.label}</span>
                </div>
                <h3 className={cx("text-xs font-semibold leading-snug", s.status === "CURRENT" ? "text-brand" : "text-ink")}>{s.title}</h3>
                <span className="mt-1 inline-block rounded border border-stroke bg-surface px-1 py-0.5 text-[10px] text-ink-2">{s.actor}</span>
                {s.reason && <p className="mt-1.5 text-[11px] leading-tight text-ink-2">{s.reason}</p>}
              </div>
              {s.status !== "NOT_APPLICABLE" && (
                <div className="mt-2.5 border-t border-[#f0f0f0] pt-1.5 text-[11px]">
                  <Link href={s.href} className="link font-medium">{LINK_LABEL[s.id] ?? "Mở"} →</Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {develop && gateStatus?.required && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-amber-700" />
            <div>
              <span className="font-semibold">Quản lý kinh doanh rà soát trước khi sang Đề xuất giải pháp:</span>{" "}
              {gateStatus.status === "APPROVED"
                ? `Đã được ${gateStatus.decidedBy ?? "Quản lý kinh doanh"} duyệt${gateStatus.comment ? `: ${gateStatus.comment}` : "."}`
                : gateStatus.status === "PENDING"
                  ? `Đang chờ ${gateStatus.deciders.join(", ")} duyệt.`
                  : gateStatus.status === "REJECTED"
                    ? `Bị từ chối${gateStatus.decidedBy ? ` bởi ${gateStatus.decidedBy}` : ""}: ${gateStatus.comment ?? ""}. Bổ sung rồi bấm Giai đoạn kế tiếp để gửi lại.`
                    : "Chưa gửi. Hệ thống gửi yêu cầu khi Nhân viên kinh doanh bấm Giai đoạn kế tiếp."}
            </div>
          </div>
          {canReviewGate && gateStatus.status === "PENDING" && <Link href="/approvals" className="btn btn-primary btn-sm">Mở Phê duyệt</Link>}
        </div>
      )}

      {develop && expertReviewRequired && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-950">
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={16} className="shrink-0 text-brand" />
            <div>
              <span className="font-semibold">Duyệt chuyên môn giải pháp:</span>{" "}
              {expertReviewStatus === "APPROVED"
                ? "Đã được Quản lý kinh doanh duyệt."
                : expertReviewStatus === "PENDING"
                  ? "Đang chờ Quản lý kinh doanh duyệt hồ sơ giải pháp."
                  : expertReviewReason ?? "Cần duyệt chuyên môn trước khi sang Đề xuất giải pháp."}
            </div>
          </div>
          {canExpertReview && expertReviewStatus === "PENDING" && <Link href={solutionHref} className="btn btn-primary btn-sm">Xem và duyệt</Link>}
        </div>
      )}
    </section>
  );
}
