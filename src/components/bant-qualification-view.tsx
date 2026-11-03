// Bảng đánh giá BANT 4 tiêu chí chuẩn hóa của nhóm và Khung quan sát Qualification Agent trên trang Lead:
// - Thang 0/8/15/25 cho 4 tiêu chí (Budget, Authority, Need, Timeline).
// - Mô tả mức điểm, lý do chấm điểm và căn cứ cho từng tiêu chí.
// - Ngưỡng đạt 60/100 VÀ điều kiện đã xác định người có thẩm quyền quyết định.
// - Khung quan sát Agent chuẩn 6 bước đồng bộ với Opportunity Agent.
// - Hiển thị đề xuất Email nháp kèm căn cứ và nút duyệt.
// - Dữ liệu bổ sung từ Agent (Enrichment) có nguồn dẫn.
// Lý do và căn cứ từng tiêu chí lấy từ bantBreakdown (src/lib/services/sales-flow.ts).

import Link from "next/link";
import type { BantBreakdown } from "@/lib/services/sales-flow";
import { runForWorkflow } from "@/lib/services/ai-review";
import { AgentTerminal } from "./agent-terminal";
import { terminalLines } from "./agent-terminal-lines";
import { Icon } from "./icons";
import { StatusBadge, cx } from "./ui";
import { SubmitButton } from "./client";
import { AgentObservationFlow, type AgentObservationStep } from "./agent-observation-flow";
import type { Suggestion } from "@/lib/services/ai-review";
import { formatDate } from "@/lib/domain";

interface BantPayload {
  scores?: {
    budget?: number;
    authority?: number;
    need?: number;
    timeline?: number;
  };
  total?: number;
  rationale?: string;
  missing_info?: string[];
  evidence?: { ref: string; detail?: string; quote?: string }[];
}

interface EmailPayload {
  to?: string;
  subject?: string;
  body?: string;
  purpose?: string;
  facts_used?: { ref: string; detail?: string; quote?: string }[];
}

interface LeadBantData {
  id: number;
  company_name: string;
  contact_name: string;
  contact_title: string | null;
  status: string;
  bant_score: number;
  bant_budget: number;
  bant_authority: number;
  bant_need: number;
  bant_timeline: number;
  bant_notes: string | null;
}

interface RunRecord {
  id: number;
  agent: string;
  trigger: string;
  model: string;
  status: string;
  tool_calls_json: string;
  summary: string | null;
  error: string | null;
  triggered_by_name: string | null;
  started_at: string;
}

interface BantQualificationViewProps {
  lead: LeadBantData;
  threshold: number;
  suggestions: Suggestion[];
  runs: RunRecord[];
  canWrite: boolean;
  canReviewAi: boolean;
  bantAction: (formData: FormData) => Promise<void>;
  breakdown: BantBreakdown;
}

// Bảng thang điểm chuẩn 4 mức của đồ án môn
export const BANT_CRITERIA = [
  {
    key: "budget" as const,
    name: "Ngân sách (Budget)",
    levels: {
      0: "Chưa có thông tin về ngân sách dự kiến",
      8: "Có nhắc đến nhưng chưa rõ con số cụ thể",
      15: "Đã có khoảng ngân sách ước tính của doanh nghiệp",
      25: "Ngân sách đã được Ban Giám đốc phê duyệt chính thức",
    },
  },
  {
    key: "authority" as const,
    name: "Thẩm quyền (Authority)",
    levels: {
      0: "Chưa xác định được người tiếp xúc",
      8: "Mới tiếp xúc người dùng cuối hoặc nhân viên tác nghiệp",
      15: "Đã gặp người có ảnh hưởng hoặc trưởng bộ phận liên quan",
      25: "Đã tiếp xúc đúng người có thẩm quyền ra quyết định cuối cùng",
    },
  },
  {
    key: "need" as const,
    name: "Nhu cầu (Need)",
    levels: {
      0: "Chưa rõ nhu cầu của khách hàng",
      8: "Nhu cầu chung chung, chưa cụ thể bài toán quản lý",
      15: "Vấn đề và khó khăn cụ thể cần giải pháp phần mềm xử lý",
      25: "Rõ bài toán nghiệp vụ, phạm vi các phân hệ và yêu cầu cần có",
    },
  },
  {
    key: "timeline" as const,
    name: "Lộ trình (Timeline)",
    levels: {
      0: "Chưa xác định thời gian triển khai",
      8: "Dự kiến mua vào năm sau hoặc chưa có kế hoạch cụ thể",
      15: "Kế hoạch triển khai trong năm nay (khoảng 3 – 6 tháng)",
      25: "Kế hoạch mua ngay trong tháng hoặc cuối quý hiện tại",
    },
  },
] as const;

