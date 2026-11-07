# Bàn giao 02: làm lại giao diện Develop, Propose và AI Agent

Người nhận: AI làm phần giao diện. Phần chức năng do AI khác làm theo `REBUILD-01-CHUC-NANG.md`; đọc mục 1 và mục 9 của tệp đó trước.

Nguồn đã đọc ngày 03/11/2026: Google Doc nhóm, tab **Test**, **Kế hoạch test**, **Task của Agent** và mục 2.1.8.2, 2.1.8.3 tab Bài làm chính; lần test tay case Tân Cảng Xanh 01–02/11.

Ý chính của người dùng: Develop, Propose và 2 AI Agent là phần quan trọng nhất của bài, nhưng trên web "rất rối và không thể hiện được luồng đi của quy trình"; giao diện quan sát Agent "đang xấu quá".

## 0. Trước khi bắt đầu

- Nhánh `agentic/rule-governance` đang có khoảng 64 tệp chưa commit. Chỉ làm khi người dùng đã commit hoặc chỉ định nhánh xuất phát; làm trên nhánh riêng.
- Đọc `AGENTS.md`, `CLAUDE.md`, skill `.claude/skills/sms-domain`, `sms-ai-agents`, và `src/components/ui.tsx`, `record.tsx`, `agent-workflow.tsx` để giữ phong cách hiện có.
- Chạy web: `SMS_DB_PATH=data/showcase.db`, `SMS_AI_MODE=mock`, `SMS_DEMO_LOGIN=true`, cổng 3100, đăng nhập một chạm ở `/login`. Xem bằng OPP-2026-0004 (Nguyễn Văn An là NVKD, Lê Minh Châu là chuyên viên tư vấn giải pháp, Phạm Quốc Dũng là Quản lý kinh doanh).
- Chạy `npm test` và `npm run check` trước khi báo xong. Không dùng `npx vitest run`.
- Phân chia tệp: AI này sở hữu `src/components/**`, các tệp `page.tsx`, `layout.tsx`, CSS. Không sửa service, quy tắc, Agent, migration. Cần dữ liệu chưa có thì dùng dữ liệu đang có, để chỗ trống có ghi chú, và đối chiếu bảng mục 9 của tệp 01.
- Giao diện tiếng Việt, đúng tên vai trò hiển thị (ví dụ "Chuyên viên tư vấn giải pháp", không dùng "Presales").

## 1. Các ý trong tab Test về giao diện

| Mã | Tab Test viết | Việc cần làm |
|---|---|---|
| U1 | "Mấy cái FR bỏ đi trông hệ thống" | Bỏ mã FR, BR, HG khỏi tiêu đề và nhãn, ví dụ "Hồ sơ giải pháp & Phương án kỹ thuật (FR-41)", "Cổng Duyệt chuyên môn giải pháp (FR-42, BR-07)". Tìm bằng `\((FR|BR|HG)-` trong `src/app` và `src/components`. Trang quản trị quy tắc có thể giữ mã quy tắc. |
| U2 | "Cái dấu & nhìn rất là khó chịu" | Thay "&" bằng "và" hoặc viết lại nhãn: tab "Sản phẩm & Giải pháp", "Stakeholders & Đối thủ", bước "Kiểm căn cứ & lưu", tiêu đề "Danh sách Báo giá & Phiên bản"… |
| U3 | "Mình cần một cái khung để quan sát AI agent làm việc… khi nó trả kết quả về thì cần có luôn vì sao theo rule nào… giao diện hiện tại đang xấu quá" | Xem mục 3. |
| U4 | "Chưa thể hiện được lý do chấm điểm như vậy và lộ trình AI agent chạy", "Chưa thể hiện rõ rule của BANT", "Sales Qualification Agent mình chưa thấy" | Xem mục 4. |
| U5 | "đối với phương án đề xuất thì cần có evidence ứng với từng recommendation" | Mỗi khuyến nghị hiện căn cứ của nó ngay bên dưới, bấm mở được nguồn. |
| U6 | Cảnh báo thì gắn cờ cho qua, vi phạm thì gắn cờ hoặc chọn xử lý; "hiện chỉ mới là xem rồi xác minh cập nhật" | Nút theo từng dòng kết quả quy tắc, sau khi tệp 01 làm F7. |
| U7 | "Thiếu thông tin trong bảng tóm tắt" | Tab Tóm tắt hiện các ô nhu cầu riêng (mục tiêu kinh doanh, quy trình hiện tại, khó khăn, nhu cầu sử dụng, kết quả kỳ vọng), sau khi tệp 01 làm F3. |
| U8 | "Kỹ thuật chưa có chỗ tải documents mô tả chi tiết phương án lên" | Ô tải tệp ngay trong tab Hồ sơ kỹ thuật, sau khi tệp 01 làm F8. |
| U9 | "phần đề xuất mail cho người dùng mình chưa thấy" | Email nháp của Agent hiện rõ trên trang Lead, có đường tới bước duyệt trước khi gửi. |
| U10 | "Mình muốn có một cái dash về dòng tiền dự tính… người có thẩm quyền mới xem" | Trang dashboard, sau khi tệp 01 làm mục 7. Ẩn menu với người không có quyền. |

## 2. Khung "Luồng xử lý" trên trang cơ hội

