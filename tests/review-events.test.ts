import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {get,run,tx} from '@/lib/db';
import {emitEvent} from '@/lib/events';
import {registerAgentTriggers,runScheduledAgents} from '@/lib/agents/triggers';
import {createLead} from '@/lib/services/leads';
const {runAgent}=vi.hoisted(()=>({runAgent:vi.fn()}));
vi.mock('@/lib/agents/runtime',()=>({runAgent}));
let stop:()=>void, jobs:Array<()=>Promise<void>>;
beforeEach(()=>{
  jobs=[];runAgent.mockReset();runAgent.mockResolvedValue({runId:1,status:'SUCCEEDED',summary:'mock'});
  stop=registerAgentTriggers(job=>jobs.push(job));
  run("INSERT OR REPLACE INTO settings(key,value) VALUES ('agent_qualification_enabled','true'),('agent_opportunity_enabled','true'),('opp_refresh_hours','6')");
});
afterEach(()=>stop());
describe('Automatic Agent scheduling',()=>{
  it('FR-89: BUG-030 events run after commit and rollback schedules nothing',async()=>{
    expect(()=>tx(()=>{emitEvent('lead.created',{leadId:123});throw new Error('rollback');})).toThrow('rollback');
    expect(jobs).toHaveLength(0);
    const lead=createLead({type:'SYSTEM'},{company_name:'Auto trigger',contact_name:'Contact',email:'auto@example.com',phone:'0901234567'});
    expect(jobs).toHaveLength(1);await jobs[0]();
    expect(runAgent).toHaveBeenCalledWith('QUALIFICATION',{type:'lead',id:lead},'EVENT_LEAD',null);
  });
  it('FR-36: BUG-030 conversion triggers immediately, key-field edits debounce and scheduler refreshes',async()=>{
    const account=run("INSERT INTO accounts(name,name_norm) VALUES ('Refresh','refresh')").id;
    const opp=run("INSERT INTO opportunities(code,name,account_id,stage) VALUES ('OPP-REFRESH','Refresh',?,'DEVELOP')",account).id;
    emitEvent('opportunity.converted',{opportunityId:opp});expect(jobs).toHaveLength(1);await jobs[0]();
    emitEvent('opportunity.key_field_changed',{opportunityId:opp});
    expect(get<{ai_refresh_due_at:string}>('SELECT ai_refresh_due_at FROM opportunities WHERE id=?',opp)?.ai_refresh_due_at).toBeTruthy();
    expect(jobs).toHaveLength(1);
    run("UPDATE opportunities SET ai_refresh_due_at=datetime('now','-1 minute') WHERE id=?",opp);
    await runScheduledAgents();
    expect(runAgent).toHaveBeenCalledWith('OPPORTUNITY',{type:'opportunity',id:opp},'SCHEDULED_REFRESH',null);
    expect(get<{ai_refresh_due_at:string|null}>('SELECT ai_refresh_due_at FROM opportunities WHERE id=?',opp)?.ai_refresh_due_at).toBeNull();
  });
});
