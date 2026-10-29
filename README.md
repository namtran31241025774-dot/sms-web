# SMS – Sales Management System

Hệ thống quản lý hoạt động Sales cho doanh nghiệp B2B SaaS có dịch vụ triển khai, tích hợp 2 AI Agent:

- **Sales Qualification Agent:** sàng lọc khách hàng tiềm năng.  
- **Sales Opportunity Agent:** nghiên cứu và theo dõi cơ hội.

Đồ án môn Kiến trúc Hệ thống, UEH.

## Câu chuyện của hệ thống

Một thương vụ đi qua 5 giai đoạn **Qualify → Develop → Propose → Close → Fulfill**. Hai Agent làm phần việc tốn thời gian của nhân viên — đọc dữ liệu, đối chiếu tiêu chí, tìm rủi ro, đề xuất bước tiếp theo — nhưng **không quyết định thay người**:

1. Lead mới vào → **Qualification Agent** chấm BANT có căn cứ, đề xuất làm giàu / loại / chuyển đổi, soạn email hỏi thêm. SDR duyệt (HG1–HG3).
2. Cơ hội ở Develop → **Opportunity Agent** đọc hồ sơ, email, ghi chú họp, rồi gọi **bộ quy tắc OPP-R01..R10** do backend sở hữu.
3. Mỗi nhận định đi kèm chuỗi **quy tắc → dữ liệu quan sát → ngưỡng → giới hạn kết luận → việc cần làm → cổng duyệt**. Thiếu dữ liệu thì ghi *Chưa đánh giá được*, không suy đoán.
4. AE xác minh bản nghiên cứu (HG4) mới chép vào hồ sơ; cơ hội mức Cao hoặc còn rủi ro phải qua QLKD (HG6).
5. Mọi lần chạy để lại dấu vết: lần chạy, công cụ đã gọi, căn cứ đã xác thực, kết quả từng quy tắc và **hash bộ quy tắc** đang dùng.

Ranh giới cốt lõi: **LLM (OpenAI) chọn bước và diễn giải; backend sở hữu ngưỡng, trạng thái, quyền và cổng duyệt; con người quyết định.**

## Whitepapers

| Tài liệu | Nội dung |
| :---- | :---- |
| [01 · Hai Agent và Harness](docs/whitepapers/01-agent-harness.md) | Các lớp của một Agent, vòng gọi công cụ có giới hạn, mock và OpenAI, Agent không được làm gì |
| [02 · Bộ quy tắc và mô hình quyết định](docs/whitepapers/02-rules-and-decision-model.md) | OPP-R01..R10, trạng thái, độ bao phủ dữ liệu, ai sở hữu phần nào (BR-28) |
| [03 · Dữ liệu của lớp AI](docs/whitepapers/03-ai-data-model.md) | Bảng AI, `ai_rule_evaluations`, hai đường truy vết |
| [04 · Kiểm soát, con người duyệt, bảo mật](docs/whitepapers/04-control-hitl-security.md) | HG1–HG8, kill switch, ngân sách, căn cứ, OWASP |
| [05 · Kịch bản test trên app](docs/whitepapers/05-demo-test-scenarios.md) | 7 ca thao tác để thấy dữ liệu chạy qua Agent |
| [06 · Hỏi đáp kỹ thuật và bản đồ code](docs/whitepapers/06-technical-qa-and-implementation-map.md) | Câu hỏi thường gặp, màn hình → code → test, việc còn mở |

## Bắt đầu

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Mở [http\://localhost:3000](http://localhost:3000). Lần chạy đầu hệ thống tự tạo dữ liệu mẫu trong `data/sms.db`.

## Tài liệu

| Tài liệu | Nội dung |
| :---- | :---- |
| [AGENTS.md](http://AGENTS.md) | Điểm bắt đầu cho mọi AI và người code |
| [docs/requirements/REQUIREMENTS.md](http://docs/requirements/REQUIREMENTS.md) | 100 yêu cầu chức năng, 15 yêu cầu phi chức năng |
| [docs/requirements/BUSINESS-RULES.md](http://docs/requirements/BUSINESS-RULES.md) | Quy tắc nghiệp vụ và con số mặc định |
| [docs/requirements/DECISIONS.md](http://docs/requirements/DECISIONS.md) | Quyết định thiết kế đã chốt và mặc định |
| [docs/requirements/ROLES.md](http://docs/requirements/ROLES.md) | Vai trò, quyền, phạm vi dữ liệu |
| [docs/requirements/DATA-MODEL.md](http://docs/requirements/DATA-MODEL.md) | Thực thể ERD của bài ↔ bảng trong code |
| [docs/WORKPLAN.md](http://docs/WORKPLAN.md) | 12 gói việc và file thuộc từng gói |
| [docs/COLLABORATION.md](http://docs/COLLABORATION.md) | Quy trình nhiều AI làm song song |
| [docs/TASKBOARD.md](http://docs/TASKBOARD.md) | Bảng trạng thái các gói việc |
| [docs/DEPLOY.md](http://docs/DEPLOY.md) | Đưa lên môi trường test |
| [docs/VIBECODE-GUIDE.md](http://docs/VIBECODE-GUIDE.md) | Đặc tả kỹ thuật Agent và khung đánh giá |

## Các lệnh kiểm tra và phát triển

```sh
npm run dev          # Khởi động máy chủ dev
npm run typecheck    # Sinh type route và kiểm tra kiểu TypeScript
npm run lint         # Kiểm tra chuẩn mã nguồn bằng ESLint
npm test             # Chạy bộ test Vitest (DB in-memory, mock AI)
npm run check        # Kiểm tra toàn diện (= typecheck + lint + test)
npm run db:reset     # Xóa và tạo mới cơ sở dữ liệu mẫu
npm run fr:coverage  # Báo cáo độ phủ kiểm thử các mã FR và HG
npm run build        # Build ứng dụng cho môi trường production
```

## Tài khoản demo

Đăng nhập bằng Email và Mật khẩu (DEC-14, FR-97) hoặc chọn nhanh tài khoản tại trang `/login`:

**Mật khẩu dùng chung cho tất cả tài khoản demo:** `Password123!`

| Vai trò | Nhãn hiển thị | Email | Họ và tên | Chức danh | Mã NV |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SALES` | Nhân viên kinh doanh | `an.nguyen@sms.local` | Nguyễn Văn An | SDR (Sales Development Rep) | `EMP-001` |
| `SALES` | Nhân viên kinh doanh | `binh.tran@sms.local` | Trần Thị Bình | Account Executive (AE) | `EMP-002` |
| `PRESALES` | Chuyên viên tư vấn kỹ thuật | `chau.le@sms.local` | Lê Minh Châu | Solution Engineer (SE) | `EMP-003` |
| `PRESALES_MANAGER` | Quản lý tư vấn giải pháp | `phuc.ngo@sms.local` | Ngô Tuấn Phúc | Quản lý tư vấn giải pháp | `EMP-004` |
| `SALES_MANAGER` | Quản lý kinh doanh | `dung.pham@sms.local` | Phạm Quốc Dũng | Quản lý kinh doanh | `EMP-005` |
| `FINANCE` | Nhân viên Tài chính – Kế toán | `ha.vo@sms.local` | Võ Thu Hà | Kế toán công nợ | `EMP-006` |
| `AI_MANAGER` | Người quản lý tác nhân AI | `tuan.le@sms.local` | Lê Hoàng Tuấn | Quản lý tác nhân AI | `EMP-007` |
| `ADMIN` | Người quản trị hệ thống | `khanh.hoang@sms.local` | Hoàng Gia Khánh | Quản trị hệ thống | `EMP-008` |