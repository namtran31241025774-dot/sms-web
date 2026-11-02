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

C4: lớp `src/lib/llm/privacy.ts` đặt ngay trước payload OpenAI, dùng danh sách bảo vệ tạm thời, cho bổ sung bằng `SMS_AI_PRIVATE_FIELDS`. Che trường có cấu trúc và mẫu email/điện thoại/định danh có nhãn trong văn bản; không cam kết nhận diện mọi PII tự do. Danh sách cuối cùng vẫn chờ nhóm chốt. C6: `SMS_ALLOW_STAGE_SELF_APPROVAL=false` chặn tự duyệt; mặc định giữ hành vi hiện hữu chờ quyết định.

Lưu ý Q1: đề bài này yêu cầu xác định người quyết định (Authority=25), chặt hơn câu Authority>0 còn trong DEC-31. Backend mới theo Q1; không tự sửa tài liệu yêu cầu. Điểm lịch sử giữ nguyên, muốn chuyển đổi phải đánh giá lại đúng thang.

## 10. Nghiệm thu

- `npm run check` xanh; mỗi mục F, P, Q có test, test tên bắt đầu bằng mã FR liên quan.
- Đi lại tay case OPP-2026-0004 từ Agent lần 1 tới Close, ghi kết quả vào `BUGS.md` nếu gặp lỗi.
- Không tick lỗi trong `BUGS.md` khi chưa gộp code.
