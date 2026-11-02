// Khung "Luồng xử lý" trên trang cơ hội cho giai đoạn Develop (9 bước) và Propose (6 bước).
// Thay thế các thanh cảnh báo rời rạc, làm rõ quy trình, trạng thái, người phụ trách và việc tiếp theo.
// TODO: Chuyển sang dùng opportunityFlow(o) và proposeFlow(o) khi Codex cung cấp theo mục 9 REBUILD-01.

import Link from "next/link";
import { Icon } from "./icons";
import { cx } from "./ui";
import type { StageGateStatus } from "@/lib/services/approvals";

export type FlowStepState = "done" | "active" | "upcoming" | "not_applicable";

export interface ProcessFlowStep {
  id: string;
  number: number;
  title: string;
  actor: string;
  state: FlowStepState;
  href: string;
  hrefLabel?: string;
  note?: string | null;
  detail?: string;
}

interface OpportunityProcessFlowProps {
  stage: string;
  oppId: number;
  // Dữ liệu hiện có để suy trạng thái tạm trước khi Codex cung cấp hàm:
  hasInitialResearch: boolean;
  hasPostSurveyResearch: boolean;
  hasPresales: boolean;
  hasCustomerNeed: boolean;
  scopeConfirmed: boolean;
  solutionConfirmed: boolean;
  hasSolutions: boolean;
  hasItems: boolean;
  expertReviewRequired: boolean;
  expertReviewStatus: string;
  expertReviewReason?: string;
  hasStakeholders: boolean;
  hasCompetitors: boolean;
  gateStatus?: StageGateStatus;
  canReviewGate?: boolean;
  canExpertReview?: boolean;
  // Propose data:
  hasQuotes: boolean;
  quotesRequireDiscountApproval: boolean;
  hasSentQuote: boolean;
  hasCustomerResponse: boolean;
  isQuoteAccepted: boolean;
}

