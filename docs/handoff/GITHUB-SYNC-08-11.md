# Đồng bộ bản web hiện tại lên GitHub ngày 08/11/2026

Người dùng yêu cầu cập nhật đầy đủ mã nguồn của bản web local lên repository `namtran31241025774-dot/sms-web`.

## Phạm vi

Giữ nguyên 43 commit phát triển đã có trên `rebuild/giao-dien` so với `main`, gồm giao diện Sales Hub, luồng Develop/Propose, hai AI Agent, adapter OpenAI và bộ đánh giá. Bổ sung 10 tệp local chưa commit tại thời điểm bắt đầu đồng bộ:

- Server action quản trị, đội ngũ và xác nhận AI dùng `unstable_rethrow` để không nuốt điều hướng của Next.js.
- Hóa đơn `REVIEWED` tiếp tục được hiển thị là nháp chờ phát hành.
- Báo giá đã chấp thuận có lối tạo đơn hàng hoặc mở đơn đã tạo.
- Agent chỉ dùng lại kết quả trong 60 giây khi cùng trigger; trigger khác được xử lý riêng.
- Giới hạn đầu ra mặc định của adapter OpenAI là 8.000 token để tránh cắt cụt dữ liệu nghiên cứu dài; tùy chọn truyền vào vẫn được ưu tiên.
- Phản hồi báo giá có thời điểm mặc định và đối chiếu tới phút khi dùng datetime-local.
- Rút gọn tiêu đề trang đăng nhập.

Đây là bản đồng bộ các thay đổi đang có; không bổ sung FR mới, không thay quy trình đã chốt. Cột Hiện trạng trong REQUIREMENTS giữ nguyên vì các FR liên quan đã được ghi Có.

## Kiểm tra

Chạy trên bản sao riêng của đúng 10 tệp nguồn, không dùng thư mục build của web local đang chạy.

- `npm run check`: thành công; typecheck, lint và 269 test / 30 tệp test.
- `npm ci --no-audit --no-fund`: thành công trên bản sao riêng.
- `npm run build`: thành công với Next.js 16.4.4, Turbopack; sinh đủ 39 trang tĩnh và các route động.
- `git diff --check`: thành công.
- Đối chiếu SHA-256: 10 tệp nguồn không đổi trong lúc kiểm tra.
- Kiểm tra dùng `SMS_AI_MODE=mock`, `SMS_DB_PATH=:memory:`; không gọi OpenAI thật.

Không đưa `.env.local`, API key, SQLite hay tài liệu làm bài ngoài mã nguồn lên repository. Dữ liệu test thực tế trên máy không được thay thế bởi việc push mã nguồn.

## Bàn giao

Mã nguồn được đưa lên nhánh `rebuild/giao-dien`, gộp vào `main` qua Pull Request sau khi CI thành công. Các quyết định nghiệp vụ còn chờ nhóm trong REBUILD-01 vẫn giữ nguyên; lần đồng bộ này không tự giải quyết chúng. Việc chạy trên cloud và cấu hình domain, volume, API key là cấu hình môi trường riêng, không được coi là đã nghiệm thu chỉ vì GitHub có mã nguồn mới.
