import {all} from '../db';
export type SchemaDifference={entity:string;tables:string[];currentColumns:Record<string,string[]>;difference:string;decisionNeeded:string};
/** Read-only comparison with DATA-MODEL.md (61-entity source, 22/10), not a claim
 * that the newer 37-entity ERD is approved. Never rename schema from this report. */
export function schemaErDifferences():SchemaDifference[]{
 const rows=[
  ['ACCOUNT',['accounts'],'ERD company_size được lưu bằng employee_size; PK thực tế là id.','Chốt tên và miền giá trị quy mô.'],
  ['CONTACT',['contacts','affiliations'],'Chức danh hiện hành là contacts.title; lịch sử chức danh ở affiliations.job_title. AFFILIATION còn trong DATA-MODEL cũ.','Chốt có giữ lịch sử công tác và tên job_title hay không.'],
  ['ASSESSMENT',['lead_assessments','ai_suggestions'],'BANT người xác nhận ở lead_assessments, đề xuất AI ở ai_suggestions; chưa có ai_result_id trực tiếp trên assessment.','Chốt liên kết đánh giá–đề xuất AI, không coi hai loại kết quả là một.'],
  ['INTERACTION',['activities','email_messages'],'Lưu tương tác theo entity_type/entity_id; email có thêm trạng thái duyệt/gửi, khác các FK lead/opportunity/quote trên hình.','Chốt mô hình liên kết đa hình hay các FK riêng.'],
  ['DOCUMENT_LINK',['documents','document_links'],'Đích bằng entity_type/entity_id, không phải đúng một trong nhiều FK như DATA-MODEL; mới thêm solution_id làm ngữ cảnh hồ sơ kỹ thuật dưới cùng cơ hội.','Chốt ràng buộc đích tài liệu và mô hình trong ERD mới.'],
  ['OPPORTUNITY',['opportunities'],'lead_id/amount/close_date khác source_lead_id/estimated_revenue/expected_close_date; bổ sung năm trường khảo sát và bốn yêu cầu kỹ thuật.','Chốt tên cột theo ERD sau khi nhóm duyệt.'],
  ['OPPORTUNITY_ITEM',['opportunity_items'],'quantity/duration_months/unit_price/amount là cấu hình dự kiến; còn cột discount_pct lịch sử nhưng không cho áp chiết khấu mới ở Develop.','Chốt kỳ hạn/license và có bỏ cột chiết khấu cũ trong đợt sau hay không.'],
  ['OPP_COMPETITOR',['competitors','opportunity_competitors'],'Code dùng danh mục đối thủ chung và liên kết; hình mới có competitor_name trực tiếp, không thống nhất DATA-MODEL cũ.','Chốt lưu tên trực tiếp hay chuẩn hóa danh mục.'],
  ['SOLUTION',['solutions','scope_documents','proposals'],'Code tách biên bản phạm vi, hồ sơ kỹ thuật và bản đề xuất gửi khách; DATA-MODEL cũ mô tả cùng solutions theo type/version.','Chốt ERD phản ánh ba trách nhiệm và số lượng hồ sơ cho một cơ hội.'],
  ['RISK',['opportunity_risks'],'severity/resolution/dismiss_reason và người phụ trách; hình dùng priority/handling_note; không tự gộp/xóa các rủi ro lịch sử.','Chốt tên, trạng thái và trách nhiệm xử lý.'],
  ['AI_RESULT',['ai_runs','ai_suggestions','opportunity_research','ai_rule_evaluations','ai_evidence'],'Kết quả Agent phân thành lần chạy, đề xuất, nghiên cứu, đánh giá quy tắc và nguồn; có phase/human_action thay cho một bảng kết quả chung.','Chốt mức chi tiết cần trình bày trong bản ERD 37 thực thể.'],
  ['QUOTE / ORDER / INVOICE',['quotes','quote_versions','quote_responses','orders','billing_milestones','invoices'],'Phản hồi và đơn liên kết đúng phiên bản báo giá; lịch lập hóa đơn tách khỏi thanh toán thực tế.','Chốt ERD có phiên bản, phản hồi, lịch lập hóa đơn và đối soát.'],
 ] as const;
 return rows.map(([entity,tables,difference,decisionNeeded])=>({entity,tables:[...tables],difference,decisionNeeded,currentColumns:Object.fromEntries(tables.map(table=>[table,all<{name:string}>(`PRAGMA table_info(${table})`).map(c=>c.name)]))}));
}
