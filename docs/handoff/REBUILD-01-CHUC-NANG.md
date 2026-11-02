# Bàn giao 01: làm lại chức năng Develop, Propose và 2 AI Agent

Người nhận: AI làm phần chức năng (service, quy tắc, Agent, dữ liệu, test). Phần giao diện do AI khác làm theo `REBUILD-02-GIAO-DIEN.md`.

Nguồn đã đọc ngày 03/11/2026:
- Google Doc nhóm `14TWLyAifD4ySm02MaJaglxEEy8ccxuRRC_6Lr-_IXpE`: tab **Test**, **Kế hoạch test**, **Task của Agent**, **Quy trình tóm gọn**; tab Bài làm chính mục 2.1.2, 2.1.3, 2.1.8.2, 2.1.8.3.
- `docs/handoff/BUGS.md` (BUG-046 đến BUG-054 ghi từ lần test tay case Tân Cảng Xanh 01–02/11).

## 0. Trước khi bắt đầu

- Nhánh `agentic/rule-governance` đang có khoảng 64 tệp chưa commit (tài liệu WP-11, màn hình Phê duyệt, duyệt chuyên môn, chống lặp phạm vi). Chỉ làm khi người dùng đã commit hoặc đã chỉ định nhánh xuất phát. Làm trên nhánh riêng.
- Đọc `AGENTS.md`, `CLAUDE.md`, `docs/requirements/` (REQUIREMENTS, BUSINESS-RULES, DECISIONS, ROLES, DATA-MODEL), skill `.claude/skills/sms-domain` và `sms-ai-agents`.
- Chạy test bằng `npm test` và `npm run check`. Không chạy `npx vitest run` trực tiếp: thiếu biến môi trường, test ghi vào `data/sms.db`.
- Web demo chạy với `SMS_DB_PATH=data/showcase.db`, `SMS_AI_MODE=mock`, `SMS_DEMO_LOGIN=true`, cổng 3100. Case đang test là OPP-2026-0004 (Công ty CP Logistics Tân Cảng Xanh); tệp mẫu ở `C:\Businesscase\Phieu-khao-sat-Tan-Cang-Xanh.docx`, `C:\Businesscase\Ho-so-ky-thuat-Tan-Cang-Xanh.docx`.
- Điều đã chốt, không đổi: không có Customer Portal; mô hình là OpenAI; Agent chỉ đề xuất, người có quyền xác nhận mới ghi vào hồ sơ; không sửa Google Doc và AOD.
- Phân chia tệp với AI giao diện: AI này sở hữu `src/lib/**`, các tệp `actions.ts`, migration, seed, `tests/**`. Không sửa bố cục trang. Dữ liệu mới cho giao diện thì xuất hàm service có kiểu rõ ràng và ghi vào mục 9.

## 1. Cần nhóm chốt trước, không tự quyết

| Mã | Vấn đề | Đang lệch |
|---|---|---|
| C1 | Vai trò duyệt chuyên môn | Tab Test và bài 2.1.8.2 Bước 3.3 có "Quản lý tư vấn giải pháp"; tab Test ghi "Phần chịu trách nhiệm này cần sửa lại theo SCD". Web có 6 vai trò (DEC-30), duyệt chuyên môn là Quản lý kinh doanh. (BUG-047) |
| C2 | Bước QLKD rà soát trước Propose | Bài 2.1.2 và 2.1.8.2 Bước 5.3 không có bước này; web chặn theo BR-06. Giữ như web cho tới khi nhóm sửa bài. (BUG-046) |
| C3 | Dashboard dòng tiền dự tính | Tab Test: "người có thẩm quyền mới xem được". Chưa rõ vai trò nào và tính từ dữ liệu nào (mục 7). |
| C4 | Thông tin không cho AI đọc | Tab Test: "rules thêm vào là không được đọc những cái thông tin …. (hoặc làm mờ trước khi cho AI chạy)". Danh sách trường đang để trống (mục 6). |
| C5 | Phản hồi của khách hàng | Bài 2.1.8.3 Bước 5 có câu "Khách hàng chỉ xem Proposal/Báo giá đã được phép công bố…", đọc như cổng khách hàng. Đã chốt không có Portal: NVKD ghi nhận phản hồi trên đúng phiên bản. |
| C6 | Tự duyệt | Quản lý kinh doanh tự gửi và tự duyệt cổng rà soát được (BUG-052). |

## 2. Sales Opportunity Agent theo luồng mới của Develop (2.1.8.2)

Bài chia Agent thành hai lần chạy. Hiện mọi lần chạy đều ghi `MANUAL_RUN`, không phân biệt mục đích.

