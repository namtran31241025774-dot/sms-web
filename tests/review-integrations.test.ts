import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {get,run} from '@/lib/db';
import {POST as webLead} from '@/app/api/integrations/web-leads/route';
import {POST as inboundEmail} from '@/app/api/integrations/email/route';
import {POST as payment} from '@/app/api/integrations/payments/route';
import {POST as accounting} from '@/app/api/integrations/accounting/route';
import {POST as cron} from '@/app/api/cron/agents/route';
import {readFileSync} from 'node:fs';
const key='unit-test-key';
const request=(payload:unknown,id='test-id',secret=key)=>new Request('http://localhost/api/integrations/test',{method:'POST',headers:{'content-type':'application/json','x-api-key':secret,'idempotency-key':id},body:JSON.stringify(payload)});
beforeEach(()=>{vi.stubEnv('INTEGRATION_API_KEY',key);vi.stubEnv('CRON_API_KEY','cron-key');});
afterEach(()=>vi.unstubAllEnvs());
describe('Integration endpoints',()=>{
  it('FR-02: BUG-039 authenticated web intake is idempotent and rejects key reuse for a different body',async()=>{
    const payload={company_name:'Webhook company',contact_name:'Contact',email:'inbound@example.com',phone:'0901234567'};
    const first=await webLead(request(payload,'web-1')), second=await webLead(request(payload,'web-1'));
    expect(first.status).toBe(200);expect(await first.json()).toEqual(await second.json());
    expect((await webLead(request({...payload,company_name:'Other'},'web-1'))).status).toBe(409);
  });
  it('FR-20: BUG-039 incoming email is linked to the known sender and duplicate delivery creates one message',async()=>{
    const lead=run("INSERT INTO leads(company_name,company_norm,contact_name,email) VALUES ('Mail','mail','Contact','sender@example.com')").id;
    const body={entityType:'lead',entityId:lead,from:'sender@example.com',to:'sales@example.com',subject:'Reply',body:'Reply body',messageId:'mail-test'};
    expect((await inboundEmail(request({...body,from:'outsider@example.com'},'bad-email'))).status).toBe(400);
    expect((await inboundEmail(request(body,'mail-1'))).status).toBe(200);
    expect((await inboundEmail(request(body,'mail-2'))).status).toBe(200);
    expect(get<{n:number}>("SELECT count(*) n FROM email_messages WHERE provider_ref='mail-test'")?.n).toBe(1);
  });
  it('FR-92: BUG-030 and BUG-039 all integration/cron routes fail closed without valid credentials',async()=>{
    for(const endpoint of [webLead,inboundEmail,payment,accounting,cron]) expect((await endpoint(request({},'unauthorized','wrong-key'))).status).toBe(401);
    vi.stubEnv('INTEGRATION_API_KEY','');expect((await webLead(request({}))).status).toBe(401);
  });
  it('FR-91: BUG-039 container does not force mock mode and requires persistent SQLite storage',()=>{
    const docker=readFileSync('Dockerfile','utf8');
    expect(docker).not.toContain('SMS_AI_MODE=mock');expect(docker).toContain('VOLUME ["/data"]');
  });
});
