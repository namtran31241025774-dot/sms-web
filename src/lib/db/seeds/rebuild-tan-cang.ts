import type {DatabaseSync} from 'node:sqlite';
/** Demo only. Business facts: the two Tan Cang survey/technical DOCX files.
 * Contact identity and stakeholders below are explicitly simulated, not facts from those files.
 * Never overwrite an existing case or the user's edited business records. */
export function seedTanCang(db:DatabaseSync){
 if(db.prepare("SELECT id FROM opportunities WHERE code='OPP-2026-0004'").get()) return;
 const user=(email:string)=>(db.prepare('SELECT id FROM users WHERE email=?').get(email) as {id:number}|undefined)?.id;
 const sales=user('an.nguyen@sms.local'),presales=user('chau.le@sms.local');
 const price=(db.prepare('SELECT id FROM price_lists ORDER BY id LIMIT 1').get() as {id:number}|undefined)?.id;
 if(!sales||!presales||!price) return;
 const insert=(sql:string,...p:(string|number|null)[])=>Number(db.prepare(sql).run(...p).lastInsertRowid);
 const account=insert("INSERT INTO accounts(name,name_norm,industry,address,owner_id) VALUES ('Công ty CP Logistics Tân Cảng Xanh','logistics tan cang xanh','Logistics','TP. Hồ Chí Minh',?)",sales);
 const contact=insert("INSERT INTO contacts(account_id,full_name,title,email,phone) VALUES (?,'Người quyết định (liên hệ giả lập)','Người quyết định — dữ liệu demo','contact@tancangxanh.example','0900000004')",account);
 const need='Quản lý bằng Excel, khó theo dõi báo giá và công nợ; cần CRM tập trung cho 100 nhân viên bán hàng.';
 const lead=insert("INSERT INTO leads(company_name,company_norm,contact_name,email,phone,notes,source,status,owner_id,account_id,contact_id,bant_budget,bant_authority,bant_need,bant_timeline,bant_score) VALUES ('Công ty CP Logistics Tân Cảng Xanh','logistics tan cang xanh','Người liên hệ giả lập','contact@tancangxanh.example','0900000004',?,'DEMO','CONVERTED',?,?,?,15,25,25,8,73)",`${need} Ngân sách dự kiến 700 triệu. Kỳ hạn 12 tháng, triển khai quý 1/2027. Demo giả định đã xác định người quyết định, cần xác minh khi dùng dữ liệu thực.`,sales,account,contact);
 insert("INSERT INTO lead_assessments(lead_id,business_problem,bant_budget,bant_authority,bant_need,bant_timeline,bant_score,timeline_frame,rating,assessed_by,status,notes) VALUES (?,?,15,25,25,8,73,'NEXT_YEAR','WARM',?,'CONFIRMED','Dữ liệu giả lập: thẩm quyền được xác nhận trong kịch bản, không có tên người quyết định trong tệp mẫu')",lead,need,sales);
 const opp=insert("INSERT INTO opportunities(code,name,lead_id,account_id,primary_contact_id,owner_id,presales_id,stage,amount,budget,customer_need,price_list_id,close_date,business_goals,current_process,pain_points,software_needs,expected_outcomes,technical_integration,technical_infrastructure,technical_security,technical_access) VALUES ('OPP-2026-0004','CRM cho 100 nhân viên Tân Cảng Xanh',?,?,?,?,?,'DEVELOP',696000000,700000000,?,?, '2027-03-31', 'Quản lý bán hàng tập trung','Quản lý bằng Excel','Khó theo dõi báo giá và công nợ','Sales Cloud Professional cho 100 người dùng, 12 tháng','Theo dõi tập trung báo giá và công nợ','Kết nối ERP kế toán qua API','Cloud, Web SaaS','Dữ liệu khách hàng lưu tại Việt Nam','Phân quyền theo phòng ban')",lead,account,contact,sales,presales,need,price);
 db.prepare("UPDATE leads SET converted_account_id=?,converted_contact_id=?,converted_opportunity_id=?,converted_at=datetime('now') WHERE id=?").run(account,contact,opp,lead);
 insert("INSERT INTO activities(entity_type,entity_id,type,subject,body,created_by) VALUES ('opportunity',?,'MEETING','Khảo sát Tân Cảng Xanh',?,?)",opp,`${need} Phạm vi TP.HCM và Hải Phòng. Ngân sách 700 triệu; kết nối ERP qua API. Nguồn: Phiếu khảo sát nhu cầu khách hàng; không có thông tin đối thủ công khai đã xác minh.`,sales);
 const products=[['SC-PRO',100,6000000],['SV-IMPL',20,4000000],['SV-TRAIN',2,8000000]] as const;
 for(const [code,quantity,unitPrice] of products){const p=db.prepare('SELECT id FROM products WHERE code=?').get(code) as {id:number}|undefined;if(p) insert('INSERT INTO opportunity_items(opportunity_id,product_id,quantity,unit_price,discount_pct,amount) VALUES (?,?,?,?,0,?)',opp,p.id,quantity,unitPrice,quantity*unitPrice);}
 insert("INSERT INTO stakeholders(opportunity_id,contact_id,name,role,notes) VALUES (?,?,'Người quyết định giả lập','DECISION_MAKER','Giả định minh họa; cần thay bằng người khách xác nhận')",opp,contact);
 const competitor=db.prepare("SELECT id FROM competitors WHERE name LIKE '%Excel%' LIMIT 1").get() as {id:number}|undefined;
 if(competitor) insert("INSERT INTO opportunity_competitors(opportunity_id,competitor_id,notes) VALUES (?,?,'Khách đang dùng Excel theo phiếu khảo sát; chưa có báo giá hay lợi thế đối thủ được xác minh')",opp,competitor.id);
 insert("INSERT INTO opportunity_stage_history(opportunity_id,from_stage,to_stage,moved_by,reason) VALUES (?,'QUALIFY','DEVELOP',?,'Dữ liệu demo sau Qualify; tiếp tục kiểm thử Propose, Close, Fulfill bằng thao tác người dùng')",opp,sales);
}
