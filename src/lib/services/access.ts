import { all, get } from '../db';
import { assert } from '../domain';
import { canSee, type UserScope, type ScopeRecord } from '../scope';
import type { Actor } from './core';

export type RecordKind = 'document'|'lead'|'opportunity'|'quote'|'quote_version'|'order'|'invoice'|'solution'|'scope_document'|'opportunity_item'|'research'|'handover'|'handover_item'|'risk';
export function resolvedScope(user: UserScope): UserScope {
  const teamIds = user.role === 'SALES_MANAGER'
    ? all<{id:number}>("SELECT id FROM teams WHERE leader_id=? AND active=1",user.id).map(t=>t.id)
    : all<{team_id:number}>("SELECT team_id FROM team_members WHERE user_id=? AND datetime(valid_from)<=datetime('now') AND (valid_to IS NULL OR datetime(valid_to)>datetime('now'))",user.id).map(t=>t.team_id);
  return {...user,teamIds};
}
function withOwnerTeams(record: ScopeRecord|undefined): ScopeRecord|undefined {
  if (!record || record.team_id || !record.owner_id) return record;
  const owner_team_ids=all<{team_id:number}>("SELECT team_id FROM team_members WHERE user_id=? AND datetime(valid_from)<=datetime('now') AND (valid_to IS NULL OR datetime(valid_to)>datetime('now'))",record.owner_id).map(t=>t.team_id);
  return {...record,owner_team_ids};
}
function scopeRecord(kind: RecordKind, id: number): ScopeRecord|undefined {
  if (kind==='document') {
    const link=get<{entity_id:number}>("SELECT entity_id FROM document_links WHERE document_id=? AND entity_type='opportunity'",id);
    return link ? scopeRecord('opportunity',link.entity_id) : undefined;
  }
  if (kind==='lead') return withOwnerTeams(get<ScopeRecord>('SELECT owner_id,team_id FROM leads WHERE id=?',id));
  if (kind==='opportunity') return withOwnerTeams(get<ScopeRecord>('SELECT owner_id,team_id,presales_id FROM opportunities WHERE id=?',id));
  const lookups: Record<Exclude<RecordKind,'document'|'lead'|'opportunity'>,[string,string,RecordKind]> = {
    quote:['quotes','opportunity_id','opportunity'], quote_version:['quote_versions','quote_id','quote'],
    order:['orders','opportunity_id','opportunity'], invoice:['invoices','order_id','order'],
    solution:['solutions','opportunity_id','opportunity'],scope_document:['scope_documents','opportunity_id','opportunity'],
    opportunity_item:['opportunity_items','opportunity_id','opportunity'], research:['opportunity_research','opportunity_id','opportunity'],
    handover:['handovers','order_id','order'],handover_item:['handover_items','handover_id','handover'],risk:['opportunity_risks','opportunity_id','opportunity'],
  };
  const [table,fk,parent]=lookups[kind];
  const row=get<{parent:number}>(`SELECT ${fk} parent FROM ${table} WHERE id=?`,id);
  return row ? scopeRecord(parent,row.parent) : undefined;
}
export function recordVisible(user: UserScope, kind: RecordKind, id: number): boolean {
  const record=scopeRecord(kind,id);
  return !!record && canSee(resolvedScope(user),record);
}
export function assertRecordAccess(user: UserScope, kind: RecordKind, id: number) {
  assert(recordVisible(user,kind,id),'Hồ sơ không tồn tại hoặc nằm ngoài phạm vi được phép');
}
export function assertActorAccess(actor: Actor, kind: RecordKind, id: number) {
  if(actor.type==='USER') assertRecordAccess(actor,kind,id);
}
