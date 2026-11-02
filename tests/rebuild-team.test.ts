import {it,expect} from 'vitest';
import {get,run} from '@/lib/db';
import {assignmentTeam} from '@/lib/services/assignment-team';
import {createLead,listLeads} from '@/lib/services/leads';
import {recordVisible} from '@/lib/services/access';
it('FR-82 FR-98 BUG-042: new intake inherits its owner sole active team; multi-team ownership is never guessed',()=>{
 const u=run("INSERT INTO users(name,email,role) VALUES ('Team fixture','team-fixture@example.com','SALES')").id;
 const t=run("INSERT INTO teams(code,name,leader_id) VALUES ('REBUILD-TEAM','Team fixture',4)").id;
 run("INSERT INTO team_members(team_id,user_id,valid_from) VALUES (?,?,'2020-01-01')",t,u);
 const actor={type:'USER' as const,id:u,role:'SALES' as const,name:'Team fixture'};
 const lead=createLead(actor,{company_name:'Team fixture',contact_name:'Khách'});
 expect(get<{team_id:number}>('SELECT team_id FROM leads WHERE id=?',lead)?.team_id).toBe(t);
 expect(recordVisible({id:4,role:'SALES_MANAGER'},'lead',lead)).toBe(true);
 const t2=run("INSERT INTO teams(code,name,leader_id) VALUES ('REBUILD-TEAM-2','Other team fixture',4)").id;
 run("INSERT INTO team_members(team_id,user_id,valid_from) VALUES (?,?,'2020-01-01')",t2,u);
 expect(assignmentTeam(u)).toBeNull();expect(assignmentTeam(u,t2)).toBe(t2);
 expect(()=>assignmentTeam(u,999999)).toThrow();
});
it('FR-82 FR-98 BUG-042: manager sees own records and the unassigned Lead queue but not unrelated assigned records',()=>{
 const queue=run("INSERT INTO leads(company_name,company_norm,contact_name) VALUES ('Queue','queue','Khách')").id;
 const own=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Manager own','managerown','Khách',4)").id;
 expect(recordVisible({id:4,role:'SALES_MANAGER'},'lead',own)).toBe(true);
 expect(listLeads({user:{id:4,role:'SALES_MANAGER'}}).some(x=>x.id===queue)).toBe(true);
 expect(recordVisible({id:3,role:'PRESALES'},'lead',queue)).toBe(false);
});
