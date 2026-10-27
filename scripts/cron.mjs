const base=process.env.SMS_BASE_URL || 'http://127.0.0.1:3000';
const key=process.env.CRON_API_KEY;
if(!key)throw new Error('Cần CRON_API_KEY');
async function tick(){
  const res=await fetch(`${base}/api/cron/agents`,{method:'POST',headers:{'x-api-key':key},signal:AbortSignal.timeout(300000)});
  if(!res.ok)throw new Error(`Cron HTTP ${res.status}`);
  console.log(await res.json());
}
if(process.argv.includes('--watch')) {
  let busy=false;
  const run=async()=>{if(busy)return;busy=true;try{await tick();}catch(e){console.error(e.message);}finally{busy=false;}};
  await run();setInterval(run,60000);
} else await tick();
