# Đưa lên mạng để test và sửa

Mục tiêu: mỗi lần gộp code vào `main`, bản mới tự lên một link test chung. Cả nhóm (và giảng viên) bấm thử, ghi lỗi vào `docs/handoff/BUGS.md`, AI phụ trách sửa rồi gộp lại.

```
AI làm trên nhánh wp-xx/… ──PR──► GitHub (CI: typecheck, lint, test, build)
                                        │ gộp vào main
                                        ▼
                         Railway tự build Dockerfile ──► https://<tên>.up.railway.app
                                        │
                     người test ghi BUGS.md ──► AI sửa trên nhánh fix/… ──PR──► …
```

## Vì sao không dùng Vercel

Dữ liệu nằm trong file SQLite (DEC-15). Vercel chạy serverless, không có ổ đĩa lưu bền, nên mỗi lần chạy lại sẽ mất dữ liệu. Cần nơi chạy **container có volume**. Railway là lựa chọn đơn giản nhất; Fly.io hoặc một VPS có Docker cũng dùng được với cùng `Dockerfile`.

## Bước 1. Đưa code lên GitHub (làm một lần)

1. Ở thư mục `sms-web`:
   ```bash
   git init
   git add .
   git commit -m "WP-00: khởi tạo repo và tài liệu chia việc"
   ```
2. Tạo repository **private** trên GitHub, rồi:
   ```bash
   git remote add origin https://github.com/<tài-khoản>/sms-web.git
   git branch -M main
   git push -u origin main
   ```
3. Trên GitHub, vào **Settings → Branches**, thêm luật cho `main`:
   - Bắt buộc Pull Request.
   - Bắt buộc check **CI / check** phải xanh.

   Nhờ vậy không AI nào đẩy thẳng code hỏng vào `main`.
4. Mời thành viên nhóm vào repo. AI chạy trên máy ai thì dùng quyền GitHub của người đó.

## Bước 2. Tạo môi trường test trên Railway (làm một lần)

1. Đăng nhập railway.app bằng GitHub → **New Project → Deploy from GitHub repo** → chọn `sms-web`. Railway tự nhận `Dockerfile`.
2. Vào service → **Variables**, thêm:

   | Biến | Giá trị |
   |---|---|
   | `SESSION_SECRET` | chuỗi ngẫu nhiên dài |
   | `INTEGRATION_API_KEY` | chuỗi ngẫu nhiên |
   | `SMS_DB_PATH` | `/data/sms.db` |
   | `SMS_AI_MODE` | `mock`; xoá biến này khi muốn demo Agent thật |
   | `LLM_PROVIDER` | `openai` (DEC-12) |
   | `OPENAI_API_KEY` | chỉ thêm khi demo Agent thật |

3. Vào service → **Volumes → Add Volume**, gắn vào đường dẫn `/data`. Bỏ qua bước này thì dữ liệu mất sau mỗi lần deploy.
4. **Settings → Networking → Generate Domain** để có link test.
5. **Settings → Deploy:** để mặc định "deploy khi push lên `main`". Mỗi lần gộp PR là có bản mới.

Lần chạy đầu, hệ thống tự tạo bảng và dữ liệu mẫu (seed) vì DB đang trống.

## Bước 3. Vòng test và sửa

1. Sau mỗi lần deploy, người test vào link, đăng nhập bằng tài khoản demo (danh sách trong `README.md`), đi theo kịch bản demo (`docs/VIBECODE-GUIDE.md` mục 9).
2. Ghi lỗi vào `docs/handoff/BUGS.md` theo mẫu, nêu FR hoặc HG liên quan.
3. Người điều phối giao lỗi cho WP sở hữu. AI sửa trên nhánh `fix/BUG-NNN-…`, thêm test tái hiện lỗi, mở PR.
4. CI xanh → gộp → Railway tự deploy → kiểm lại.

## Làm mới dữ liệu demo

Khi dữ liệu test bị rối, có hai cách:
- **Cách đơn giản:** vào Railway → **Volumes** → xoá file `sms.db` (hoặc xoá volume rồi tạo lại), redeploy. Hệ thống seed lại.
- **Sau khi WP-00 thêm script `db:reset`:** chạy trong Railway shell:
  ```bash
  npm run db:reset
  ```

## Sao lưu (NFR-10, mức prototype)

Trước buổi demo quan trọng, tải file `/data/sms.db` về máy:
- Railway CLI: `railway run cat /data/sms.db > backup.db`
- Hoặc dùng snapshot volume của Railway.

## Chạy trên máy cá nhân

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Mở http://localhost:3000. Muốn chạy giống môi trường test: `docker build -t sms-web .` rồi `docker run -p 3000:3000 -v sms-data:/data -e SESSION_SECRET=dev sms-web`.

## Chưa kiểm

### Lưu ý sửa lỗi 27/10/2026 (BUG-015, BUG-030, BUG-039)

- Không dùng filesystem tạm thời của Render Free để lưu SQLite. Môi trường được hỗ trợ phải gắn volume lưu bền tại `/data`, đặt `SMS_DB_PATH=/data/sms.db`, và xác minh dữ liệu còn sau khi khởi động lại. Nếu chưa có volume thì chỉ dùng bản đó để demo bỏ dữ liệu; không coi là môi trường lưu trữ ổn định. Phiên sửa này **không mua dịch vụ, không cấu hình hay deploy lại bản public**.
- Container không ghi cứng `SMS_AI_MODE`. Đặt `mock` để test không tốn phí. Chạy thật cần API key, `llm_allowed_models` và phiên bản cấu hình hợp lệ; không tự chạy trả phí trong phiên sửa lỗi.
- `SMS_DEMO_LOGIN` mặc định tắt. Chỉ đặt `true` khi chủ động demo local; không bật trên bản public. Mật khẩu và tài khoản không được in trên trang đăng nhập.
- Bốn API POST: `/api/integrations/web-leads`, `/email`, `/payments`, `/accounting`. Mỗi yêu cầu cần `x-api-key: INTEGRATION_API_KEY`, `idempotency-key` và JSON đúng schema trong route. Cùng khóa/cùng dữ liệu trả lại kết quả cũ; cùng khóa/khác dữ liệu trả 409. Không gửi khóa trong URL.
- Cron: `/api/cron/agents` (GET/POST) dùng `x-api-key: CRON_API_KEY`, mặc định từ chối nếu chưa cấu hình. Đặt cùng khóa trong server và tiến trình `node scripts/cron.mjs --watch`; script gọi mỗi phút, không chồng lần đang chạy. Chạy một lượt bằng `node scripts/cron.mjs`.
- Trigger được đăng ký qua instrumentation của Next.js; tác vụ bắt đầu sau commit. Rollback không tạo lần chạy. Sửa trường trọng yếu đặt thời điểm làm mới sau 2 phút; scheduler xử lý khi đến hạn và làm mới định kỳ theo `opp_refresh_hours`.
- Kết quả cổng thanh toán chỉ ghi giao dịch chờ đối soát. Chỉ kế toán hoặc callback ERP đã xác thực mới phân bổ; không tự đổi hóa đơn thành đã trả khi cổng báo thành công.

Lệnh `docker build` và cấu hình Railway chưa được chạy thử trên máy này (máy chưa có Docker). CI GitHub Actions dùng đúng các lệnh `tsc`, `eslint`, `next build` đã chạy qua trên máy ngày 19/10/2026.
