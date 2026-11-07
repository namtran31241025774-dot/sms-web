import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { all } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { getTeam, listTeamMembers } from "@/lib/services/team";
import { CommandBar, CommandLink, PageTitle, Card, Empty, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { updateTeamAction, addTeamMemberAction, removeTeamMemberAction } from "../../actions";

export const metadata: Metadata = { title: "Chi tiết Sale Pod" };

export default async function PodDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const team = getTeam(Number(id));
  if (!team) notFound();

  const canWrite = can(user.role, "team.write");
  const members = listTeamMembers(team.id, false);
  const activeMembers = members.filter((m) => m.is_active === 1);

  const allUsers = all<{ id: number; name: string; role: string; title: string }>(
    "SELECT id, name, role, title FROM users WHERE active = 1 ORDER BY name ASC",
  );

  return (
    <>
      <CommandBar>
        <CommandLink href="/team?tab=pods" icon="back">
          Quay lại danh sách
        </CommandLink>
        <CommandLink href={`/team/pods/${id}`} icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>

      <Flash sp={sp} />

      <PageTitle
        title={`${team.name} (${team.code})`}
        subtitle={`Trưởng nhóm: ${team.leader_name || "Chưa phân công"} · Khu vực: ${team.territory || "Toàn quốc"} · Phân khúc: ${team.target_segment}`}
        icon="people"
      />

      <div className="px-6 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột 1: Quản lý thành viên nhóm (FR-80) */}
        <div className="lg:col-span-2 space-y-6">
          <Card title={`Thành viên Sale Pod (${activeMembers.length} thành viên đang hoạt động)`}>
            {activeMembers.length === 0 ? (
              <Empty>Chưa có thành viên nào trong nhóm</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#fcfcfc] border-b border-stroke text-xs font-semibold text-ink-2">
                    <tr>
                      <th className="px-4 py-2.5">Họ và tên</th>
                      <th className="px-4 py-2.5">Chức danh / Vai trò</th>
                      <th className="px-4 py-2.5">Vai trò trong Pod</th>
                      <th className="px-4 py-2.5">Thời gian tham gia</th>
                      <th className="px-4 py-2.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke text-xs">
                    {activeMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-2.5 font-medium text-ink">
                          <div>{m.user_name}</div>
                          <div className="text-[11px] text-ink-3">{m.user_email}</div>
                        </td>
                        <td className="px-4 py-2.5 text-ink-2">
                          <div>{m.title || "—"}</div>
                          <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                            {m.user_role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              m.role === "LEADER"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {m.role === "LEADER" ? "Trưởng nhóm" : "Thành viên"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-3">
                          Từ {formatDate(m.valid_from)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canWrite && (
                            <form action={removeTeamMemberAction} className="inline">
                              <input type="hidden" name="team_id" value={team.id} />
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <button
                                type="submit"
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium hover:underline"
                              >
                                Rời nhóm
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
          </Card>

          {/* Lịch sử thành viên đã từng tham gia */}
          {members.some((m) => m.is_active === 0) && (
            <Card title="Lịch sử thành viên đã rời nhóm">
              <div className="divide-y divide-stroke text-xs">
                {members
                  .filter((m) => m.is_active === 0)
                  .map((m) => (
                    <div key={m.id} className="py-2 flex items-center justify-between text-ink-3">
                      <div>
                        <span className="font-medium text-ink-2">{m.user_name}</span> ({m.user_email}) · {m.role}
                      </div>
                      <div>
                        {formatDate(m.valid_from)} → {m.valid_to ? formatDate(m.valid_to) : "nay"}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>

        {/* Cột 2: Thêm thành viên & Chỉnh sửa thông tin Pod */}
        <div className="space-y-6">
          {canWrite && (
            <Card title="Thêm thành viên vào Pod">
              <form action={addTeamMemberAction} className="space-y-3 text-xs">
                <input type="hidden" name="team_id" value={team.id} />

                <div>
                  <label className="label">Chọn nhân sự</label>
                  <select name="user_id" className="select" required>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role} - {u.title || "Nhân viên"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Vai trò trong Pod</label>
                  <select name="role" className="select" defaultValue="MEMBER">
                    <option value="MEMBER">Thành viên (Member)</option>
                    <option value="LEADER">Trưởng nhóm (Leader)</option>
                  </select>
                </div>

                <SubmitButton className="w-full">Thêm vào nhóm</SubmitButton>
              </form>
            </Card>
          )}

          <Card title="Cập nhật thông tin và Phạm vi">
            <form action={updateTeamAction} className="space-y-3 text-xs">
              <input type="hidden" name="id" value={team.id} />

              <div>
                <label className="label">Tên nhóm</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={team.name}
                  required
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Trưởng nhóm</label>
                <select
                  name="leader_id"
                  defaultValue={team.leader_id ?? ""}
                  disabled={!canWrite}
                  className="select"
                >
                  <option value="">-- Chưa chỉ định --</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Khu vực địa lý</label>
                <input
                  type="text"
                  name="territory"
                  defaultValue={team.territory ?? ""}
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Phân khúc khách hàng</label>
                <select
                  name="target_segment"
                  defaultValue={team.target_segment}
                  disabled={!canWrite}
                  className="select"
                >
                  <option value="ALL">Tất cả phân khúc</option>
                  <option value="SMB">Doanh nghiệp vừa và nhỏ (SMB)</option>
                  <option value="ENTERPRISE">Tập đoàn lớn (Enterprise)</option>
                </select>
              </div>

              <div>
                <label className="label">Dòng sản phẩm phụ trách</label>
                <input
                  type="text"
                  name="product_line"
                  defaultValue={team.product_line ?? ""}
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Mô tả</label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={team.description ?? ""}
                  disabled={!canWrite}
                  className="input"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  name="active"
                  value="1"
                  defaultChecked={team.active === 1}
                  disabled={!canWrite}
                  id="active"
                  className="cursor-pointer"
                />
                <label htmlFor="active" className="cursor-pointer text-ink font-medium">
                  Đang hoạt động
                </label>
              </div>

              {canWrite && <SubmitButton className="w-full">Lưu thay đổi</SubmitButton>}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
