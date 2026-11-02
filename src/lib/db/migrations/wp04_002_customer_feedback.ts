import type {Migration} from './types';
export const wp04_002_customer_feedback:Migration={name:'wp04_002_customer_feedback',up(db){
 const cols=db.prepare('PRAGMA table_info(quote_responses)').all() as {name:string}[];
 if(cols.length && !cols.some(c=>c.name==='respondent_name')) db.exec('ALTER TABLE quote_responses ADD COLUMN respondent_name TEXT');
}};