**F1. Agent lần 1: nghiên cứu bối cảnh ban đầu (Bước 1.1)**
- Chạy khi cơ hội được tạo hoặc chuyển đổi từ Lead và đạt điều kiện nghiên cứu.
- Đọc Account, Contact, kết quả BANT, lịch sử tương tác (ghi chú cuộc gọi, email), chỉ số nhu cầu sơ bộ của SDR, thông tin công khai trên web.
- Bản nghiên cứu phải có 4 mục đúng tên trong bài: **Bối cảnh doanh nghiệp**, **Thông tin cơ hội** (chủ đề, nguồn, doanh thu ước tính, thời gian mua), **Kết quả BANT**, **Lịch sử tương tác** (vấn đề khách đã nêu, kết quả trao đổi, việc đang theo dõi); kèm **thông tin còn thiếu** để NVKD hỏi khách.
- Hiện `insights` trong `src/lib/agents/schemas.ts` có `account_overview, health, pain_need, product, stakeholder, competitor`, thiếu thông tin cơ hội, BANT, lịch sử tương tác. Thêm các mục này; mục nào không có nguồn thì `NO_INSIGHT` kèm lý do.
- Lưu loại lần chạy (lần 1 hoặc lần 2) trên bản nghiên cứu để giao diện ghi đúng.

**F2. Sau lần 1: xem nghiên cứu, hẹn lịch, phân công (Bước 1.2)**
- Tab Test: "Hệ thống chưa thể hiện được cái này". NVKD tạo lịch hẹn với khách (thời gian, hình thức, người tham dự) và phân công chuyên viên tư vấn giải pháp tham gia, trong cùng một thao tác hoặc hai thao tác liền nhau. Kiểm tra phần Hoạt động hiện có trước khi thêm bảng mới.

**F3. Khảo sát nhu cầu (Bước 2.1)**
- Tab Test: "Thiếu thông tin trong bảng tóm tắt". Nhu cầu khách hàng cần các ô riêng: mục tiêu kinh doanh, quy trình vận hành hiện tại, khó khăn đang gặp, nhu cầu sử dụng phần mềm, kết quả kỳ vọng. Giữ `customer_need` cũ để không mất dữ liệu.
- Chuyên viên tư vấn giải pháp ghi yêu cầu kỹ thuật (tích hợp, hạ tầng Cloud/On-premise, bảo mật, phân quyền) và đính kèm Biên bản khảo sát kỹ thuật.

**F4. Agent lần 2: phân tích sau khảo sát (Bước 2.2, 2.3, 3.1, 3.2, 4.1, 5.1, 5.2)**
- Chạy sau khi NVKD cập nhật khảo sát, tải tài liệu, hoặc đổi cấu hình sản phẩm (Bước 3.2: "Sau khi CRM cập nhật doanh thu").
- Đầu ra theo bài:
  - Nhu cầu chưa rõ, thông tin mâu thuẫn với kết quả Qualify, rủi ro có căn cứ (2.2).
  - Tổng hợp nhu cầu, quy mô, ràng buộc khách đã nêu trong họp và email để NVKD đối chiếu với biên bản phạm vi (2.3).
  - Product Insights: khả năng sản phẩm liên quan và giá trị cần nhấn mạnh (3.1).
  - Kiểm ngân sách (3.2), đủ 3 trường hợp: doanh thu ước tính vượt ngân sách thì gắn cờ, nêu căn cứ, khuyến nghị điều chỉnh mô-đun, số người dùng hoặc phạm vi; chưa có ngân sách thì ghi là thông tin còn thiếu; không có cờ thì ghi rõ "không thay thế việc NVKD tự kiểm tra".
  - Stakeholder Insights: người dùng trực tiếp, IT, mua hàng/pháp chế, người kiểm soát ngân sách, người quyết định cuối; vai trò Người ra quyết định, Người đánh giá kỹ thuật, Người mua kinh tế, Người ủng hộ, Người dùng cuối; cảnh báo giảm tương tác hoặc thiếu kết nối với người có ảnh hưởng lớn (4.1, 4.2).
  - Competitor Insights: tên đối thủ, thông tin công khai về sản phẩm, chiến lược giá, điểm mạnh/yếu, ngữ cảnh khách từng nhắc; lợi thế/bất lợi về tính năng, tích hợp, chi phí, thời gian triển khai, hỗ trợ; cảnh báo khi đối thủ có lợi thế (5.1, 5.2).
- Agent vẫn không được tự thêm đối thủ, bên liên quan, rủi ro hay tick checklist (đã có trong `catalog.ts`).
- Chế độ mock phải sinh nội dung đủ các mục trên từ dữ liệu OPP-2026-0004, để demo không toàn "Chưa có nhận định".

