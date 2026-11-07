import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { CommandBar, CommandLink, PageTitle, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createEmployeeAction } from "../../actions";

export const metadata: Metadata = { title: "Thêm nhân viên mới" };

export default async function NewEmployeePage() {
  await requirePermission("team.write");

  return (
    <>
      <CommandBar>
        <CommandLink href="/team?tab=employees" icon="back">
          Quay lại danh sách
        </CommandLink>
      </CommandBar>

      <PageTitle
        title="Thêm hồ sơ nhân viên mới"
        subtitle="Hồ sơ nghiệp vụ nhân sự bán hàng · Tách biệt với tài khoản đăng nhập hệ thống"
        icon="people"
      />

      <div className="max-w-2xl px-6 pb-12">
        <Card title="Thông tin nhân viên nghiệp vụ">
          <form action={createEmployeeAction} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Mã nhân viên (Bắt buộc, duy nhất)</label>
                <input
                  type="text"
                  name="code"
                  required
                  placeholder="vd: EMP-010"
                  className="input font-mono uppercase"
                />
              </div>

              <div>
                <label className="label">Họ và tên</label>
                <input
                  type="text"
                  name="full_name"
                  required
                  placeholder="vd: Hoàng Thu Trang"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Email công việc</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="trang.hoang@sms.local"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Số điện thoại</label>
                <input
                  type="text"
                  name="phone"
                  placeholder="0912345678"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Chức danh nghiệp vụ</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="vd: Account Executive (AE) / SDR"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Vai trò nghiệp vụ</label>
                <select name="business_role" className="select" defaultValue="SALES">
                  <option value="SALES">Nhân viên kinh doanh (SDR/AE/CS)</option>
                  <option value="PRESALES">Chuyên viên tư vấn giải pháp (SE)</option>
                  <option value="SALES_MANAGER">Quản lý kinh doanh</option>
                  <option value="FINANCE">Nhân viên Tài chính – Kế toán</option>
                  <option value="ADMIN">Người quản trị hệ thống</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Trạng thái làm việc ban đầu</label>
                <select name="status" className="select" defaultValue="ACTIVE">
                  <option value="ACTIVE">Đang làm việc</option>
                  <option value="ON_LEAVE">Nghỉ phép</option>
                </select>
              </div>

              <div>
                <label className="label">Khả năng nhận việc</label>
                <select name="can_accept_work" className="select" defaultValue="1">
                  <option value="1">Sẵn sàng nhận khách hàng / cơ hội</option>
                  <option value="0">Tạm ngưng nhận việc mới</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Ghi chú chuyên môn</label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Thế mạnh kinh nghiệm, ngành chuyên sâu (Sản xuất, Bán lẻ, Logistics...)"
                className="input"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <Link href="/team?tab=employees" className="btn-secondary">
                Hủy
              </Link>
              <SubmitButton>Lưu hồ sơ nhân viên</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
