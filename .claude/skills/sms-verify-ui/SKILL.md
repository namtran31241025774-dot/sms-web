---
name: sms-verify-ui
description: Chạy app SMS ở máy với dữ liệu mẫu riêng và AI mock để kiểm tra giao diện Agent hoặc chụp ảnh cho README/whitepaper. Dùng sau khi sửa trang /agents, tab Nghiên cứu AI, bảng Căn cứ quy tắc, workflow lần chạy, hoặc khi cần cập nhật ảnh trong assets/.
---

# SMS — Kiểm tra giao diện và chụp ảnh

## Chạy app riêng cho kiểm tra

- Dùng DB riêng, không đụng `data/sms.db`: `SMS_DB_PATH=data/showcase.db`, `SMS_AI_MODE=mock`, `npx next dev -p 3100`. Thư mục `data/` đã nằm trong `.gitignore`.
- Lần đầu chạy, DB tự migrate + seed. Muốn làm lại từ đầu thì xoá `data/showcase.db*`.
- Đăng nhập tài khoản demo trong README (AE: `binh.tran@sms.local`, mật khẩu chung ghi trong README). Chỉ dùng trên localhost.

## Các màn hình cần xem

| Màn hình | Đường dẫn | Kiểm tra |
|---|---|---|
| Trung tâm AI Agent | `/agents?agent=OPPORTUNITY` và `?agent=QUALIFICATION` | Thống kê, phân vai, workflow 8 bước, 6 thành phần, giới hạn, lần chạy gần đây |
| Nghiên cứu AI | `/opportunities/1?tab=research` | Workflow của lần chạy, mức quan trọng theo quy tắc, độ bao phủ, hash, Căn cứ quy tắc |
| Rủi ro sau xác minh | `/opportunities/1?tab=risks` | Rủi ro AI được chọn, banner cổng BR-06 |
| Hàng chờ duyệt | `/ai-review` | Đề xuất của Qualification Agent (HG1–HG3) |

Kịch bản thao tác đầy đủ: `docs/demo-walkthrough.md`.

## Chụp ảnh cho tài liệu

1. Xoá badge dev của Next trước khi chụp: `document.querySelectorAll('nextjs-portal').forEach(e => e.remove())`.
2. Chụp đủ độ phân giải (scale 1); vùng nhỏ thì dùng zoom theo vùng.
3. Lưu vào `assets/` với tên tiếng Anh ngắn (`agent-center.jpg`, `run-workflow.png`, …) và cập nhật mục walkthrough trong README.
4. Tắt server sau khi xong.