**F5. Căn cứ cho từng khuyến nghị**
- Tab Test: "đối với phương án đề xuất thì cần có evidence ứng với từng recommendation". Hiện `next_actions` chỉ có `{action, owner_role, why}`. Mỗi khuyến nghị cần `evidence_refs` (qua `validateEvidence`) và mã quy tắc sinh ra nó nếu có.

**F6. Kết quả nào cũng phải nói được vì sao**
- Tab Test: "Dựa trên rules nguồn ở đâu để cho ra được kết quả này". Mọi kết luận hiển thị (mức quan trọng, rủi ro, cờ ngân sách, khuyến nghị) phải truy được về quy tắc (OPP-R01..R10) và nguồn dữ liệu. Cung cấp dữ liệu này cho giao diện, không chỉ có trong bảng 10 quy tắc.

**F7. Thao tác trên kết quả quy tắc**
- Tab Test: hiện chỉ "xem rồi xác minh cập nhật". Yêu cầu:
  - **Cảnh báo (WARNING):** NVKD "ghi nhận và cho qua" kèm ghi chú; không chặn chuyển giai đoạn.
  - **Vi phạm (HIT):** NVKD chọn "gắn cờ" (bắt buộc lý do) hoặc "xử lý" (chuyển thành rủi ro hoặc việc cần làm, có người phụ trách).
- Lưu lựa chọn theo từng dòng `ai_rule_evaluations`, có người, thời điểm, ghi chú. Các vi phạm đã gắn cờ phải hiện cho Quản lý kinh doanh khi rà soát cổng BR-06.

## 3. Tài liệu và hồ sơ

- **F8.** Tab Test: "Kỹ thuật chưa có chỗ tải documents mô tả chi tiết phương án lên" và "Tải tài liệu hồ sơ đang còn bị thiếu nhiều". Chuyên viên tư vấn giải pháp tải tệp phương án ngay trong Hồ sơ kỹ thuật, tệp gắn với hồ sơ đó. Rà danh sách loại tài liệu theo các bước 2.1.8.2: biên bản khảo sát kỹ thuật, biên bản xác nhận phạm vi, hồ sơ giải pháp (kiến trúc, lộ trình), tài liệu đối thủ nếu có.
- **F9.** Tách rõ Develop và Propose (xem phân tích trong `BUGS.md` và hội thoại 02/11): sản phẩm trên cơ hội là **cấu hình dự kiến** để ước tính doanh thu; báo giá ở Propose mới có chiết khấu, thuế, hiệu lực, duyệt giá. "Hồ sơ kỹ thuật" là tài liệu nội bộ; "Bản đề xuất giải pháp" gửi khách là FR-50 (`src/lib/services/proposals.ts`). Không gộp hai thứ này.

## 4. Propose theo 2.1.8.3

- **P1.** Xuất trạng thái 6 bước cho giao diện, suy từ dữ liệu báo giá và bản đề xuất: (1) chốt cấu hình từ Develop, (2) báo giá nháp, (3) duyệt giá khi vượt hạn mức (HG7), (4) gửi và thương lượng, mỗi lần đổi là một phiên bản mới, (5) quyết định của khách: chấp thuận, từ chối, yêu cầu điều chỉnh, (6) xác nhận chi tiết mua hàng, sẵn sàng sang Close.
- **P2.** Phản hồi khách do NVKD ghi trên đúng phiên bản (C5): người phản hồi, thời điểm, nội dung. Báo giá hết hạn, bị thay thế hoặc thu hồi không nhận chấp thuận mới. Kiểm lại phần đã có trước khi thêm.

## 5. Sales Qualification Agent

Tab Test: "Sales Qualification Agent mình chưa thấy cái này luôn", "Chưa thể hiện được lý do chấm điểm như vậy và lộ trình AI agent chạy", "Chưa thể hiện rõ được rule của BANT", "phần đề xuất mail cho người dùng mình chưa thấy".
- **Q1.** Thang BANT của nhóm (tab Kế hoạch test): mỗi tiêu chí 0–25, tổng 100; đạt khi tổng ≥ 60 **và** đã xác định người quyết định. Mức 0 không có thông tin; 8 ngân sách nói đến chưa rõ số, mới gặp người dùng cuối, nhu cầu chung chung, mua năm sau; 15 có khoảng ngân sách, gặp người có ảnh hưởng, vấn đề cụ thể, mua trong năm; 25 ngân sách đã duyệt, gặp đúng người quyết định, rõ vấn đề và phạm vi, mua trong tháng hoặc cuối quý. Đối chiếu với `bant_threshold` và quy tắc hiện có; mỗi tiêu chí cần điểm, mức, lý do, căn cứ.
- **Q2.** Lộ trình chạy: danh sách công cụ đã gọi, dữ liệu đã đọc, kết quả kiểm quy tắc, để giao diện vẽ.
- **Q3.** Email nháp: phải thấy được ở Lead, đi qua duyệt (HG1) trước khi gửi.
- **Q4.** Tab Test: "Test nhập địa chỉ này nó chưa có biết để xác thực địa chỉ". Thêm kiểm tra địa chỉ khi nhập Lead/Account (định dạng tối thiểu, tỉnh/thành hợp lệ); không gọi dịch vụ ngoài khi chưa được duyệt.