export function BantQualificationView({
  lead,
  threshold,
  suggestions,
  runs,
  canWrite,
  canReviewAi,
  bantAction,
  breakdown,
}: BantQualificationViewProps) {
  // Tìm đề xuất BANT từ Agent (nếu có)
  const bantSuggestion = suggestions.find((s) => s.kind === "BANT_SCORE");
  let bantPayload: BantPayload | null = null;
  if (bantSuggestion) {
    try {
      bantPayload = JSON.parse(bantSuggestion.payload_json) as BantPayload;
    } catch {
      bantPayload = null;
    }
  }

  // Tìm email nháp từ Agent (nếu có)
  const emailSuggestion = suggestions.find((s) => s.kind === "EMAIL_DRAFT");
  let emailPayload: EmailPayload | null = null;
  if (emailSuggestion) {
    try {
      emailPayload = JSON.parse(emailSuggestion.payload_json) as EmailPayload;
    } catch {
      emailPayload = null;
    }
  }

  // Tìm dữ liệu bổ sung Enrichment từ Agent
  const enrichmentSuggestions = suggestions.filter((s) => s.kind === "ENRICHMENT");

  // Lấy lần chạy Qualification Agent gần nhất
  const latestRun = runs[0];
  const latestTrace = latestRun ? runForWorkflow(latestRun.id) : undefined;
  let toolCalls: { tool: string; ok: boolean; input?: unknown }[] = [];
  if (latestRun) {
    try {
      toolCalls = JSON.parse(latestRun.tool_calls_json);
    } catch {
      toolCalls = [];
    }
  }

  // Điều kiện đạt chuẩn BANT: Tổng >= threshold VÀ Authority = 25 (đã gặp đúng người quyết định), theo bantBreakdown
  const hasDecisionMaker = lead.bant_authority >= 25;
  const detail = (key: string) => breakdown.criteria.find((c) => c.key === key);
  const evidenceText = (e: unknown) =>
    typeof e === "string" ? e : (e as { ref?: string; quote?: string })?.ref ?? JSON.stringify(e);
  const isScorePassed = lead.bant_score >= threshold;
  const isQualified = isScorePassed && hasDecisionMaker;

  // Xây dựng 6 bước quan sát cho Qualification Agent
  const observationSteps: AgentObservationStep[] = [
    {
      key: "q_data",
      title: "1. Dữ liệu được cấp quyền",
      owner: "SYSTEM",
      ownerLabel: "Bảo mật",
      status: "done",
      summary: "Đọc thông tin Lead, lịch sử tương tác, chức danh liên hệ",
      details: ["lead.company_name", "lead.contact_title", "lead.notes"],
      note: "Phạm vi kiểm soát nội bộ",
    },
    {
      key: "q_tools",
      title: "2. Agent và công cụ",
      owner: "LLM",
      ownerLabel: "Agent",
      status: toolCalls.length > 0 ? "done" : "skipped",
      summary: toolCalls.length > 0 ? `${toolCalls.length} công cụ được thực thi an toàn` : "Chưa chạy Agent",
      details: toolCalls.map((t) => `${t.tool}${t.ok ? " ✓" : " ✕"}`),
      note: latestRun ? `${latestRun.model} · ${latestRun.status}` : undefined,
    },
    {
      key: "q_rules",
      title: "3. Kiểm quy tắc BANT",
      owner: "RULES",
      ownerLabel: "Bộ quy tắc",
      status: "done",
      summary: `Áp thang điểm 0/8/15/25 và đối chiếu ngưỡng ${threshold}`,
      note: isQualified ? "Đạt cả điểm số và thẩm quyền" : "Chưa đạt điều kiện chuyển đổi",
    },
    {
      key: "q_proposal",
      title: "4. Lưu đề xuất",
      owner: "SYSTEM",
      ownerLabel: "Hệ thống",
      status: bantSuggestion ? "done" : "skipped",
      summary: bantSuggestion ? `Đề xuất điểm ${bantPayload?.total ?? 0}/100 lưu ở bảng duyệt` : "Chưa có đề xuất mới",
      note: "Agent đề xuất, không ghi đè hồ sơ",
    },
    {
      key: "q_verify",
      title: "5. Con người xác minh",
      owner: "HUMAN",
      ownerLabel: "NVKD",
      status: bantSuggestion?.status === "APPROVED" ? "done" : bantSuggestion ? "active" : "upcoming",
      summary: bantSuggestion
        ? bantSuggestion.status === "APPROVED"
          ? `Đã duyệt bởi ${bantSuggestion.reviewed_by_name ?? "NVKD"}`
          : "Đang chờ Nhân viên kinh doanh xác nhận"
        : "NVKD cập nhật trực tiếp hoặc duyệt từ Agent",
      note: bantSuggestion?.reviewed_at ? formatDate(bantSuggestion.reviewed_at, true) : undefined,
    },
    {
      key: "q_update",
      title: "6. Cập nhật nghiệp vụ",
      owner: "HUMAN",
      ownerLabel: "Nghiệp vụ",
      status: isQualified ? "done" : "upcoming",
      summary: isQualified ? "Đủ điều kiện chuyển đổi sang Cơ hội bán hàng" : "Cần bổ sung thông tin BANT còn thiếu",
      note: isQualified ? "Sẵn sàng Qualify → Develop" : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. KHUNG QUAN SÁT VẬN HÀNH CỦA QUALIFICATION AGENT */}
      <AgentObservationFlow
        agentName="Sales Qualification Agent"
        runId={latestRun?.id}
        trigger={latestRun?.trigger}
        model={latestRun?.model}
        steps={observationSteps}
      />

      {latestTrace && (
        <AgentTerminal
          title="Sales Qualification Agent đang làm việc"
          subtitle={`Lần chạy #${latestRun!.id}`}
          lines={terminalLines(latestTrace, { savedLabel: "Lưu các đề xuất chờ duyệt (BANT, bổ sung thông tin, email nháp)" })}
        />
      )}

      {/* 2. BẢNG BANT 4 TIÊU CHÍ CHUẨN ĐỒ ÁN */}
      <section className="rounded-xl border border-stroke bg-surface p-4 shadow-[var(--shadow-4)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand">
                <Icon name="checkmark" size={14} />
              </span>
              <h3 className="text-[15px] font-semibold text-ink">
                Đánh giá chuẩn BANT (Thang điểm 0 / 8 / 15 / 25)
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">
              Ngưỡng đạt: Tổng điểm ≥ {threshold}/100 và Thẩm quyền đạt 25 (đã gặp đúng người quyết định)
            </p>
          </div>

          {/* Huy hiệu kết luận đạt / chưa đạt */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">Kết luận:</span>
            <span
              className={cx(
                "rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                isQualified
                  ? "bg-success-tint text-success border border-success/30"
                  : "bg-amber-100 text-amber-900 border border-amber-300",
              )}
            >
              {isQualified ? "Đạt chuẩn chuyển đổi" : "Chưa đạt chuẩn BANT"}
            </span>
          </div>
        </div>

        {/* Thanh tóm tắt tổng điểm và điều kiện người quyết định */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-stroke bg-[#fafafa] p-3 text-xs">
          <div>
            <span className="text-ink-3">Tổng điểm BANT hiện tại:</span>
            <div className="text-lg font-bold">
              <span className={lead.bant_score >= threshold ? "text-success" : "text-amber-800"}>
                {lead.bant_score}
              </span>
              <span className="text-sm font-normal text-ink-3"> / 100</span>
              <span className="ml-2 text-xs font-normal text-ink-3">
                ({lead.bant_score >= threshold ? "Đạt ngưỡng điểm" : `Cần thêm ${threshold - lead.bant_score} điểm`})
              </span>
            </div>
          </div>

          <div>
            <span className="text-ink-3">Người ra quyết định (Thẩm quyền = 25):</span>
            <div className="text-sm font-semibold mt-1">
              {hasDecisionMaker ? (
                <span className="text-success flex items-center gap-1">
                  <Icon name="check" size={14} /> Đã xác định ({lead.bant_authority}/25)
                </span>
              ) : (
                <span className="text-danger flex items-center gap-1">
                  <Icon name="dismiss" size={14} /> Chưa xác định (Hiện {lead.bant_authority}/25)
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-ink-3">Đề xuất từ Qualification Agent:</span>
            <div className="text-xs font-medium text-ink-1 mt-1">
              {bantSuggestion ? (
                <span>
                  Agent chấm {bantPayload?.total ?? "—"}/100 (
                  <StatusBadge
                    status={bantSuggestion.status}
                    labels={{ PENDING_REVIEW: "Chờ xác nhận", APPROVED: "Đã xác nhận", REJECTED: "Đã từ chối" }}
                  />
                  )
                </span>
              ) : (
                <span className="text-ink-3 italic">Chưa có đề xuất từ Agent</span>
              )}
            </div>
          </div>
        </div>

        {/* Form cập nhật BANT với 4 tiêu chí */}
        <form action={bantAction} className="space-y-4">
          <input type="hidden" name="id" value={lead.id} />

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-stroke bg-[#fafafa] text-left text-ink-3">
                <tr>
                  <th className="py-2 px-3 font-semibold w-48">Tiêu chí BANT</th>
                  <th className="py-2 px-3 font-semibold w-32">Mức điểm (0/8/15/25)</th>
                  <th className="py-2 px-3 font-semibold">Mô tả mức và Giải thích của Agent</th>
                  <th className="py-2 px-3 font-semibold w-40">Căn cứ / Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {BANT_CRITERIA.map((crit) => {
                  const currentValue = lead[`bant_${crit.key}` as const];
                  const agentScore = bantPayload?.scores?.[crit.key];

                  return (
                    <tr key={crit.key} className="align-top hover:bg-[#fafafa]/50">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-ink text-[13px]">{crit.name}</div>
                        <div className="text-[11px] text-ink-3 mt-0.5">
                          Hiện tại: <span className="font-bold text-ink-1">{currentValue}/25</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          name={crit.key}
                          defaultValue={currentValue}
                          disabled={!canWrite}
                          className="select !h-8 text-xs font-semibold"
                        >
                          <option value="0">0 — Chưa có thông tin</option>
                          <option value="8">8 — Sơ bộ / Mức thấp</option>
                          <option value="15">15 — Trung bình / Có kế hoạch</option>
                          <option value="25">25 — Đã phê duyệt / Chắc chắn</option>
                        </select>
                        {agentScore !== undefined && agentScore !== currentValue && (
                          <div className="mt-1 text-[10px] text-brand font-medium">
                            Agent đề xuất: {agentScore}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-ink-1 font-medium">
                          {crit.levels[currentValue as keyof typeof crit.levels] ?? crit.levels[0]}
                        </div>
                        {detail(crit.key) && (
                          <div className="mt-1 text-[11px] text-ink-2 pl-2 border-l-2 border-brand/30">
                            <span className="font-semibold text-brand">Vì sao:</span> {detail(crit.key)!.reason}
                            {detail(crit.key)!.level.startsWith("Điểm lịch sử") && (
                              <div className="text-[#bc4b09]">Điểm lịch sử ngoài thang 0/8/15/25, cần đánh giá lại.</div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-ink-3">
                        {detail(crit.key)?.evidence.length ? (
                          <ul className="space-y-0.5">
                            {detail(crit.key)!.evidence.map((e, i) => (
                              <li key={i}><code className="text-[10px] font-mono bg-[#f5f5f5] px-1 py-0.5 rounded text-ink-1">{evidenceText(e)}</code></li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[11px] italic">Chưa có căn cứ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-medium text-ink-2 mb-1">
              Ghi chú và chứng cứ chứng minh BANT:
            </label>
            <textarea
              name="bant_notes"
              defaultValue={lead.bant_notes ?? ""}
              disabled={!canWrite}
              className="textarea !min-h-16"
              placeholder="Ghi nhận các thông tin bổ sung, nguồn xác nhận hoặc nội dung trao đổi cụ thể với khách..."
            />
          </div>

          {canWrite && (
            <div className="flex justify-end pt-1">
              <SubmitButton icon="save">Lưu đánh giá BANT</SubmitButton>
            </div>
          )}
        </form>
      </section>

      {/* 3. EMAIL NHÁP DO AGENT ĐỀ XUẤT (NẾU CÓ) */}
      {emailSuggestion && (
        <section className="rounded-xl border border-brand/30 bg-brand-tint/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/20 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5c2e91]/20 text-[#5c2e91]">
                <Icon name="mail" size={14} />
              </span>
              <h4 className="text-xs font-semibold text-brand uppercase tracking-wider">
                Email nháp do Qualification Agent soạn thảo
              </h4>
              <StatusBadge
                status={emailSuggestion.status}
                labels={{ PENDING_REVIEW: "Chờ duyệt (Cổng duyệt email)", APPROVED: "Đã duyệt và gửi", REJECTED: "Đã từ chối" }}
              />
            </div>

            {canReviewAi && (
              <Link
                href={`/ai-review#s${emailSuggestion.id}`}
                className="btn btn-sm btn-primary text-xs"
              >
                Mở màn hình duyệt email →
              </Link>
            )}
          </div>

          {emailPayload && (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="text-ink-3">Người nhận:</span>
                <span className="font-semibold text-ink">{emailPayload.to}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="text-ink-3">Tiêu đề:</span>
                <span className="font-semibold text-ink">{emailPayload.subject}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="text-ink-3">Mục đích:</span>
                <span className="text-ink-2">{emailPayload.purpose}</span>
              </div>
              <div className="rounded border border-stroke bg-surface p-3 mt-2">
                <div className="font-medium text-ink-3 mb-1 text-[11px]">Nội dung email:</div>
                <div className="whitespace-pre-wrap text-ink-1 leading-relaxed text-xs">
                  {emailPayload.body}
                </div>
              </div>

              {emailPayload.facts_used && emailPayload.facts_used.length > 0 && (
                <div className="text-[11px] text-ink-3 pt-1">
                  <span className="font-medium text-ink-2">Căn cứ sử dụng:</span>{" "}
                  {emailPayload.facts_used.map((f: { ref: string; quote?: string; detail?: string }, idx: number) => (
                    <span key={idx}>{idx > 0 ? "; " : ""}{f.ref} ({f.quote || f.detail})</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. DỮ LIỆU BỔ SUNG (ENRICHMENT) TỪ AGENT */}
      {enrichmentSuggestions.length > 0 && (
        <section className="rounded-xl border border-stroke bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <Icon name="sparkle" size={13} className="text-brand" /> Dữ liệu bổ sung từ Agent (Enrichment)
            </h4>
            <span className="text-[11px] text-ink-3">Đã qua rà soát và kiểm duyệt</span>
          </div>

          <div className="space-y-2 text-xs">
            {enrichmentSuggestions.map((e) => {
              let payload: { fields?: Record<string, string> } = {};
              try {
                payload = JSON.parse(e.payload_json) as { fields?: Record<string, string> };
              } catch {
                payload = {};
              }

              return (
                <div key={e.id} className="flex items-center justify-between p-2 rounded bg-[#fafafa] border border-[#f0f0f0]">
                  <div>
                    <span className="font-semibold text-ink">{e.title}</span>
                    {payload.fields && (
                      <span className="text-ink-2 ml-2">
                        ({Object.entries(payload.fields).map(([k, v]) => `${k}: ${v}`).join(", ")})
                      </span>
                    )}
                  </div>
                  <StatusBadge
                    status={e.status}
                    labels={{ PENDING_REVIEW: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Đã từ chối" }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
