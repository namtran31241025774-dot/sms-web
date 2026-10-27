import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { get, run } from '@/lib/db';
import { runAgent } from '@/lib/agents/runtime';
import { checkPreRunConstraints } from '@/lib/services/ai-admin';
import { invokeTool, type ToolCallLog } from '@/lib/agents/tools';
import { validateEvidence } from '@/lib/agents/evidence';
import {OpenAiProvider} from '@/lib/llm/openai';
const {chat} = vi.hoisted(()=>({chat:vi.fn()}));
vi.mock('@/lib/llm',()=>({getLlmProvider:()=>({name:'unit-test',chat})}));
let entityId:number;
beforeEach(()=>{
  entityId=run("INSERT INTO leads(company_name,company_norm,contact_name,notes) VALUES ('Thép Nam Việt','thep nam viet','Contact','Actual source')").id;
  run("UPDATE agent_configs SET model_reference='unit-model' WHERE agent_id='QUALIFICATION'");
  for(const [key,value] of Object.entries({ai_status:'ACTIVE',ai_emergency_kill:'false',agent_qualification_enabled:'true',ai_daily_token_budget:'200000',ai_max_tokens_per_run:'20',ai_max_iterations:'2',ai_max_web_searches_per_run:'1',llm_allowed_models:'unit-model'})) run('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)',key,value);
  vi.stubEnv('SMS_AI_MODE','live'); vi.stubEnv('OPENAI_API_KEY','unit-test-never-transmitted');
  chat.mockReset(); chat.mockResolvedValue({content:'Done',usage:{prompt_tokens:1,completion_tokens:1},stop_reason:'stop'});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Agent regression safeguards',()=>{
  it('FR-91: BUG-033 provider calls have an enforced abort deadline, with no real network',async()=>{
    vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>{
      const signal=init.signal!;
      if(signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    })));
    await expect(new OpenAiProvider('unit-test').chat([] ,[],{model:'unit-model',timeoutMs:1})).rejects.toThrow();
  });
  it('FR-91: BUG-033 web calls stop at the configured per-run limit',async()=>{
    chat.mockResolvedValue({content:null,tool_calls:[{id:'w1',type:'function',function:{name:'web_research',arguments:'{"query":"Thép Nam Việt"}'}},{id:'w2',type:'function',function:{name:'web_research',arguments:'{"query":"Thép Nam Việt"}'}}]});
    const result=await runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-web-limit',null);
    expect(result.status).toBe('FAILED');
    expect(get<{web_search_calls:number}>('SELECT web_search_calls FROM ai_runs WHERE id=?',result.runId)?.web_search_calls).toBe(1);
  });
  it('FR-91: BUG-031 sends real JSON input schemas to the provider',async()=>{
    await runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-schema',null);
    const tools=chat.mock.calls[0][1] as {function:{name:string;parameters:{properties:Record<string,unknown>}}}[];
    expect(tools.find(t=>t.function.name==='web_research')?.function.parameters.properties).toHaveProperty('query');
  });
  it('FR-91: BUG-032 mock mode consumes no token budget',async()=>{
    vi.stubEnv('SMS_AI_MODE','mock');
    const res=await runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-mock',null);
    expect(res.status).toBe('SUCCEEDED');
    expect(get<{input_tokens:number,output_tokens:number}>('SELECT input_tokens,output_tokens FROM ai_runs WHERE id=?',res.runId)).toEqual({input_tokens:0,output_tokens:0});
  });
  it('FR-90: BUG-032 budget warning is emitted once per threshold per day',()=>{
    run("INSERT OR IGNORE INTO users(id,name,email,role) VALUES (903,'AI Review','ai-review@sms.local','AI_MANAGER')");
    run("INSERT INTO ai_runs(agent,trigger,entity_type,entity_id,model,status,input_tokens,output_tokens) VALUES ('QUALIFICATION','budget','lead',?,'unit-model','SUCCEEDED',170000,0)",entityId);
    const before=get<{n:number}>("SELECT count(*) n FROM notifications WHERE user_id=903")!.n;
    checkPreRunConstraints('QUALIFICATION'); checkPreRunConstraints('QUALIFICATION');
    expect(get<{n:number}>("SELECT count(*) n FROM notifications WHERE user_id=903")!.n-before).toBe(1);
    run("DELETE FROM ai_runs WHERE trigger='budget'");
  });
  it('FR-91: BUG-033 stops over budget and retains already consumed usage on failure',async()=>{
    chat.mockResolvedValue({content:'Done',usage:{prompt_tokens:30,completion_tokens:1}});
    const res=await runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-budget',null);
    expect(res.status).toBe('FAILED');
    expect(get<{input_tokens:number}>('SELECT input_tokens FROM ai_runs WHERE id=?',res.runId)?.input_tokens).toBe(30);
  });
  it('FR-91: BUG-033 exhausting iterations is FAILED, not empty success',async()=>{
    chat.mockResolvedValue({content:null,tool_calls:[{id:'t',type:'function',function:{name:'get_lead',arguments:'{}'}}]});
    expect((await runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-iterations',null)).status).toBe('FAILED');
  });
  it('FR-91: BUG-034 refuses live execution without an allowed model',async()=>{
    run("UPDATE settings SET value='' WHERE key='llm_allowed_models'");
    await expect(runAgent('QUALIFICATION',{type:'lead',id:entityId},'unit-model',null)).rejects.toThrow(/model|mô hình/);
    expect(chat).not.toHaveBeenCalled();
  });
  it('FR-92: BUG-035 refuses invented URLs and quotes not found in their source',()=>{
    const ctx={agent:'QUALIFICATION' as const,runId:900000,entityType:'lead' as const,entityId};
    expect(()=>validateEvidence(ctx,[{ref:'https://invented.example/fake'}])).toThrow();
    expect(()=>validateEvidence(ctx,[{ref:'lead.notes',quote:'Invented quotation'}])).toThrow();
  });
  it('FR-93: BUG-037 both in-memory and persisted tool traces redact PII and secrets',()=>{
    const log:ToolCallLog[]=[];
    const ctx={agent:'QUALIFICATION' as const,runId:900000,entityType:'lead' as const,entityId};
    expect(()=>invokeTool(ctx,'not_allowed',{password:'do-not-log',message:'private@example.com 0912345678'},log)).toThrow();
    expect(JSON.stringify(log)).not.toContain('do-not-log');
    expect(JSON.stringify(log)).not.toContain('private@example.com');
    expect(JSON.stringify(log)).not.toContain('0912345678');
  });
});
