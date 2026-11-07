import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {SCHEMA_SQL} from '@/lib/db/schema';
import {runMigrations,MIGRATIONS} from '@/lib/db/migrations';
import {seed} from '@/lib/db/seed';
import {seedTanCang} from '@/lib/db/seeds/rebuild-tan-cang';
import {runAllSeeds} from '@/lib/db/seeds';
it('FR-36 FR-37 FR-41: fresh database seeds Tan Cang once and new migrations preserve populated records',()=>{
 const fresh=new DatabaseSync(':memory:');fresh.exec(SCHEMA_SQL);
 try{
  runMigrations(fresh);seed(fresh);
  const o=fresh.prepare("SELECT id,budget,customer_need FROM opportunities WHERE code='OPP-2026-0004'").get() as {id:number;budget:number;customer_need:string};
  expect(o.budget).toBe(700000000);expect(o.customer_need).toContain('100');
  fresh.prepare("UPDATE opportunities SET customer_need='Người dùng đã chỉnh' WHERE id=?").run(o.id);
  seedTanCang(fresh);expect((fresh.prepare('SELECT customer_need FROM opportunities WHERE id=?').get(o.id) as {customer_need:string}).customer_need).toBe('Người dùng đã chỉnh');
  expect(runMigrations(fresh).applied).toHaveLength(0);
  fresh.prepare("UPDATE settings SET value='77' WHERE key='bant_threshold'").run();
  fresh.prepare("UPDATE users SET password_hash='human-updated-hash',title='Người dùng đã sửa' WHERE id=1").run();
  runAllSeeds(fresh);
  expect((fresh.prepare("SELECT value FROM settings WHERE key='bant_threshold'").get() as {value:string}).value).toBe('77');
  expect((fresh.prepare('SELECT password_hash,title FROM users WHERE id=1').get() as {password_hash:string;title:string})).toEqual(expect.objectContaining({password_hash:'human-updated-hash',title:'Người dùng đã sửa'}));
 }finally{fresh.close();}
 const old=new DatabaseSync(':memory:');old.exec(SCHEMA_SQL);
 try{
  for(const m of MIGRATIONS.filter(m=>!['wp08_004_research_phases','wp03_002_discovery','wp04_002_customer_feedback'].includes(m.name)))m.up(old);
  old.exec("INSERT INTO accounts(id,name,name_norm) VALUES (999,'Existing','existing');INSERT INTO opportunities(id,code,name,account_id,customer_need) VALUES (999,'OLD','Existing',999,'Keep original');");
  for(const m of MIGRATIONS.filter(m=>['wp08_004_research_phases','wp03_002_discovery','wp04_002_customer_feedback'].includes(m.name))){m.up(old);m.up(old);}
  const row=old.prepare('SELECT customer_need,business_goals FROM opportunities WHERE id=999').get() as {customer_need:string;business_goals:null};
  expect(row).toEqual(expect.objectContaining({customer_need:'Keep original',business_goals:null}));
 }finally{old.close();}
});
