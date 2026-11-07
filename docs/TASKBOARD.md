# Bảng việc

Cập nhật dòng của WP mình khi bắt đầu và khi kết thúc phiên (xem `docs/COLLABORATION.md`). Mã FR theo bản đọc ngày 22/10/2026.

Trạng thái:
- **Chờ**: còn phụ thuộc WP chưa xong.
- **Sẵn sàng**: nhận được.
- **Đang làm**: đã có người hoặc AI nhận.
- **Chờ review**: đã mở PR.
- **Xong**: đã gộp vào `main`.

| WP | Tên | FR | Đợt | Phụ thuộc | Trạng thái | Người / AI | Cập nhật | PR / ghi chú |
|---|---|---|---|---|---|---|---|---|
| WP-00 | Nền móng và hợp đồng chung | — | 0 | — | Xong | Antigravity | 25/10/2026 | Hoàn tất nền móng, migration runner, rbac, scope, scripts, healthcheck, test pass |
| WP-01 | Quản lý khách hàng | FR-01 → FR-05, FR-07 → FR-18 | 1 | WP-00 | Xong | Antigravity | 25/10/2026 | Hoàn tất Lead/Account/Contact CRUD, CSV Import, Dedupe BR-21, Merge approval DEC-04, Affiliations DEC-21, 19/19 tests pass |
| WP-02 | Sản phẩm, dịch vụ, bảng giá | FR-21 → FR-29 | 1 | WP-00 | Xong | Antigravity | 25/10/2026 | Hoàn tất Product/Service/Module/Package CRUD, Price Lists (BR-03, BR-22), Discount Policy (BR-05), 12/12 tests pass |
| WP-07 | Đội ngũ Sales | FR-75 → FR-87 | 1 | WP-00 | Xong | Antigravity | 25/10/2026 | Hoàn tất hồ sơ nhân viên, Sale Pods, phân công, bàn giao, việc cần làm, chỉ tiêu BR-14, đánh giá hiệu quả, 13/13 tests pass |
| WP-09 | Quản trị hệ thống | FR-96 → FR-100 | 1 | WP-00, WP-07 (`teams`) | Xong | Antigravity | 25/10/2026 | Hoàn tất quản lý tài khoản, liên kết nhân viên, ma trận RBAC, phạm vi nhóm, báo cáo phễu BR-14, nhật ký kiểm toán, 12/12 tests pass |
| WP-10 | Tích hợp, dữ liệu mẫu, triển khai | — | 1 | WP-00 | Sẵn sàng | | 25/10/2026 | Sẵn sàng nhận việc |
| WP-03 | Đánh giá khách hàng và Phát triển cơ hội | FR-30, FR-31, FR-33 → FR-35, FR-37 → FR-43, FR-45 → FR-47 | 2 | WP-01, WP-02 | Xong | Antigravity | 25/10/2026 | Hoàn tất khảo sát sơ bộ BANT (BR-01, BR-02), chuyển đổi Lead (HG3, DEC-03), biên bản phạm vi (FR-37), sản phẩm & doanh thu (FR-38), stakeholders (BR-19), hồ sơ giải pháp & duyệt chuyên môn (FR-42, BR-07), rủi ro (HG5), rà soát QLKD (HG6, BR-06), checklist phễu (FR-46), đóng Lost (BR-27) & mở lại (BR-17). 19/19 tests pass |
| WP-08 | AI Agent | FR-06, FR-19, FR-20, FR-32, FR-36, FR-44, FR-88 → FR-95 | 2 | WP-01, WP-03, WP-07 | Xong | Antigravity | 25/10/2026 | Hoàn tất 2 Agent (Sales Qualification & Opportunity), sửa BUG-001 -> BUG-010, Workspace /ai-review (HG1, HG2, HG3), quản trị /admin/ai (Kill Switch, Token budget BR-16, timeout cleanup BR-23, retry FR-94, config versioning DEC-27, feedback FR-90, grounding validation NFR-08). 20/20 tests pass |
| WP-04 | Đề xuất giải pháp và báo giá | FR-48 → FR-55 | 3 | WP-02, WP-03 | Xong | Antigravity | 25/10/2026 | Hoàn tất đề xuất giải pháp (FR-48), báo giá & phiên bản (DEC-22, FR-49), đối chiếu cấu hình (FR-50), phê duyệt chiết khấu QLKD (HG7, BR-05, FR-51), xuất PDF nhị phân & gửi email (FR-52), theo dõi hiệu lực (BR-09, FR-53), ghi nhận phản hồi & điều chỉnh tạo v2 (FR-54), ký điện tử giả lập (DEC-13, FR-55), cung cấp hợp đồng getAcceptedQuoteVersion cho WP-05. 20/20 tests pass |
| WP-05 | Đơn hàng | FR-56 → FR-63 | 4 | WP-04 | Xong | Antigravity | 25/10/2026 | Hoàn tất tạo đơn từ báo giá chấp thuận (FR-56, BR-09), chặn lặp đơn (DEC-23), đơn trực tiếp (FR-57, BR-10, BR-05), tra cứu & xem đơn (FR-58), lịch thanh toán các đợt cân bằng tổng tiền (FR-59, BR-11), khóa giá (FR-60, BR-22), tiến độ triển khai (FR-61), hồ sơ bàn giao kỹ thuật & nghiệm thu (FR-62, DEC-10), hoàn thành đơn & chuyển tiếp sau bán không đổi trạng thái thanh toán (FR-63). 15/15 tests pass |
| WP-06 | Hoá đơn và thanh toán | FR-64 → FR-74 | 5 | WP-05, WP-10 | Xong | Antigravity | 25/10/2026 | Hoàn tất lập hồ sơ hóa đơn nháp từ đơn hàng (FR-64, BR-12), thiết lập lịch lập hóa đơn (FR-65), kiểm tra nháp (DEC-09, FR-66), phát hành qua ERP & gửi khách (HG8, DEC-08, FR-67), tra cứu trạng thái (FR-68), ghi nhận thanh toán & phân bổ theo Account (FR-69, DEC-23), thanh toán online qua cổng (DEC-13, FR-70), báo cáo công nợ & nhắc nợ cửa sổ 7 ngày (FR-71, BR-13), đồng bộ dữ liệu kế toán ERP (FR-72), đề xuất & phê duyệt điều chỉnh/hủy hóa đơn (FR-73), lưu & tra cứu lịch sử chứng từ (FR-74). 15/15 tests pass |
| WP-11 | Kiểm thử và đánh giá | 10 cổng, NFR | liên tục | WP-00 | Sẵn sàng | | 25/10/2026 | Bắt đầu ngay sau WP-00. Sửa BUG-011 → BUG-013 |

