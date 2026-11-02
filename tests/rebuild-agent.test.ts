import {describe,it,expect} from 'vitest';
import {all,get,run} from '@/lib/db';
import {runAgent} from '@/lib/agents/runtime';
import {invokeTool,type ToolContext} from '@/lib/agents/tools';
import {actOnRuleEvaluation} from '@/lib/services/research-actions';
import {managerGate,getOpportunity,verifyResearch} from '@/lib/services/opportunities';
import type {Actor} from '@/lib/services/core';
import {opportunityFlow,proposeFlow,researchView,bantBreakdown} from '@/lib/services/sales-flow';

let serial=0;
const actor:Actor={type:'USER',id:1,role:'SALES',name:'Test sales'};
function opportunity() {
  serial++;
  const account=run('INSERT INTO accounts(name,name_norm) VALUES (?,?)',`Rebuild ${serial}`,`rebuild ${serial}`).id;
  return run("INSERT INTO opportunities(code,name,account_id,owner_id,stage,amount,budget,customer_need) VALUES (?,?,?,1,'DEVELOP',10000000,0,'Cần CRM để quản lý bán hàng')",`REBUILD-${serial}`,`Rebuild ${serial}`,account).id;
}
async function research(id:number,trigger='MANUAL_INITIAL') {
  const result=await runAgent('OPPORTUNITY',{type:'opportunity',id},trigger,1);
  expect(result.status,result.summary).toBe('SUCCEEDED');
  return get<{id:number;research_phase:string;insights_json:string;next_actions_json:string;status:string}>('SELECT * FROM opportunity_research WHERE run_id=?',result.runId)!;
}
describe('Rebuild Agent phases and human review',()=>{
  it('FR-36 FR-50: supplies typed Develop/Propose/research/BANT views without modifying records',async()=>{
    const id=opportunity();const r=await research(id);const user={id:1,role:'SALES' as const};
    expect(opportunityFlow(getOpportunity(id)!,user).steps).toHaveLength(9);
    expect(proposeFlow(getOpportunity(id)!,user).steps).toHaveLength(6);
    expect(researchView(r.id,user).sections).toHaveLength(10);
    expect(()=>researchView(r.id,{id:1,role:'FINANCE'})).toThrow();
    expect(bantBreakdown(1,user).criteria).toHaveLength(4);
  });
  it('FR-36 F1: stores distinct initial and post-survey research with four grounded initial sections',async()=>{
    const id=opportunity();
    const initial=await research(id);
    expect(initial.research_phase).toBe('INITIAL');
    const sections=JSON.parse(initial.insights_json);
    for(const key of ['account_overview','opportunity_info','bant_result','interaction_history']) expect(sections[key]).toBeTruthy();
    expect(sections.bant_result.status).toBe('NO_INSIGHT');
    const later=await research(id,'MANUAL_POST_SURVEY');
    expect(later.research_phase).toBe('POST_SURVEY');
    expect(later.id).not.toBe(initial.id);
  });
  it('FR-44 F4: emits three budget cases and never writes business risks or checklists',async()=>{
    const id=opportunity();
    const missing=JSON.parse((await research(id,'MANUAL_POST_SURVEY')).insights_json).budget_check;
    expect(missing.text).toContain('thông tin còn thiếu');
    run('UPDATE opportunities SET budget=5000000 WHERE id=?',id);
    const over=JSON.parse((await research(id,'MANUAL_POST_SURVEY')).insights_json).budget_check;
    expect(over.text).toContain('mô-đun');
    run('UPDATE opportunities SET budget=20000000 WHERE id=?',id);
    const safe=JSON.parse((await research(id,'MANUAL_POST_SURVEY')).insights_json).budget_check;
    expect(safe.text).toContain('không thay thế');
    expect(all('SELECT id FROM opportunity_risks WHERE opportunity_id=?',id)).toHaveLength(0);
    expect(getOpportunity(id)?.need_confirmed).toBe(0);
  });
  it('FR-44 F5 F6: recommendations retain validated evidence and reject invented per-action evidence atomically',async()=>{
    const id=opportunity();const r=await research(id);
    for(const a of JSON.parse(r.next_actions_json)) {expect(a.rule_id).toMatch(/^OPP-R/);expect(a.evidence_refs.length).toBeGreaterThan(0);}
    const ctx:ToolContext={agent:'OPPORTUNITY',entityType:'opportunity',entityId:id,runId:0};
    expect(()=>invokeTool(ctx,'save_opportunity_research',{importance:'LOW',summary:'Không được bỏ qua căn cứ riêng của khuyến nghị',risks:[],next_actions:[{action:'Tự nhận định không có căn cứ',evidence_refs:[{ref:'activity:99999999'}]}],sources:[{ref:'opportunity.name'}]},[])).toThrow();
    expect(get<{status:string}>('SELECT status FROM opportunity_research WHERE id=?',r.id)?.status).toBe('PENDING_REVIEW');
  });
  it('FR-43 F7: warning acknowledgement does not block, flagged violations reach manager gate, AI cannot act',async()=>{
    const id=opportunity();const r=await research(id);
    const warning=get<{id:number}>("SELECT id FROM ai_rule_evaluations WHERE research_id=? AND status='WARNING'",r.id)!;
    actOnRuleEvaluation(actor,warning.id,{action:'ACKNOWLEDGED',note:'Đã ghi nhận, tiếp tục làm rõ'});
    expect(managerGate(getOpportunity(id)!).required).toBe(false);
    const hit=get<{id:number}>("SELECT id FROM ai_rule_evaluations WHERE research_id=? AND status='HIT'",r.id)!;
    expect(()=>actOnRuleEvaluation({type:'AI',agent:'OPPORTUNITY',runId:0},hit.id,{action:'FLAGGED',note:'Agent tự quyết'})).toThrow();
    expect(()=>actOnRuleEvaluation(actor,hit.id,{action:'FLAGGED',note:''})).toThrow();
    actOnRuleEvaluation(actor,hit.id,{action:'FLAGGED',note:'Chưa gặp người quyết định, trình quản lý'});
    expect(managerGate(getOpportunity(id)!).required).toBe(true);
    const handled=actOnRuleEvaluation(actor,hit.id,{action:'RISK',note:'Chuyển thành rủi ro để xử lý',assigneeId:1});
    expect(get<{responsible_user_id:number}>('SELECT responsible_user_id FROM opportunity_risks WHERE id=?',handled.riskId)?.responsible_user_id).toBe(1);
    expect(get<{human_action:string}>('SELECT human_action FROM ai_rule_evaluations WHERE id=?',hit.id)?.human_action).toBe('RISK');
  });
  it('FR-43 BUG-050: refreshed research cannot duplicate an existing or handled risk',async()=>{
    const id=opportunity();const first=await research(id);
    verifyResearch(actor,first.id,{applyImportance:false,riskIndexes:[0]});
    const count=all('SELECT * FROM opportunity_risks WHERE opportunity_id=?',id).length;
    run("UPDATE opportunity_risks SET status='RESOLVED' WHERE opportunity_id=?",id);
    const second=await research(id,'MANUAL_POST_SURVEY');
    verifyResearch(actor,second.id,{applyImportance:false,riskIndexes:[0]});
    expect(all('SELECT * FROM opportunity_risks WHERE opportunity_id=?',id)).toHaveLength(count);
  });
});