Hiện trang cơ hội có thanh 5 giai đoạn (Qualify → Fulfill), 2–3 thanh cảnh báo rời ở đầu trang và 11 tab ngang hàng không theo thứ tự quy trình. Người xem không biết đang ở bước nào, việc tiếp theo là gì.

- Thay các thanh cảnh báo rời bằng một khung bước, đặt dưới thanh giai đoạn.
- Ở Develop, các bước theo bài 2.1.8.2:
  1. Agent lần 1 nghiên cứu bối cảnh.
  2. NVKD xem nghiên cứu, hẹn lịch với khách, phân công chuyên viên tư vấn giải pháp.
  3. Khảo sát nhu cầu và yêu cầu kỹ thuật, tải tài liệu.
  4. Agent lần 2 phân tích khảo sát, kiểm ngân sách.
  5. Xác nhận phạm vi với khách.
  6. Giải pháp sơ bộ, cấu hình sản phẩm, hồ sơ kỹ thuật, duyệt chuyên môn khi thuộc diện.
  7. Bên liên quan.
  8. Đối thủ.
  9. Chuyển giai đoạn, Quản lý kinh doanh rà soát khi thuộc diện.
- Ở Propose, 6 bước theo 2.1.8.3: chốt cấu hình, báo giá nháp, duyệt giá, gửi và thương lượng, khách quyết định, sẵn sàng Close.
- Mỗi bước có: trạng thái (xong, đang làm, chưa tới, không áp dụng), ai làm (NVKD, chuyên viên tư vấn giải pháp, Quản lý kinh doanh, Agent), một nút đi tới đúng chỗ làm. Bước đang làm nổi bật kèm một dòng "Việc tiếp theo".
- Dữ liệu từ `opportunityFlow(o)`, `proposeFlow(o)` của tệp 01. Trong lúc chờ, ô "QLKD rà soát" đã có dữ liệu thật qua `stageGateStatus(o)` (`src/lib/services/approvals.ts`).
- Sắp lại tab theo thứ tự quy trình: Tóm tắt, Nghiên cứu AI, Tài liệu, Phạm vi và sản phẩm, Hồ sơ kỹ thuật, Bên liên quan và đối thủ, Rủi ro, Báo giá; Hoạt động và Nhật ký để cuối.

## 3. Khung quan sát AI Agent và bản nghiên cứu cơ hội

Hiện tab Nghiên cứu AI hiện mỗi lần chạy là một thẻ dài (sơ đồ 8 bước, bảng 10 quy tắc), các bản chồng lên nhau; 6 mục nhận định Agent đã lưu (`insights_json`) **không được hiển thị ở đâu**.

- Bản mới nhất lên đầu, ghi rõ **Agent lần 1** hay **lần 2**, chạy lúc nào, ai kích hoạt.
- Phần nội dung theo đúng tên mục trong bài: Bối cảnh doanh nghiệp, Thông tin cơ hội, Kết quả BANT, Lịch sử tương tác, Nhu cầu và điểm chưa rõ, Sản phẩm liên quan, Bên liên quan, Đối thủ, Rủi ro ngân sách, Thông tin còn thiếu, tối đa 3 hành động. Mục "Chưa có nhận định" hiện lý do, không để trống.
- Khung quan sát theo luồng chung trong tab Test: **Dữ liệu được cấp quyền → Agent và công cụ xử lý → kiểm tra quy tắc, căn cứ → lưu đề xuất → con người xác minh → cập nhật nghiệp vụ.** Hiện công cụ đã gọi, dữ liệu đã đọc, quy tắc nào đạt hay không, ai xác minh.
- Mỗi kết luận (mức quan trọng, rủi ro, cờ ngân sách, khuyến nghị) có dòng "Vì sao": quy tắc nào, nguồn nào. Bảng 10 quy tắc đầy đủ thu gọn, bấm mới mở.
- Bản cũ thu gọn thành một dòng (thời điểm, trạng thái, người xác minh), bấm mới mở.
- Mock hiện chỉ sinh nội dung ngắn; giao diện phải chịu được cả mục rỗng lẫn nội dung dài khi chạy OpenAI thật.

## 4. Sales Qualification Agent trên trang Lead

- Hiện bảng BANT của nhóm: 4 tiêu chí, mỗi tiêu chí điểm 0/8/15/25 kèm mô tả mức, lý do và căn cứ; tổng điểm so với ngưỡng 60 và điều kiện đã có người quyết định; kết luận đạt hay chưa.
- Hiện lộ trình lần chạy theo cùng kiểu khung quan sát ở mục 3, để hai Agent nhìn thống nhất.
- Thông tin Agent bổ sung có nguồn, dữ liệu còn thiếu, email nháp, mỗi thứ có nút đi tới bước duyệt.

## 5. Nguyên tắc chung

- Mỗi khu vực một hành động chính; không lặp cùng một trạng thái ở nhiều chỗ trên một trang.
- Ai làm bước nào phải nhìn thấy được; nút người dùng không có quyền thì ẩn hoặc ghi rõ ai làm.
- Không đổi quy tắc nghiệp vụ, không đổi cách lưu dữ liệu.

## 6. Nghiệm thu

- `npm run check` xanh, test cũ không phải sửa logic.
- Ảnh chụp OPP-2026-0004 ở từng bước Develop và Propose, và trang Lead có kết quả Qualification Agent, bằng các tài khoản An, Châu, Dũng.
- Không còn mã FR/BR/HG và dấu "&" trên nhãn giao diện người dùng.