export function OpportunityProcessFlow(props: OpportunityProcessFlowProps) {
  const { stage, oppId } = props;
  const href = (tab: string) => `/opportunities/${oppId}?tab=${tab}`;

  let steps: ProcessFlowStep[] = [];
  let stageTitle = "";
  let stageSubtitle = "";

  if (stage === "DEVELOP") {
    stageTitle = "Quy trình Phát triển cơ hội (Develop)";
    stageSubtitle = "9 bước chuẩn hóa nghiệp vụ từ nghiên cứu bối cảnh tới rà soát chuyển giai đoạn";

    const s1Done = props.hasInitialResearch;
    const s2Done = s1Done && props.hasPresales;
    const s3Done = s2Done && props.hasCustomerNeed;
    const s4Done = s3Done && props.hasPostSurveyResearch;
    const s5Done = props.scopeConfirmed;
    const s6Done = props.hasSolutions && props.hasItems && (!props.expertReviewRequired || props.expertReviewStatus === "APPROVED");
    const s7Done = props.hasStakeholders;
    const s8Done = props.hasCompetitors;
    const s9Done = false; // Đang ở Develop nên chưa chuyển

    const rawSteps = [
      {
        id: "initial_research",
        title: "Agent lần 1 nghiên cứu bối cảnh",
        actor: "Agent",
        done: s1Done,
        href: href("research"),
        hrefLabel: s1Done ? "Xem nghiên cứu" : "Chạy Agent",
        detail: "Đọc thông tin cơ hội, khách hàng và lịch sử tương tác ban đầu",
        note: s1Done ? "Đã hoàn thành bản nghiên cứu ban đầu" : "Cần chạy Agent lần 1 để phân tích",
      },
      {
        id: "discovery_appointment",
        title: "Xem nghiên cứu, hẹn lịch và phân công tư vấn giải pháp",
        actor: "Nhân viên kinh doanh",
        done: s2Done,
        href: href("summary"),
        hrefLabel: "Phân công",
        detail: "NVKD rà soát phát hiện của Agent, liên hệ khách và phân công Chuyên viên tư vấn giải pháp",
        note: props.hasPresales ? "Đã phân công chuyên viên tư vấn giải pháp" : "Chưa phân công chuyên viên tư vấn giải pháp",
      },
      {
        id: "survey",
        title: "Khảo sát nhu cầu và yêu cầu kỹ thuật",
        actor: "Nhân viên kinh doanh và Chuyên viên tư vấn giải pháp",
        done: s3Done,
        href: href("summary"),
        hrefLabel: "Nhập khảo sát",
        detail: "Ghi nhận bài toán, mục tiêu, hiện trạng, khó khăn và yêu cầu giải pháp",
        note: props.hasCustomerNeed ? "Đã ghi nhận thông tin nhu cầu khách hàng" : "Cần hoàn thiện khảo sát nhu cầu",
      },
      {
        id: "post_survey_research",
        title: "Agent lần 2 phân tích sau khảo sát",
        actor: "Agent",
        done: s4Done,
        href: href("research"),
        hrefLabel: s4Done ? "Xem phân tích" : "Chạy phân tích",
        detail: "Phân tích tài liệu khảo sát, kiểm tra ngân sách và phát hiện rủi ro",
        note: s4Done ? "Đã hoàn thành phân tích sau khảo sát" : "Chờ phân tích sau khi có biên bản khảo sát",
      },
      {
        id: "scope",
        title: "Xác nhận phạm vi với khách hàng",
        actor: "Nhân viên kinh doanh",
        done: s5Done,
        href: href("items"),
        hrefLabel: "Biên bản phạm vi",
        detail: "Thống nhất biên bản phạm vi triển khai và sản phẩm bàn giao",
        note: props.scopeConfirmed ? "Khách hàng đã xác nhận biên bản phạm vi" : "Chưa xác nhận biên bản phạm vi",
      },
      {
        id: "solution",
        title: "Phương án kỹ thuật, cấu hình sản phẩm và duyệt chuyên môn",
        actor: "Chuyên viên tư vấn giải pháp",
        done: s6Done,
        href: href("solution"),
        hrefLabel: "Hồ sơ kỹ thuật",
        detail: "Lập phương án kỹ thuật, kiến trúc, cấu hình sản phẩm dự kiến và trình duyệt chuyên môn khi có tích hợp",
        note: props.expertReviewRequired
          ? props.expertReviewStatus === "APPROVED"
            ? "Đã duyệt chuyên môn giải pháp"
            : props.expertReviewStatus === "PENDING"
            ? "Đang chờ Quản lý duyệt chuyên môn"
            : "Bắt buộc duyệt chuyên môn trước khi chuyển bước"
          : props.hasSolutions && props.hasItems
          ? "Đã lập phương án kỹ thuật và cấu hình"
          : "Chưa hoàn thiện hồ sơ kỹ thuật",
      },
      {
        id: "stakeholders",
        title: "Xác nhận bản đồ các bên liên quan",
        actor: "Nhân viên kinh doanh",
        done: s7Done,
        href: href("stakeholders"),
        hrefLabel: "Bên liên quan",
        detail: "Xác định người quyết định, người mua kinh tế, người đánh giá kỹ thuật và người dùng",
        note: props.hasStakeholders ? "Đã lập danh sách bên liên quan" : "Chưa thiết lập bên liên quan",
      },
      {
        id: "competitors",
        title: "Xác nhận đối thủ cạnh tranh",
        actor: "Nhân viên kinh doanh",
        done: s8Done,
        href: href("stakeholders"),
        hrefLabel: "Đối thủ",
        detail: "Phân tích điểm mạnh, điểm yếu và chiến lược đối phó với đối thủ",
        note: props.hasCompetitors ? "Đã ghi nhận thông tin đối thủ" : "Chưa có thông tin đối thủ",
      },
      {
        id: "advance",
        title: "Chuyển giai đoạn và Quản lý kinh doanh rà soát",
        actor: props.gateStatus?.required ? "Quản lý kinh doanh" : "Nhân viên kinh doanh",
        done: s9Done,
        href: href("summary"),
        hrefLabel: "Chuyển giai đoạn",
        detail: "Kiểm tra 4 mục kiểm soát và rà soát của Quản lý kinh doanh khi thuộc diện",
        note: props.gateStatus?.required
          ? props.gateStatus.status === "APPROVED"
            ? "Quản lý kinh doanh đã phê duyệt rà soát"
            : props.gateStatus.status === "PENDING"
            ? "Đang chờ Quản lý kinh doanh rà soát"
            : "Cần Quản lý kinh doanh rà soát khi chuyển sang Propose"
          : "Đủ điều kiện chuyển giai đoạn khi hoàn thành các bước trên",
      },
    ];

    let foundActive = false;
    steps = rawSteps.map((s, idx) => {
      let state: FlowStepState = "upcoming";
      if (s.done) {
        state = "done";
      } else if (!foundActive) {
        state = "active";
        foundActive = true;
      }
      return {
        ...s,
        number: idx + 1,
        state,
      };
    });
  } else if (stage === "PROPOSE") {
    stageTitle = "Quy trình Đề xuất giải pháp (Propose)";
    stageSubtitle = "6 bước chuẩn hóa từ chốt cấu hình đến ghi nhận quyết định của khách hàng";

    const p1Done = props.hasItems && props.hasSolutions;
    const p2Done = props.hasQuotes;
    const p3Done = !props.quotesRequireDiscountApproval || props.hasSentQuote;
    const p4Done = props.hasSentQuote;
    const p5Done = props.hasCustomerResponse;
    const p6Done = props.isQuoteAccepted;

    const rawSteps = [
      {
        id: "p1_config",
        title: "Chốt cấu hình từ Phát triển cơ hội",
        actor: "Nhân viên kinh doanh và Chuyên viên tư vấn giải pháp",
        done: p1Done,
        href: href("items"),
        hrefLabel: "Xem cấu hình",
        detail: "Kế thừa cấu hình sản phẩm và phương án kỹ thuật đã hoàn thiện ở Develop",
        note: p1Done ? "Đã chốt cấu hình sản phẩm" : "Cần hoàn thiện cấu hình sản phẩm",
      },
      {
        id: "p2_draft_quote",
        title: "Lập bản đề xuất và báo giá nháp",
        actor: "Nhân viên kinh doanh",
        done: p2Done,
        href: href("quotes"),
        hrefLabel: "Báo giá",
        detail: "Thiết lập đơn giá, chiết khấu, điều khoản thương mại và xuất bản đề xuất PDF",
        note: p2Done ? "Đã tạo báo giá nháp" : "Chưa tạo báo giá nháp",
      },
      {
        id: "p3_discount_approval",
        title: "Duyệt giá khi chiết khấu vượt hạn mức",
        actor: "Quản lý kinh doanh",
        done: p3Done,
        href: href("quotes"),
        hrefLabel: "Duyệt chiết khấu",
        detail: "Trình Quản lý kinh doanh phê duyệt nếu chiết khấu vượt hạn mức nhân viên",
        note: props.quotesRequireDiscountApproval
          ? props.hasSentQuote
            ? "Đã phê duyệt chiết khấu"
            : "Chờ Quản lý kinh doanh duyệt chiết khấu"
          : "Chiết khấu trong hạn mức cho phép",
      },
      {
        id: "p4_send_negotiate",
        title: "Gửi và thương lượng theo phiên bản",
        actor: "Nhân viên kinh doanh",
        done: p4Done,
        href: href("quotes"),
        hrefLabel: "Gửi khách",
        detail: "Gửi báo giá qua email/PDF, quản lý thương lượng qua từng phiên bản v1, v2...",
        note: p4Done ? "Đã gửi báo giá cho khách hàng" : "Chưa gửi báo giá chính thức",
      },
      {
        id: "p5_customer_decision",
        title: "Ghi nhận quyết định của khách hàng",
        actor: "Nhân viên kinh doanh",
        done: p5Done,
        href: href("quotes"),
        hrefLabel: "Ghi phản hồi",
        detail: "Ghi nhận phản hồi: Chấp thuận, Từ chối hoặc Yêu cầu điều chỉnh phương án",
        note: p5Done ? "Đã ghi nhận phản hồi của khách hàng" : "Chờ phản hồi từ khách hàng",
      },
      {
        id: "p6_close_ready",
        title: "Xác nhận chi tiết mua hàng, sẵn sàng Tạo đơn",
        actor: "Nhân viên kinh doanh",
        done: p6Done,
        href: href("quotes"),
        hrefLabel: "Tạo đơn hàng",
        detail: "Khách hàng chấp thuận báo giá, sẵn sàng chuyển sang giai đoạn Đóng (Close / Order)",
        note: p6Done ? "Báo giá đã được chấp thuận, sẵn sàng tạo đơn hàng" : "Chưa đủ điều kiện chốt đơn",
      },
    ];

    let foundActive = false;
    steps = rawSteps.map((s, idx) => {
      let state: FlowStepState = "upcoming";
      if (s.done) {
        state = "done";
      } else if (!foundActive) {
        state = "active";
        foundActive = true;
      }
      return {
        ...s,
        number: idx + 1,
        state,
      };
    });
  } else {
    // Không phải Develop hoặc Propose (Qualify, Close, Fulfill)
    return null;
  }

  const currentStep = steps.find((s) => s.state === "active") ?? steps[steps.length - 1];

  return (
    <section className="mx-6 mb-4 rounded-xl border border-stroke bg-surface p-4 shadow-[var(--shadow-4)]">
      {/* Tiêu đề khung luồng */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand">
              <Icon name="arrowRight" size={14} />
            </span>
            <h2 className="text-[15px] font-semibold text-ink">{stageTitle}</h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">{stageSubtitle}</p>
        </div>

        {/* Nổi bật việc tiếp theo */}
        {currentStep && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-tint,#ebf3fc)] px-3 py-1.5 text-xs text-brand border border-brand/20">
            <span className="font-semibold">Việc tiếp theo:</span>
            <span>Bước {currentStep.number}. {currentStep.title}</span>
            <Link href={currentStep.href} className="font-semibold underline ml-1 hover:text-brand-strong">
              {currentStep.hrefLabel ?? "Thực hiện ngay"} →
            </Link>
          </div>
        )}
      </div>

      {/* Lưới các bước theo quy trình */}
      <ol className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-9">
        {steps.map((s) => {
          const isDone = s.state === "done";
          const isActive = s.state === "active";
          return (
            <li
              key={s.id}
              className={cx(
                "relative flex flex-col justify-between rounded-lg border p-2.5 transition-all",
                isDone && "border-[#b5e0b5] bg-[#f7fcf6]",
                isActive && "border-brand bg-[#f5f9fe] ring-2 ring-brand/20 shadow-sm",
                s.state === "upcoming" && "border-stroke bg-[#fafafa] text-ink-3",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={cx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      isDone && "bg-success text-white",
                      isActive && "bg-brand text-white",
                      s.state === "upcoming" && "bg-[#e5e5e5] text-ink-3",
                    )}
                  >
                    {isDone ? <Icon name="check" size={12} strokeWidth={2.5} /> : s.number}
                  </span>

                  <span
                    className={cx(
                      "rounded px-1 py-0.5 text-[10px] font-medium",
                      isDone && "bg-success-tint text-success",
                      isActive && "bg-brand-tint text-brand font-semibold",
                      s.state === "upcoming" && "bg-stroke text-ink-3",
                    )}
                  >
                    {isDone ? "Hoàn thành" : isActive ? "Đang làm" : "Chưa tới"}
                  </span>
                </div>

                <h3 className={cx("text-xs font-semibold leading-snug", isActive ? "text-brand" : "text-ink")}>
                  {s.title}
                </h3>

                <div className="mt-1">
                  <span className="inline-block rounded bg-surface px-1 py-0.5 text-[10px] text-ink-2 border border-stroke">
                    {s.actor}
                  </span>
                </div>

                {s.note && (
                  <p className={cx("mt-1.5 text-[11px] leading-tight", isActive ? "text-ink-1 font-medium" : "text-ink-3")}>
                    {s.note}
                  </p>
                )}
              </div>

              <div className="mt-2.5 pt-1.5 border-t border-[#f0f0f0] flex justify-between items-center text-[11px]">
                <Link href={s.href} className="link font-medium">
                  {s.hrefLabel ?? "Mở"} →
                </Link>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Hộp rà soát của Quản lý kinh doanh khi thuộc diện (dữ liệu từ stageGateStatus) */}
      {props.gateStatus && props.gateStatus.required && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={16} className="text-amber-700 shrink-0" />
            <div>
              <span className="font-semibold">Cổng Quản lý kinh doanh rà soát cơ hội:</span>{" "}
              {props.gateStatus.status === "APPROVED" ? (
                <span className="text-success font-medium">
                  Đã được {props.gateStatus.decidedBy ?? "Quản lý kinh doanh"} phê duyệt ({props.gateStatus.comment ?? "Đạt yêu cầu"}).
                </span>
              ) : props.gateStatus.status === "PENDING" ? (
                <span>
                  Đang chờ {props.gateStatus.deciders.join(", ")} rà soát trước khi chuyển sang Đề xuất giải pháp (Propose).
                </span>
              ) : (
                <span>
                  Cần rà soát khi giá trị cơ hội lớn hoặc có cảnh báo rủi ro.
                </span>
              )}
            </div>
          </div>
          {props.canReviewGate && props.gateStatus.status === "PENDING" && (
            <Link href="/approvals" className="btn btn-sm btn-primary">
              Mở màn hình Phê duyệt
            </Link>
          )}
        </div>
      )}

      {/* Cổng duyệt chuyên môn giải pháp khi thuộc diện */}
      {props.expertReviewRequired && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-950">
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={16} className="text-brand shrink-0" />
            <div>
              <span className="font-semibold">Cổng duyệt chuyên môn giải pháp:</span>{" "}
              {props.expertReviewStatus === "APPROVED" ? (
                <span className="text-success font-medium">
                  Chuyên môn giải pháp đã được Quản lý kinh doanh phê duyệt.
                </span>
              ) : props.expertReviewStatus === "PENDING" ? (
                <span>Đang chờ Quản lý phê duyệt hồ sơ giải pháp và kiến trúc kỹ thuật.</span>
              ) : (
                <span>{props.expertReviewReason ?? "Yêu cầu tích hợp hoặc quy mô lớn cần duyệt chuyên môn trước khi sang Propose."}</span>
              )}
            </div>
          </div>
          {props.canExpertReview && props.expertReviewStatus === "PENDING" && (
            <Link href={`${href("solution")}`} className="btn btn-sm btn-primary">
              Rà soát chuyên môn
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
