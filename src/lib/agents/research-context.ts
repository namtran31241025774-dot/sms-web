import { createHash } from 'node:crypto';
import { all, get } from '../db';

export type ResearchPhase = 'INITIAL' | 'POST_SURVEY';
export function researchPhaseFor(id: number, trigger: string): ResearchPhase {
  if (/INITIAL|CONVERTED|CREATED/.test(trigger)) return 'INITIAL';
  if (/POST_SURVEY|SURVEY|DOCUMENT|PRODUCT|KEY_FIELD/.test(trigger)) return 'POST_SURVEY';
  return get('SELECT id FROM opportunity_research WHERE opportunity_id=? LIMIT 1', id) ? 'POST_SURVEY' : 'INITIAL';
}

/** Data is scoped to one opportunity and its source lead; no arbitrary ID is accepted from the model. */
export function opportunityResearchContext(id: number) {
  const opportunity = get<Record<string, unknown>>('SELECT * FROM opportunities WHERE id=?', id);
  if (!opportunity) throw new Error('Không tìm thấy cơ hội');
  const account = get<Record<string, unknown>>('SELECT * FROM accounts WHERE id=?', Number(opportunity.account_id));
  const contact = opportunity.primary_contact_id ? get<Record<string, unknown>>('SELECT * FROM contacts WHERE id=?', Number(opportunity.primary_contact_id)) : null;
  const lead = opportunity.lead_id ? get<Record<string, unknown>>('SELECT * FROM leads WHERE id=?', Number(opportunity.lead_id)) : null;
  const bant = lead ? get<Record<string, unknown>>('SELECT * FROM lead_assessments WHERE lead_id=? ORDER BY id DESC LIMIT 1', Number(lead.id)) : null;
  const interactions = all<{id:number;subject:string;body:string|null;type:string;occurred_at:string}>(
    "SELECT id,subject,body,type,occurred_at FROM activities WHERE (entity_type='opportunity' AND entity_id=?) OR (entity_type='lead' AND entity_id=?) ORDER BY occurred_at DESC,id DESC LIMIT 30", id, Number(lead?.id ?? 0));
  const documents = all<{id:number;name:string;fields_json:string|null}>(
    `SELECT DISTINCT d.id,d.name,(SELECT fields_json FROM document_extractions e WHERE e.document_id=d.id AND e.status!='REJECTED' ORDER BY e.id DESC LIMIT 1) fields_json
     FROM documents d JOIN document_links l ON l.document_id=d.id WHERE l.entity_type='opportunity' AND l.entity_id=? ORDER BY d.id DESC`, id);
  const products = all<{id:number;name:string;description:string|null;quantity:number}>(
    'SELECT p.id,p.name,p.description,i.quantity FROM opportunity_items i JOIN products p ON p.id=i.product_id WHERE i.opportunity_id=? ORDER BY i.id', id);
  const stakeholders=all('SELECT * FROM stakeholders WHERE opportunity_id=? ORDER BY id',id);
  const competitors=all('SELECT c.*,l.notes FROM opportunity_competitors l JOIN competitors c ON c.id=l.competitor_id WHERE l.opportunity_id=? ORDER BY l.id',id);
  const risks=all('SELECT * FROM opportunity_risks WHERE opportunity_id=? ORDER BY id',id);
  return { opportunity, account, contact, lead, bant, interactions, documents, products,stakeholders,competitors,risks };
}

export function researchFingerprint(id: number): string {
  return createHash('sha256').update(JSON.stringify(opportunityResearchContext(id))).digest('hex');
}
