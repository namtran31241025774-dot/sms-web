# Mô hình dữ liệu: ERD của bài ↔ bảng trong code

Nguồn: mục 2.4.3 và tab *Phụ lục ERD* (mã Mermaid đầy đủ, 61 thực thể), bản đọc ngày 22/10/2026. Quyết định chung: DEC-20.

## Quy ước

- ERD là **đích**. Mỗi thực thể có đúng một dòng dưới đây.
- **Có**: bảng đã có trong `src/lib/db/schema.ts`. **Giữ tên bảng**, chỉ thêm hoặc đổi cột bằng migration của WP ghi ở cột *WP*.
- **Mới**: WP ở cột *WP* tạo bảng bằng migration `src/lib/db/migrations/wpXX_NNN_<ten>.ts`, tên bảng đúng như cột *Bảng*.
- **Gộp**: prototype lưu thực thể này trong bảng khác, ghi rõ cách lưu. Báo cáo vẫn trình bày theo ERD.
- Tên cột theo thuộc tính ERD (snake_case). Khoá chính trong code là `id INTEGER`; khoá ngoại là `<bảng số ít>_id` như hiện có.
- Ràng buộc ở mục 2.4.3c của bài (UNIQUE, "đúng một trong các FK", không sửa bản đã gửi…) phải được kiểm ở service hoặc bằng `CHECK`, và có test.

## ERD-01. Khách hàng và thông tin tương tác

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| ACCOUNT | `accounts` | Có | WP-01 | Thêm `tax_code`, `status`, `email`, `phone`; `employee_size` = `company_size` |
| CONTACT | `contacts` | Có | WP-01 | `account_id` = doanh nghiệp hiện hành (DEC-21) |
| AFFILIATION | `affiliations` | Mới | WP-01 | `contact_id`, `account_id`, `job_title`, `valid_from`, `valid_to`; tối đa một dòng đang hiệu lực mỗi người |
| LEAD | `leads` | Có | WP-01 | Thêm `topic`, `account_id`, `contact_id`, `deleted_at`, `merged_into_lead_id`. Cột `bant_*` chỉ là bản sao của đánh giá mới nhất trong `lead_assessments` |
| ASSESSMENT | `lead_assessments` | Mới | WP-03 | Kết quả đánh giá do NVKD xác nhận; `ai_result_id` trỏ tới đề xuất AI đã dùng (nếu có) |
| INTERACTION | `activities` + `email_messages` | Có | WP-01 (`activities`), WP-08 (`email_messages`) | Gộp: ghi chú, cuộc gọi, họp ở `activities`; email ở `email_messages`. `email_messages` thêm `status` DRAFT / APPROVED / SENT / FAILED, `content_snapshot` (nội dung được duyệt và gửi), `edited_by_human` (khác bản nháp của Agent trong `ai_suggestions`, dùng cho BR-26), `approved_at`, `direction`, `contact_id` |
| DOCUMENT | `documents` | Mới | WP-00 | Có phiên bản (`previous_version_id`, `version_no`, `checksum`); `signature_status` cho FR-55 |
| DOCUMENT_LINK | `document_links` | Mới | WP-00 | Đúng một FK đích (Lead, cơ hội, phiên bản báo giá, đơn, hoá đơn, tương tác) |
| TAG | `tags` | Mới | WP-01 | |
| LEAD_TAG | `lead_tags` | Mới | WP-01 | UNIQUE (`lead_id`, `tag_id`) |

## ERD-02. Phát triển cơ hội và kiểm soát giai đoạn

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| OPPORTUNITY | `opportunities` | Có | WP-03 | `name` = topic, `amount` = estimated_revenue, `close_date` = expected_close_date, `lead_id` = source_lead_id (UNIQUE khi có), `lost_reason` = close_reason (ghi chú). 4 cột xác nhận mục kiểm soát đã có. Thêm `budget`, `lost_reason_code` theo danh mục BR-27 |
| STAKEHOLDER | `stakeholders` | Có | WP-03 | UNIQUE (`opportunity_id`, `contact_id`, `role`); một người nhiều vai trò (BR-19) |
| OPPORTUNITY_ITEM | `opportunity_items` | Mới | WP-03 | Cấu hình dự kiến: sản phẩm, số lượng, license, kỳ hạn, đơn giá ước tính |
| COMPETITOR | `competitors` | Có | WP-03 | |
| OPP_COMPETITOR | `opportunity_competitors` | Có | WP-03 | Thêm `competing_solution`, `price_reference`, `strengths`, `weaknesses` |
| SOLUTION | `solutions` | Mới | WP-03 | `type` SCOPE (biên bản phạm vi) / INTERNAL (giải pháp nội bộ) / PROPOSAL (đề xuất gửi khách, WP-04 ghi); `version_no`, `status`, `confirmed_at` |
| RISK | `opportunity_risks` | Có | WP-03 | Trạng thái theo FR-43: OPEN / HANDLED / DONE / IGNORED, thêm `ignore_reason`, `ai_result_id` |
| STAGE_HISTORY | `opportunity_stage_history` | Mới | WP-03 | `from_stage`, `to_stage`, `gate_snapshot`, `changed_by`, `changed_at` |
| REVIEW | `approvals` | Có | WP-03 (mở rộng `kind`) | Gộp mọi loại duyệt: QUOTE_DISCOUNT, OPP_STAGE_GATE, EXPERT_REVIEW, MERGE. Không tạo `LEGAL_REVIEW` mới (DEC-16). Đúng một đích |

