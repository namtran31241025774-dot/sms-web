import type {LlmMessage} from './types';
// Interim C4 policy; the group can add names via SMS_AI_PRIVATE_FIELDS.
// Field protection is unconditional. Free-text matching cannot prove absence of all PII.
export const DEFAULT_PRIVATE_FIELDS=['phone','telephone','mobile','email','to_email','from_email','tax_code','tax_id','bank_account','account_number','identity_number','government_id','cccd','cmnd','passport','api_key','password','secret'];
const MASK='[REDACTED]';
function fieldPrivate(key:string){const normalized=key.replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase();return [...DEFAULT_PRIVATE_FIELDS,...(process.env.SMS_AI_PRIVATE_FIELDS ?? '').split(',')].filter(Boolean).some(k=>normalized===k || normalized.endsWith('_'+k));}
export function redactModelText(raw:string):string {
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,MASK)
    .replace(/(?<!\d)(?:\+?84|0)(?:[ .()-]*\d){8,10}(?!\d)/g,MASK)
    .replace(/((?:mã\s*số\s*thuế|ma\s*so\s*thue|tax[ _-]?(?:code|id)|số\s*tài\s*khoản|so\s*tai\s*khoan|bank[ _-]?account|cccd|cmnd|passport)\s*[:=]?\s*)[\d .-]{6,30}/gi,`$1${MASK}`);
}
export function redactModelValue(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(redactModelValue);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,fieldPrivate(k)?MASK:redactModelValue(v)]));
  if(typeof value==='string') {
    try{return JSON.stringify(redactModelValue(JSON.parse(value)));}catch{return redactModelText(value);}
  }
  return value;
}
/** Last boundary before serialization to OpenAI; covers both agents and document extraction. */
export function privateMessages(messages:LlmMessage[]):LlmMessage[]{return messages.map(m=>({...m,content:m.content===null?null:String(redactModelValue(m.content)),tool_calls:m.tool_calls?.map(c=>({...c,function:{...c.function,arguments:String(redactModelValue(c.function.arguments))}}))}));}
