import { get, run, tx } from '../db';
import { assert } from '../domain';
import { can } from '../rbac';
import { assertActorAccess, recordVisible } from './access';
import { audit, type Actor } from './core';
import { addRisk, findMatchingRisk } from './risks';
import { createWorkItem } from './work-items';
import type { UserScope } from '../scope';

export type RuleAction = 'ACKNOWLEDGED'|'FLAGGED'|'RISK'|'TASK';
export type RuleActionInput = {action:RuleAction;note:string;assigneeId?:number};
export function actOnRuleEvaluation(actor:Actor,evaluationId:number,input:RuleActionInput) {
  assert(actor.type==='USER' && can(actor.role,'ai.review'),'Chỉ người có quyền xác minh được xử lý kết quả quy tắc');
  const e=get<{id:number;opportunity_id:number;research_id:number;status:string;severity:'LOW'|'MEDIUM'|'HIGH'|null;rationale:string;human_action:string|null;required_action:string|null}>(
    'SELECT * FROM ai_rule_evaluations WHERE id=?',evaluationId);
  assert(e,'Không tìm thấy kết quả quy tắc');
  assertActorAccess(actor,'opportunity',e.opportunity_id);
  assert(get<{stage:string}>('SELECT stage FROM opportunities WHERE id=?',e.opportunity_id)?.stage==='DEVELOP','Chỉ xử lý quy tắc khi cơ hội đang Phát triển');
  assert(get<{status:string}>('SELECT status FROM opportunity_research WHERE id=?',e.research_id)?.status!=='DISMISSED','Bản nghiên cứu đã bị thay thế hoặc bỏ qua');
  assert(!e.human_action,'Dòng quy tắc đã được xử lý');
  assert(input.note?.trim(),'Cần ghi chú hoặc lý do xử lý');
  assert((e.status==='WARNING' && input.action==='ACKNOWLEDGED') || (e.status==='HIT' && ['FLAGGED','RISK','TASK'].includes(input.action)),'Thao tác không phù hợp trạng thái quy tắc');
  const assigned=input.assigneeId ?? actor.id;
  if(input.action==='RISK' || input.action==='TASK') {
    assert(get("SELECT id FROM users WHERE id=? AND active=1 AND status='ACTIVE'",assigned),'Người phụ trách không còn hoạt động');
    const u=get<UserScope>('SELECT id,role FROM users WHERE id=?',assigned);
    assert(u && recordVisible(u,'opportunity',e.opportunity_id),'Người phụ trách phải được truy cập cơ hội');
    if(input.action==='RISK') assert(assigned===actor.id,'Người ghi nhận rủi ro chịu trách nhiệm; dùng công việc để giao người khác');
  }
  return tx(()=>{
    let riskId:number|null=null,taskId:number|null=null;
    if(input.action==='RISK') riskId=findMatchingRisk(e.opportunity_id,e.rationale)?.id ?? addRisk(actor,e.opportunity_id,{description:e.rationale,severity:e.severity ?? 'MEDIUM',source:'AI'}).id;
    if(input.action==='TASK') taskId=createWorkItem({title:(e.required_action ?? e.rationale).slice(0,200),description:input.note,entityType:'opportunity',entityId:e.opportunity_id,assigneeId:assigned,source:'USER'},actor.id).id;
    run("UPDATE ai_rule_evaluations SET human_action=?,acted_by=?,acted_at=datetime('now'),action_note=?,linked_risk_id=?,linked_task_id=? WHERE id=?",input.action,actor.id,input.note.trim(),riskId,taskId,e.id);
    audit(actor,'opportunity',e.opportunity_id,'RULE_ACTION',{details:{evaluationId:e.id,action:input.action,note:input.note,riskId,taskId}});
    return {evaluationId:e.id,action:input.action,riskId,taskId};
  });
}

export function flaggedRuleViolations(opportunityId:number) {
  return get<{count:number}>("SELECT COUNT(*) count FROM ai_rule_evaluations WHERE opportunity_id=? AND status='HIT' AND human_action='FLAGGED'",opportunityId)?.count ?? 0;
}
