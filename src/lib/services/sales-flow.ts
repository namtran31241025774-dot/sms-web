import { all, get } from '../db';
import { getScopeDocument, isExpertReviewRequired, gateState, listSolutions, listOpportunityItems, type Opportunity } from './opportunities';
import { assert } from '../domain';
import { assertRecordAccess } from './access';
import type { UserScope } from '../scope';
import { settingNumber } from './core';
import { can } from '../rbac';

export type FlowState='DONE'|'CURRENT'|'UPCOMING'|'NOT_APPLICABLE';
export type ProcessStep={id:string;title:string;actor:string;status:FlowState;href:string;reason:string|null};
export type ProcessFlow={stage:string;steps:ProcessStep[];nextStepId:string|null;nextAction:string|null};
function flow(stage:string,steps:Array<Omit<ProcessStep,'status'> & {done:boolean;applicable?:boolean}>):ProcessFlow {
  let current=false;
  const result=steps.map(({done,applicable,...s}):ProcessStep=>{
    let status:FlowState;
    if(applicable===false) status='NOT_APPLICABLE';
    else if(done) status='DONE';
    else if(!current) {status='CURRENT';current=true;}
    else status='UPCOMING';
    return {...s,status};
  });
  const next=result.find(s=>s.status==='CURRENT');
  return {stage,steps:result,nextStepId:next?.id ?? null,nextAction:next?.title ?? null};
}
/** Pass a scoped Opportunity from getOpportunity(id,user), or pass user for a server scope recheck. */
export function opportunityFlow(o:Opportunity,user?:UserScope):ProcessFlow {
  if(user) assertRecordAccess(user,'opportunity',o.id);
  // Cơ hội đã có khảo sát trước lần chạy đầu tiên sẽ nhận bản POST_SURVEY, cơ hội cũ có bản LEGACY:
  // bước nghiên cứu ban đầu coi là xong khi có bất kỳ bản chưa bỏ qua nào, ưu tiên bản đã xác minh.
  const initial=get<{status:string}>("SELECT status FROM opportunity_research WHERE opportunity_id=? AND status!='DISMISSED' ORDER BY (status='VERIFIED') DESC,(research_phase='INITIAL') DESC,id DESC LIMIT 1",o.id);
  const after=get<{status:string}>("SELECT status FROM opportunity_research WHERE opportunity_id=? AND research_phase='POST_SURVEY' AND status!='DISMISSED' ORDER BY id DESC LIMIT 1",o.id);
  const appointment=get("SELECT t.id FROM tasks t JOIN work_participants p ON p.task_id=t.id WHERE t.entity_type='opportunity' AND t.entity_id=? AND t.type='APPOINTMENT' AND p.user_id=? AND p.status!='DECLINED'",o.id,o.presales_id ?? 0);
  const expert=isExpertReviewRequired(o), gate=gateState(o);
  const href=(tab:string)=>`/opportunities/${o.id}?tab=${tab}`;
  const row=get<Record<string,unknown>>('SELECT * FROM opportunities WHERE id=?',o.id)!;
  const surveyed=['business_goals','current_process','pain_points','software_needs','expected_outcomes'].every(k=>!!row[k]);
  return flow('DEVELOP',[
    {id:'initial_research',title:'Agent lần 1 nghiên cứu bối cảnh',actor:'Agent',done:!!initial,href:href('research'),reason:initial ? null : 'Chưa có bản nghiên cứu ban đầu'},
    {id:'discovery_appointment',title:'Xem nghiên cứu, hẹn lịch và phân công tư vấn',actor:'Nhân viên kinh doanh',done:initial?.status==='VERIFIED' && !!appointment && !!o.presales_id,href:href('summary')+'#discovery',reason:null},
    {id:'survey',title:'Khảo sát nhu cầu và yêu cầu kỹ thuật',actor:'Nhân viên kinh doanh và Chuyên viên tư vấn giải pháp',done:surveyed,href:href('summary')+'#discovery',reason:surveyed ? null : 'Cần ghi đủ năm nội dung khảo sát'},
    {id:'post_survey_research',title:'Agent lần 2 phân tích sau khảo sát',actor:'Agent',done:!!after,href:href('research'),reason:null},
    {id:'scope',title:'Xác nhận phạm vi với khách hàng',actor:'Nhân viên kinh doanh',done:getScopeDocument(o.id)?.status==='CONFIRMED',href:href('scope'),reason:null},
    {id:'solution',title:'Hoàn thiện giải pháp, cấu hình và rà soát chuyên môn',actor:'Chuyên viên tư vấn giải pháp',done:!!o.solution_confirmed && listSolutions(o.id).length>0 && listOpportunityItems(o.id).length>0 && (!expert.required || o.expert_review_status==='APPROVED'),href:href('solution'),reason:expert.required ? expert.reason ?? null : null},
    {id:'stakeholders',title:'Xác nhận bên liên quan',actor:'Nhân viên kinh doanh',done:!!o.stakeholders_confirmed,href:href('stakeholders'),reason:null},
    {id:'competitors',title:'Xác nhận đối thủ cạnh tranh',actor:'Nhân viên kinh doanh',done:!!o.competitors_confirmed,href:href('stakeholders'),reason:null},
    {id:'advance',title:'Kiểm tra và chuyển sang Đề xuất giải pháp',actor:gate.required ? 'Nhân viên kinh doanh và Quản lý kinh doanh' : 'Nhân viên kinh doanh',done:o.stage!=='DEVELOP',href:href('summary'),reason:gate.required ? gate.reasons.join('; ') : null},
  ]);
}

