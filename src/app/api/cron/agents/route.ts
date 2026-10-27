import {runScheduledAgents} from '@/lib/agents/triggers';
import {integrationAuthorized} from '@/lib/integrations/authorization';
export const runtime='nodejs';
export async function POST(request:Request) {
  if(!integrationAuthorized(request,process.env.CRON_API_KEY)) return Response.json({error:'Không có quyền'},{status:401});
  return Response.json(await runScheduledAgents());
}
export const GET=POST;
