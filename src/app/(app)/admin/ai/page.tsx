import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/domain";
import {
  getAiMonitoringStats,
  listAiRuns,
  listAgentConfigs,
  getAiEffectivenessReport,
} from "@/lib/services/ai-admin";
import {
  CommandBar,
  CommandLink,
  CommandSep,
  Empty,
  Flash,
  PageTitle,
  Kpi,
  StatusBadge,
  Badge,
} from "@/components/ui";
import {
  toggleKillSwitchAction,
  cleanTimeoutRunsAction,
  retryRunAction,
  activateConfigAction,
  rollbackConfigAction,
} from "./actions";

export const metadata: Metadata = { title: "Quản trị và Giám sát Tác nhân AI" };

export default async function AdminAiPage({ searchParams }: PageProps<"/admin/ai">) {
  const user = await requireUser();
  if (!can(user.role, "ai.config.read") && !can(user.role, "ai.monitor.read")) {
    return (
      <div className="p-8 text-center text-sm text-danger-ink">
        Bạn không có quyền truy cập trang Quản trị Tác nhân AI.
      </div>
    );
  }

  const sp = (await searchParams) as { tab?: string; agent?: string; status?: string; ok?: string; error?: string };
  const currentTab = sp.tab ?? "runs";

  const stats = getAiMonitoringStats();
  const runs = listAiRuns({ agent: sp.agent, status: sp.status });
  const qualConfigs = listAgentConfigs("QUALIFICATION");
  const oppConfigs = listAgentConfigs("OPPORTUNITY");
  const report = getAiEffectivenessReport();

  return (
    <>
      <CommandBar>
        <CommandLink href="/admin/ai?tab=runs" icon="bot">Nhật ký lần chạy</CommandLink>
        <CommandLink href="/admin/ai?tab=configs" icon="settings">Cấu hình và Phiên bản</CommandLink>
        <CommandLink href="/admin/ai?tab=reports" icon="chartBar">Báo cáo hiệu quả và Sửa đổi</CommandLink>
        <CommandSep />
        <CommandLink href="/ai-review" icon="sparkle">Mở Hộp thư Kiểm duyệt (AI Review)</CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title="Quản trị và Giám sát Tác nhân AI"
        subtitle="Giám sát vận hành 2 tác nhân AI, kiểm soát ngân sách token, phiên bản cấu hình và công tắc khẩn cấp"
        icon="bot"
        right={
          <div className="flex items-center gap-3">
            {/* Form Clean timeout runs */}
            <form action={cleanTimeoutRunsAction}>
              <button
                type="submit"
                className="rounded border border-edge px-3 py-1.5 text-xs text-ink-2 hover:bg-surface-hover transition-colors font-medium"
              >
                Dọn lần chạy treo (Timeout)
              </button>
            </form>

            {/* Kill Switch Toggle */}
            <form action={toggleKillSwitchAction}>
              <input type="hidden" name="currentStatus" value={stats.aiStatus} />
              {stats.isEmergencyPaused ? (
                <button
                  type="submit"
                  className="rounded bg-success px-3.5 py-1.5 text-xs text-white hover:bg-green-700 transition-colors font-bold shadow-sm"
                >
                  ▶ Kích hoạt lại Tác nhân AI
                </button>
              ) : (
                <button
                  type="submit"
                  className="rounded bg-danger px-3.5 py-1.5 text-xs text-white hover:bg-red-700 transition-colors font-bold shadow-sm"
                >
                  ⏹ Dừng khẩn cấp (Kill Switch)
                </button>
              )}
            </form>
          </div>
        }
      />

      <div className="px-6 pb-12 space-y-6">
        {/* Emergency Alert Banner if PAUSED */}
        {stats.isEmergencyPaused && (
          <div className="rounded-lg bg-red-50 border border-red-300 p-4 text-xs text-red-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">⚠️ CẢNH BÁO:</span>
              <span>Tất cả tác nhân AI đang ở trạng thái <strong>TẠM DỪNG KHẨN CẤP (PAUSED)</strong>. Mọi yêu cầu chạy mới sẽ bị chặn.</span>
            </div>
          </div>
        )}

        {/* Failure rate alert */}
        {stats.isFailureRateAlert && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 text-xs text-amber-900 flex items-center gap-2">
            <span className="text-base font-bold">⚠️ CẢNH BÁO TỶ LỆ LỖI:</span>
            <span>Tỷ lệ chạy lỗi trong 24h qua đạt <strong>{stats.failureRatePct}%</strong> (vượt ngưỡng cho phép {20}%). Vui lòng kiểm tra nhật ký lần chạy.</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            icon="clock"
            label="Ngân sách Token hôm nay"
            value={`${stats.tokenUsageToday.toLocaleString()} / ${stats.dailyBudget.toLocaleString()}`}
            sub={
              <div className="mt-1 space-y-1">
                <div className="h-1.5 w-full bg-edge rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stats.tokenUsagePct >= 80 ? "bg-red-500" : "bg-accent"}`}
                    style={{ width: `${stats.tokenUsagePct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-ink-3">
                  <span>Tiêu thụ: {stats.tokenUsagePct}%</span>
                  <span>{stats.tokenUsagePct >= 80 ? "⚠️ Cảnh báo ngân sách" : "Bình thường"}</span>
                </div>
              </div>
            }
          />
          <Kpi
            icon="chartBar"
            label="Tỷ lệ lỗi 24h"
            value={`${stats.failureRatePct}%`}
            sub={`${stats.failedRuns24h} lỗi / ${stats.runs24h} lần chạy`}
          />
          <Kpi
            icon="dismissCircle"
            label="Công cụ bị chặn (DENIED)"
            value={stats.deniedCalls24h}
            sub="24 giờ qua (Quyền và Bảo mật)"
          />
          <Kpi
            icon="sparkle"
            label="Phản hồi người dùng"
            value={`${stats.feedbackStats.positive} 👍 / ${stats.feedbackStats.negative} 👎`}
            sub={`${stats.feedbackStats.neutral} trung tính`}
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-edge text-xs">
          <Link
            href="/admin/ai?tab=runs"
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              currentTab === "runs" ? "border-accent text-accent font-semibold" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            Nhật ký lần chạy (ai_runs)
          </Link>
          <Link
            href="/admin/ai?tab=configs"
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              currentTab === "configs" ? "border-accent text-accent font-semibold" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            Cấu hình và Phiên bản (agent_configs)
          </Link>
          <Link
            href="/admin/ai?tab=reports"
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              currentTab === "reports" ? "border-accent text-accent font-semibold" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            Báo cáo hiệu quả và Tỷ lệ sửa
          </Link>
        </div>

        {/* Tab 1: Runs List */}
        {currentTab === "runs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span>Hiển thị {runs.length} lần chạy gần nhất</span>
              <div className="flex items-center gap-2">
                <Link href="/admin/ai?tab=runs" className="text-accent hover:underline">Tất cả</Link>
                <span>·</span>
                <Link href="/admin/ai?tab=runs&status=FAILED" className="text-danger-ink hover:underline">Chỉ lần lỗi (FAILED)</Link>
                <span>·</span>
                <Link href="/admin/ai?tab=runs&agent=QUALIFICATION" className="text-ink hover:underline">Qualification</Link>
                <span>·</span>
                <Link href="/admin/ai?tab=runs&agent=OPPORTUNITY" className="text-ink hover:underline">Opportunity</Link>
              </div>
            </div>

            {runs.length === 0 ? (
              <Empty icon="bot">Chưa có lần chạy nào được ghi nhận.</Empty>
            ) : (
              <div className="rounded-lg border border-edge bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-3 border-b border-edge">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Tác nhân</th>
                      <th className="p-3">Sự kiện kích hoạt</th>
                      <th className="p-3">Hồ sơ</th>
                      <th className="p-3">Model</th>
                      <th className="p-3">Tokens</th>
                      <th className="p-3">Thời gian</th>
                      <th className="p-3">Trạng thái</th>
                      <th className="p-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {runs.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-hover/50">
                        <td className="p-3 font-mono font-medium">#{r.id}</td>
                        <td className="p-3">
                          <Badge tone={r.agent === "QUALIFICATION" ? "brand" : "neutral"}>
                            {r.agent}
                          </Badge>
                        </td>
                        <td className="p-3 truncate max-w-[200px]" title={r.trigger}>
                          {r.trigger}
                        </td>
                        <td className="p-3 font-medium">
                          <Link
                            href={r.entity_type === "lead" ? `/leads/${r.entity_id}` : `/opportunities/${r.entity_id}`}
                            className="text-accent hover:underline"
                          >
                            {r.entity_type} #{r.entity_id}
                          </Link>
                        </td>
                        <td className="p-3 font-mono text-ink-3 text-[11px]">{r.model}</td>
                        <td className="p-3 tabular-nums text-ink-2">
                          {(r.input_tokens + r.output_tokens).toLocaleString()}
                        </td>
                        <td className="p-3 text-ink-3 text-[11px]">
                          {formatDate(r.started_at)}
                          {r.latency_ms > 0 && <span className="block text-[10px] text-ink-3">({(r.latency_ms / 1000).toFixed(1)}s)</span>}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={r.status} />
                          {r.error && <span className="block text-[10px] text-danger-ink truncate max-w-[150px]" title={r.error}>{r.error}</span>}
                        </td>
                        <td className="p-3 text-right">
                          {r.status === "FAILED" && (
                            <form action={retryRunAction} className="inline-block">
                              <input type="hidden" name="runId" value={r.id} />
                              <button
                                type="submit"
                                className="rounded bg-accent/10 border border-accent/20 px-2.5 py-1 text-[11px] text-accent hover:bg-accent hover:text-white transition-colors font-medium"
                              >
                                Chạy lại
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Configs */}
        {currentTab === "configs" && (
          <div className="space-y-8">
            {/* Qualification Agent Configs */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-ink flex items-center justify-between">
                <span>Cấu hình Sales Qualification Agent ({qualConfigs.length} phiên bản)</span>
              </h3>
              <div className="rounded-lg border border-edge bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-3 border-b border-edge">
                    <tr>
                      <th className="p-3">Phiên bản</th>
                      <th className="p-3">Model</th>
                      <th className="p-3">Ngân sách token</th>
                      <th className="p-3">Kiểm thử Eval</th>
                      <th className="p-3">Trạng thái</th>
                      <th className="p-3">Hiệu lực</th>
                      <th className="p-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {qualConfigs.map((c) => (
                      <tr key={c.id} className={c.status === "ACTIVE" ? "bg-accent/5" : ""}>
                        <td className="p-3 font-semibold">
                          v{c.version_no} {c.status === "ACTIVE" && <span className="text-[10px] text-accent">(Đang chạy)</span>}
                        </td>
                        <td className="p-3 font-mono text-[11px]">{c.model_reference}</td>
                        <td className="p-3 tabular-nums">{c.budget_limit.toLocaleString()}</td>
                        <td className="p-3">
                          {c.eval_passed ? (
                            <span className="text-success-ink font-medium">✓ Đạt chuẩn</span>
                          ) : (
                            <span className="text-ink-3">Chưa đánh giá</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={c.status} /></td>
                        <td className="p-3 text-ink-3 text-[11px]">{formatDate(c.effective_at || c.created_at)}</td>
                        <td className="p-3 text-right space-x-2">
                          {c.status !== "ACTIVE" && (
                            <form action={activateConfigAction} className="inline-block">
                              <input type="hidden" name="configId" value={c.id} />
                              <button
                                type="submit"
                                className="rounded border border-edge px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-hover transition-colors font-medium"
                              >
                                Kích hoạt
                              </button>
                            </form>
                          )}
                          {c.status === "RETIRED" && (
                            <form action={rollbackConfigAction} className="inline-block">
                              <input type="hidden" name="agentId" value="QUALIFICATION" />
                              <input type="hidden" name="versionNo" value={c.version_no} />
                              <button
                                type="submit"
                                className="rounded border border-edge px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-hover transition-colors font-medium"
                              >
                                Rollback
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Opportunity Agent Configs */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-ink flex items-center justify-between">
                <span>Cấu hình Sales Opportunity Agent ({oppConfigs.length} phiên bản)</span>
              </h3>
              <div className="rounded-lg border border-edge bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-3 border-b border-edge">
                    <tr>
                      <th className="p-3">Phiên bản</th>
                      <th className="p-3">Model</th>
                      <th className="p-3">Ngân sách token</th>
                      <th className="p-3">Kiểm thử Eval</th>
                      <th className="p-3">Trạng thái</th>
                      <th className="p-3">Hiệu lực</th>
                      <th className="p-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {oppConfigs.map((c) => (
                      <tr key={c.id} className={c.status === "ACTIVE" ? "bg-accent/5" : ""}>
                        <td className="p-3 font-semibold">
                          v{c.version_no} {c.status === "ACTIVE" && <span className="text-[10px] text-accent">(Đang chạy)</span>}
                        </td>
                        <td className="p-3 font-mono text-[11px]">{c.model_reference}</td>
                        <td className="p-3 tabular-nums">{c.budget_limit.toLocaleString()}</td>
                        <td className="p-3">
                          {c.eval_passed ? (
                            <span className="text-success-ink font-medium">✓ Đạt chuẩn</span>
                          ) : (
                            <span className="text-ink-3">Chưa đánh giá</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={c.status} /></td>
                        <td className="p-3 text-ink-3 text-[11px]">{formatDate(c.effective_at || c.created_at)}</td>
                        <td className="p-3 text-right space-x-2">
                          {c.status !== "ACTIVE" && (
                            <form action={activateConfigAction} className="inline-block">
                              <input type="hidden" name="configId" value={c.id} />
                              <button
                                type="submit"
                                className="rounded border border-edge px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-hover transition-colors font-medium"
                              >
                                Kích hoạt
                              </button>
                            </form>
                          )}
                          {c.status === "RETIRED" && (
                            <form action={rollbackConfigAction} className="inline-block">
                              <input type="hidden" name="agentId" value="OPPORTUNITY" />
                              <input type="hidden" name="versionNo" value={c.version_no} />
                              <button
                                type="submit"
                                className="rounded border border-edge px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-hover transition-colors font-medium"
                              >
                                Rollback
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Reports */}
        {currentTab === "reports" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-edge bg-surface p-4 space-y-2">
                <div className="text-xs font-semibold text-ink-3 uppercase">Tỷ lệ con người sửa Email</div>
                <div className="text-2xl font-bold text-ink">{report.email.editRatePct}%</div>
                <div className="text-xs text-ink-3">
                  {report.email.editedCount} email bị sửa trên tổng {report.email.totalApproved} email đã duyệt
                </div>
              </div>

              <div className="rounded-lg border border-edge bg-surface p-4 space-y-2">
                <div className="text-xs font-semibold text-ink-3 uppercase">Bàn giao sai chuẩn từ Lead</div>
                <div className="text-2xl font-bold text-danger-ink">{report.misclassification.ratePct}%</div>
                <div className="text-xs text-ink-3">
                  {report.misclassification.misclassifiedCount} cơ hội thất bại do đánh giá sai trên tổng {report.misclassification.totalLost} cơ hội LOST
                </div>
              </div>

              <div className="rounded-lg border border-edge bg-surface p-4 space-y-2">
                <div className="text-xs font-semibold text-ink-3 uppercase">Mục tiêu kiểm soát ảo giác</div>
                <div className="text-2xl font-bold text-success-ink">&lt; 5.0%</div>
                <div className="text-xs text-ink-3">Đo qua bộ dữ liệu chuẩn hóa và kiểm tra trích dẫn</div>
              </div>
            </div>

            {/* Suggestions Rejection Rate table */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-ink-2 uppercase">Tỷ lệ đề xuất bị từ chối theo loại</h4>
              <div className="rounded-lg border border-edge bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-3 border-b border-edge">
                    <tr>
                      <th className="p-3">Loại đề xuất</th>
                      <th className="p-3">Tổng số</th>
                      <th className="p-3">Bị từ chối</th>
                      <th className="p-3">Tỷ lệ từ chối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {report.suggestions.map((s) => (
                      <tr key={s.kind}>
                        <td className="p-3 font-medium">{s.kind}</td>
                        <td className="p-3 tabular-nums">{s.total}</td>
                        <td className="p-3 tabular-nums text-danger-ink">{s.rejected}</td>
                        <td className="p-3 tabular-nums font-semibold">{s.rejectRatePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
