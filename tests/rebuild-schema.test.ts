import {it,expect} from 'vitest';
import {schemaErDifferences} from '@/lib/services/schema-comparison';
import {all} from '@/lib/db';
it('FR-98: schema comparison reports named ERD storage differences without changing any schema',()=>{
 const before=all("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name");
 const rows=schemaErDifferences();
 expect(rows.find(r=>r.entity==='CONTACT')?.currentColumns.contacts).toContain('title');
 expect(rows.find(r=>r.entity==='OPP_COMPETITOR')?.tables).toContain('competitors');
 expect(rows.every(r=>r.decisionNeeded.length>0)).toBe(true);
 expect(all("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name")).toEqual(before);
});
