import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, formatVnd } from "@/lib/domain";
import { getEmployee, getEmployeeWorkload } from "@/lib/services/team";
import { CommandBar, CommandLink, PageTitle, Card, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { updateEmployeeAction, updateWorkStatusAction } from "../../actions";

export const metadata: Metadata = { title: "Chi tiết hồ sơ nhân viên" };

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const employee = getEmployee(Number(id));
  if (!employee) notFound();

  const canWrite = can(user.role, "team.write");
  const workload = getEmployeeWorkload(employee.code);

  return (
    <>
      <CommandBar>
        <CommandLink href="/team?tab=employees" icon="back">
          Quay lại danh sách
        </CommandLink>
        <CommandLink href={`/team/employees/${id}`} icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title={`${employee.full_name} (${employee.code})`}
        subtitle={`Chức danh: ${employee.title} · Vai trò: ${employee.business_role} · Ngày tạo: ${formatDate(employee.created_at)}`}
        icon="people"
      />

      <div className="px-6 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột 1: Thông tin hồ sơ & Chỉnh sửa */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Hồ sơ nghiệp vụ nhân viên (FR-76, FR-77)">
            <form action={updateEmployeeAction} className="space-y-4 text-xs">
              <input type="hidden" name="id" value={employee.id} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Mã nhân viên (Không đổi)</label>
                  <input
                    type="text"
                    disabled
                    value={employee.code}
                    className="input bg-[#f5f5f5] font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="label">Họ và tên</label>
                  <input
                    type="text"
                    name="full_name"
                    defaultValue={employee.full_name}
                    required
                    disabled={!canWrite}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={employee.email}
                    required
                    disabled={!canWrite}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Số điện thoại</label>
                  <input
                    type="text"
                    name="phone"
                    defaultValue={employee.phone ?? ""}
                    disabled={!canWrite}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Chức danh</label>
                  <input
                    type="text"
                    name="title"
                    defaultValue={employee.title}
                    required
                    disabled={!canWrite}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Vai trò nghiệp vụ (FR-77)</label>
                  <select
                    name="business_role"
                    defaultValue={employee.business_role}
                    disabled={!canWrite}
                    className="select"
                  >
                    <option value="SALES">Nhân viên kinh doanh (SDR/AE)</option>
                    <option value="PRESALES">Chuyên viên tư vấn giải pháp (SE)</option>
                    <option value="SALES_MANAGER">Quản lý kinh doanh</option>
                    <option value="FINANCE">Nhân viên Tài chính – Kế toán</option>
                    <option value="ADMIN">Người quản trị hệ thống</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Ghi chú nghiệp vụ</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={employee.notes ?? ""}
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              {canWrite && (
                <div className="pt-2 text-right">
                  <SubmitButton>Cập nhật hồ sơ</SubmitButton>
                </div>
              )}
            </form>
          </Card>

          {/* Khối lượng công việc đang phụ trách (FR-78, FR-84) */}
          <Card title="Khối lượng công việc đang phụ trách (Workload)">
            <p className="text-xs text-ink-3 mb-4">
              Tổng hợp Leads, Cơ hội và Công việc đang mở để sẵn sàng chuẩn bị bàn giao nếu thay đổi nhân sự (FR-78, FR-84).
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="rounded border border-stroke p-3 bg-[#fafafa]">
                <div className="text-xl font-bold text-brand">{workload.assignedLeads.length}</div>
                <div className="text-[11px] text-ink-3">Lead đang mở</div>
              </div>
              <div className="rounded border border-stroke p-3 bg-[#fafafa]">
                <div className="text-xl font-bold text-green-700">{workload.assignedOpportunities.length}</div>
                <div className="text-[11px] text-ink-3">Cơ hội đang chạy</div>
              </div>
              <div className="rounded border border-stroke p-3 bg-[#fafafa]">
                <div className="text-xl font-bold text-purple-700">{workload.assignedTasks.length}</div>
                <div className="text-[11px] text-ink-3">Việc chưa xong</div>
              </div>
            </div>

            {workload.assignedOpportunities.length > 0 && (
              <div className="space-y-2 border-t border-stroke pt-3 text-xs">
                <span className="font-semibold text-ink">Các cơ hội phụ trách:</span>
                <div className="divide-y divide-stroke">
                  {workload.assignedOpportunities.map((o) => (
                    <div key={o.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-brand font-medium">{o.code}</span>
                        <div className="font-medium text-ink">{o.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-brand">{formatVnd(o.amount)}</div>
                        <span className="text-[10px] bg-sky-50 text-sky-800 px-1.5 py-0.5 rounded border border-sky-200">
                          {o.stage}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Cột 2: Cập nhật trạng thái làm việc (FR-78) */}
        <div className="space-y-6">
          <Card title="Trạng thái làm việc & Nhận việc (FR-78)">
            <form action={updateWorkStatusAction} className="space-y-4 text-xs">
              <input type="hidden" name="id" value={employee.id} />

              <div>
                <label className="label">Tình trạng làm việc</label>
                <select
                  name="status"
                  defaultValue={employee.status}
                  disabled={!canWrite}
                  className="select"
                >
                  <option value="ACTIVE">Đang làm việc (Active)</option>
                  <option value="ON_LEAVE">Nghỉ phép (On Leave)</option>
                  <option value="RESIGNED">Đã nghỉ việc (Resigned)</option>
                </select>
              </div>

              <div>
                <label className="label">Khả năng tiếp nhận việc mới</label>
                <select
                  name="can_accept_work"
                  defaultValue={employee.can_accept_work ? "1" : "0"}
                  disabled={!canWrite}
                  className="select"
                >
                  <option value="1">Có thể nhận thêm Lead / Cơ hội</option>
                  <option value="0">Tạm dừng nhận việc mới (Quá tải / Nghỉ)</option>
                </select>
              </div>

              <div>
                <label className="label">Lý do / Ghi chú tình trạng</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={employee.notes ?? ""}
                  placeholder="Ghi rõ thời gian nghỉ phép hoặc điều phối..."
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              {canWrite && (
                <SubmitButton className="w-full">Lưu trạng thái làm việc</SubmitButton>
              )}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
