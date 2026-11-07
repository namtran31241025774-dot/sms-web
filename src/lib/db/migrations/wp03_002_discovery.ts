import type {Migration} from './types';
export const wp03_002_discovery:Migration={name:'wp03_002_discovery',up(db){
  const add=(table:string,name:string,ddl:string)=>{const cols=db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];if(cols.length && !cols.some(c=>c.name===name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);};
  for(const name of ['business_goals','current_process','pain_points','software_needs','expected_outcomes','technical_integration','technical_infrastructure','technical_security','technical_access']) add('opportunities',name,`${name} TEXT`);
  add('tasks','meeting_method','meeting_method TEXT');
  add('tasks','external_attendees_json',"external_attendees_json TEXT NOT NULL DEFAULT '[]'");
  add('documents','document_kind',"document_kind TEXT NOT NULL DEFAULT 'OTHER' CHECK(document_kind IN ('SURVEY','SCOPE','SOLUTION','COMPETITOR','OTHER'))");
  add('document_links','solution_id','solution_id INTEGER REFERENCES solutions(id)');
  add('opportunity_risks','responsible_user_id','responsible_user_id INTEGER REFERENCES users(id)');
}};
