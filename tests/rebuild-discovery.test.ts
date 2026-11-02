import {it,expect} from 'vitest';
import {get,run} from '@/lib/db';
import {createDiscoveryAppointment,updateDiscoverySurvey,updateTechnicalSurvey} from '@/lib/services/discovery';
import {createSolution,createScopeDocument,confirmScopeDocument,getScopeDocument,getOpportunity} from '@/lib/services/opportunities';
import {saveOpportunityDocument,listOpportunityDocuments} from '@/lib/services/documents';
import type {Actor} from '@/lib/services/core';
const sales:Actor={type:'USER',id:1,role:'SALES',name:'Sales'};
function setup(){
 const a=run("INSERT INTO accounts(name,name_norm) VALUES ('Discovery','discovery')").id;
 const contact=run("INSERT INTO contacts(account_id,full_name) VALUES (?,'Khách')",a).id;
 const pre=get<{id:number}>("SELECT id FROM users WHERE role='PRESALES' AND active=1")!.id;
 const opp=run("INSERT INTO opportunities(code,name,account_id,primary_contact_id,owner_id,presales_id,stage,customer_need) VALUES (?,'Discovery',?,?,1,?,'DEVELOP','Giữ nhu cầu cũ')",`DISC-${a}`,a,contact,pre).id;
 return {opp,contact,pre};
}
it('FR-83 F2: appointment stores time, method, customer and presales assignment atomically',()=>{
 const {opp,contact,pre}=setup();
 const t=createDiscoveryAppointment(sales,opp,{startsAt:'2027-01-01T03:00:00Z',method:'Microsoft Teams',presalesId:pre,contactIds:[contact]});
 expect(t.contactIds).toEqual([contact]);expect(t.type).toBe('APPOINTMENT');
 expect(get<{user_id:number}>("SELECT user_id FROM work_participants WHERE task_id=? AND role='PRESALES'",t.id)?.user_id).toBe(pre);
 expect(()=>createDiscoveryAppointment(sales,opp,{startsAt:'invalid',method:'',presalesId:pre,contactIds:[contact]})).toThrow();
});
it('FR-37 FR-41 F3: separate five survey fields and technical responsibilities without losing legacy needs',()=>{
 const {opp,pre}=setup();
 const s=updateDiscoverySurvey(sales,opp,{business_goals:'Tăng doanh thu',current_process:'Excel',pain_points:'Trùng dữ liệu',software_needs:'CRM',expected_outcomes:'Báo cáo chuẩn'});
 expect(s?.customer_need).toBe('Giữ nhu cầu cũ');expect(s?.software_needs).toBe('CRM');
 expect(()=>updateTechnicalSurvey(sales,opp,{technical_security:'SSO'})).toThrow();
 expect(updateTechnicalSurvey({type:'USER',id:pre,role:'PRESALES',name:'Tư vấn'},opp,{technical_integration:'ERP',technical_infrastructure:'Cloud',technical_security:'SSO',technical_access:'RBAC'})?.technical_security).toBe('SSO');
 const scope=createScopeDocument(sales,opp,{title:'Phạm vi',content:'CRM'});confirmScopeDocument(sales,scope.id);
 run("UPDATE opportunities SET expert_review_status='APPROVED',solution_confirmed=1 WHERE id=?",opp);
 updateTechnicalSurvey({type:'USER',id:pre,role:'PRESALES',name:'Tư vấn'},opp,{technical_security:'MFA bổ sung'});
 expect(getOpportunity(opp)?.expert_review_status).toBe('NONE');expect(getOpportunity(opp)?.solution_confirmed).toBe(0);expect(getScopeDocument(opp)?.status).toBe('DRAFT');
});
it('FR-41 F8: technical document belongs to the exact solution and rejects cross-opportunity links',()=>{
 const {opp,pre}=setup();const actor:Actor={type:'USER',id:pre,role:'PRESALES',name:'Tư vấn'};
 const solution=createSolution(actor,opp,{title:'Giải pháp CRM'});
 const doc=saveOpportunityDocument(actor,opp,{name:'solution.pdf',bytes:Buffer.from('%PDF-1.4 test')},{kind:'SOLUTION',solutionId:solution.id});
 expect(listOpportunityDocuments(opp).find(d=>d.id===doc)?.solution_id).toBe(solution.id);
 const other=setup();expect(()=>saveOpportunityDocument(sales,other.opp,{name:'wrong.pdf',bytes:Buffer.from('%PDF-1.4')},{kind:'SOLUTION',solutionId:solution.id})).toThrow();
});
