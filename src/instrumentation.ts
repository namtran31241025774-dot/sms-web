export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs') {
    const {after}=await import('next/server');
    const {registerAgentTriggers}=await import('./lib/agents/triggers');
    registerAgentTriggers(job=>after(job));
  }
}
