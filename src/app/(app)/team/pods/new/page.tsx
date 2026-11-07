import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { all } from "@/lib/db";
import { CommandBar, CommandLink, PageTitle, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createTeamAction } from "../../actions";

export const metadata: Metadata = { title: "Tạo Sale Pod mới" };

export default async function NewTeamPage() {
  await requirePermission("team.write");

  const leaders = all<{ id: number; name: string; role: string }>(
    "SELECT id, name, role FROM users WHERE role IN ('SALES_MANAGER', 'SALES') AND active = 1 ORDER BY name ASC",
  );

  return (
    <>
      <CommandBar>
        <CommandLink href="/team?tab=pods" icon="back">
          Quay lại danh sách
        </CommandLink>
      </CommandBar>

      <PageTitle
        title="Tạo Sale Pod bán hàng mới"
        subtitle="Cơ cấu nhóm bán hàng và phạm vi phụ trách"
        icon="people"
      />

      <div className="max-w-2xl px-6 pb-12">
        <Card title="Thông tin Sale Pod">
          <form action={createTeamAction} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Mã nhóm (Bắt buộc, duy nhất)</label>
                <input
                  type="text"
                  name="code"
                  required
                  placeholder="vd: POD-SMB-HCM"
                  className="input font-mono uppercase"
                />
              </div>

              <div>
                <label className="label">Tên nhóm bán hàng</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="vd: Sale Pod Doanh nghiệp vừa và nhỏ TP.HCM"
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="label">Trưởng nhóm (Leader)</label>
              <select name="leader_id" className="select">
                <option value="">-- Chưa chỉ định --</option>
                {leaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Khu vực địa lý (Territory)</label>
                <input
                  type="text"
                  name="territory"
                  placeholder="vd: Miền Nam / TP.HCM / Miền Trung / Toàn quốc"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Phân khúc khách hàng</label>
                <select name="target_segment" className="select" defaultValue="ALL">
                  <option value="ALL">Tất cả phân khúc</option>
                  <option value="SMB">Doanh nghiệp vừa và nhỏ (SMB - dưới 200 nhân sự)</option>
                  <option value="ENTERPRISE">Tập đoàn lớn (Enterprise - từ 200 nhân sự)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Dòng sản phẩm phụ trách</label>
              <input
                type="text"
                name="product_line"
                placeholder="vd: Enterprise SaaS Suite, Core CRM, Add-on AI Agents"
                className="input"
              />
            </div>

            <div>
              <label className="label">Mô tả mục tiêu hoạt động</label>
              <textarea
                name="description"
                rows={3}
                placeholder="Mục tiêu kinh doanh, phân bổ thị trường của Pod..."
                className="input"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <Link href="/team?tab=pods" className="btn-secondary">
                Hủy
              </Link>
              <SubmitButton>Tạo Sale Pod</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
