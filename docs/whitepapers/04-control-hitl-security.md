# 04 · Kiểm soát, con người duyệt và bảo mật

> **Mục đích.** Agent được phép phân tích và đề xuất; mọi hành động có hậu quả ra ngoài hoặc thay đổi hồ sơ chính thức phải qua người có thẩm quyền.

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

## 3. Kiểm soát dữ liệu đầu ra

- **Căn cứ (evidence):** `validateEvidence` chỉ nhận trường có thật và có giá trị của hồ sơ đang chạy, `activity:<id>` thuộc hồ sơ đó, hoặc URL có trong kết quả web của **chính lần chạy**; trích dẫn phải xuất hiện nguyên văn trong nguồn.
- **Quy tắc (BR-28):** mức quan trọng, rủi ro có mã, thứ tự hành động, cổng duyệt do `rules.ts` tính lại ở server khi lưu, bất kể LLM gửi gì.
- **Thiếu dữ liệu:** trả `NOT_EVALUABLE` / `NO_INSIGHT`, không suy đoán.

## 4. Bảo mật

| Rủi ro (OWASP LLM / Agentic) | Biện pháp trong SMS |
|---|---|
| Prompt injection qua email, ghi chú, web | Bọc `untrusted_data` + prompt cấm làm theo chỉ dẫn trong dữ liệu |
| Excessive agency | Công cụ chỉ thao tác trên `ctx.entityId`; không có công cụ sửa giá, giai đoạn, đối thủ |
| Tool misuse / privilege | `invokeTool` kiểm Agent ↔ công cụ, ghi DENIED |
| Rò rỉ dữ liệu nhạy cảm trong log | `redactSensitive` che email, SĐT, khoá, token trước khi ghi `tool_calls` |
| Khoá API | Chỉ ở biến môi trường máy chủ, không vào prompt hay log |
| Kết luận không kiểm chứng | Bản nghiên cứu luôn PENDING_REVIEW; HG4 |

## 5. Safe failure

Lỗi provider, sai schema, vượt giới hạn, căn cứ không hợp lệ → lần chạy FAILED có lý do, không có bản nghiên cứu "trông như thật". Người dùng chạy lại bằng RETRY (có liên kết `retry_of_run_id`).
