import type {DatabaseSync} from 'node:sqlite';
/** Only fill an unassigned record when its owner has exactly one current active team. */
export function backfillAssignedTeams(db:DatabaseSync){
 for(const table of ['leads','opportunities']) db.exec(`UPDATE ${table} SET team_id=(SELECT MIN(m.team_id) FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=${table}.owner_id AND t.active=1 AND datetime(m.valid_from)<=datetime('now') AND (m.valid_to IS NULL OR datetime(m.valid_to)>datetime('now'))) WHERE team_id IS NULL AND (SELECT COUNT(DISTINCT m.team_id) FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=${table}.owner_id AND t.active=1 AND datetime(m.valid_from)<=datetime('now') AND (m.valid_to IS NULL OR datetime(m.valid_to)>datetime('now')))=1`);
}
