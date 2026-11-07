import type { Migration } from './types';
import { rebuildTable } from './rebuild-table';
export const wp08_002_edit_and_refresh: Migration = {
  name:'wp08_002_edit_and_refresh',
  up(db) {
    const fk=(db.prepare('PRAGMA foreign_keys').get() as {foreign_keys:number}).foreign_keys;
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try {
      const ddl=db.prepare("SELECT sql FROM sqlite_master WHERE name='ai_suggestions'").get() as {sql:string}|undefined;
      if(ddl && !ddl.sql.includes("'EDITED'")) rebuildTable(db,'ai_suggestions',sql=>sql.replace(/'APPROVED'\s*,\s*'REJECTED'/g,"'APPROVED','REJECTED','EDITED'"));
      const columns=db.prepare('PRAGMA table_info(opportunities)').all() as {name:string}[];
      if(columns.length && !columns.some(c=>c.name==='ai_refresh_due_at')) db.exec('ALTER TABLE opportunities ADD COLUMN ai_refresh_due_at TEXT');
      db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK');throw e;}
    finally {db.exec(`PRAGMA foreign_keys=${fk}`);}
  },
};
