# 07 · Bản đồ triển khai

> Đi từ một điều thấy trên màn hình tới code, bảng dữ liệu và test tương ứng.

## 1. Bản đồ từ màn hình đến code và test

| Thấy trên màn hình | Code | Test |
|---|---|---|
| Nút "Chạy Opportunity Agent", lịch sử lần chạy | `src/lib/agents/runtime.ts`, `triggers.ts` | `wp08-ai-agents.test.ts` |
| Công cụ, quyền, DENIED, che log | `src/lib/agents/tools.ts` (`invokeTool`, `redactSensitive`) | `wp08-ai-agents.test.ts`, `review-runtime.test.ts` |
| Trang **Trung tâm AI Agent** (thành phần, workflow, giới hạn, thống kê) | `src/app/(app)/agents/page.tsx`, `src/lib/agents/catalog.ts`, `src/components/agent-workflow.tsx` | Kiểm tra tay (docs/demo-walkthrough.md) |
| Thanh **Workflow của lần chạy này** | `src/components/research-flow.tsx` | Kiểm tra tay |
| Bảng **Căn cứ quy tắc**, độ bao phủ, hash | `src/lib/agents/rules.ts`, `src/components/rule-evaluation-table.tsx` | `wp08-opportunity-rules.test.ts` |
| Mức quan trọng / rủi ro / hành động ưu tiên | `rules.ts` → `save_opportunity_research` trong `tools.ts` | `wp08-opportunity-rules.test.ts` |
| Nguồn dẫn được kiểm | `src/lib/agents/evidence.ts` | `wp08-ai-agents.test.ts` |
| Xác minh nghiên cứu (HG4) | `src/app/(app)/opportunities/actions.ts`, `src/lib/services/opportunities.ts` | Chưa có test riêng (xem ca E ở docs/demo-walkthrough.md) |
| Kill switch, ngân sách, cấu hình phiên bản | `src/lib/services/ai-admin.ts`, trang `/admin/ai` | `wp08-ai-agents.test.ts` |
| Bảng `ai_rule_evaluations` | `src/lib/db/migrations/wp08_003_rule_evaluations.ts` | `wp08-opportunity-rules.test.ts` |

Từ khóa tìm nhanh: `evaluateOpportunityRules`, `RULESET_VERSION`, `rulesetHash`, `NOT_EVALUABLE`, `validateEvidence`, `invokeTool`, `checkPreRunConstraints`.


## 2. Việc còn mở

| Việc | Vì sao chưa làm |
|---|---|
| Bảng quy tắc riêng cho Qualification Agent (`QUAL-Rxx` vào `ai_rule_evaluations`) | Đã có kiểm soát server (BANT, NEED_INFO < 0,6); cần nhóm chốt danh mục |
| Liên kết rủi ro/đối thủ đã xác minh ngược về `rule_id` nguồn | Cần thêm cột `source_rule_id` khi AE xác minh |
| Bộ đánh giá (eval) 45 ca theo VIBECODE-GUIDE mục 8 chạy với model thật | Cần khoá OpenAI và danh sách model cho phép |
| Mô tả BR-28 trong mục 2.6.4 của bài | Nhóm cần chép bảng BR-28 từ `BUSINESS-RULES.md` vào bài |
| Cảnh báo bảo mật Next.js trước khi deploy | Ngoài phạm vi nhánh này |

