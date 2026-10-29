# 05 · Kịch bản test trên app để minh họa luồng dữ liệu Agent

> Dùng một thương vụ xuyên suốt: **Minh Tâm – Sales Cloud Pro + AI**, tài khoản **Trần Thị Bình** (AE, `binh.tran@sms.local` / `Password123!`). Chế độ mock (không cần khoá OpenAI). Số tiền là dữ liệu thử.

## Ca A — Thiếu dữ liệu thì Agent nói "chưa đánh giá được"

1. Mở cơ hội, **xóa ngân sách** (để 0) và **xóa ngày chốt**.
2. Bấm **Chạy Opportunity Agent** → tab **Nghiên cứu AI** → mở **Căn cứ quy tắc**.

**Mong đợi:** OPP-R06 và OPP-R07 ở trạng thái *Chưa đánh giá được*; độ bao phủ dữ liệu giảm; hành động gợi ý có "Hỏi khoảng ngân sách", "Thống nhất ngày chốt".
**Dữ liệu:** `ai_runs` (1 dòng) → `opportunity_research` (PENDING_REVIEW, `confidence`) → `ai_rule_evaluations` (10 dòng).

## Ca B — Mức quan trọng theo BR-08, không theo LLM

1. Đặt **Ngân sách khách = 100 000 000**, thêm sản phẩm để doanh thu dự kiến = **120 000 000**.
2. Chạy Agent.

**Mong đợi:** mức quan trọng **Trung bình**, OPP-R01 ghi "ngưỡng Trung bình 100 000 000 ₫, Cao 500 000 000 ₫ (BR-08)"; OPP-R07 *Vi phạm* vì 120 triệu > 100 triệu.
**Thử thêm:** đăng nhập `tuan.le@sms.local` (AI_MANAGER) hoặc Admin, đổi `importance_medium_amount` = 150 000 000 rồi chạy lại → mức **Thấp** và **hash bộ quy tắc** trên thẻ nghiên cứu đổi.

## Ca C — Người quyết định: nói đúng giới hạn kết luận

1. Cơ hội chưa có bên liên quan vai trò *Người quyết định*. Chạy Agent.

**Mong đợi:** OPP-R02 *Vi phạm*, phần giới hạn ghi "chưa đủ căn cứ khẳng định doanh nghiệp chưa tiếp cận được người đó"; hành động "Xác minh người quyết định…" đứng đầu vì là rủi ro mức Cao.
2. Vào **Stakeholders & Đối thủ**, thêm liên hệ CEO với vai trò *Người quyết định* → chạy lại → OPP-R02 *Đạt*.

## Ca D — Đối thủ: Agent phân tích, người ghi nhận

1. Chạy Agent khi **chưa** có đối thủ → OPP-R04 *Chưa đánh giá được* (không kết luận "không có cạnh tranh").
2. AE tự thêm **CloudCRM Global** ở tab Stakeholders & Đối thủ với ghi chú → chạy lại → OPP-R04 *Cảnh báo*, có hành động "Chuẩn bị bảng so sánh với CloudCRM Global".

**Điểm cần thấy:** chạy Agent không tự thêm đối thủ vào `opportunity_competitors`.

## Ca E — Xác minh (HG4) và rủi ro chưa phân loại

1. Ở thẻ nghiên cứu: rủi ro có mã `OPP-Rxx` là của quy tắc; rủi ro ghi *Chưa phân loại (LLM)* là do LLM thêm (chỉ có ở chế độ thật).
2. Bỏ chọn một rủi ro, bấm **Xác minh & cập nhật hồ sơ**.

**Mong đợi:** chỉ rủi ro được chọn vào tab **Quản lý rủi ro**; thẻ nghiên cứu chuyển *Đã xác minh*, ghi người xác minh.

## Ca F — Cổng QLKD (HG6)

1. Còn ít nhất một rủi ro mở → bấm **Giai đoạn kế tiếp**.

**Mong đợi:** OPP-R09 hiện *Cổng: QLKD rà soát*; hệ thống chặn chuyển giai đoạn cho tới khi QLKD (`dung.pham@sms.local`) rà soát.

## Ca G — Kiểm soát vận hành

- Bật **Kill switch** ở trang Quản trị AI → bấm chạy Agent → bị chặn, có thông báo.
- Xem **Lịch sử lần chạy** cuối tab Nghiên cứu AI: mỗi lần chạy có trạng thái, token, các công cụ đã gọi.

## Test tự động tương ứng

`npm test` → `tests/wp08-opportunity-rules.test.ts` kiểm các ca B, C, A (thiếu dữ liệu), hash đổi khi đổi tham số, LLM bị thay mức quan trọng, mock chạy end-to-end.
