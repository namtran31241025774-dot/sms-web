import {it,expect} from 'vitest';
import {get,run} from '@/lib/db';
import {createScopeDocument,confirmScopeDocument,updateScopeDocument,getScopeDocument,getOpportunity,moveStage,addOpportunityItem} from '@/lib/services/opportunities';
import {pendingExpertReviews,requestApproval,decideStageGate} from '@/lib/services/approvals';
import {evaluateOpportunityRules} from '@/lib/agents/rules';
import type {Actor} from '@/lib/services/core';
const sales:Actor={type:'USER',id:1,role:'SALES',name:'An'};
function opp(){const a=run("INSERT INTO accounts(name,name_norm) VALUES ('Bugs','bugs')").id;return run("INSERT INTO opportunities(code,name,account_id,owner_id,stage,amount) VALUES (?,'Bugs',?,1,'DEVELOP',1)",`BUG-${a}`,a).id;}
it('FR-42 BUG-049: stage exit closes pending expert request and excludes old stage requests',()=>{
 const id=opp();run("UPDATE opportunities SET expert_review_status='PENDING' WHERE id=?",id);
 expect(pendingExpertReviews({id:1,role:'SALES'}).some(r=>r.id===id)).toBe(true);
 moveStage(sales,id,'PROPOSE');expect(getOpportunity(id)?.expert_review_status).toBe('NONE');
 run("UPDATE opportunities SET expert_review_status='PENDING' WHERE id=?",id);
 expect(pendingExpertReviews({id:1,role:'SALES'}).some(r=>r.id===id)).toBe(false);
});
it('FR-37 BUG-051: material scope edits invalidate confirmation, identical text does not',()=>{
 const id=opp(),doc=createScopeDocument(sales,id,{title:'Phạm vi',content:'50 users'});confirmScopeDocument(sales,doc.id);
 updateScopeDocument(sales,doc.id,{content:'50 users'});expect(getScopeDocument(id)?.status).toBe('CONFIRMED');
 updateScopeDocument(sales,doc.id,{content:'100 users',status:'CONFIRMED'});
 expect(getScopeDocument(id)?.status).toBe('DRAFT');expect(getScopeDocument(id)?.confirmed_at).toBeNull();expect(getOpportunity(id)?.need_confirmed).toBe(0);
});
it('FR-42 BUG-053: absent solution is unknown, not evidence of no integration',()=>{
 const e=evaluateOpportunityRules(opp()).evaluations.find(r=>r.rule_id==='OPP-R10')!;
 expect(e.status).toBe('NOT_EVALUABLE');expect(e.raw_value).toContain('Chưa có hồ sơ');
});
it('FR-46 BUG-052: self-approval policy can be disabled without deciding C6 for the group',()=>{
 const id=opp();const a=requestApproval(sales,{kind:'OPP_STAGE_GATE',entityType:'opportunity',entityId:id,reason:'Test'});
 const before=process.env.SMS_ALLOW_STAGE_SELF_APPROVAL;process.env.SMS_ALLOW_STAGE_SELF_APPROVAL='false';
 try{expect(()=>decideStageGate({...sales,role:'SALES_MANAGER'},a,true,null)).toThrow(/quản lý khác/);}finally{if(before===undefined) delete process.env.SMS_ALLOW_STAGE_SELF_APPROVAL;else process.env.SMS_ALLOW_STAGE_SELF_APPROVAL=before;}
 expect(get<{status:string}>('SELECT status FROM approvals WHERE id=?',a)?.status).toBe('PENDING');
});
it('FR-38 F9: projected Develop configuration rejects quotation discounts',()=>{
 expect(()=>addOpportunityItem(sales,opp(),{product_id:1,quantity:2,unit_price:100,discount_pct:10})).toThrow(/Propose/);
});
