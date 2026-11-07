import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate, SUGGESTION_KIND } from "@/lib/domain";
import { listSuggestions, type Suggestion } from "@/lib/services/ai-review";
import { CommandBar, CommandLink, CommandSep, Empty, Flash, PageTitle, StatusBadge, Badge } from "@/components/ui";
import { approveSuggestionAction, rejectSuggestionAction } from "./actions";

export const metadata: Metadata = { title: "Kiểm duyệt đề xuất AI (AI Review Inbox)" };

// Màu theo mức điểm BANT 0/8/15/25: xám, cam, xanh, xanh lá.
const BANT_TONE = {
  none: { label: "Chưa có", bg: "#f5f7fa", border: "#e1e8f3", ink: "#667085", bar: "#a4acb9" },
  low: { label: "Sơ bộ", bg: "#fff7ec", border: "#f6d9ad", ink: "#9a5b06", bar: "#c97d0e" },
  mid: { label: "Khá", bg: "#eef5fd", border: "#c9dff7", ink: "#0f5aa3", bar: "#0f6cbd" },
  high: { label: "Đạt", bg: "#eefaf0", border: "#bfe5c4", ink: "#0e700e", bar: "#107c10" },
};
const BANT_LABEL = { budget: "Ngân sách", authority: "Thẩm quyền", need: "Nhu cầu", timeline: "Thời gian" } as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  EDITED: "Đã chỉnh sửa và duyệt",
};