## 6. Bảo vệ dữ liệu trước khi gửi cho OpenAI (C4)

- Lớp che hoặc loại bỏ trường nhạy cảm ngay trước khi gửi nội dung cho nhà cung cấp mô hình, áp cho cả hai Agent và phần đọc tài liệu. DEC-28 hiện mới che `tool_calls`.
- Danh sách trường chờ nhóm chốt. Đề xuất mặc định để hỏi: số điện thoại, email cá nhân, mã số thuế, số tài khoản ngân hàng, số giấy tờ tùy thân.
- Có test chứng minh nội dung gửi đi không chứa giá trị gốc.

## 7. Dashboard dòng tiền dự tính (C3)

- Dòng tiền vào dự kiến theo tháng: hóa đơn chưa thu theo hạn thanh toán, lịch lập hóa đơn (FR-65), đơn hàng chưa lập hóa đơn. Pipeline có trọng số nếu đưa vào thì tách riêng, ghi rõ là ước tính.
- Quyền mới trong `rbac.ts`, chỉ vai trò được nhóm chốt xem được, kiểm ở server.

## 8. Việc còn lại

- **ERD:** tab Test ghi "ERD và web có khác biệt về tên trường, cách lưu đối thủ, giải pháp và dữ liệu AI"; ERD đang rà bản 37 thực thể (đang ở cụm Phát triển cơ hội). Lập bảng khác biệt giữa `docs/requirements/DATA-MODEL.md` và schema; không đổi tên cột khi nhóm chưa chốt ERD.
- **Chất lượng AI thật:** tab Test: "Web đang dùng mock để minh họa, chưa chứng minh chất lượng nghiên cứu của AI". Liên quan BUG-012, BUG-013, BUG-044. Chạy OpenAI thật chỉ khi người dùng đồng ý chi phí (BR-24).
- **Case xuyên suốt:** tab Test: "Case xuyên suốt bài chưa có hợp lí". Dựng dữ liệu mẫu một case đi đủ 5 quy trình (Lead, cơ hội, báo giá, đơn hàng, hóa đơn) khớp với tài liệu mẫu Tân Cảng Xanh.
- **Lỗi đang mở:** BUG-049, 050, 051, 052, 053, 054, 042, 039.


### 8.1. Bảng khác biệt đang chờ chốt ERD

Đối chiếu DATA-MODEL.md bản 61 thực thể ngày 22/10 với schema hiện tại; không coi đây là bản ERD 37 thực thể đã được duyệt. Không đổi tên cột.

