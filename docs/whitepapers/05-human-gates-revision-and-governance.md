# 05 · Cổng con người, chạy lại và quản trị

> **Mục đích.** Agent đề xuất; người có thẩm quyền quyết định. Khi dữ kiện thay đổi, hệ thống chạy lại Agent trên cùng hồ sơ, giữ bản cũ để so sánh trước/sau.

## 0. Sáu lớp kiểm soát (hiển thị trên trang `/agents`)

| Lớp | Chặn gì | Thực thi ở | Không đạt thì |
|---|---|---|---|
| 1 Kiểm tra trước khi chạy | Agent tắt, kill switch, hết ngân sách ngày, sai giai đoạn, chạy trùng, model ngoài danh sách | `runtime.ts` | Không tạo lần chạy |
| 2 Giới hạn khi chạy | 15 vòng, 60 000 token, 5 lượt tìm web, 300 giây | `runtime.ts` | FAILED kèm lý do |
| 3 Quyền công cụ | Công cụ ngoài danh sách, sai schema, ngoài hồ sơ đang chạy | `tools.ts` | DENIED / lỗi trả về model |
| 4 Kiểm căn cứ | Nguồn không thuộc hồ sơ, URL ngoài lần chạy, trích dẫn sai | `evidence.ts` | Không lưu kết quả |
| 5 Bộ quy tắc | Mức quan trọng, rủi ro, thứ tự hành động, cổng duyệt | `rules.ts` | Thay giá trị LLM bằng kết quả quy tắc |
| 6 Con người | Email, loại / chuyển đổi, xác minh, rủi ro, chuyển giai đoạn | HG1–HG8 | Hồ sơ giữ nguyên |

Ảnh: `assets/control-layers.png`. Số liệu trên trang là 7 ngày gần nhất, chỉ tính hồ sơ người xem được phép thấy.

## 1. Tám cổng con người (HG)

| Cổng | Áp cho | Hệ thống chặn gì |
|---|---|---|
| HG1 Duyệt email do Agent soạn | Qualification | Email nháp không gửi được qua API khi chưa duyệt |
| HG2 Duyệt đề xuất loại Lead | Qualification | Lead vẫn Mở cho tới khi người duyệt, bắt buộc lý do |
| HG3 Người kích hoạt chuyển đổi | Qualification | Agent không tự tạo cơ hội |
| HG4 Xác minh bản nghiên cứu | Opportunity | Chưa xác minh thì không chép vào hồ sơ; AE chọn rủi ro nào được thêm |
| HG5 Xử lý rủi ro | Opportunity | Bỏ qua rủi ro phải có lý do; Agent không đổi trạng thái rủi ro |
| HG6 QLKD rà soát trước khi chuyển giai đoạn | Opportunity (OPP-R09, BR-06) | Không chuyển Develop → Propose khi chưa rà soát |
| HG7 Duyệt chiết khấu vượt hạn mức | Báo giá (BR-05) | Không gửi khách |
| HG8 Hoá đơn chính thức | Tài chính | Chỉ hoá đơn có số chính thức mới gửi |


## 2. Kiểm soát vận hành (FR-88..95)

| Kiểm soát | Giá trị mặc định | Hành vi khi vi phạm |
|---|---|---|
| Kill switch (FR-93) | Tắt | Chặn mọi lần chạy mới |
| Ngân sách token ngày (BR-16) | 200 000 / Agent | Cảnh báo 80 %, chặn ở 100 % |
| Giới hạn mỗi lần chạy (BR-24) | 15 vòng, 60 000 token, 5 lượt tìm web | Dừng, FAILED kèm lý do |
| Thời gian tối đa (BR-23) | 300 giây | Job dọn chuyển FAILED "Quá thời gian" |
| Model cho phép (BR-25) | Danh sách do nhóm điền | Không chạy thật nếu model ngoài danh sách |
| Kích hoạt cấu hình (BR-25) | Phải có kết quả đánh giá | Không kích hoạt phiên bản chưa đánh giá |
| Cảnh báo (BR-23) | Tỷ lệ lỗi ≥ 20 %, có DENIED, kết quả không căn cứ | Thông báo AI_MANAGER |


## 3. Dữ kiện thay đổi → chạy lại có kiểm soát

Đổi trường trọng yếu (nhu cầu, giải pháp, doanh thu, ngày chốt, bên liên quan, đối thủ — BR-15) phát sự kiện `opportunity.key_field_changed` → hẹn làm mới sau 2 phút; hoặc AE bấm chạy lại. Bản nghiên cứu mới **không ghi đè** bản cũ: bản chờ duyệt cũ chuyển DISMISSED, bản đã xác minh giữ nguyên.

Ví dụ trên app (ảnh `assets/research-v2.png`): ngân sách khách đổi từ 0 → 300 000 000 ₫.

| | Bản #1 | Bản #2 |
|---|---|---|
| OPP-R07 Ngân sách | Chưa đánh giá được | **Vi phạm**: 420 tr > 300 tr |
| Độ bao phủ dữ liệu | 90 % | 100 % |
| Rủi ro | OPP-R02 | OPP-R02, OPP-R07 |
| Hành động ưu tiên #2 | So sánh với Excel | Rà lại phạm vi / chia giai đoạn cho khớp ngân sách |
| Hash bộ quy tắc | giống nhau | giống nhau (tham số không đổi) |

## 4. Safe failure

Lỗi provider, sai schema, vượt giới hạn, căn cứ không hợp lệ → lần chạy FAILED có lý do, không có bản nghiên cứu "trông như thật". Người dùng chạy lại bằng RETRY (có liên kết `retry_of_run_id`).