export default async function AiReviewPage({ searchParams }: PageProps<"/ai-review">) {
  await requireUser();
  const sp = (await searchParams) as { status?: string; kind?: string; ok?: string; error?: string };
  const currentStatus = sp.status ?? "PENDING_REVIEW";
  const currentKind = sp.kind ?? "";

  const suggestions = listSuggestions({
    status: currentStatus,
    kind: currentKind || undefined,
  });

  return (
    <>
      <CommandBar>
        <CommandLink href="/ai-review?status=PENDING_REVIEW" icon="sparkle">Chờ duyệt</CommandLink>
        <CommandLink href="/ai-review?status=APPROVED" icon="checkCircle">Đã duyệt</CommandLink>
        <CommandLink href="/ai-review?status=REJECTED" icon="dismissCircle">Đã từ chối</CommandLink>
        <CommandLink href="/ai-review?status=ALL" icon="filter">Tất cả trạng thái</CommandLink>
        <CommandSep />
        <CommandLink href="/ai-review?kind=EMAIL_DRAFT" icon="chat">Email nháp</CommandLink>
        <CommandLink href="/ai-review?kind=BANT_SCORE" icon="star">BANT Score</CommandLink>
        <CommandLink href="/ai-review?kind=DISQUALIFY" icon="dismissCircle">Đề xuất loại</CommandLink>
        <CommandLink href="/ai-review?kind=CONVERSION" icon="lead">Chuyển đổi</CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title="Kiểm duyệt đề xuất AI (AI Review Inbox)"
        subtitle="Điểm kiểm duyệt con người (Human-in-the-loop): Duyệt email nháp, duyệt loại Lead, xác nhận chuyển đổi"
        icon="sparkle"
      />

      <div className="px-6 pb-12 space-y-6">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-subtle p-3 text-xs border border-edge">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-2">Trạng thái:</span>
            {["PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"].map((st) => (
              <Link
                key={st}
                href={`/ai-review?status=${st}${currentKind ? `&kind=${currentKind}` : ""}`}
                className={`px-2.5 py-1 rounded transition-colors ${
                  currentStatus === st ? "bg-accent text-white font-medium" : "bg-surface hover:bg-surface-hover text-ink-2"
                }`}
              >
                {STATUS_LABELS[st] ?? st}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-2">Loại đề xuất:</span>
            <Link
              href={`/ai-review?status=${currentStatus}`}
              className={`px-2.5 py-1 rounded transition-colors ${
                !currentKind ? "bg-accent text-white font-medium" : "bg-surface hover:bg-surface-hover text-ink-2"
              }`}
            >
              Tất cả
            </Link>
            {Object.entries(SUGGESTION_KIND).map(([k, label]) => (
              <Link
                key={k}
                href={`/ai-review?status=${currentStatus}&kind=${k}`}
                className={`px-2.5 py-1 rounded transition-colors ${
                  currentKind === k ? "bg-accent text-white font-medium" : "bg-surface hover:bg-surface-hover text-ink-2"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Suggestion list */}
        {suggestions.length === 0 ? (
          <Empty icon="sparkle">
            Không có đề xuất AI nào phù hợp với bộ lọc hiện tại.
          </Empty>
        ) : (
          <div className="space-y-4">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SuggestionCard({ suggestion: s }: { suggestion: Suggestion }) {
  let payload: Record<string, unknown> = {};
  let evidence: Array<{ ref?: string; source?: string; quote?: string; detail?: string }> = [];

  try {
    payload = JSON.parse(s.payload_json);
  } catch {
    payload = {};
  }

  try {
    evidence = JSON.parse(s.evidence_json);
  } catch {
    evidence = [];
  }

  const isPending = s.status === "PENDING_REVIEW";
  const entityLink = s.entity_type === "lead" ? `/leads/${s.entity_id}` : `/opportunities/${s.entity_id}`;

  return (
    <div className="rounded-lg border border-edge bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-surface-subtle/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone={s.kind === "DISQUALIFY" ? "danger" : s.kind === "CONVERSION" ? "success" : "brand"}>
            {SUGGESTION_KIND[s.kind] ?? s.kind}
          </Badge>
          <span className="font-semibold text-sm text-ink">{s.title}</span>
          <span className="text-xs text-ink-3">· {s.agent === "QUALIFICATION" ? "Qualification Agent" : "Opportunity Agent"}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-ink-3">{formatDate(s.created_at)}</span>
          <StatusBadge status={s.status} labels={STATUS_LABELS} />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 text-xs">
        {/* Target Entity */}
        <div className="flex items-center gap-2 text-ink-2">
          <span className="font-semibold text-ink-3">Hồ sơ mục tiêu:</span>
          <Link href={entityLink} className="text-accent hover:underline font-medium">
            {s.entity_type.toUpperCase()} #{s.entity_id} {s.entity_label ? `(${s.entity_label})` : ""}
          </Link>
        </div>

        {/* Content Details by kind */}
        <div className="rounded border border-edge/60 bg-surface-subtle/30 p-3">
          {s.kind === "EMAIL_DRAFT" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-ink-3">Người nhận:</span> <span className="font-medium">{String(payload.to || "")}</span></div>
                <div><span className="text-ink-3">Mục đích:</span> <span className="font-medium">{String(payload.purpose || "Tiếp cận khách hàng")}</span></div>
              </div>
              <div><span className="text-ink-3">Tiêu đề:</span> <span className="font-semibold">{String(payload.subject || "")}</span></div>
              <div className="mt-2 whitespace-pre-wrap rounded bg-surface p-2.5 font-mono text-xs border border-edge">
                {String(payload.body || "")}
              </div>
            </div>
          )}

          {s.kind === "BANT_SCORE" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["budget", "authority", "need", "timeline"] as const).map((key) => {
                  const score = ((payload.scores as Record<string, number>) || {})[key] ?? 0;
                  const tone = score >= 25 ? BANT_TONE.high : score >= 15 ? BANT_TONE.mid : score >= 8 ? BANT_TONE.low : BANT_TONE.none;
                  return (
                    <div key={key} className="rounded-xl border p-3" style={{ borderColor: tone.border, background: tone.bg }}>
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide" style={{ color: tone.ink }}>
                        {BANT_LABEL[key]}
                        <span className="rounded-full bg-white/70 px-1.5 text-[10px] normal-case">{tone.label}</span>
                      </div>
                      <div className="mt-1 text-[22px] font-bold leading-7 text-brand-ink">{score}<span className="text-xs font-normal text-ink-3">/25</span></div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/80">
                        <div className="h-1.5 rounded-full" style={{ width: `${(score / 25) * 100}%`, background: tone.bar }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 text-ink-2">
                <span className="font-semibold text-ink-3">Đánh giá và căn cứ:</span> {String(payload.rationale || "")}
              </div>
              {payload.confidence !== undefined && (
                <div className="text-xs text-ink-3">
                  Độ tin cậy của Agent: <strong className="text-ink">{(Number(payload.confidence) * 100).toFixed(0)}%</strong>
                  {Number(payload.confidence) < 0.6 && " (Dưới ngưỡng 60% - yêu cầu con người xem xét)"}
                </div>
              )}
            </div>
          )}

          {s.kind === "ENRICHMENT" && (
            <div className="space-y-1">
              <div className="font-semibold text-ink-3 mb-1">Các trường thông tin đề xuất bổ sung:</div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries((payload.fields as Record<string, string>) || {}).map(([f, val]) => (
                  <div key={f} className="rounded bg-surface p-2 border border-edge">
                    <dt className="text-ink-3 text-[11px] capitalize">{f}:</dt>
                    <dd className="font-medium text-ink mt-0.5">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {s.kind === "DISQUALIFY" && (
            <div className="space-y-1 text-danger-ink">
              <span className="font-semibold text-ink-3">Lý do đề xuất loại bỏ:</span>
              <p className="mt-1 font-medium">{String(payload.reason || "")}</p>
            </div>
          )}

          {s.kind === "CONVERSION" && (
            <div className="space-y-1 text-success-ink">
              <span className="font-semibold text-ink-3">Gói bàn giao chuyển đổi cơ hội:</span>
              <p className="mt-1 font-medium text-ink">{String(payload.handoff_summary || "")}</p>
            </div>
          )}
        </div>

        {/* Evidence & Grounding */}
        {evidence.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="font-semibold text-xs text-ink-3">Căn cứ trích dẫn chứng minh (Grounding):</span>
            <div className="flex flex-wrap gap-2">
              {evidence.filter((ev, idx, arr) => arr.findIndex((x) => (x.ref || x.source) === (ev.ref || ev.source) && (x.quote || x.detail) === (ev.quote || ev.detail)) === idx).map((ev, idx) => {
                const ref = ev.ref || ev.source || "";
                const detail = ev.quote || ev.detail || "";
                return (
                  <span
                    key={idx}
                    title={detail}
                    className="inline-flex items-center gap-1 rounded-full border border-[#cfe0f6] bg-brand-tint px-2.5 py-0.5 text-[11px] text-ink-2"
                  >
                    <strong className="text-ink">{ref}</strong>
                    {detail && <span className="text-ink-3 truncate max-w-[200px]">: &quot;{detail}&quot;</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Audit / Review result info if already processed */}
        {!isPending && (
          <div className="border-t border-edge pt-2 text-xs text-ink-3 flex items-center justify-between">
            <span>
              Người xử lý: <strong className="text-ink">{s.reviewed_by_name || "Hệ thống"}</strong> lúc {formatDate(s.reviewed_at)}
            </span>
            {s.review_note && <span>Ghi chú: {s.review_note}</span>}
          </div>
        )}

        {/* Action Buttons for Pending Review */}
        {isPending && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-edge pt-3">
            {/* Form Từ chối (Reject) */}
            <form action={rejectSuggestionAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={s.id} />
              <input
                type="text"
                name="note"
                placeholder="Lý do từ chối (bắt buộc)..."
                required
                className="rounded border border-edge px-2 py-1 text-xs outline-none focus:border-accent w-48 bg-surface"
              />
              <button
                type="submit"
                className="rounded px-3 py-1 font-medium text-xs text-danger-ink border border-danger hover:bg-danger-surface transition-colors"
              >
                Từ chối
              </button>
            </form>

            {/* Form Duyệt & Gửi / Duyệt & Áp dụng (Approve) */}
            <form action={approveSuggestionAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={s.id} />
              {s.kind === "EMAIL_DRAFT" && (
                <button
                  type="submit"
                  className="rounded bg-accent px-4 py-1 font-medium text-xs text-white hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Duyệt và Gửi Email
                </button>
              )}
              {s.kind === "DISQUALIFY" && (
                <button
                  type="submit"
                  className="rounded bg-danger px-4 py-1 font-medium text-xs text-white hover:bg-red-700 transition-colors shadow-sm"
                >
                  Duyệt Loại Lead
                </button>
              )}
              {s.kind === "CONVERSION" && (
                <Link
                  href={`/leads/${s.entity_id}`}
                  className="rounded bg-success px-4 py-1 font-medium text-xs text-white hover:bg-green-700 transition-colors shadow-sm"
                >
                  Đến trang Lead để Chuyển đổi
                </Link>
              )}
              {s.kind !== "EMAIL_DRAFT" && s.kind !== "DISQUALIFY" && s.kind !== "CONVERSION" && (
                <button
                  type="submit"
                  className="rounded bg-accent px-4 py-1 font-medium text-xs text-white hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Duyệt và Áp dụng
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
