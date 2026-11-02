# Vai trò và quyền

> **Cập nhật 31/10/2026 (DEC-30):** hệ thống chỉ còn 6 vai trò `SALES`, `SALES_MANAGER`, `PRESALES`, `FINANCE`, `DELIVERY`, `ADMIN`. Quyền thực tế xem `src/lib/rbac.ts`, người phụ trách FR xem `FR-OWNERS.md`. Phần dưới nhắc `PRESALES_MANAGER`, `AI_MANAGER`, `LEGAL` là bản cũ.

Mã FR theo bản đọc ngày 22/10/2026.

## Ánh xạ vai trò trong bài → mã trong code

| Vai trò trong bài | Mã `Role` | Nhãn UI | Ghi chú |
|---|---|---|---|
| Nhân viên kinh doanh (SDR, AE, CS) | `SALES` | Nhân viên kinh doanh | Phân biệt SDR/AE/CS bằng chức danh nghiệp vụ (module 6.0), không phải bằng quyền |
| Chuyên viên tư vấn kỹ thuật (bài còn gọi "tư vấn giải pháp") | `PRESALES` | Chuyên viên tư vấn kỹ thuật | DEC-17 |
| Quản lý tư vấn giải pháp | `PRESALES_MANAGER` | Quản lý tư vấn giải pháp | **Mới** (DEC-26). Rà soát chuyên môn (FR-42) |
| Quản lý kinh doanh | `SALES_MANAGER` | Quản lý kinh doanh | Duyệt chiết khấu, rà soát cơ hội, quản lý đội ngũ, duyệt hợp nhất, cấu hình nghiệp vụ Agent |
| Nhân viên Tài chính – Kế toán | `FINANCE` | Nhân viên Tài chính – Kế toán | Hoá đơn, thanh toán, công nợ |
| Người quản trị hệ thống | `ADMIN` | Người quản trị hệ thống | Tài khoản, phân quyền, phạm vi dữ liệu, quyền dữ liệu của Agent, nhật ký |
| Người quản lý tác nhân AI | `AI_MANAGER` | Người quản lý tác nhân AI | **Mới** (DEC-11). Cấu hình kỹ thuật, giám sát Agent (DEC-24) |
| Nhân viên Pháp chế, Nhân viên triển khai kỹ thuật | `LEGAL`, `DELIVERY` | — | Có trong bảng 1.4.2 nhưng không có FR. Giữ trong enum, không cấp quyền mới (DEC-10, DEC-16) |
| Sales Qualification Agent, Sales Opportunity Agent | không phải `Role` | — | Actor `AI` trong `audit_log`; quyền thực thi ở tool registry (`src/lib/agents/tools.ts`) và bảng `tool_grants` |

## Nguyên tắc

1. **Kiểm quyền ở server** trong mọi server action và route handler (`requirePermission`). Ẩn nút ở UI chỉ là tiện ích.
2. **Hai lớp quyền:** quyền thao tác (permission key) và phạm vi dữ liệu (FR-98):
   - SALES thấy hồ sơ mình phụ trách và hồ sơ trong nhóm bán hàng (Sale Pod, bảng `teams`) của mình.
   - SALES_MANAGER thấy các nhóm mình quản lý.
   - FINANCE, ADMIN thấy hết trong phạm vi nghiệp vụ của mình.
3. **Chức danh, nhóm, vai trò nghiệp vụ không tự cấp quyền** (FR-77, FR-98).
4. **AI_MANAGER** không có `admin.users`, `admin.permissions`, không mở rộng quyền dữ liệu của Agent, không duyệt nghiệp vụ bán hàng (FR-92, FR-93, FR-98).
5. **Agent** không bao giờ được cấp quyền đổi trạng thái nghiệp vụ, gửi email hay sửa trường lõi. Chỉ ghi đề xuất, bản nghiên cứu, rủi ro (nguồn AI), việc, thông báo.

## Quyền theo nhóm FR (mặc định)