## ERD-03. Danh mục, bảng giá và phiên bản báo giá

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| PRODUCT | `products` | Có | WP-02 | `type` mở rộng thành PRODUCT / SERVICE / MODULE / PACKAGE; thêm `license_policy`; `active` = status |
| PRODUCT_COMPONENT | `product_components` | Mới | WP-02 | Thành phần của gói; không tự chứa, không chu trình |
| PRICE_LIST | `price_lists` | Có | WP-02 | Thêm `customer_segment`, `valid_from`, `valid_to` (BR-03, BR-22) |
| PRICE_ITEM | `price_list_items` | Có | WP-02 | Thêm `tax_pct` |
| SALES_POLICY | `settings` + `audit_log` | Gộp | WP-02 | Ngưỡng chiết khấu đọc từ `settings` (BR-05); lịch sử thay đổi ở `audit_log`; `approvals` lưu ngưỡng tại thời điểm duyệt |
| QUOTE | `quotes` | Có | WP-04 | Thành hồ sơ chung: `code`, `opportunity_id`, `account_id`. Các cột trạng thái, tổng tiền chuyển sang `quote_versions` |
| QUOTE_VERSION | `quote_versions` | Mới | WP-04 | DEC-22. UNIQUE (`quote_id`, `version_no`); bản đã gửi hoặc chấp thuận không sửa |
| QUOTE_LINE | `quote_lines` | Có | WP-04 | FK sang `quote_version_id`; thêm `license_count`, `term_months`, `tax_pct` |
| QUOTE_RESPONSE | `quote_responses` | Mới | WP-04 | Phản hồi gắn đúng phiên bản khách đã nhận |

## ERD-04. Đơn hàng, thanh toán và bàn giao

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| SALES_ORDER | `orders` | Có | WP-05 | `quote_id` → `source_quote_version_id` (UNIQUE, DEC-23); thêm `customer_snapshot`, `terms_snapshot`, `completed_at`. Trạng thái `CANCELLED` không dùng (DEC-18) |
| ORDER_LINE | `order_lines` | Có | WP-05 | Thêm `source_quote_line_id`, `license_count`, `term_months`, `tax_pct` |
| BILLING_MILESTONE | `billing_milestones` | Mới | WP-05 | Tổng các đợt = giá trị đơn (BR-11) |
| HANDOVER | `handovers` | Mới | WP-05 | Thay `fulfillment_tasks`; không cấp license (DEC-10) |
| HANDOVER_ITEM | `handover_items` | Mới | WP-05 | |
| INVOICE | `invoices` | Có | WP-06 | `milestone` (text) → `milestone_id`; `erp_ref` = external_invoice_id; thêm `external_system`, `customer_snapshot` |
| INVOICE_LINE | `invoice_lines` | Mới | WP-06 | |
| PAYMENT | `payments` | Có | WP-06 | Đổi: theo `account_id`, bỏ `invoice_id` bắt buộc; thêm `external_transaction_id`, `gateway_status`, `reconciliation_status` (DEC-23) |
| PAYMENT_ALLOCATION | `payment_allocations` | Mới | WP-06 | Tổng phân bổ không vượt khoản thanh toán và nghĩa vụ hoá đơn |
| PAYMENT_REQUEST | `payment_requests` | Mới | WP-06 | Chỉ dùng với cổng thanh toán giả lập (FR-70, Tùy chọn) |
| INVOICE_CHANGE | `invoice_change_requests` | Mới | WP-06 | FR-73 |
| SYNC_EVENT | `sync_events` | Mới | WP-10 | Kết quả đồng bộ với hệ thống kế toán |

