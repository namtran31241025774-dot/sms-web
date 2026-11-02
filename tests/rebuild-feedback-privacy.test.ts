import {it,expect,vi,afterEach} from 'vitest';
import {get,run} from '@/lib/db';
import {createQuote,recordCustomerFeedback,quoteResponses,reviseQuote} from '@/lib/services/quotes';
import {OpenAiProvider} from '@/lib/llm/openai';
import {proposeFlow} from '@/lib/services/sales-flow';
import {getOpportunity} from '@/lib/services/opportunities';
import {createProposal} from '@/lib/services/proposals';
const actor={type:'USER' as const,id:1,name:'An',role:'SALES' as const};
afterEach(()=>vi.unstubAllGlobals());
function sent(){const a=run("INSERT INTO accounts(name,name_norm) VALUES ('Feedback','feedback')").id;const opp=run("INSERT INTO opportunities(code,name,account_id,owner_id,stage,price_list_id) VALUES (?,'Feedback',?,1,'PROPOSE',1)",`FB-${a}`,a).id;const q=createQuote(actor,opp);run("UPDATE quote_versions SET status='SENT',sent_at=datetime('now','-1 hour') WHERE id=?",q.versionId);return q;}
it('FR-50 P1: Propose highlights the actual approval/negotiation/response step and requires a proposal for a revised version',()=>{
 const q=sent();const opp=get<{opportunity_id:number}>('SELECT opportunity_id FROM quotes WHERE id=?',q.quoteId)!.opportunity_id;
 run('UPDATE opportunities SET solution_confirmed=1 WHERE id=?',opp);run('INSERT INTO opportunity_items(opportunity_id,product_id,quantity) VALUES (?,1,1)',opp);
 run("UPDATE quote_versions SET status='DRAFT',sent_at=NULL WHERE id=?",q.versionId);
 expect(proposeFlow(getOpportunity(opp)!).nextStepId).toBe('draft');
 createProposal(actor,{opportunityId:opp,title:'Đề xuất v1',quoteVersionId:q.versionId});
 expect(proposeFlow(getOpportunity(opp)!).steps.find(s=>s.id==='discount')?.status).toBe('NOT_APPLICABLE');
 run("UPDATE quote_versions SET status='PENDING_APPROVAL',max_discount_pct=20 WHERE id=?",q.versionId);
 expect(proposeFlow(getOpportunity(opp)!).nextStepId).toBe('discount');
 run("UPDATE quote_versions SET status='APPROVED' WHERE id=?",q.versionId);
 expect(proposeFlow(getOpportunity(opp)!).nextStepId).toBe('negotiation');
 run("UPDATE quote_versions SET status='SENT',sent_at=datetime('now','-1 hour') WHERE id=?",q.versionId);
 expect(proposeFlow(getOpportunity(opp)!).nextStepId).toBe('response');
 recordCustomerFeedback(actor,q.versionId,{responseType:'REVISION_REQUESTED',respondentName:'Khách',respondedAt:new Date().toISOString(),content:'Cần chỉnh cấu hình'});
 expect(proposeFlow(getOpportunity(opp)!).nextStepId).toBe('draft');
});
it('FR-54 P2: exact-version customer feedback requires identity, time and content; stale and expired acceptance is rejected',()=>{
 const q=sent(),now=new Date().toISOString();
 expect(()=>recordCustomerFeedback(actor,q.versionId,{responseType:'ACCEPTED',respondedAt:now,content:'Đồng ý'})).toThrow(/người phản hồi/);
 recordCustomerFeedback(actor,q.versionId,{responseType:'REJECTED',respondedAt:now,content:'Cần xem lại chi phí',respondentName:'Khách Nguyễn Mai'});
 expect(quoteResponses(q.versionId)[0].respondent_name).toBe('Khách Nguyễn Mai');
 const q2=sent();run("UPDATE quote_versions SET valid_until=date('now','-1 day') WHERE id=?",q2.versionId);
 expect(()=>recordCustomerFeedback(actor,q2.versionId,{responseType:'ACCEPTED',respondedAt:now,content:'Đồng ý',respondentName:'Khách'})).toThrow(/hết hạn/);
 reviseQuote(actor,q2.versionId,'Điều chỉnh');
 expect(()=>recordCustomerFeedback(actor,q2.versionId,{responseType:'ACCEPTED',respondedAt:now,content:'Đồng ý',respondentName:'Khách'})).toThrow();
 expect(get('SELECT id FROM quote_responses WHERE quote_version_id=?',q2.versionId)).toBeUndefined();
 const recalled=sent();run("UPDATE quotes SET status='SUPERSEDED' WHERE id=?",recalled.quoteId);
 expect(()=>recordCustomerFeedback(actor,recalled.versionId,{responseType:'ACCEPTED',respondedAt:now,content:'Đồng ý',respondentName:'Khách'})).toThrow(/thu hồi/);
});
it('FR-06 FR-36 C4: both agent tool JSON and document text are masked in actual provider payload, never contacting OpenAI',async()=>{
 let body='';vi.stubGlobal('fetch',vi.fn(async(_url:unknown,options:{body:string})=>{body=options.body;return new Response(JSON.stringify({choices:[{message:{content:'mock'},finish_reason:'stop'}]}),{status:200});}));
 const original=JSON.stringify({phone:'0901234567',email:'private@example.com',tax_code:'1234567890',bank_account:'777888999000',budget:500000000});
 await new OpenAiProvider('fake-test-key').chat([{role:'tool',tool_call_id:'call1',content:original},{role:'user',content:'Tài liệu: email private@example.com; số tài khoản: 777888999000; mã số thuế: 1234567890; điện thoại 0901234567'}],undefined,{model:'mock-test'});
 for(const value of ['0901234567','private@example.com','1234567890','777888999000']) expect(body).not.toContain(value);
 expect(body).toContain('500000000');expect(body).toContain('[REDACTED]');expect(original).toContain('private@example.com');
});