export function proposeFlow(o:Opportunity,user?:UserScope):ProcessFlow {
  if(user) assertRecordAccess(user,'opportunity',o.id);
  const v=get<{id:number;status:string;max_discount_pct:number;sent_at:string|null}>(`SELECT v.* FROM quote_versions v JOIN quotes q ON q.id=v.quote_id WHERE q.opportunity_id=? ORDER BY q.id DESC,v.version_no DESC LIMIT 1`,o.id);
  const response=v ? get<{response_type:string}>('SELECT response_type FROM quote_responses WHERE quote_version_id=? ORDER BY id DESC LIMIT 1',v.id) : null;
  const needsApproval=!!v && v.max_discount_pct>settingNumber('discount_threshold_pct');
  const sent=!!v?.sent_at;
  const href=`/opportunities/${o.id}?tab=quotes`;
  return flow('PROPOSE',[
    {id:'configuration',title:'Chốt cấu hình từ Phát triển cơ hội',actor:'Nhân viên kinh doanh và Chuyên viên tư vấn giải pháp',done:!!o.solution_confirmed && listOpportunityItems(o.id).length>0,href,reason:null},
    {id:'draft',title:'Lập bản đề xuất và báo giá nháp',actor:'Nhân viên kinh doanh',done:!!v && !!get("SELECT id FROM proposals WHERE opportunity_id=? AND quote_version_id=? AND status!='SUPERSEDED'",o.id,v.id),href,reason:null},
    {id:'discount',title:'Duyệt giá khi vượt hạn mức',actor:'Quản lý kinh doanh',done:!!v && ['APPROVED','SENT','ACCEPTED'].includes(v.status),applicable:needsApproval,href,reason:needsApproval ? 'Chiết khấu vượt hạn mức nhân viên' : null},
    {id:'negotiation',title:'Gửi và thương lượng đúng phiên bản',actor:'Nhân viên kinh doanh',done:sent,href,reason:null},
    {id:'response',title:'Ghi nhận quyết định của khách hàng',actor:'Nhân viên kinh doanh',done:!!response,href,reason:response?.response_type ?? null},
    {id:'close_ready',title:'Xác nhận chi tiết mua hàng, sẵn sàng Tạo đơn hàng',actor:'Nhân viên kinh doanh',done:v?.status==='ACCEPTED' && response?.response_type==='ACCEPTED',href,reason:null},
  ]);
}