| Thực thể | Bảng thực tế | Khác biệt | Cần nhóm chốt |
|---|---|---|---|
| ACCOUNT | `accounts` | ERD company_size được lưu bằng employee_size; PK thực tế là id. | Chốt tên và miền giá trị quy mô. |
| CONTACT | `contacts`, `affiliations` | Chức danh hiện hành là contacts.title; lịch sử chức danh ở affiliations.job_title. AFFILIATION còn trong DATA-MODEL cũ. | Chốt có giữ lịch sử công tác và tên job_title hay không. |
| ASSESSMENT | `lead_assessments`, `ai_suggestions` | BANT người xác nhận ở lead_assessments, đề xuất AI ở ai_suggestions; chưa có ai_result_id trực tiếp trên assessment. | Chốt liên kết đánh giá–đề xuất AI, không coi hai loại kết quả là một. |
| INTERACTION | `activities`, `email_messages` | Lưu tương tác theo entity_type/entity_id; email có thêm trạng thái duyệt/gửi, khác các FK lead/opportunity/quote trên hình. | Chốt mô hình liên kết đa hình hay các FK riêng. |
| DOCUMENT_LINK | `documents`, `document_links` | Đích bằng entity_type/entity_id, không phải đúng một trong nhiều FK như DATA-MODEL; mới thêm solution_id làm ngữ cảnh hồ sơ kỹ thuật dưới cùng cơ hội. | Chốt ràng buộc đích tài liệu và mô hình trong ERD mới. |
| OPPORTUNITY | `opportunities` | lead_id/amount/close_date khác source_lead_id/estimated_revenue/expected_close_date; bổ sung năm trường khảo sát và bốn yêu cầu kỹ thuật. | Chốt tên cột theo ERD sau khi nhóm duyệt. |
| OPPORTUNITY_ITEM | `opportunity_items` | quantity/duration_months/unit_price/amount là cấu hình dự kiến; còn cột discount_pct lịch sử nhưng không cho áp chiết khấu mới ở Develop. | Chốt kỳ hạn/license và có bỏ cột chiết khấu cũ trong đợt sau hay không. |
| OPP_COMPETITOR | `competitors`, `opportunity_competitors` | Code dùng danh mục đối thủ chung và liên kết; hình mới có competitor_name trực tiếp, không thống nhất DATA-MODEL cũ. | Chốt lưu tên trực tiếp hay chuẩn hóa danh mục. |
| SOLUTION | `solutions`, `scope_documents`, `proposals` | Code tách biên bản phạm vi, hồ sơ kỹ thuật và bản đề xuất gửi khách; DATA-MODEL cũ mô tả cùng solutions theo type/version. | Chốt ERD phản ánh ba trách nhiệm và số lượng hồ sơ cho một cơ hội. |
| RISK | `opportunity_risks` | severity/resolution/dismiss_reason và người phụ trách; hình dùng priority/handling_note; không tự gộp/xóa các rủi ro lịch sử. | Chốt tên, trạng thái và trách nhiệm xử lý. |
| AI_RESULT | `ai_runs`, `ai_suggestions`, `opportunity_research`, `ai_rule_evaluations`, `ai_evidence` | Kết quả Agent phân thành lần chạy, đề xuất, nghiên cứu, đánh giá quy tắc và nguồn; có phase/human_action thay cho một bảng kết quả chung. | Chốt mức chi tiết cần trình bày trong bản ERD 37 thực thể. |
| QUOTE / ORDER / INVOICE | `quotes`, `quote_versions`, `quote_responses`, `orders`, `billing_milestones`, `invoices` | Phản hồi và đơn liên kết đúng phiên bản báo giá; lịch lập hóa đơn tách khỏi thanh toán thực tế. | Chốt ERD có phiên bản, phản hồi, lịch lập hóa đơn và đối soát. |

## 9. Hàm cung cấp cho AI giao diện

Ghi tên hàm, tệp và kiểu trả về vào đây khi làm xong, để AI giao diện dùng.

