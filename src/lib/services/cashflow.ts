import {all} from '../db';
import {assert} from '../domain';
import {can} from '../rbac';
import type {UserScope} from '../scope';
import {recordVisible} from './access';
export type CashflowEntry={kind:'INVOICE'|'BILLING_SCHEDULE'|'UNBILLED_ORDER';id:number;orderId:number;code:string;amount:number;dueDate:string|null;month:string|null;status:string};
export function cashflowForecast(user:UserScope){
  assert(can(user.role,'report.cashflow'),'Quyền xem dòng tiền chưa được nhóm chốt hoặc vai trò không được cấp quyền');
  const orders=all<{id:number;code:string;status:string;grand_total:number;total:number;opportunity_id:number|null;created_by:number|null}>('SELECT id,code,status,grand_total,total,opportunity_id,created_by FROM orders');
  const entries:CashflowEntry[]=[];
  for(const o of orders){
    const visible=o.opportunity_id?recordVisible(user,'order',o.id):['FINANCE','ADMIN'].includes(user.role)||o.created_by===user.id;
    if(!visible) continue;
    const invoices=all<{id:number;code:string;amount:number;paid_amount:number;due_date:string|null;status:string;milestone_id:number|null}>("SELECT id,code,amount,paid_amount,due_date,status,milestone_id FROM invoices WHERE order_id=? AND status!='CANCELLED'",o.id);
    const date=(v:string|null)=>v && /^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):null;
    for(const i of invoices){const amount=Math.max(0,i.amount-i.paid_amount),dueDate=date(i.due_date);if(amount) entries.push({kind:'INVOICE',id:i.id,orderId:o.id,code:i.code,amount,dueDate,month:dueDate?.slice(0,7) ?? null,status:i.status});}
    if(o.status==='CANCELLED') continue;
    let remaining=Math.max(0,(o.grand_total || o.total)-invoices.reduce((s,i)=>s+i.amount,0));
    const schedules=all<{id:number;name:string;amount:number;due_date:string|null;status:string}>('SELECT id,name,amount,due_date,status FROM billing_milestones WHERE order_id=? ORDER BY due_date IS NULL,due_date,id',o.id);
    for(const s of invoices.some(i=>i.milestone_id===null) ? [] : schedules){
      // Subtract invoiced face value, not unpaid value: paid invoices must never reappear.
      const invoiced=invoices.filter(i=>i.milestone_id===s.id).reduce((sum,i)=>sum+i.amount,0);
      const amount=Math.min(remaining,Math.max(0,s.amount-invoiced));
      if(amount){const dueDate=date(s.due_date);entries.push({kind:'BILLING_SCHEDULE',id:s.id,orderId:o.id,code:s.name,amount,dueDate,month:dueDate?.slice(0,7) ?? null,status:s.status});remaining-=amount;}
    }
    if(remaining) entries.push({kind:'UNBILLED_ORDER',id:o.id,orderId:o.id,code:o.code,amount:remaining,dueDate:null,month:null,status:o.status});
  }
  const months=[...new Set(entries.flatMap(e=>e.month?[e.month]:[]))].sort().map(month=>({month,total:entries.filter(e=>e.month===month).reduce((s,e)=>s+e.amount,0),entries:entries.filter(e=>e.month===month)}));
  return {currency:'VND' as const,months,undated:entries.filter(e=>!e.month),total:entries.reduce((s,e)=>s+e.amount,0),pipelineIncluded:false as const,limitation:'Dự tính theo hạn hóa đơn/lịch đã nhập; giá trị chưa có ngày hoặc hóa đơn cũ chưa gắn lịch được tách riêng, không tự suy ngày thu tiền.'};
}
export type CashflowForecast=ReturnType<typeof cashflowForecast>;
