# 06 · Hỏi đáp kỹ thuật và bản đồ code

## 1. Hỏi đáp ngắn

**Đây có phải chatbot hay prompt chaining không?** Không. Mỗi Agent có prompt, danh sách công cụ được cấp quyền, vòng gọi công cụ có giới hạn, schema đầu ra, rule engine và cổng duyệt riêng.

**Ai quyết định mức quan trọng?** Quy tắc OPP-R01 theo BR-08, đọc ngưỡng từ cấu hình. LLM đề xuất khác thì bị thay, giá trị LLM được giữ ở `llm_importance` để đối chiếu.

**"Độ bao phủ 60 %" có phải AI đúng 60 % không?** Không. Là tỷ lệ quy tắc có đủ dữ liệu để đánh giá.

**Không có email trong 30 ngày nghĩa là khách im lặng?** Không. Nếu hồ sơ chưa từng có email đồng bộ, OPP-R05 là *Chưa đánh giá được*. Chỉ khi có lịch sử email mà 30 ngày không có email nhận thì mới là rủi ro.

**3 hành động ưu tiên chọn thế nào?** Backend xếp: quy tắc *Vi phạm* trước, rồi theo mức Cao > Trung bình > Thấp; không còn "3 câu đầu theo thứ tự code".

**Agent có tự thêm đối thủ / rủi ro không?** Không. Chỉ ghi bản nghiên cứu; AE xác minh (HG4) mới chép vào hồ sơ.

**Nguồn `mock://…` là gì?** Dữ liệu mẫu của chế độ mock, không phải tin tức tìm trên Internet.

**OpenAI nằm ở đâu?** `src/lib/llm/openai.ts`, function calling trong `runWithLlm` (DEC-12): chọn bước, gọi công cụ, diễn giải, viết tóm tắt và insight. Không tính ngưỡng, không đặt trạng thái quy tắc, không duyệt.

**Đổi ngưỡng thì bản nghiên cứu cũ thế nào?** Giữ nguyên; `ruleset_hash` cho biết bản đó tạo theo tham số nào.

## 2. Bản đồ từ màn hình đến code và test

| Thấy trên màn hình | Code | Test |
|---|---|---|
| Nút "Chạy Opportunity Agent", lịch sử lần chạy | `src/lib/agents/runtime.ts`, `triggers.ts` | `wp08-ai-agents.test.ts` |
| Công cụ, quyền, DENIED, che log | `src/lib/agents/tools.ts` (`invokeTool`, `redactSensitive`) | `wp08-ai-agents.test.ts`, `review-runtime.test.ts` |
| Bảng **Căn cứ quy tắc**, độ bao phủ, hash | `src/lib/agents/rules.ts`, `src/components/rule-evaluation-table.tsx` | `wp08-opportunity-rules.test.ts` |
| Mức quan trọng / rủi ro / hành động ưu tiên | `rules.ts` → `save_opportunity_research` trong `tools.ts` | `wp08-opportunity-rules.test.ts` |
| Nguồn dẫn được kiểm | `src/lib/agents/evidence.ts` | `wp08-ai-agents.test.ts` |
| Xác minh nghiên cứu (HG4) | `src/app/(app)/opportunities/actions.ts`, `src/lib/services/opportunities.ts` | Chưa có test riêng (xem ca E ở whitepaper 05) |
| Kill switch, ngân sách, cấu hình phiên bản | `src/lib/services/ai-admin.ts`, trang `/admin/ai` | `wp08-ai-agents.test.ts` |
| Bảng `ai_rule_evaluations` | `src/lib/db/migrations/wp08_003_rule_evaluations.ts` | `wp08-opportunity-rules.test.ts` |

Từ khóa tìm nhanh: `evaluateOpportunityRules`, `RULESET_VERSION`, `rulesetHash`, `NOT_EVALUABLE`, `validateEvidence`, `invokeTool`, `checkPreRunConstraints`.

## 3. Việc còn mở

| Việc | Vì sao chưa làm |
|---|---|
| Bảng quy tắc riêng cho Qualification Agent (`QUAL-Rxx` vào `ai_rule_evaluations`) | Đã có kiểm soát server (BANT, NEED_INFO < 0,6); cần nhóm chốt danh mục |
| Liên kết rủi ro/đối thủ đã xác minh ngược về `rule_id` nguồn | Cần thêm cột `source_rule_id` khi AE xác minh |
| Bộ đánh giá (eval) 45 ca theo VIBECODE-GUIDE mục 8 chạy với model thật | Cần khoá OpenAI và danh sách model cho phép |
| Mô tả BR-28 trong mục 2.6.4 của bài | Nhóm cần chép bảng BR-28 từ `BUSINESS-RULES.md` vào bài |
| Cảnh báo bảo mật Next.js trước khi deploy | Ngoài phạm vi nhánh này |
