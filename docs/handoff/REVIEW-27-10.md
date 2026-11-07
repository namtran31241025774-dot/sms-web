# Bàn giao review 27/10/2026

- Nhánh `review/doi-chieu-bai-27-10`. Người dùng giao BUG-014 trở đi, sửa xuyên WP và cho phép đầy đủ BUG-023, BUG-030/039. Chỉ thử local mock, không AI trả phí, không deploy.
- BUG-014–038 và BUG-040–041 đã sửa/test; chờ review và merge. BUG-039 phần code xong, còn xác minh volume bền và thử restart trên Render.

## Thay đổi

- Quyền truy cập Lead, Opportunity, Quote, Order, Invoice theo người phụ trách/nhóm, gồm truy cập thẳng bằng ID và các thao tác nghiệp vụ liên quan; đăng nhập nhanh mặc định tắt, từ chối hash mật khẩu rỗng, sửa vai trò nghiệp vụ.
- Cổng Authority/BANT, báo giá PROPOSE/đơn CLOSE, duyệt chuyên môn, hết hiệu lực duyệt QLKD khi điều kiện đổi; hợp nhất bảo toàn liên kết và thống nhất đường xử lý BANT/loại khách.
- Bỏ lịch thanh toán tự sinh, lệnh kích hoạt triển khai và API hóa đơn/thanh toán cũ; giữ thời điểm khóa giá, kiểm nghiệm thu trước hoàn thành.
- Thanh toán theo Account, callback chờ đối soát; kiểm tra hóa đơn độc lập, email sau commit, VAT từng dòng; KPI theo kỳ và giá trị đơn, hệ số từ settings.
- Agent: hook sau commit, cron xác thực/làm mới, JSON Schema, token thật và mock bằng 0, cảnh báo có chống lặp, giới hạn vòng/token/web/thời gian, model được phép, kiểm nguồn và trích dẫn, EDITED, che log và prompt v2.
- Webhook web lead/email/payment/ERP: xác thực, kiểm đầu vào, idempotency. Docker không khóa mock; hướng dẫn volume bền. Đếm FR theo tên test, giữ setting bằng 0 và DomainError nghiệp vụ.

## Kiểm tra

- `npm run check`: PASS — typecheck, ESLint, 15 suite / 194 test (154 ban đầu + 40 mới).
- `npm run build` với SQLite `:memory:` và AI mock: PASS.
- Test hồi quy: `tests/review-regressions.test.ts`, `review-runtime.test.ts`, `review-events.test.ts`, `review-integrations.test.ts`, `review-static.test.ts`; các fixture WP được sửa theo cổng nghiệp vụ đúng.
- Không gọi AI trả phí, email thật, ERP thật hoặc cổng thanh toán thật.

## Migration và chạy local

- wp06_002: invoice_id nullable, source GATEWAY/currency, invoice REVIEWED. wp08_002: EDITED và ai_refresh_due_at. wp10_001: integration_requests và unique giao dịch ngoài.
- Không sửa schema/migration gốc. Sao lưu DB trước áp dụng trên dữ liệu thật; kiểm dữ liệu giao dịch ngoài trùng trước unique index.
- Cron cần `CRON_API_KEY`; gọi `/api/cron/agents` hoặc `node scripts/cron.mjs --watch`. Chưa cài lịch public.
- Prompt v2 không ghi đè cấu hình ACTIVE đã lưu: đánh giá/kích hoạt phiên bản mới theo quy trình cấu hình.
- Demo local dùng DB riêng `data/review-27-10.db`, AI mock và loopback; đăng nhập nhanh chỉ bật cho phiên demo.

## Còn chờ và giới hạn

- BUG-039: chưa cấu hình/kiểm chứng volume và restart của Render; không thay bản public.
- BUG-012/013 (kiểm thử an toàn chuyên biệt/bộ đánh giá chất lượng AI) ngoài phạm vi lần này, vẫn thuộc WP-11. Không tuyên bố đã đánh giá chất lượng AI thật.
- `npm audit` báo Next.js 16.4.0 có mức critical, đề xuất 16.4.3. Chưa nâng dependency trong phạm vi này; cần xử lý trước triển khai.
- BUG-014 được kiểm trên các hồ sơ Sales kể trên; đây không phải kết luận kiểm toán bảo mật toàn ứng dụng.
- Dấu tick BUGS theo yêu cầu người dùng chỉ là sửa/test trên nhánh review, chưa merge/deploy.