export const RESEARCH_SECTION_TITLES={account_overview:'Bối cảnh doanh nghiệp',opportunity_info:'Thông tin cơ hội',bant_result:'Kết quả BANT',interaction_history:'Lịch sử tương tác',pain_need:'Nhu cầu và điểm chưa rõ',scope_summary:'Tổng hợp phạm vi khảo sát',product:'Sản phẩm liên quan',stakeholder:'Bên liên quan',competitor:'Đối thủ',budget_check:'Rủi ro ngân sách'} as const;
export function researchView(researchId:number,user:UserScope) {
  assert(can(user.role,'opp.read'),'Không có quyền đọc nghiên cứu cơ hội');
  assertRecordAccess(user,'research',researchId);
  const r=get<{id:number;opportunity_id:number;research_phase:string;insights_json:string;missing_info_json:string;next_actions_json:string;importance:string;importance_reason:string|null;created_at:string;status:string;run_id:number|null}>('SELECT * FROM opportunity_research WHERE id=?',researchId);
  assert(r,'Không tìm thấy nghiên cứu');
  const parse=<T>(s:string,fallback:T):T=>{try{return JSON.parse(s) as T;}catch{return fallback;}};
  const insights=parse<Record<string,{text?:string;sources?:{ref:string}[];reason?:string}>>(r.insights_json,{});
  const evaluations=all<{id:number;rule_id:string;br_ref:string;status:string;rationale:string;raw_value:string|null;threshold:string|null;evidence_refs_json:string;human_action:string|null;action_note:string|null;acted_by:number|null;acted_at:string|null}>('SELECT * FROM ai_rule_evaluations WHERE research_id=? ORDER BY rule_id',researchId);
  return {...r,phase:r.research_phase as 'INITIAL'|'POST_SURVEY'|'LEGACY',phaseLabel:r.research_phase==='INITIAL' ? 'Agent lần 1' : r.research_phase==='POST_SURVEY' ? 'Agent lần 2' : 'Nghiên cứu cũ (chưa phân loại)',
    sections:Object.entries(RESEARCH_SECTION_TITLES).map(([key,title])=>({key,title,status:insights[key]?.text ? 'INSIGHT' as const : 'NO_INSIGHT' as const,text:insights[key]?.text ?? null,sources:insights[key]?.sources ?? [],reason:insights[key]?.reason ?? (insights[key]?.text ? null : 'Bản nghiên cứu cũ chưa lưu mục này')})),
    missingInfo:parse<string[]>(r.missing_info_json,[]),
    recommendations:parse<Array<{action:string;owner_role?:string;why?:string;rule_id?:string;evidence_refs?:{ref:string}[]}>>(r.next_actions_json,[]),
    evaluations:evaluations.map(e=>({...e,evidenceRefs:parse<string[]>(e.evidence_refs_json,[])})),
  };
}
export type ResearchView=ReturnType<typeof researchView>;

export const BANT_LEVELS={budget:['Chưa có thông tin','Đề cập nhưng chưa có số','Có khoảng ngân sách','Ngân sách đã duyệt'],authority:['Chưa có thông tin','Người dùng cuối','Người có ảnh hưởng','Đã xác định người quyết định'],need:['Chưa có thông tin','Nhu cầu chung chung','Vấn đề cụ thể','Rõ vấn đề và phạm vi'],timeline:['Chưa có thông tin','Năm sau','Trong năm','Trong tháng hoặc cuối quý']} as const;
export function bantBreakdown(leadId:number,user:UserScope) {
  assert(can(user.role,'lead.read'),'Không có quyền xem Lead');
  assertRecordAccess(user,'lead',leadId);
  const assessment=get<Record<string,unknown>>('SELECT * FROM lead_assessments WHERE lead_id=? ORDER BY id DESC LIMIT 1',leadId);
  const suggestion=get<{id:number;status:string;payload_json:string;evidence_json:string}>("SELECT id,status,payload_json,evidence_json FROM ai_suggestions WHERE entity_type='lead' AND entity_id=? AND kind='BANT_SCORE' ORDER BY id DESC LIMIT 1",leadId);
  const payload=suggestion ? JSON.parse(suggestion.payload_json) as {scores:Record<string,number>;rationale?:string;breakdown?:Record<string,{reason?:string;evidence?:unknown[]}>} : null;
  const scores=[0,8,15,25];
  return {threshold:settingNumber('bant_threshold'),decisionMakerRequired:true,suggestionId:suggestion?.id ?? null,suggestionStatus:suggestion?.status ?? null,applied:assessment ?? null,
    criteria:Object.entries(BANT_LEVELS).map(([key,levels])=>{
      const score=payload?.scores[key] ?? Number(assessment?.[`bant_${key}`] ?? 0);
      return {key,score,level:scores.includes(score) ? levels[scores.indexOf(score)] : 'Điểm lịch sử ngoài thang 0/8/15/25',reason:payload?.breakdown?.[key]?.reason ?? payload?.rationale ?? String(assessment?.notes ?? 'Chưa ghi nhận lý do'),evidence:payload?.breakdown?.[key]?.evidence ?? (suggestion ? JSON.parse(suggestion.evidence_json || '[]') as unknown[] : [])};
    })};
}
export type BantBreakdown=ReturnType<typeof bantBreakdown>;
