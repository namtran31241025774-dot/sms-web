import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { all } from "@/lib/db";
import { formatVnd, formatDate } from "@/lib/domain";
import { listEmployees, listTeams, type EmployeeStatus, type BusinessRole } from "@/lib/services/team";
import { listWorkItems, type WorkItemType } from "@/lib/services/work-items";
import { listSalesTargets, getPerformanceSummary, listPerformanceReviews } from "@/lib/services/targets";
import { listAssignments } from "@/lib/services/assignments";
import {
  Card,
  CommandBar,
  CommandLink,
  Empty,
  Flash,
  PageTitle,
  Tabs,
} from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { EmployeeStatusBadge, WorkItemStatusBadge, PerformanceRatingBadge } from "@/components/team/badges";
import {
  createWorkItemAction,
  completeWorkItemAction,
  setSalesTargetAction,
  createPerformanceReviewAction,
  handoverWorkAction,
} from "./actions";

export const metadata: Metadata = { title: "Quản lý đội ngũ Sales" };

const TABS = [
  { key: "employees", label: "Hồ sơ nhân sự (→ 78)" },
  { key: "pods", label: "Sale Pods và Nhóm (→ 81)" },
  { key: "tasks", label: "Công việc và Lịch hẹn" },
  { key: "targets", label: "Chỉ tiêu và Hiệu suất (→ 87)" },
  { key: "assignments", label: "Phân bổ và Điều phối (84)" },
];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    status?: string;
    role?: string;
    period?: string;
    item_type?: string;
    task_status?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab || "employees";
  const period = sp.period || "2026-Q4";

  const canWriteTeam = can(user.role, "team.write");
  const canWriteTask = can(user.role, "task.write");

  // Dữ liệu cho các tab
  const employees = listEmployees({
    query: sp.q,
    status: sp.status as EmployeeStatus,
    businessRole: sp.role as BusinessRole,
  });
  const teams = listTeams();
  const workItems = listWorkItems({
    type: sp.item_type as WorkItemType,
    status: sp.task_status,
  });
  const targets = listSalesTargets({ periodName: period });
  const performanceSummary = getPerformanceSummary({ periodName: period });
  const reviews = listPerformanceReviews({ periodName: period });
  const assignments = listAssignments({ limit: 50 });

  const allUsers = all<{ id: number; name: string; role: string; title: string }>(
    "SELECT id, name, role, title FROM users WHERE active = 1 ORDER BY name ASC",
  );

  return (
    <>
      <CommandBar>
        {canWriteTeam && tab === "employees" && (
          <CommandLink href="/team/employees/new" icon="add">
            Thêm nhân viên mới
          </CommandLink>
        )}
        {canWriteTeam && tab === "pods" && (
          <CommandLink href="/team/pods/new" icon="add">
            Tạo Sale Pod mới
          </CommandLink>
        )}
        {canWriteTask && tab === "tasks" && (
          <CommandLink href="/team?tab=tasks#new-task" icon="add">
            Tạo việc / Lịch hẹn
          </CommandLink>
        )}
        {canWriteTeam && tab === "assignments" && (
          <CommandLink href="/team?tab=assignments#handover" icon="arrowRight">
            Điều phối và Bàn giao
          </CommandLink>
        )}
        <CommandLink href={`/team?tab=${tab}&period=${period}`} icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title="Quản lý đội ngũ Sales"
        subtitle="Hồ sơ nhân sự nghiệp vụ · Sale Pods · Phân công và Điều phối · Lịch hẹn và Chỉ tiêu (Module 6.0)"
        icon="people"
      />

      <div className="px-6 pb-12">
        <Tabs base="/team" current={tab} tabs={TABS} />

        {/* TAB 1: HỒ SƠ NHÂN SỰ */}
        {tab === "employees" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-lg border border-stroke">
              <form method="GET" action="/team" className="flex flex-wrap items-center gap-3 text-sm">
                <input type="hidden" name="tab" value="employees" />
                <input
                  type="text"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder="Tìm theo mã, họ tên, email..."
                  className="rounded border border-stroke px-3 py-1.5 text-xs outline-none focus:border-brand w-64"
                />
                <select name="status" defaultValue={sp.status ?? ""} className="select !h-8 !py-0 !text-xs">
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang làm việc</option>
                  <option value="ON_LEAVE">Nghỉ phép</option>
                  <option value="RESIGNED">Đã nghỉ việc</option>
                </select>
                <select name="role" defaultValue={sp.role ?? ""} className="select !h-8 !py-0 !text-xs">
                  <option value="">Tất cả vai trò</option>
                  <option value="SALES">Nhân viên kinh doanh (SDR/AE)</option>
                  <option value="PRESALES">Tư vấn giải pháp (SE)</option>
                  <option value="SALES_MANAGER">Quản lý kinh doanh</option>
                  <option value="FINANCE">Tài chính – Kế toán</option>
                  <option value="ADMIN">Quản trị hệ thống</option>
                </select>
                <button type="submit" className="btn !py-1 !text-xs">
                  Lọc
                </button>
                {sp.q && (
                  <Link href="/team?tab=employees" className="text-xs text-ink-3 hover:text-ink">
                    Xóa lọc
                  </Link>
                )}
              </form>
            </div>

            <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-4)]">
              {employees.length === 0 ? (
                <Empty>Chưa có hồ sơ nhân viên</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#fcfcfc] border-b border-stroke text-xs font-semibold text-ink-2">
                      <tr>
                        <th className="px-4 py-3">Mã NV</th>
                        <th className="px-4 py-3">Họ và tên</th>
                        <th className="px-4 py-3">Chức danh nghiệp vụ</th>
                        <th className="px-4 py-3">Vai trò</th>
                        <th className="px-4 py-3">Email và SĐT</th>
                        <th className="px-4 py-3">Tình trạng</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke">
                      {employees.map((e) => (
                        <tr key={e.id} className="hover:bg-[#fafafa]">
                          <td className="px-4 py-3 font-mono font-medium text-brand">{e.code}</td>
                          <td className="px-4 py-3 font-medium text-ink">{e.full_name}</td>
                          <td className="px-4 py-3 text-ink-2">{e.title}</td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 border border-sky-200">
                              {e.business_role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-3">
                            <div>{e.email}</div>
                            {e.phone && <div className="text-ink-2">{e.phone}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <EmployeeStatusBadge status={e.status} canAccept={e.can_accept_work} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canWriteTeam && (
                              <Link
                                href={`/team/employees/${e.id}`}
                                className="text-xs font-semibold text-brand hover:underline"
                              >
                                Chi tiết và Sửa
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SALE PODS & THÀNH VIÊN */}
        {tab === "pods" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map((t) => (
                <div key={t.id} className="rounded-lg border border-stroke bg-surface p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-brand uppercase">{t.code}</span>
                      <h3 className="font-semibold text-base text-ink mt-0.5">{t.name}</h3>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {t.active ? "Hoạt động" : "Tạm ngưng"}
                    </span>
                  </div>

                  <p className="text-xs text-ink-3 line-clamp-2">{t.description || "Chưa có mô tả nhóm"}</p>

                  <div className="border-t border-stroke pt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-3">Trưởng nhóm:</span>
                      <span className="font-medium text-ink">{t.leader_name || "Chưa phân công"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Khu vực:</span>
                      <span className="font-medium text-ink">{t.territory || "Toàn quốc"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Phân khúc:</span>
                      <span className="font-medium text-ink">{t.target_segment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Số thành viên:</span>
                      <span className="font-semibold text-brand">{t.member_count ?? 0} người</span>
                    </div>
                  </div>

                  <div className="border-t border-stroke pt-3 text-right">
                    <Link
                      href={`/team/pods/${t.id}`}
                      className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1"
                    >
                      Quản lý thành viên và Phạm vi →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CÔNG VIỆC & LỊCH HẸN (FR-83) */}
        {tab === "tasks" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-4)]">
                <div className="p-4 border-b border-stroke flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-ink">Danh sách Công việc và Lịch hẹn</h3>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/team?tab=tasks"
                      className={`text-xs px-2.5 py-1 rounded border ${
                        !sp.item_type ? "border-brand bg-brand-tint text-brand" : "border-stroke bg-surface"
                      }`}
                    >
                      Tất cả
                    </Link>
                    <Link
                      href="/team?tab=tasks&item_type=APPOINTMENT"
                      className={`text-xs px-2.5 py-1 rounded border ${
                        sp.item_type === "APPOINTMENT"
                          ? "border-brand bg-brand-tint text-brand"
                          : "border-stroke bg-surface"
                      }`}
                    >
                      Lịch hẹn 📅
                    </Link>
                    <Link
                      href="/team?tab=tasks&item_type=TASK"
                      className={`text-xs px-2.5 py-1 rounded border ${
                        sp.item_type === "TASK" ? "border-brand bg-brand-tint text-brand" : "border-stroke bg-surface"
                      }`}
                    >
                      Công việc 📋
                    </Link>
                  </div>
                </div>

                {workItems.length === 0 ? (
                  <Empty>Chưa có công việc hoặc lịch hẹn nào</Empty>
                ) : (
                  <div className="divide-y divide-stroke">
                    {workItems.map((item) => (
                      <div key={item.id} className="p-4 hover:bg-[#fafafa] flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <WorkItemStatusBadge status={item.status} type={item.type} />
                            <span className="font-medium text-sm text-ink">{item.title}</span>
                          </div>
                          {item.description && <p className="text-xs text-ink-3">{item.description}</p>}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3 pt-1">
                            <span>Phụ trách: <strong className="text-ink">{item.assignee_name || "Chưa giao"}</strong></span>
                            {item.due_date && <span>Hạn: <strong className="text-ink">{formatDate(item.due_date)}</strong></span>}
                            {item.participants && item.participants.length > 0 && (
                              <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                👥 {item.participants.length} người tham gia
                              </span>
                            )}
                            {item.outcome && (
                              <div className="w-full text-green-700 bg-green-50 p-2 rounded border border-green-200 mt-1">
                                <strong>Kết quả:</strong> {item.outcome}
                              </div>
                            )}
                          </div>
                        </div>

                        {item.status !== "DONE" && (
                          <form action={completeWorkItemAction} className="flex-shrink-0">
                            <input type="hidden" name="id" value={item.id} />
                            <input
                              type="hidden"
                              name="outcome"
                              value="Đã hoàn thành công việc và cập nhật hồ sơ bán hàng"
                            />
                            <button
                              type="submit"
                              className="rounded border border-green-600 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                            >
                              ✓ Hoàn tất
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Form tạo việc / lịch hẹn nhanh */}
            <div id="new-task">
              <Card title="Giao việc và Lập lịch hẹn mới">
                <form action={createWorkItemAction} className="space-y-4 text-xs">
                  <div>
                    <label className="label">Loại nhiệm vụ</label>
                    <select name="type" className="select" defaultValue="APPOINTMENT">
                      <option value="APPOINTMENT">Lịch hẹn khách hàng / Tư vấn (Appointment)</option>
                      <option value="TASK">Công việc nội bộ (Task)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Tiêu đề</label>
                    <input
                      type="text"
                      name="title"
                      required
                      placeholder="vd: Họp demo giải pháp CPQ và AI cho CIO"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Nội dung chi tiết</label>
                    <textarea
                      name="description"
                      rows={3}
                      placeholder="Mục tiêu buổi làm việc, nội dung cần thống nhất..."
                      className="input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Người phụ trách</label>
                      <select name="assignee_id" className="select" defaultValue={user.id}>
                        {allUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Mức ưu tiên</label>
                      <select name="priority" className="select" defaultValue="HIGH">
                        <option value="HIGH">Cao</option>
                        <option value="MEDIUM">Trung bình</option>
                        <option value="LOW">Thấp</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Hạn hoàn thành</label>
                      <input type="date" name="due_date" className="input" />
                    </div>
                    <div>
                      <label className="label">Mời tư vấn giải pháp</label>
                      <select name="presales_user_id" className="select">
                        <option value="">-- Không mời --</option>
                        {allUsers
                          .filter((u) => u.role === "PRESALES")
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.title || "SE"})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <SubmitButton className="w-full">Tạo nhiệm vụ / Lịch hẹn</SubmitButton>
                </form>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 4: CHỈ TIÊU & HIỆU SUẤT (BR-14) */}
        {tab === "targets" && (
          <div className="space-y-6">
            {/* Thống kê tổng hợp BR-14 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-stroke bg-surface p-4">
                <span className="text-xs text-ink-3">Chỉ tiêu kỳ {period}</span>
                <div className="text-xl font-bold text-ink mt-1">
                  {formatVnd(performanceSummary.targetAmount)}
                </div>
                <div className="text-xs text-ink-3 mt-1">
                  Mục tiêu: {performanceSummary.targetDeals} hợp đồng
                </div>
              </div>

              <div className="rounded-lg border border-stroke bg-surface p-4">
                <span className="text-xs text-ink-3">Thực tế đã chốt (WON)</span>
                <div className="text-xl font-bold text-green-700 mt-1">
                  {formatVnd(performanceSummary.actualRevenue)}
                </div>
                <div className="text-xs text-green-600 mt-1 font-semibold">
                  Tỷ lệ hoàn thành: {performanceSummary.completionPct}%
                </div>
              </div>

              <div className="rounded-lg border border-stroke bg-surface p-4">
                <span className="text-xs text-ink-3">Dự báo Pipeline</span>
                <div className="text-xl font-bold text-brand mt-1">
                  {formatVnd(performanceSummary.pipelineForecastAmount)}
                </div>
                <div className="text-xs text-ink-3 mt-1">
                  Từ {performanceSummary.openDealsCount} cơ hội đang mở (20%-50%-80%)
                </div>
              </div>

              <div className="rounded-lg border border-stroke bg-surface p-4">
                <span className="text-xs text-ink-3">Số hợp đồng đạt được</span>
                <div className="text-xl font-bold text-purple-700 mt-1">
                  {performanceSummary.actualWonDeals} / {performanceSummary.targetDeals}
                </div>
                <div className="text-xs text-purple-600 mt-1 font-semibold">
                  Đạt {performanceSummary.dealsCompletionPct}% số lượng
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bảng danh sách chỉ tiêu đã giao */}
              <div className="lg:col-span-2 space-y-6">
                <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-4)]">
                  <div className="p-4 border-b border-stroke flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-ink">Bảng Chỉ tiêu Doanh số</h3>
                    <div className="text-xs text-ink-3">Kỳ: {period}</div>
                  </div>
                  {targets.length === 0 ? (
                    <Empty>Chưa có chỉ tiêu nào trong kỳ</Empty>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#fcfcfc] border-b border-stroke text-xs font-semibold text-ink-2">
                        <tr>
                          <th className="px-4 py-3">Đối tượng</th>
                          <th className="px-4 py-3">Loại</th>
                          <th className="px-4 py-3">Kỳ áp dụng</th>
                          <th className="px-4 py-3 text-right">Chỉ tiêu doanh số</th>
                          <th className="px-4 py-3 text-right">Mục tiêu Deal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke">
                        {targets.map((t) => (
                          <tr key={t.id} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-3 font-medium text-ink">
                              {t.user_id ? t.user_name : t.team_name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-medium ${
                                  t.user_id
                                    ? "bg-sky-50 text-sky-800 border border-sky-200"
                                    : "bg-purple-50 text-purple-800 border border-purple-200"
                                }`}
                              >
                                {t.user_id ? "Cá nhân" : "Sale Pod"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{t.period_name}</td>
                            <td className="px-4 py-3 text-right font-semibold text-brand">
                              {formatVnd(t.target_amount)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-ink">{t.target_deals}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Bảng Đánh giá Hiệu suất (FR-87) */}
                <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-4)]">
                  <div className="p-4 border-b border-stroke">
                    <h3 className="font-semibold text-sm text-ink">Lịch sử Đánh giá Hiệu suất Bán hàng</h3>
                    <p className="text-xs text-ink-3 mt-0.5">
                      Đánh giá thực tế của Quản lý kinh doanh (không áp dụng cho AI Agent)
                    </p>
                  </div>
                  {reviews.length === 0 ? (
                    <Empty>Chưa có đánh giá hiệu suất nào trong kỳ</Empty>
                  ) : (
                    <div className="divide-y divide-stroke">
                      {reviews.map((r) => (
                        <div key={r.id} className="p-4 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-ink">
                              {r.employee_name} ({r.employee_code})
                            </span>
                            <PerformanceRatingBadge rating={r.rating} />
                          </div>
                          <div className="text-xs text-ink-3 flex gap-4">
                            <span>Doanh số thực tế: <strong className="text-green-700">{formatVnd(r.actual_revenue)}</strong></span>
                            <span>Chỉ tiêu: <strong className="text-ink">{formatVnd(r.target_revenue)}</strong></span>
                            <span>Hoàn thành: <strong className="text-brand">{r.completion_pct}%</strong></span>
                          </div>
                          {r.feedback && (
                            <p className="text-xs bg-[#fafafa] p-2 rounded border border-stroke text-ink-2 mt-2">
                              {r.feedback}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Form Thiết lập Chỉ tiêu & Đánh giá */}
              {canWriteTeam && (
                <div className="space-y-6">
                  <Card title="Thiết lập Chỉ tiêu Doanh số">
                    <form action={setSalesTargetAction} className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">Loại kỳ</label>
                          <select name="period_type" className="select" defaultValue="QUARTER">
                            <option value="MONTH">Tháng</option>
                            <option value="QUARTER">Quý</option>
                            <option value="YEAR">Năm</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Tên kỳ</label>
                          <input type="text" name="period_name" defaultValue={period} className="input" required />
                        </div>
                      </div>

                      <div>
                        <label className="label">Áp dụng cho</label>
                        <select name="target_type" className="select" defaultValue="USER">
                          <option value="USER">Cá nhân nhân viên</option>
                          <option value="TEAM">Sale Pod (Nhóm)</option>
                        </select>
                      </div>

                      <div>
                        <label className="label">Chọn nhân sự</label>
                        <select name="user_id" className="select">
                          <option value="">-- Chọn nhân viên --</option>
                          {allUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Hoặc chọn Sale Pod</label>
                        <select name="team_id" className="select">
                          <option value="">-- Chọn nhóm --</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Mục tiêu Doanh số (VND)</label>
                        <input
                          type="number"
                          name="target_amount"
                          step={10000000}
                          defaultValue={500000000}
                          required
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="label">Mục tiêu số hợp đồng</label>
                        <input type="number" name="target_deals" defaultValue={3} className="input" />
                      </div>

                      <SubmitButton className="w-full">Lưu chỉ tiêu</SubmitButton>
                    </form>
                  </Card>

                  <Card title="Ghi Đánh giá Hiệu suất">
                    <form action={createPerformanceReviewAction} className="space-y-3 text-xs">
                      <div>
                        <label className="label">Nhân viên được đánh giá</label>
                        <select name="employee_id" className="select" required>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.full_name} ({e.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Kỳ đánh giá</label>
                        <input type="text" name="period_name" defaultValue={period} className="input" required />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">Doanh thu thực tế</label>
                          <input type="number" name="actual_revenue" defaultValue={250000000} className="input" />
                        </div>
                        <div>
                          <label className="label">Chỉ tiêu kỳ</label>
                          <input type="number" name="target_revenue" defaultValue={500000000} className="input" />
                        </div>
                      </div>

                      <div>
                        <label className="label">Xếp loại hiệu suất</label>
                        <select name="rating" className="select" defaultValue="GOOD">
                          <option value="EXCELLENT">Xuất sắc (A - Vượt chỉ tiêu)</option>
                          <option value="GOOD">Tốt (B - Đạt chỉ tiêu)</option>
                          <option value="AVERAGE">Trung bình (C - Gần đạt)</option>
                          <option value="NEEDS_IMPROVEMENT">Cần cải thiện (D - Dưới kỳ vọng)</option>
                        </select>
                      </div>

                      <div>
                        <label className="label">Nhận xét và Góp ý</label>
                        <textarea
                          name="feedback"
                          rows={3}
                          placeholder="Nhận xét kỹ năng đàm phán, đóng góp và định hướng kỳ sau..."
                          className="input"
                        />
                      </div>

                      <SubmitButton className="w-full">Lưu đánh giá</SubmitButton>
                    </form>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: PHÂN BỔ & ĐIỀU PHỐI (FR-82, FR-84) */}
        {tab === "assignments" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="overflow-hidden rounded-lg border border-stroke bg-surface shadow-[var(--shadow-4)]">
                <div className="p-4 border-b border-stroke">
                  <h3 className="font-semibold text-sm text-ink">Lịch sử Phân công và Điều phối</h3>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Toàn bộ thay đổi người phụ trách, bàn giao và lưu vết trách nhiệm
                  </p>
                </div>

                {assignments.length === 0 ? (
                  <Empty>Chưa có lượt phân công hoặc điều phối nào</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#fcfcfc] border-b border-stroke text-xs font-semibold text-ink-2">
                        <tr>
                          <th className="px-4 py-3">Thời điểm</th>
                          <th className="px-4 py-3">Đối tượng</th>
                          <th className="px-4 py-3">Loại</th>
                          <th className="px-4 py-3">Từ nhân sự</th>
                          <th className="px-4 py-3">Chuyển cho</th>
                          <th className="px-4 py-3">Lý do</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke text-xs">
                        {assignments.map((a) => (
                          <tr key={a.id} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-3 text-ink-3 whitespace-nowrap">{formatDate(a.created_at)}</td>
                            <td className="px-4 py-3 font-medium text-ink uppercase">
                              {a.entity_type} #{a.entity_id}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  a.assignment_type === "INITIAL"
                                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                                    : "bg-amber-50 text-amber-800 border border-amber-200"
                                }`}
                              >
                                {a.assignment_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink-2">{a.from_user_name || "—"}</td>
                            <td className="px-4 py-3 font-medium text-brand">{a.to_user_name}</td>
                            <td className="px-4 py-3 text-ink-3 max-w-xs truncate" title={a.reason || ""}>
                              {a.reason || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Form Điều phối & Bàn giao (FR-84) */}
            {canWriteTeam && (
              <div id="handover">
                <Card title="Điều phối và Bàn giao Hàng loạt">
                  <form action={handoverWorkAction} className="space-y-4 text-xs">
                    <div>
                      <label className="label">Nhân sự bàn giao (Hiện tại)</label>
                      <select name="from_user_id" className="select" required>
                        <option value="">-- Chọn nhân sự chuyển đi --</option>
                        {allUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Nhân sự tiếp nhận (Mới)</label>
                      <select name="to_user_id" className="select" required>
                        <option value="">-- Chọn nhân sự nhận việc --</option>
                        {allUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Sale Pod tiếp nhận (Tuỳ chọn)</label>
                      <select name="team_id" className="select">
                        <option value="">-- Giữ nguyên nhóm hiện tại --</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Lý do bàn giao (bắt buộc)</label>
                      <textarea
                        name="reason"
                        required
                        rows={3}
                        placeholder="vd: Thay đổi nhân sự phụ trách / Nhân sự nghỉ thai sản / Cân đối lại tải việc..."
                        className="input"
                      />
                    </div>

                    <div className="space-y-2 border-t border-stroke pt-3">
                      <span className="font-semibold text-ink">Phạm vi bàn giao:</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="transfer_leads" value="1" defaultChecked />
                        <span>Chuyển tất cả Lead đang mở</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="transfer_opportunities" value="1" defaultChecked />
                        <span>Chuyển tất cả Cơ hội đang phát triển</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="transfer_tasks" value="1" defaultChecked />
                        <span>Chuyển các công việc chưa hoàn tất</span>
                      </label>
                    </div>

                    <SubmitButton className="w-full">Xác nhận Điều phối và Bàn giao</SubmitButton>
                  </form>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