| Dữ liệu | Hàm đề xuất | Trạng thái |
|---|---|---|
| Các bước Develop và trạng thái từng bước | `opportunityFlow(o, user?)` — `src/lib/services/sales-flow.ts`, trả `ProcessFlow` (9 bước, nextStepId/nextAction) | có; truyền Opportunity đã kiểm scope hoặc truyền user |
| Các bước Propose | `proposeFlow(o, user?)` — `src/lib/services/sales-flow.ts`, trả `ProcessFlow` (6 bước) | có; trạng thái suy từ dữ liệu, không ghi hồ sơ |
| Bản nghiên cứu theo tên mục trong bài, loại lần chạy | `researchView(researchId, user)` — `src/lib/services/sales-flow.ts`, trả `ResearchView` | có; 10 mục, INITIAL/POST_SURVEY/LEGACY, sources, missingInfo, recommendations, evaluations |
| Kết quả quy tắc kèm thao tác đã chọn | `ruleEvaluationsOf(researchId)` — `src/lib/services/opportunities.ts`; `actOnRuleEvaluation(actor,id,input)` — `research-actions.ts` | có; human_action/by/time/note, linked risk/task; xử lý chỉ người có quyền |
| Điểm BANT từng tiêu chí, lý do, căn cứ | `bantBreakdown(leadId,user)` — `src/lib/services/sales-flow.ts`, trả `BantBreakdown` | có; phân biệt đề xuất và hồ sơ đã áp dụng, đánh dấu điểm lịch sử ngoài thang |
| Lộ trình một lần chạy Agent | `runForWorkflow(runId,user?)` trong `src/lib/services/ai-review.ts`, trả `AgentWorkflow` | có; trace công cụ theo thứ tự, kết quả/nguồn quy tắc, model, phase; truyền user hoặc dùng ID đã kiểm quyền |
| Dòng tiền dự tính | `cashflowForecast(user)` — `src/lib/services/cashflow.ts`, trả `CashflowForecast` | có; months/undated/total, ba nguồn không đếm trùng; permission `report.cashflow`, mặc định khóa, cấu hình `SMS_CASHFLOW_ROLES` sau khi nhóm chốt C3 |
| Trạng thái cổng QLKD rà soát | `stageGateStatus(o)` trong `approvals.ts` | đã có |
| Khảo sát và lịch hẹn | `discoverySurvey(id)`, `updateDiscoverySurvey(actor,id,input)`, `updateTechnicalSurvey(actor,id,input)`, `createDiscoveryAppointment(actor,id,input)` trong `src/lib/services/discovery.ts` | có; kiểu `SurveyUpdate`, `TechnicalUpdate`, `DiscoveryAppointmentInput`; actions tương ứng `saveDiscoverySurveyAction`, `createDiscoveryAppointmentAction` |
| Tài liệu theo hồ sơ kỹ thuật | `saveOpportunityDocument(actor,oppId,file,{kind,solutionId})`, `listOpportunityDocuments(oppId)` trong `src/lib/services/documents.ts` | có; `DocumentKind`, trả `number` / `OpportunityDocument[]` thêm document_kind, solution_id |
| Email nháp tại Lead | `leadEmailDrafts(leadId,user)` trong `src/lib/services/ai-review.ts` | có; id/status/payload_json/reviewed_at/review_note/delivery_status/sent_at; duyệt vẫn qua approveSuggestion (HG1) |
| Kiểm tra địa chỉ offline | `validateVietnamAddress(raw)` trong `src/lib/services/address-validation.ts` | có; valid/normalized/province/reason; danh mục 34 tỉnh hiện hành; không xác minh vị trí thực tế |
| Phản hồi khách theo phiên bản | `recordCustomerFeedback(actor,versionId,input)` — `src/lib/services/quotes.ts` | có; input responseType/respondentName hoặc contactId/respondedAt/content; trả id/versionId/respondentName/respondedAt/content. `recordCustomerResponseAction` nhận thêm respondent_name/contact_id/responded_at. Giao diện cần bổ sung các ô này. |
| Tệp kỹ thuật cũ chờ xác nhận | `pendingSolutionExtraction(oppId)`, `applySolutionExtraction(actor,id,values,choice?)` — `documents.ts` | có; thêm requiresChoice/existingSolutionIds; choice `{action:'SKIP'}` hoặc `{action:'REPLACE',solutionId}`; không tạo chồng hồ sơ lập tay |
| Báo giá từ cấu hình Develop | `createQuoteFromConfiguration(actor,oppId,options?)` — `src/lib/services/quotes.ts` | có; trả `{quoteId:number,versionId:number}`; lấy số lượng/kỳ hạn dự kiến, định giá lại theo bảng giá hiện hành, không mang chiết khấu Develop sang; `createQuoteAction` tại cơ hội đã dùng hàm này |
| Bảng khác biệt ERD/schema | `schemaErDifferences()` — `src/lib/services/schema-comparison.ts` | có; trả `SchemaDifference[]`, gồm entity/tables/currentColumns/difference/decisionNeeded; chỉ đọc, không đổi tên cột |

Đường dẫn trao đổi giao diện: các action mới ở `src/app/(app)/opportunities/actions.ts`; uploadDocumentAction nhận thêm document_kind và solution_id; applySolutionExtractionAction nhận solution_choice (`SKIP`/`REPLACE`) và solution_id. Khảo sát thay đổi sẽ đưa phạm vi về nháp, bỏ xác nhận giải pháp và kết quả duyệt chuyên môn cũ để rà lại.

C4: lớp `src/lib/llm/privacy.ts` đặt ngay trước payload OpenAI, dùng danh sách bảo vệ tạm thời, cho bổ sung bằng `SMS_AI_PRIVATE_FIELDS`. Che trường có cấu trúc và mẫu email/điện thoại/định danh có nhãn trong văn bản; không cam kết nhận diện mọi PII tự do. Danh sách cuối cùng vẫn chờ nhóm chốt. C6: `SMS_ALLOW_STAGE_SELF_APPROVAL=false` chặn tự duyệt; mặc định giữ hành vi hiện hữu chờ quyết định.

Lưu ý Q1: đề bài này yêu cầu xác định người quyết định (Authority=25), chặt hơn câu Authority>0 còn trong DEC-31. Backend mới theo Q1; không tự sửa tài liệu yêu cầu. Điểm lịch sử giữ nguyên, muốn chuyển đổi phải đánh giá lại đúng thang.

## 10. Nghiệm thu

- `npm run check` xanh; mỗi mục F, P, Q có test, test tên bắt đầu bằng mã FR liên quan.
- Đi lại tay case OPP-2026-0004 từ Agent lần 1 tới Close, ghi kết quả vào `BUGS.md` nếu gặp lỗi.
- Không tick lỗi trong `BUGS.md` khi chưa gộp code.

## 11. Báo cáo nhánh rebuild/chuc-nang (03/11/2026)

