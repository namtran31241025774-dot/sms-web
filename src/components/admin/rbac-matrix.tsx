import { PERMISSION_MATRIX } from "@/lib/rbac";
import type { Role } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain";

const ALL_ROLES: Role[] = [
  "ADMIN",
  "SALES_MANAGER",
  "SALES",
  "PRESALES",
  "FINANCE",
  "DELIVERY",
];

const PERMISSION_GROUPS: { groupName: string; permissions: { key: keyof typeof PERMISSION_MATRIX; label: string }[] }[] = [
  {
    groupName: "1.0 Khách hàng và Người liên hệ (WP-01)",
    permissions: [
      { key: "lead.read", label: "Xem khách hàng tiềm năng (Leads)" },
      { key: "lead.write", label: "Tạo / Cập nhật Lead" },
      { key: "lead.qualify", label: "Đánh giá BANT và Sàng lọc Lead" },
      { key: "lead.convert", label: "Chuyển đổi Lead thành Cơ hội" },
      { key: "lead.disqualify", label: "Đánh dấu loại Lead" },
      { key: "lead.merge.request", label: "Yêu cầu hợp nhất Lead trùng lặp" },
      { key: "lead.merge.approve", label: "Phê duyệt hợp nhất Lead (Cổng kiểm soát)" },
      { key: "account.read", label: "Xem Doanh nghiệp (Accounts)" },
      { key: "account.write", label: "Tạo / Sửa Doanh nghiệp" },
      { key: "contact.read", label: "Xem Người liên hệ (Contacts)" },
      { key: "contact.write", label: "Tạo / Sửa Người liên hệ" },
    ],
  },
  {
    groupName: "2.0 Danh mục sản phẩm và Bảng giá (WP-02)",
    permissions: [
      { key: "catalog.read", label: "Tra cứu sản phẩm, gói, mô-đun" },
      { key: "catalog.write", label: "Quản lý gói, tính năng phần mềm" },
      { key: "pricelist.read", label: "Tra cứu bảng giá và chính sách" },
      { key: "pricelist.write", label: "Thiết lập bảng giá chuẩn và phân khúc" },
      { key: "discount.policy.write", label: "Cấu hình chính sách chiết khấu" },
    ],
  },
  {
    groupName: "3.0 Cơ hội bán hàng và Báo giá (WP-03, WP-04)",
    permissions: [
      { key: "opp.read", label: "Xem cơ hội bán hàng (Opportunities)" },
      { key: "opp.write", label: "Cập nhật cơ hội và cấu hình dự kiến" },
      { key: "opp.solution", label: "Lập hồ sơ giải pháp kỹ thuật" },
      { key: "opp.stage", label: "Đề nghị chuyển giai đoạn phễu" },
      { key: "opp.expert_review", label: "Rà soát chuyên môn giải pháp" },
      { key: "opp.manager_review", label: "Quản lý rà soát cơ hội" },
      { key: "opp.reopen", label: "Mở lại cơ hội đã đóng" },
      { key: "quote.read", label: "Xem báo giá" },
      { key: "quote.write", label: "Lập báo giá nháp" },
      { key: "quote.approve", label: "Duyệt chiết khấu vượt hạn mức" },
      { key: "quote.send", label: "Gửi báo giá chính thức cho khách" },
    ],
  },
  {
    groupName: "4.0 Đơn hàng, Hoá đơn và Thanh toán (WP-05, WP-06)",
    permissions: [
      { key: "order.read", label: "Xem đơn hàng" },
      { key: "order.create", label: "Tạo đơn hàng từ báo giá" },
      { key: "order.create_direct", label: "Tạo đơn hàng thủ công" },
      { key: "fulfillment.update", label: "Ghi nhận tiến độ bàn giao kỹ thuật" },
      { key: "invoice.read", label: "Xem hoá đơn và công nợ" },
      { key: "invoice.create", label: "Lập hoá đơn nháp" },
      { key: "invoice.finance", label: "Phát hành hoá đơn và đối soát thanh toán" },
      { key: "payment.write", label: "Xác nhận kết quả thanh toán" },
    ],
  },
  {
    groupName: "6.0 Quản lý Đội ngũ Sales và Phân công (WP-07)",
    permissions: [
      { key: "team.read", label: "Xem đội ngũ, Sale Pods và chỉ tiêu cá nhân" },
      { key: "team.write", label: "Quản lý hồ sơ nhân viên và Sale Pods" },
      { key: "task.read", label: "Xem danh sách việc cần làm và lịch hẹn" },
      { key: "task.write", label: "Giao việc, cập nhật tiến độ công việc" },
    ],
  },
  {
    groupName: "7.1 Quản trị AI Agent (WP-08)",
    permissions: [
      { key: "ai.config.read", label: "Xem cấu hình và phiên bản Agent" },
      { key: "ai.config.write", label: "Soạn thảo cấu hình và tham số mô hình AI" },
      { key: "ai.config.manage", label: "Kích hoạt và rollback phiên bản AI" },
      { key: "ai.monitor.read", label: "Giám sát chi phí, token và lần chạy lỗi" },
      { key: "ai.admin.security", label: "Quản lý quyền kết nối và xác thực Agent" },
    ],
  },
  {
    groupName: "7.2 Quản trị hệ thống và Báo cáo (WP-09)",
    permissions: [
      { key: "admin.users", label: "Quản lý tài khoản người dùng và Khóa tài khoản" },
      { key: "admin.permissions", label: "Thiết lập phân quyền và xem ma trận RBAC" },
      { key: "admin.scope", label: "Thiết lập phạm vi dữ liệu theo nhóm" },
      { key: "admin.settings", label: "Cấu hình tham số hệ thống và BR" },
      { key: "admin.logs", label: "Tra cứu nhật ký kiểm toán (Audit Trail)" },
      { key: "report.funnel", label: "Xem báo cáo phễu cơ hội và dự báo doanh số" },
    ],
  },
];

