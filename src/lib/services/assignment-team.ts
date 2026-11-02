import {all} from '../db';
import {assert} from '../domain';
/** Resolve only an unambiguous active team. Multi-team owners require explicit selection. */
export function assignmentTeam(ownerId:number|null,requested?:number|null):number|null {
 if(!ownerId){assert(!requested,'Chọn người phụ trách trước khi chọn nhóm');return null;}
 const teams=all<{team_id:number}>("SELECT DISTINCT m.team_id FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=? AND t.active=1 AND datetime(m.valid_from)<=datetime('now') AND (m.valid_to IS NULL OR datetime(m.valid_to)>datetime('now')) ORDER BY m.team_id",ownerId);
 if(requested){assert(teams.some(t=>t.team_id===requested),'Người phụ trách không thuộc nhóm đang chọn');return requested;}
 return teams.length===1?teams[0].team_id:null;
}
