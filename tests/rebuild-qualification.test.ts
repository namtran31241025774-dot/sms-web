import {it,expect} from 'vitest';
import {get,run} from '@/lib/db';
import {runAgent} from '@/lib/agents/runtime';
import {bantBreakdown} from '@/lib/services/sales-flow';
import {runForWorkflow,leadEmailDrafts,approveSuggestion} from '@/lib/services/ai-review';
import {invokeTool} from '@/lib/agents/tools';
import {scoreBant,convertLeadToOpportunity} from '@/lib/services/qualification';
import {validateVietnamAddress} from '@/lib/services/address-validation';
import {createLead} from '@/lib/services/leads';
import {createAccount} from '@/lib/services/accounts';
const actor={type:'USER' as const,id:1,role:'SALES' as const,name:'An'},user={id:1,role:'SALES' as const};
function lead(notes:string){return run("INSERT INTO leads(company_name,company_norm,contact_name,email,phone,owner_id,notes) VALUES ('Qualification','qualification','Khách','test@example.com','0901234567',1,?)",notes).id;}
it('FR-08 FR-11 Q4: validates minimal address and province locally on Lead and Account writes',()=>{
 expect(validateVietnamAddress('123 Nguyễn Huệ, TP. Hồ Chí Minh').valid).toBe(true);
 expect(validateVietnamAddress('12 phố Huế, Tỉnh không tồn tại').valid).toBe(false);
 expect(()=>createAccount(actor,{name:'Bad address',address:'abc'})).toThrow(/Địa chỉ/);
 expect(()=>createLead(actor,{company_name:'Bad address',contact_name:'Khách',source:'WEB',address:'abc'})).toThrow(/Địa chỉ/);
});
it('FR-32 Q1: mock BANT uses four documented levels, per-criterion reasons, verified sources and no automatic application',async()=>{
 const id=lead('Ngân sách đã duyệt 500 triệu. Người quyết định là giám đốc. Cần CRM cho phạm vi 50 users trong tháng.');
 const r=await runAgent('QUALIFICATION',{type:'lead',id},'MANUAL',1);expect(r.status,r.summary).toBe('SUCCEEDED');
 const view=bantBreakdown(id,user);expect(view.criteria.map(c=>c.score)).toEqual([25,25,25,25]);
 for(const c of view.criteria){expect(c.reason).toBeTruthy();expect(c.evidence.length).toBeGreaterThan(0);}
 expect(get<{bant_score:number}>('SELECT bant_score FROM leads WHERE id=?',id)?.bant_score).toBe(0);
});
it('FR-32 Q1: total alone cannot qualify an influencer, arbitrary score levels are rejected',()=>{
 const id=lead('Có nhu cầu CRM');
 const ctx={agent:'QUALIFICATION' as const,entityType:'lead' as const,entityId:id,runId:0};
 const result=invokeTool(ctx,'propose_bant_score',{budget:25,authority:15,need:25,timeline:25,outcome:'QUALIFIED',rationale:'Tổng cao nhưng chưa gặp người quyết định',evidence:[{ref:'lead.notes'}]},[]) as {outcome:string};
 expect(result.outcome).toBe('NEED_INFO');
 expect(()=>scoreBant(actor,id,{budget:20,authority:25,need:25,timeline:25})).toThrow(/0, 8, 15/);
 expect(()=>scoreBant({type:'AI',agent:'QUALIFICATION',runId:0},id,{budget:25,authority:25,need:25,timeline:25})).toThrow(/đề xuất/);
 const prior=get<{value:string}>("SELECT value FROM settings WHERE key='ai_auto_convert'")?.value ?? 'false';
 run("UPDATE settings SET value='true' WHERE key='ai_auto_convert'");
 try {expect(()=>convertLeadToOpportunity({type:'AI',agent:'QUALIFICATION',runId:0},id,{opportunity_name:'Blocked AI'})).toThrow(/DEC-03/);}finally{run("UPDATE settings SET value=? WHERE key='ai_auto_convert'",prior);}
 run('UPDATE leads SET bant_score=90,bant_authority=15 WHERE id=?',id);
 expect(()=>convertLeadToOpportunity(actor,id,{account_action:'new',contact_action:'new',opportunity_name:'Blocked'})).toThrow(/người quyết định/);
});
it('FR-19 FR-32 Q2 Q3: exposes tool trace and Lead email drafts, only human approval dispatches mail',async()=>{
 const id=lead('Cần CRM, ngân sách 100 triệu, mua trong năm.');
 const r=await runAgent('QUALIFICATION',{type:'lead',id},'MANUAL',1);expect(r.status,r.summary).toBe('SUCCEEDED');
 expect(runForWorkflow(r.runId,user)?.trace.some(t=>t.tool_name==='get_lead')).toBe(true);
 const drafts=leadEmailDrafts(id,user);expect(drafts.length).toBeGreaterThan(0);
 expect(drafts[0].status).toBe('PENDING_REVIEW');expect(drafts[0].delivery_status).toBeNull();
 approveSuggestion(actor,drafts[0].id);expect(leadEmailDrafts(id,user)[0].delivery_status).toBe('SENT');
});