Thư mục làm việc: `D:\Năm 3\System Architecture\sms-chuc-nang`, worktree từ commit `dbc0518` của `sms-sales-system`. Không sửa component, page, layout, CSS, Google Doc hoặc tên cột theo ERD. Mục 9 là hợp đồng cho nhánh giao diện; các tính năng chưa có ô/nút tương ứng trên giao diện cũ cần AI giao diện nối vào.

| Mã | Kết quả | Tệp chính | Test |
|---|---|---|---|
| F1 | Có hai phase, bốn mục ban đầu, thông tin thiếu và căn cứ | agents/research-context.ts, runtime.ts, schemas.ts | rebuild-agent.test.ts: FR-36 F1 |
| F4 | Sau khảo sát/tài liệu/cấu hình, debounce rồi POST_SURVEY; mock đủ mười mục, đối chiếu Qualify, ba trường hợp ngân sách | agents/mock.ts, triggers.ts | rebuild-agent.test.ts: FR-44 F4; review-events.test.ts |
| F5, F6 | Khuyến nghị có nguồn riêng được kiểm tra, mã rule, dữ liệu và giải thích | agents/tools.ts, evidence.ts, rules.ts | rebuild-agent.test.ts: FR-44 F5 F6 |
| F7 | WARNING ghi nhận; HIT gắn cờ hoặc chuyển risk/task có người phụ trách; cờ tới BR-06 | services/research-actions.ts | rebuild-agent.test.ts: FR-43 F7 |
| F2 | Lịch hẹn dùng tasks/work_participants, có thời gian/hình thức/khách/tư vấn | services/discovery.ts | rebuild-discovery.test.ts: FR-83 F2 |
| F3 | Năm trường khảo sát và bốn trường kỹ thuật; giữ customer_need; thay đổi làm mất xác nhận cũ | services/discovery.ts | rebuild-discovery.test.ts: FR-37 FR-41 F3 |
| F8 | Tải Word/PDF theo loại, gắn đúng hồ sơ kỹ thuật, chặn gắn nhầm cơ hội | services/documents.ts | rebuild-discovery.test.ts: FR-41 F8 |
| F9 | Develop không áp chiết khấu mới; tạo báo giá từ cấu hình, định giá lại theo bảng giá; hồ sơ nội bộ tách proposal gửi khách | services/opportunities.ts, quotes.ts, proposals.ts | rebuild-bugs.test.ts; rebuild-actions.test.ts |
| P1 | Sáu bước Propose suy từ phiên bản báo giá, proposal và phản hồi; bản mới cần proposal đúng phiên bản | services/sales-flow.ts | rebuild-feedback-privacy.test.ts: FR-50 P1; rebuild-journey.test.ts |
| P2 | Ghi người/thời điểm/nội dung theo đúng phiên bản; chặn chấp thuận hết hạn/thay thế | services/quotes.ts | rebuild-feedback-privacy.test.ts: FR-54 P2 |
| Q1 | BANT 0/8/15/25; tổng đạt ngưỡng và Authority=25; lý do/căn cứ từng tiêu chí; Agent không ghi điểm chính thức | bant-policy.ts, qualification.ts, agents/tools.ts | rebuild-qualification.test.ts: FR-32 Q1 |
| Q2, Q3 | Trace công cụ và kết quả rule; email nháp tại Lead; HG1 mới gửi | services/ai-review.ts | rebuild-qualification.test.ts: FR-19 FR-32 Q2 Q3 |
| Q4 | Kiểm địa chỉ tối thiểu và tỉnh/thành offline khi ghi Lead/Account và xem trước nhập tệp | services/address-validation.ts | rebuild-qualification.test.ts: FR-08 FR-11 Q4 |
| Mục 6 / C4 | Có lớp che trước payload OpenAI, test bằng fetch giả; danh sách cuối chờ chốt, regex không chứng minh loại bỏ mọi PII tự do | llm/privacy.ts, openai.ts | rebuild-feedback-privacy.test.ts: FR-06 FR-36 C4 |
| Mục 7 / C3 | Có forecast hóa đơn/lịch/đơn chưa lập hóa đơn, không đếm trùng; khóa quyền mặc định; ngoại tệ không cộng vào VND | services/cashflow.ts, rbac.ts | rebuild-cashflow.test.ts: FR-65 FR-99 C3 |
| Mục 8 / ERD | Có bảng đối chiếu 8.1 và hàm đọc schema, không đổi tên cột | services/schema-comparison.ts | rebuild-schema.test.ts |
| Mục 8 / case, migration | Seed Tân Cảng Xanh ở Develop; test đi tới bàn giao/thu tiền, seed không ghi đè nội dung người dùng/mật khẩu/tham số đã sửa | db/seeds/rebuild-tan-cang.ts, wp00.ts | rebuild-journey.test.ts, rebuild-migrations.test.ts |
| BUG-042, 049–051, 053–055 | Đã sửa code/test, ghi chú chưa gộp, không tick | services/assignment-team.ts, approvals.ts, documents.ts | rebuild-team.test.ts, rebuild-bugs.test.ts, wp11-documents.test.ts, rebuild-actions.test.ts |
| BUG-052 / C6 | Có cờ chặn tự duyệt và test; chưa tự đổi chính sách | rebuild-policy.ts, approvals.ts | rebuild-bugs.test.ts: FR-46 BUG-052 |
| BUG-039, chất lượng AI thật | Chưa nghiệm thu volume Render hoặc AI thật; ngoài kiểm tra mock/local được cho phép | Không deploy, không gọi OpenAI thật | Không coi unit test là bằng chứng chất lượng AI thật |

