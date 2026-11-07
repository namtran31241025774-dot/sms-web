import {timingSafeEqual} from 'node:crypto';
export function integrationAuthorized(request:Request,key=process.env.INTEGRATION_API_KEY):boolean {
  const presented=request.headers.get('x-api-key');
  if(!key || !presented) return false;
  const a=Buffer.from(key),b=Buffer.from(presented);
  return a.length===b.length && timingSafeEqual(a,b);
}
