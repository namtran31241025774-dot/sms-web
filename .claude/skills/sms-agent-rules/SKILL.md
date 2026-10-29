---
name: sms-agent-rules
description: Cách thêm, sửa hoặc giải thích quy tắc kiểm soát của AI Agent trong SMS (BR-28, rule engine OPP-R01..R10, bảng ai_rule_evaluations, độ bao phủ dữ liệu, cổng duyệt). Dùng khi đổi ngưỡng/quy tắc của Opportunity Agent, thêm quy tắc cho Qualification Agent, sửa cách tính mức quan trọng, rủi ro, 3 hành động ưu tiên, hoặc khi kết quả Agent "không rõ dựa vào đâu".
---

# SMS — Quy tắc và kiểm soát của Agent

Đọc trước: `docs/whitepapers/04-decision-model-and-ownership.md`, `src/lib/agents/rules.ts`, BR-28 trong `docs/requirements/BUSINESS-RULES.md`.

## Bất biến (không được phá)

1. **Backend sở hữu** ngưỡng, trạng thái, mức độ, cổng duyệt. LLM chỉ diễn giải. `save_opportunity_research` luôn tính lại bằng `evaluateOpportunityRules` và ghi đè mức quan trọng của LLM (giữ giá trị LLM ở `llm_importance`, ghi audit).
2. Trạng thái là tập đóng: `PASSED | WARNING | HIT | NOT_EVALUABLE | NOT_APPLICABLE`. **Thiếu dữ liệu → `NOT_EVALUABLE`**, không kết luận thay; viết `limitation` khi kết luận có giới hạn (ví dụ "không có email ≠ khách im lặng").
3. Ngưỡng đọc từ `settings` (`src/lib/settings-defaults.ts`), không hard-code. Mock (`mock.ts`) phải gọi `evaluate_opportunity_rules`, không tự đặt ngưỡng.
4. Mỗi kết quả có `rule_id`, `br`, `raw_value`, `threshold`, `rationale`, `evidence_refs`, `required_action`, `human_gate`.
5. Độ bao phủ = quy tắc đánh giá được / quy tắc áp dụng — không gọi là "xác suất AI đúng".
6. Hành động ưu tiên xếp: HIT trước, rồi HIGH > MEDIUM > LOW; tối đa 3.

## Thêm hoặc sửa một quy tắc — checklist

1. `rules.ts`: thêm mục vào `OPPORTUNITY_RULES` (id, br, title, `settings` dùng) và khối đánh giá trong `evaluateOpportunityRules`. Đủ các nhánh: dữ liệu thiếu / đạt / vi phạm.
2. Tham số mới: thêm vào `settings-defaults.ts` **và** chèn cho DB đã có dữ liệu bằng migration mới `wp08_00x_*.ts` (chỉ `INSERT OR IGNORE` khi bảng `settings` đã có dòng — DB mới do seed nạp, chèn sớm sẽ lỗi UNIQUE). Đăng ký migration trong `migrations/index.ts`.
3. Rủi ro mới: dùng `risk_category` có trong `OpportunityRiskCategory` (`schemas.ts`).
4. Test trong `tests/wp08-opportunity-rules.test.ts`: một ca cho mỗi trạng thái, và nếu đổi số quy tắc thì sửa ca "lưu 10 dòng `ai_rule_evaluations`". Đổi tham số phải làm đổi `rulesetHash()`.
5. Đổi ý nghĩa quy tắc thì tăng `RULESET_VERSION`.
6. Tài liệu: bảng quy tắc ở whitepaper 04, dòng BR-28, `docs/requirements/DATA-MODEL.md` nếu đổi bảng. Trang `/agents` và bảng "Căn cứ quy tắc" tự đọc từ registry — không cần sửa giao diện.
7. Chạy `npm test`, `npx tsc --noEmit`, `npx eslint src tests`.

## Quy tắc cho Qualification Agent (chưa làm)

Làm theo cùng mẫu: `QUAL-Rxx` (BANT BR-01, mức Nóng/Ấm/Lạnh BR-02, TCP BR-04, trùng BR-21, NEED_INFO < 0,6), lưu `ai_rule_evaluations` với `suggestion_id` thay vì `research_id` (cần migration thêm cột), hiển thị trong `/ai-review`. Danh mục phải được nhóm chốt trước.
