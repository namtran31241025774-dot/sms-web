import {it,expect} from 'vitest';
import {run} from '@/lib/db';
import {cashflowForecast} from '@/lib/services/cashflow';
import {can} from '@/lib/rbac';
it('FR-65 FR-99 C3: cashflow is fail-closed until roles configured and does not count invoices twice',()=>{
 const before=process.env.SMS_CASHFLOW_ROLES;delete process.env.SMS_CASHFLOW_ROLES;
 try{
  expect(can('FINANCE','report.cashflow')).toBe(false);expect(()=>cashflowForecast({id:5,role:'FINANCE'})).toThrow();
  process.env.SMS_CASHFLOW_ROLES='FINANCE';expect(can('SALES','report.cashflow')).toBe(false);
  const a=run("INSERT INTO accounts(name,name_norm) VALUES ('Cashflow','cashflow')").id;
  const opp=run("INSERT INTO opportunities(code,name,account_id,owner_id,stage) VALUES (?,'Cashflow',?,1,'CLOSE')",`CASHOPP-${a}`,a).id;
  const o=run("INSERT INTO orders(code,opportunity_id,account_id,total,grand_total,created_by,price_locked_at) VALUES (?, ?, ?,1000,1000,1,datetime('now'))",`CASH-${a}`,opp,a).id;
  const m=run("INSERT INTO billing_milestones(order_id,name,percentage,amount,due_date,status) VALUES (?,'Đợt 1',60,600,'2027-02-01','INVOICED')",o).id;
  run("INSERT INTO billing_milestones(order_id,name,percentage,amount,due_date) VALUES (?,'Đợt 2',40,400,'2027-03-01')",o);
  run("INSERT INTO invoices(code,order_id,milestone_id,milestone,amount,paid_amount,status,due_date) VALUES (?,?,?,'Đợt 1',600,200,'PARTIALLY_PAID','2027-02-01')",`CASH-INV-${a}`,o,m);
  const f=cashflowForecast({id:5,role:'FINANCE'}),entries=[...f.months.flatMap(x=>x.entries),...f.undated].filter(x=>x.orderId===o);
  expect(entries.reduce((s,e)=>s+e.amount,0)).toBe(800);expect(entries.filter(e=>e.kind==='INVOICE')[0].amount).toBe(400);
  expect(entries.filter(e=>e.kind==='BILLING_SCHEDULE')[0].amount).toBe(400);expect(entries.filter(e=>e.kind==='UNBILLED_ORDER')).toHaveLength(0);
  const usd=run("INSERT INTO orders(code,opportunity_id,account_id,total,grand_total,currency,created_by,price_locked_at) VALUES (?, ?, ?,999,999,'USD',1,datetime('now'))",`CASH-USD-${a}`,opp,a).id;
  const multi=cashflowForecast({id:5,role:'FINANCE'});expect(multi.excludedCurrencies).toContain('USD');expect([...multi.months.flatMap(m=>m.entries),...multi.undated].some(e=>e.orderId===usd)).toBe(false);
 }finally{if(before===undefined) delete process.env.SMS_CASHFLOW_ROLES;else process.env.SMS_CASHFLOW_ROLES=before;}
});