| Nhóm quyền | SALES | PRESALES | PRESALES_MANAGER | SALES_MANAGER | FINANCE | ADMIN | AI_MANAGER |
|---|---|---|---|---|---|---|---|
| Khách hàng tiềm năng, doanh nghiệp, liên hệ (FR-01 → FR-05, FR-07 → FR-16, FR-18) | Ghi | Xem | Xem | Ghi | Xem | — | — |
| Đề nghị hợp nhất / Duyệt hợp nhất (FR-17) | Đề nghị | — | — | **Duyệt** | — | — | — |
| Danh mục sản phẩm, gói, mô-đun, quyền sử dụng (FR-21 → FR-26) | Xem | Ghi gói, mô-đun | Ghi | Ghi | Xem | — | — |
| Bảng giá, giá theo nhóm (FR-27, FR-28) | Xem | Xem | Xem | **Ghi** (DEC-05) | Xem | — | — |
| Chiết khấu, hạn mức (FR-29) | Xem | — | — | Ghi | Xem | — | — |
| Đánh giá, chuyển đổi, loại (FR-30, FR-31, FR-33, FR-34) | Ghi | — | — | Ghi | — | — | — |
| Cơ hội, phát triển cơ hội (FR-35, FR-37 → FR-41, FR-43, FR-46, FR-47) | Ghi | Ghi nhu cầu, giải pháp, đối thủ | Xem | Ghi | — | — | — |
| Rà soát chuyên môn (FR-42, khi `expert_review_enabled`) | — | — | **Duyệt** | — | — | — | — |
| Rà soát cơ hội (FR-45), mở lại cơ hội (BR-17) | — | — | — | **Duyệt** | — | — | — |
| Đề xuất giải pháp, báo giá, gửi, phản hồi (FR-48 → FR-50, FR-52 → FR-55) | Ghi | Ghi đề xuất, cấu hình | Xem | Ghi | — | — | — |
| Duyệt giá, chiết khấu (FR-51) | Trình | — | — | **Duyệt** | — | — | — |
| Đơn hàng (FR-56, FR-58 → FR-63) | Ghi | Xem | — | Ghi | Xem; kiểm điều khoản thanh toán | — | — |
| Đơn hàng thủ công (FR-57) | — | — | — | Ghi (BR-10) | — | — | — |
| Hoá đơn, thanh toán, công nợ (FR-64 → FR-74) | Xem; đề nghị điều chỉnh; phối hợp nhắc | — | — | Xem | **Ghi** | — | — |
| Đội ngũ, nhóm, chỉ tiêu, phân công (FR-75 → FR-87) | Xem việc và KPI của mình; tạo việc của mình | Xem việc của mình | — | **Ghi** | — | — | — |
| Đề xuất của Agent: nghiên cứu Lead, duyệt email, đọc phản hồi, đề xuất đánh giá, xác minh nghiên cứu, hành động ưu tiên (FR-06, FR-19, FR-20, FR-32, FR-36, FR-44) | **Duyệt** (hồ sơ mình phụ trách) | Xem, phản hồi | — | Duyệt | — | — | — |
| Cấu hình Agent: chế độ, phạm vi, TCP, tiêu chí, lịch, sự kiện làm mới (FR-88, FR-89) | Ghi nếu được cấp riêng | — | — | Xem | — | — | **Ghi** (DEC-24) |
| Duyệt tiêu chí nghiệp vụ trước khi kích hoạt phiên bản cấu hình (BR-25) | — | — | — | **Duyệt** | — | — | Trình |
| Giám sát, cảnh báo và phản hồi chất lượng (FR-90, BR-23) | Phản hồi | Phản hồi | — | Xem | — | — | **Xem, nhận cảnh báo** |
| Hướng dẫn, mô hình, ngân sách, công cụ, lần chạy lỗi, kích hoạt và rollback cấu hình (FR-91, FR-93, FR-94, DEC-27) | — | — | — | — | — | — | **Ghi** (DEC-24) |
| Phạm vi dữ liệu, công cụ, thông tin xác thực, quyền ghi của Agent (FR-89, FR-92, FR-93) | — | — | — | — | — | **Ghi** | Xem tuân thủ |
| Báo cáo hiệu quả Agent (FR-95) | — | — | — | Xem | — | — | **Xem** |
| Tài khoản, phân quyền, phạm vi dữ liệu (FR-96 → FR-98) | — | — | — | — | — | **Ghi** | — |
| Báo cáo phễu, dự báo (FR-99) | Của mình | — | — | **Xem** | — | — | — |
| Nhật ký (FR-100) | — | — | — | Xem | — | **Xem** | Xem nhật ký Agent |

Bảng này là đầu vào cho `src/lib/rbac.ts`. WP-00 chuyển nó thành permission key; các WP khác chỉ gọi key, không tự thêm quyền ngoài bảng.