## Review BUG-014 trở đi — 27/10/2026

- Nhánh `review/doi-chieu-bai-27-10`; người dùng giao sửa xuyên WP; **chờ review**, chưa merge/deploy.
- BUG-014–038, 040–041 đã sửa: 194 test, typecheck/lint xanh; build thành công. BUG-039 còn xác minh volume trên Render.
- Bàn giao: `docs/handoff/REVIEW-27-10.md`; BUG-012/013 vẫn thuộc WP-11.

## Test trực tiếp 29/10 — BUG-045

- Đã sửa lỗi render kết quả Opportunity Agent; 197 test xanh. Chờ review, chưa merge/deploy. Không đổi mô hình ERD hay tự xác minh nghiên cứu của người dùng.

## Quyết định cần nhóm chốt (ảnh hưởng code)

Xem `docs/requirements/DECISIONS.md`, mục *Việc nhóm cần sửa trong bài*. Các mục **Mặc định** quan trọng nhất:

- **DEC-12 (đã chốt OpenAI):** WP-08 phải viết adapter OpenAI; code hiện chỉ có adapter Claude.
- **DEC-11, DEC-24, DEC-26:** vai trò "Người quản lý tác nhân AI", "Quản lý tư vấn giải pháp" và ai cấu hình Agent.
- **DEC-21, DEC-23:** người liên hệ nhiều doanh nghiệp; báo giá – đơn 1:1, thanh toán từng phần.
- **DEC-08:** ai phát hành hoá đơn.
- **DEC-03:** Agent có tự chuyển đổi Lead không.

## Đồng bộ mã nguồn GitHub — 08/11/2026

- Người dùng giao Codex đồng bộ đầy đủ bản web local lên `namtran31241025774-dot/sms-web` và cập nhật `main` qua Pull Request.
- Đã đối chiếu 10 tệp nguồn chưa commit, giữ toàn bộ lịch sử nhánh `rebuild/giao-dien`.
- Kiểm tra bản sao riêng: `npm run check` xanh (269 test / 30 tệp), `npm ci` và `npm run build` thành công; chỉ chạy AI mock và DB trong bộ nhớ.
- Không thay đổi phạm vi FR hay các quyết định đang chờ nhóm chốt. Chi tiết: `docs/handoff/GITHUB-SYNC-08-11.md`.