Kết quả kiểm tra:
- `npm install` đã chạy; `npm test` và `npm run check` xanh: **268 test / 30 tệp test**; typecheck và lint xanh.
- DB mới `data/codex.db`: có OPP-2026-0004, Develop, ngân sách 700 triệu; `integrity_check=ok`, không lỗi FK.
- Bản sao DB cũ `data/migration-legacy.db` lấy snapshot SQLite từ showcase.db: chạy đủ ba migration mới; 4 cơ hội trước/sau, giữ bant_threshold, số lỗi FK trước/sau đều 0, `integrity_check=ok`. Không sửa DB nguồn.
- Ca xuyên suốt trong test dùng service của người dùng để xác nhận nghiên cứu, hẹn khảo sát, ghi khảo sát, chốt phạm vi/giải pháp, duyệt chuyên môn và BR-06, lập/gửi/chấp thuận báo giá, tạo đơn, lập/phát hành/thu hóa đơn và chấp nhận bàn giao. Không biến thao tác người dùng thành quyền tự quyết của Agent.
- Web thực cổng **3101**, SMS_DB_PATH=data/codex.db, SMS_AI_MODE=mock, SMS_DEMO_LOGIN=true, SESSION_SECRET ngẫu nhiên 64 hex: đăng nhập demo Nguyễn Văn An và POST form Chạy Opportunity Agent thành công. DB lưu INITIAL/PENDING_REVIEW, model mock, bốn checklist vẫn 0, stage Develop, rủi ro nghiệp vụ 0.
- Chưa đi tay toàn bộ luồng trên giao diện mới: nhánh giao diện cần nối các trường khảo sát, xử lý quy tắc và phản hồi khách trong mục 9. Test xuyên suốt service không thay thế bước nghiệm thu giao diện này.
- Dữ liệu người liên hệ/người quyết định trong seed là giả lập có nhãn rõ; dữ kiện 100 người dùng, 12 tháng, 700 triệu, 20 man-day, 2 buổi đào tạo, Cloud, ERP qua API lấy từ hai DOCX mẫu. Các rủi ro trùng lịch sử không tự xóa; bản mới không thêm trùng.
- Next.js CLI phát cảnh báo bảo mật phiên bản 16.4.0 khi khởi động. Không nâng phụ thuộc trong nhánh này vì nằm ngoài ranh giới tệp được giao.

Cần nhóm chốt:
1. C1: giữ Quản lý kinh doanh duyệt chuyên môn hay bổ sung vai trò Quản lý tư vấn giải pháp? Hiện dùng hằng số expertReviewerRole trong rebuild-policy.ts, giữ DEC-30.
2. C2 và BUG-048: đồng bộ bài với BR-06 và điều kiện BR-07 như thế nào? Backend giữ cổng hiện tại, không tự khóa thứ tự các bước theo mô tả cũ.
3. C3: những vai trò nào được xem dòng tiền? Chỉ mở SMS_CASHFLOW_ROLES sau khi chốt.
4. C4: danh sách thông tin nào tuyệt đối không gửi mô hình? Danh sách hiện tại là bảo vệ tạm thời, không coi là chính sách đã duyệt.
5. C6: có cho tự duyệt HG6 không? SMS_ALLOW_STAGE_SELF_APPROVAL=false chặn; mặc định chưa thay đổi hành vi hiện hữu.
6. Q1: cần đồng bộ câu Authority>0 trong DEC-31/BR-01 với yêu cầu xác định người quyết định (Authority=25) trong đề bài này. Không sửa tài liệu nguồn.

C5 đã thực hiện theo chốt: không Customer Portal, NVKD ghi phản hồi của khách trên đúng phiên bản báo giá.