## ERD-05. Vòng đời tác nhân AI và truy xuất căn cứ

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| AGENT | `agents` | Mới | WP-08 | 2 dòng cố định: QUALIFICATION, OPPORTUNITY |
| AGENT_CONFIG | `agent_configs` | Mới | WP-08 | **Nguồn chính** của prompt, model, tiêu chí, lịch, ngân sách (DEC-27). Cột: `agent_id`, `version_no`, `instructions`, `model_reference`, `criteria_snapshot`, `schedule_rule`, `budget_limit`, `status` DRAFT / ACTIVE / RETIRED, `eval_report_ref`, `eval_passed`, `configured_by`, `business_approved_by` (QLKD, khi đổi tiêu chí nghiệp vụ), `effective_at`. Mỗi Agent đúng một bản ACTIVE. Kích hoạt theo BR-25; rollback = kích hoạt lại bản cũ |
| AGENT_RUN | `ai_runs` | Có | WP-08 | Thêm `config_id`, `retry_of_run_id`, `idempotency_key`, `input_tokens`, `output_tokens`, `web_search_calls`, `latency_ms`, `cost` (tính theo BR-24, để trống khi chưa có đơn giá). Đúng một trong Lead hoặc cơ hội. Trạng thái FAILED kèm lý do, gồm cả "Quá thời gian" và "Hết ngân sách" (BR-23, BR-24) |
| AI_RESULT | `ai_suggestions` + `opportunity_research` | Có | WP-08 | Gộp: đề xuất của Qualification Agent ở `ai_suggestions`; bản nghiên cứu của Opportunity Agent ở `opportunity_research`. Cả hai thêm trạng thái **EDITED** (người sửa rồi mới dùng) và lưu bản gốc của Agent (`payload_json`, `summary`) nguyên vẹn để tính tỷ lệ sửa (BR-26) |
| AI_EVIDENCE | `ai_evidence` | Mới | WP-08 | Thay dần `evidence_json`, `sources_json`. Mỗi căn cứ có ít nhất email, tài liệu hoặc URL, và thời điểm lấy |
| AI_RULE_EVALUATION | `ai_rule_evaluations` | Mới | WP-08 | BR-28. Một dòng cho mỗi quy tắc OPP-R01..R10 đã áp cho một bản nghiên cứu: `rule_id`, `br_ref`, `ruleset_version`, `ruleset_hash`, `status`, `severity`, `raw_value`, `threshold`, `rationale`, `limitation`, `evidence_refs_json`, `required_action`, `human_gate`. `opportunity_research` thêm `ruleset_version`, `ruleset_hash`, `confidence`, `confidence_band`, `llm_importance` (giá trị LLM đề xuất, giữ để đối chiếu), `gates_json` |
| TOOL | `tools` | Mới | WP-08 | |
| TOOL_GRANT | `tool_grants` | Mới | WP-08 | Công cụ được cấp cho từng `agent_configs`; ADMIN cấp quyền dữ liệu (FR-92) |
| TOOL_CALL | `tool_calls` | Mới | WP-08 | Thay `ai_runs.tool_calls_json`. Cột `outcome` OK / ERROR / **DENIED** (bị chặn vì quyền, tách khỏi lỗi thường), `input_redacted`, `output_summary`, `duration_ms`, `authorization_snapshot`. Đầu vào và đầu ra đã che dữ liệu cá nhân, không bao giờ chứa khoá API (DEC-28) |
| AI_FEEDBACK | `ai_feedback` | Mới | WP-08 | FR-90 |

## ERD-06. Nhân sự, phân công và quyền truy cập

| Thực thể ERD | Bảng | Trạng thái | WP | Ghi chú |
|---|---|---|---|---|
| EMPLOYEE | `employees` | Mới | WP-07 | Hồ sơ nghiệp vụ, tách khỏi tài khoản |
| USER_ACCOUNT | `users` | Có | WP-00 | Thêm `employee_id` (UNIQUE), `password_hash`, `status` |
| ROLE, USER_ROLE | `users.role` + `src/lib/rbac.ts` | Gộp | WP-00 | Prototype: mỗi tài khoản một vai trò; ma trận quyền nằm trong code theo `ROLES.md`. Báo cáo trình bày theo ERD |
| TEAM | `teams` | Mới | WP-07 | Sale Pod |
| TEAM_MEMBER | `team_members` | Mới | WP-07 | Có `valid_from`, `valid_to` |
| ASSIGNMENT | `assignments` | Mới | WP-07 | Lịch sử phân công; `owner_id` trên `leads`, `opportunities` là người phụ trách hiện tại |
| WORK_ITEM | `tasks` | Có | WP-07 | Thêm `type` (việc, lịch hẹn), `due_at`, `outcome`, `opportunity_id`/`lead_id` |
| WORK_PARTICIPANT | `work_participants` | Mới | WP-07 | Mời tư vấn tham gia lịch hẹn |
| SALES_TARGET | `sales_targets` | Mới | WP-07 | Đúng một trong cá nhân hoặc nhóm |
| PERFORMANCE_REVIEW | `performance_reviews` | Mới | WP-07 | |
| AUDIT_EVENT | `audit_log` | Có | WP-00 | `actor_type` phân biệt người, AI, tích hợp |

## Bảng trong code không có trong ERD

| Bảng | Lý do giữ |
|---|---|
| `settings` | Siêu dữ liệu: giá trị BR (BUSINESS-RULES) |
| `notifications` | Thông báo trong ứng dụng; nhóm có thể bổ sung vào ERD nếu muốn |
| `integration_requests` | Sổ kỹ thuật idempotency cho webhook (hash đầu vào và kết quả, không lưu khóa API); không phải thực thể Sales mới. Migration `wp10_001`. |
| `fulfillment_tasks` | Bỏ dần, thay bằng `handovers`, `handover_items` (WP-05) |

## Phạm vi demo

ERD mục 2.4.3d tự ghi: không phải cài đủ 61 thực thể trong bản demo; ưu tiên Lead – cơ hội – 2 Agent – các cổng kiểm soát. Các bảng "Mới" của WP-05, WP-06, WP-07 làm theo thứ tự đợt trong `WORKPLAN.md`.
