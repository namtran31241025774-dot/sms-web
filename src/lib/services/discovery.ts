import {get,run,tx} from '../db';
import {assert} from '../domain';
import {can} from '../rbac';
import {assertActorAccess} from './access';
import {audit,type Actor} from './core';
import {createWorkItem} from './work-items';

export const SURVEY_FIELDS=['business_goals','current_process','pain_points','software_needs','expected_outcomes'] as const;
export const TECHNICAL_FIELDS=['technical_integration','technical_infrastructure','technical_security','technical_access'] as const;
export type SurveyUpdate=Partial<Record<typeof SURVEY_FIELDS[number],string>>;
export type TechnicalUpdate=Partial<Record<typeof TECHNICAL_FIELDS[number],string>>;
function update(actor:Actor,id:number,input:SurveyUpdate|TechnicalUpdate,technical:boolean){
  assert(actor.type==='USER' && can(actor.role,technical?'opp.solution':'opp.write'),'Không có quyền cập nhật khảo sát này');
  assertActorAccess(actor,'opportunity',id);
  const o=get<Record<string,unknown> & {stage:string}>('SELECT * FROM opportunities WHERE id=?',id);
  assert(o?.stage==='DEVELOP','Chỉ khảo sát khi đang Phát triển cơ hội');
  const allowed:readonly string[]=technical?TECHNICAL_FIELDS:SURVEY_FIELDS;
  const entries=Object.entries(input);
  assert(entries.length>0 && entries.every(([k,v])=>allowed.includes(k) && typeof v==='string' && v.length<=10000),'Trường khảo sát không hợp lệ');
  const changed=entries.some(([k,v])=>(v.trim()||null)!==(o[k] ?? null));
  if(!changed) return discoverySurvey(id);
  tx(()=>{run(`UPDATE opportunities SET ${entries.map(([k])=>`${k}=?`).join(',')},updated_at=datetime('now') WHERE id=?`,...entries.map(([,v])=>v.trim()||null),id);
    run("UPDATE opportunities SET need_confirmed=0,solution_confirmed=0,expert_review_status=CASE WHEN expert_review_status IN ('APPROVED','PENDING') THEN 'NONE' ELSE expert_review_status END WHERE id=?",id);
    run("UPDATE scope_documents SET status='DRAFT',confirmed_at=NULL,confirmed_by=NULL WHERE opportunity_id=? AND status!='DRAFT'",id);
    audit(actor,'opportunity',id,'UPDATE',{details:{section:technical?'technical_survey':'discovery_survey',fields:entries.map(([k])=>k)}});
  });
  return discoverySurvey(id);
}
/** Caller must first obtain a scoped opportunity. */
export function discoverySurvey(id:number){return get<SurveyUpdate & TechnicalUpdate & {customer_need:string|null}>(`SELECT customer_need,${[...SURVEY_FIELDS,...TECHNICAL_FIELDS].join(',')} FROM opportunities WHERE id=?`,id);}
export function updateDiscoverySurvey(actor:Actor,id:number,input:SurveyUpdate){return update(actor,id,input,false);}
export function updateTechnicalSurvey(actor:Actor,id:number,input:TechnicalUpdate){return update(actor,id,input,true);}
export type DiscoveryAppointmentInput={startsAt:string;method:string;presalesId:number;contactIds:number[];note?:string};
export function createDiscoveryAppointment(actor:Actor,id:number,input:DiscoveryAppointmentInput){
  assert(actor.type==='USER' && can(actor.role,'opp.write'),'Chỉ kinh doanh được hẹn khảo sát và phân công');
  assertActorAccess(actor,'opportunity',id);
  const o=get<{stage:string;owner_id:number;account_id:number}>('SELECT stage,owner_id,account_id FROM opportunities WHERE id=?',id);
  assert(o?.stage==='DEVELOP','Chỉ hẹn khảo sát trong Phát triển cơ hội');
  assert(Number.isFinite(Date.parse(input.startsAt)) && input.method?.trim(),'Cần thời gian và hình thức hợp lệ');
  assert(get("SELECT id FROM users WHERE id=? AND role='PRESALES' AND active=1 AND status='ACTIVE'",input.presalesId),'Cần chuyên viên tư vấn giải pháp đang hoạt động');
  const contacts=[...new Set(input.contactIds)];
  assert(contacts.length>0 && contacts.every(c=>get('SELECT id FROM contacts WHERE id=? AND account_id=?',c,o.account_id)),'Người tham dự phải thuộc doanh nghiệp của cơ hội');
  return tx(()=>{
    run("UPDATE opportunities SET presales_id=?,updated_at=datetime('now') WHERE id=?",input.presalesId,id);
    const task=createWorkItem({title:'Khảo sát nhu cầu và kỹ thuật',type:'APPOINTMENT',entityType:'opportunity',entityId:id,assigneeId:o.owner_id,dueAt:new Date(input.startsAt).toISOString(),description:input.note,participants:[{userId:actor.id,role:'ORGANIZER'},{userId:input.presalesId,role:'PRESALES'}]},actor.id);
    run('UPDATE tasks SET meeting_method=?,external_attendees_json=? WHERE id=?',input.method.trim(),JSON.stringify(contacts),task.id);
    audit(actor,'opportunity',id,'DISCOVERY_APPOINTMENT',{details:{taskId:task.id,presalesId:input.presalesId,contactIds:contacts}});
    return {...task,meeting_method:input.method.trim(),contactIds:contacts};
  });
}