export function RbacMatrixView() {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1">
        <p className="font-semibold text-amber-950">Nguyên tắc phân quyền và Phạm vi dữ liệu:</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-800">
          <li><strong>Quyền AI:</strong> Người quản trị hệ thống cấu hình và giám sát Agent, nhưng không phê duyệt nghiệp vụ bán hàng và không sửa dữ liệu nguồn. Quản lý kinh doanh duyệt tiêu chí trước khi áp dụng.</li>
          <li><strong>Không tự cấp quyền:</strong> Việc tham gia Sale Pod hay đổi chức danh nghiệp vụ (<code className="bg-amber-100 px-1 rounded">employees</code>) không tự động cấp thêm quyền hệ thống (<code className="bg-amber-100 px-1 rounded">users</code>).</li>
          <li><strong>Kiểm soát ở máy chủ:</strong> Mọi thao tác ghi và đọc dữ liệu đều được xác thực và kiểm tra phạm vi (Data Scope) ở server qua Server Actions và Route Handlers.</li>
        </ul>
      </div>

      <div className="overflow-x-auto border border-stroke rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#f8f9fa] border-b border-stroke text-ink-2 font-semibold">
              <th className="py-3 px-4 min-w-[280px]">Chức năng và Quyền hạn nghiệp vụ</th>
              {ALL_ROLES.map((role) => (
                <th key={role} className="py-3 px-2 text-center min-w-[90px]">
                  <div className="text-[11px] font-bold text-ink">{role}</div>
                  <div className="text-[10px] text-ink-3 font-normal truncate max-w-[90px]" title={ROLE_LABEL[role]}>
                    {ROLE_LABEL[role]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke">
            {PERMISSION_GROUPS.map((group) => (
              <tr key={group.groupName} className="contents">
                <tr className="bg-surface-2 font-bold text-ink border-t-2 border-stroke">
                  <td colSpan={ALL_ROLES.length + 1} className="py-2.5 px-4 text-xs tracking-wide">
                    {group.groupName}
                  </td>
                </tr>
                {group.permissions.map((perm) => (
                  <tr key={perm.key} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 text-ink">
                      <div className="font-medium">{perm.label}</div>
                      <div className="font-mono text-[10px] text-ink-3">{perm.key}</div>
                    </td>
                    {ALL_ROLES.map((role) => {
                      const allowed = (PERMISSION_MATRIX[perm.key] as readonly Role[]).includes(role);
                      return (
                        <td key={role} className="py-2 px-2 text-center align-middle">
                          {allowed ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-zinc-300 font-normal">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
