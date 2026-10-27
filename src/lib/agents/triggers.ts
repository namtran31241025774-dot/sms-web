import {all,get,run} from '../db';
import {onEvent} from '../events';
import {settingBool,settingNumber} from '../services/core';
import {cleanTimedOutRuns} from '../services/ai-admin';
import {runAgent} from './runtime';
type Defer=(job:()=>Promise<void>)=>void;
let unregister:(()=>void)|undefined;

export function registerAgentTriggers(defer:Defer=job=>{void job().catch(console.error);}) {
  if(unregister) return unregister;
  const off:Array<()=>void>=[];
  const qualification=(data:{leadId:number;actorUserId?:number})=>{
    if(settingBool('agent_qualification_enabled')) defer(async()=>{await runAgent('QUALIFICATION',{type:'lead',id:data.leadId},'EVENT_LEAD',data.actorUserId ?? null);});
  };
  off.push(onEvent('lead.created',qualification),onEvent('lead.bant_updated',qualification),onEvent('lead.email_received',qualification));
  off.push(onEvent<{leadIds:number[];actorUserId?:number}>('lead.imported',p=>{for(const leadId of p.leadIds)qualification({leadId,actorUserId:p.actorUserId});}));
  off.push(onEvent<{opportunityId:number;actorUserId?:number}>('opportunity.converted',p=>{
    if(settingBool('agent_opportunity_enabled')) defer(async()=>{await runAgent('OPPORTUNITY',{type:'opportunity',id:p.opportunityId},'EVENT_CONVERTED',p.actorUserId ?? null);});
  }));
  off.push(onEvent<{opportunityId:number}>('opportunity.key_field_changed',p=>{
    run("UPDATE opportunities SET ai_refresh_due_at=datetime('now','+2 minutes') WHERE id=? AND stage IN ('DEVELOP','PROPOSE')",p.opportunityId);
  }));
  unregister=()=>{off.forEach(stop=>stop());unregister=undefined;};
  return unregister;
}

export async function runScheduledAgents() {
  const cleaned=cleanTimedOutRuns(); let succeeded=0,failed=0;
  const work:Array<{agent:'QUALIFICATION'|'OPPORTUNITY';type:'lead'|'opportunity';id:number;due:string|null}>=[];
  if(settingBool('agent_qualification_enabled')) for(const lead of all<{id:number}>("SELECT id FROM leads l WHERE status IN ('OPEN','WORKING') AND deleted_at IS NULL AND merged_into_lead_id IS NULL AND NOT EXISTS(SELECT 1 FROM ai_runs r WHERE r.agent='QUALIFICATION' AND r.entity_type='lead' AND r.entity_id=l.id)")) work.push({agent:'QUALIFICATION',type:'lead',id:lead.id,due:null});
  if(settingBool('agent_opportunity_enabled')) for(const opp of all<{id:number;ai_refresh_due_at:string|null}>(
    `SELECT id,ai_refresh_due_at FROM opportunities o WHERE stage IN ('DEVELOP','PROPOSE') AND (
      (ai_refresh_due_at IS NOT NULL AND datetime(ai_refresh_due_at)<=datetime('now')) OR
      (ai_refresh_due_at IS NULL AND NOT EXISTS(SELECT 1 FROM ai_runs r WHERE r.agent='OPPORTUNITY' AND r.entity_type='opportunity' AND r.entity_id=o.id AND datetime(r.started_at)>datetime('now',?))))`,
    `-${settingNumber('opp_refresh_hours')} hours`,
  )) work.push({agent:'OPPORTUNITY',type:'opportunity',id:opp.id,due:opp.ai_refresh_due_at});
  for(const item of work) {
    if(get("SELECT id FROM ai_runs WHERE agent=? AND entity_type=? AND entity_id=? AND status='RUNNING'",item.agent,item.type,item.id)) continue;
    try {
      const result=await runAgent(item.agent,{type:item.type,id:item.id},'SCHEDULED_REFRESH',null);
      if(result.status==='SUCCEEDED') {
        succeeded++;
        if(item.type==='opportunity' && item.due) run('UPDATE opportunities SET ai_refresh_due_at=NULL WHERE id=? AND ai_refresh_due_at=?',item.id,item.due);
      } else failed++;
    } catch {failed++;}
  }
  return {...cleaned,succeeded,failed};
}
