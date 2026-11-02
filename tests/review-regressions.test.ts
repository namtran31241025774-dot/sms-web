import { beforeEach, describe, expect, it, vi } from "vitest";
import { get, run } from "@/lib/db";
import { batchConvertLeads, convertLeadToOpportunity } from "@/lib/services/qualification";
import type { Actor } from "@/lib/services/core";
import { authenticateWithPassword } from "@/lib/auth";
import { loginAction } from "@/app/login/actions";
import { createUser } from "@/lib/services/admin";
import { verifyPassword } from "@/lib/password";
import { createQuote, getAcceptedQuoteVersion } from "@/lib/services/quotes";
import { recordPayment, allocatePayment, handleOnlinePaymentCallback } from "@/lib/services/payments";
import { issueInvoice, reviewInvoiceDraft } from "@/lib/services/invoices";
import { getLead, listLeads, updateLead } from "@/lib/services/leads";
import { getOpportunity, listOpportunities } from "@/lib/services/opportunities";
import { recordVisible } from "@/lib/services/access";
import { getPerformanceSummary, setSalesTarget } from "@/lib/services/targets";
import { checkDiscount } from "@/lib/services/pricing";
import { can } from "@/lib/rbac";
import { reviewExpertSolution, reopenOpportunity, setChecklist, isExpertReviewRequired } from "@/lib/services/opportunities";
import { scoreBant } from "@/lib/services/qualification";
import { createSuggestion, approveSuggestion } from "@/lib/services/ai-review";
import { getPipelineFunnelReport } from "@/lib/services/reports";
import { requestApproval } from "@/lib/services/approvals";
import { gateState } from "@/lib/services/opportunities";
import { requestLeadMerge, approveLeadMerge } from "@/lib/services/dedupe";
import { createInvoiceDraftFromOrder } from "@/lib/services/invoices";
import { lockOrderPrice, completeOrderAndTransitionPostSales } from "@/lib/services/orders";
import {email} from '@/lib/integrations';

let sequence = 0;
const finance: Actor = { type: "USER", id: 902, name: "Review Finance", role: "FINANCE" };
function fixture() {
  const code = `REVIEW-${++sequence}`;
  const account = run("INSERT INTO accounts(name,name_norm) VALUES (?,?)", code, code).id;
  const opp = run("INSERT INTO opportunities(code,name,account_id,owner_id,stage,amount) VALUES (?,?,?,901,'DEVELOP',1000)", code,code,account).id;
  const order = run("INSERT INTO orders(code,opportunity_id,account_id,total,grand_total,price_locked_at) VALUES (?,?,?,1000,1000,datetime('now'))",code,opp,account).id;
  const invoice = run("INSERT INTO invoices(code,order_id,account_id,milestone,amount,status,created_by) VALUES (?,?,?,'Review',1000,'ISSUED',902)",code,order,account).id;
  return {account,opp,order,invoice};
}
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }) }));

const sales: Actor = { type: "USER", id: 901, name: "Review Sales", role: "SALES" };
beforeEach(() => {
  run("INSERT OR IGNORE INTO users (id,name,email,role) VALUES (901,'Review Sales','review@sms.local','SALES')");
  run("INSERT OR IGNORE INTO users (id,name,email,role) VALUES (902,'Review Finance','reviewfinance@sms.local','FINANCE')");
});
describe("Regression review 27/10", () => {
  it('HG8: BUG-026 email delivery failure cannot roll back an issued ERP invoice',()=>{
    const f=fixture();run("UPDATE invoices SET status='DRAFT' WHERE id=?",f.invoice);
    const send=vi.spyOn(email,'send').mockImplementation(()=>{throw new Error('mail unavailable');});
    try {
      expect(()=>issueInvoice(finance,f.invoice,{recipientEmail:'customer@example.com'})).toThrow('mail unavailable');
      expect(get<{status:string}>('SELECT status FROM invoices WHERE id=?',f.invoice)?.status).toBe('ISSUED');
      expect(get("SELECT id FROM audit_log WHERE entity_type='invoice' AND entity_id=? AND action='EMAIL_FAILED'",f.invoice)).toBeDefined();
    }finally{send.mockRestore();}
  });
  it("FR-95: BUG-036 only actual payload edits count as EDITED",()=>{
    const lead=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Edit','edit','Contact',901)").id;
    const base={runId:0,agent:'QUALIFICATION' as const,kind:'EMAIL_DRAFT' as const,entityType:'lead',entityId:lead,title:'Email',payload:{to:'contact@example.com',subject:'Subject',body:'Original'},evidence:[]};
    const unchanged=createSuggestion(base); approveSuggestion(sales,unchanged,{to:'contact@example.com',subject:'Subject',body:'Original'});
    expect(get<{status:string}>('SELECT status FROM ai_suggestions WHERE id=?',unchanged)?.status).toBe('APPROVED');
    const edited=createSuggestion(base); approveSuggestion(sales,edited,{body:'Human edit'});
    expect(get<{status:string}>('SELECT status FROM ai_suggestions WHERE id=?',edited)?.status).toBe('EDITED');
    expect(get<{edited_by_human:number}>('SELECT edited_by_human FROM email_messages WHERE suggestion_id=?',unchanged)?.edited_by_human).toBe(0);
    expect(get<{edited_by_human:number}>('SELECT edited_by_human FROM email_messages WHERE suggestion_id=?',edited)?.edited_by_human).toBe(1);
  });
  it("HG6: BUG-020 invalidates gate approvals when risk/importance changes",()=>{
    const f=fixture();
    run("UPDATE opportunities SET importance='HIGH' WHERE id=?",f.opp);
    const approval=requestApproval(sales,{kind:'OPP_STAGE_GATE',entityType:'opportunity',entityId:f.opp,reason:'Review'});
    run("UPDATE approvals SET status='APPROVED' WHERE id=?",approval);
    expect(gateState(getOpportunity(f.opp)!).approval?.status).toBe('APPROVED');
    run("INSERT INTO opportunity_risks(opportunity_id,description,severity,status,source) VALUES (?,'New risk','HIGH','OPEN','USER')",f.opp);
    expect(gateState(getOpportunity(f.opp)!).approval?.status).not.toBe('APPROVED');
  });
  it("FR-17: BUG-021 proposer cannot approve their own merge",()=>{
    const a=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Merge','merge','A',901)").id;
    const b=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Merge','merge','B',901)").id;
    const manager:Actor={type:'USER',id:901,name:'Manager',role:'SALES_MANAGER'};
    const approval=requestLeadMerge(manager,a,b,'Duplicate');
    expect(()=>approveLeadMerge(manager,approval)).toThrow(/tự|đề nghị/);
  });
  it("FR-60: BUG-023 price lock is idempotent and completion requires handover evidence",()=>{
    const f=fixture(); run("UPDATE orders SET price_locked_at='2020-01-01' WHERE id=?",f.order);
    lockOrderPrice(sales,f.order);
    expect(get<{price_locked_at:string}>('SELECT price_locked_at FROM orders WHERE id=?',f.order)?.price_locked_at).toBe('2020-01-01');
    expect(()=>completeOrderAndTransitionPostSales(sales,f.order,{})).toThrow(/bàn giao/);
  });
  it("FR-64: BUG-027 invoice tax follows order lines, including zero VAT",()=>{
    const f=fixture(), product=get<{id:number}>('SELECT id FROM products LIMIT 1')!.id;
    run("INSERT INTO order_lines(order_id,product_id,quantity,unit_price,discount_pct,line_total,tax_pct) VALUES (?,?,1,1000,0,1000,0)",f.order,product);
    run('DELETE FROM invoices WHERE id=?',f.invoice);
    const id=createInvoiceDraftFromOrder(finance,f.order,{milestoneName:'Half',amount:500});
    expect(get<{subtotal:number,tax_amount:number}>('SELECT subtotal,tax_amount FROM invoices WHERE id=?',id)).toEqual({subtotal:500,tax_amount:0});
    expect(get<{n:number}>('SELECT SUM(line_total) n FROM invoice_lines WHERE invoice_id=?',id)?.n).toBe(500);
  });
  it("FR-86: BUG-028 counts order value only for opportunities closed within the target period",()=>{
    const inside=fixture(), outside=fixture();
    run("UPDATE opportunities SET stage='WON',closed_at='2026-10-15',amount=999999 WHERE id=?",inside.opp);
    run("UPDATE opportunities SET stage='WON',closed_at='2026-07-15',amount=888888 WHERE id=?",outside.opp);
    setSalesTarget({periodType:'QUARTER',periodName:'2026-Q4',userId:901,targetAmount:10000,targetDeals:1},901);
    expect(getPerformanceSummary({periodName:'2026-Q4',userId:901}).actualRevenue).toBe(1000);
  });
  it("FR-98: BUG-016 ADMIN cannot approve sales gates or assume business roles",()=>{
    const admin:Actor={type:'USER',id:901,name:'Admin',role:'ADMIN'}, f=fixture();
    expect(()=>reviewExpertSolution(admin,f.opp,'APPROVED')).toThrow();
    expect(()=>reopenOpportunity(admin,f.opp,'Review')).toThrow(/Quản lý kinh doanh/);
    expect(()=>setChecklist(admin,f.opp,'solution_confirmed',true)).toThrow(/quyền|tư vấn giải pháp/);
    expect(can('SALES','invoice.create')).toBe(false);
    expect(can('DELIVERY','fulfillment.update')).toBe(true);
    expect(can('DELIVERY','order.write')).toBe(false);
    expect(checkDiscount(20,'ADMIN').requiresApproval).toBe(true);
  });
  it("FR-42: BUG-019 effort alone does not trigger expert review",()=>{
    const f=fixture();
    run("INSERT INTO solutions(opportunity_id,title,estimated_effort_mandays,integration_required) VALUES (?,'Effort',100,0)",f.opp);
    expect(isExpertReviewRequired(getOpportunity(f.opp)!).required).toBe(false);
  });
  it("FR-31: BUG-022 AI-approved BANT writes the canonical assessment",()=>{
    const lead=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('BANT','bant','Contact',901)").id;
    const sug=createSuggestion({runId:0,agent:'QUALIFICATION',kind:'BANT_SCORE',entityType:'lead',entityId:lead,title:'BANT',payload:{scores:{budget:20,authority:20,need:20,timeline:20},rationale:'Review'},evidence:[]});
    approveSuggestion(sales,sug);
    expect(get<{bant_score:number}>('SELECT bant_score FROM lead_assessments WHERE lead_id=?',lead)?.bant_score).toBe(80);
  });
  it("FR-99: BUG-029 forecast reads configured probabilities including zero",()=>{
    const f=fixture();
    run("INSERT OR REPLACE INTO settings(key,value) VALUES ('forecast_prob_develop','0')");
    const report=getPipelineFunnelReport({owner_id:901});
    expect(report.stages.find(s=>s.stage==='DEVELOP')?.weightedAmount).toBe(0);
    run("INSERT OR REPLACE INTO settings(key,value) VALUES ('forecast_prob_develop','20')");
    expect(getOpportunity(f.opp)).toBeDefined();
  });
  it("FR-31: BUG-041 honors configured zero BANT thresholds",()=>{
    const lead=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Zero','zero','Contact',901)").id;
    run("INSERT OR REPLACE INTO settings(key,value) VALUES ('bant_threshold','0')");
    expect(scoreBant(sales,lead,{budget:0,authority:1,need:0,timeline:0,timeline_frame:'IN_MONTH'}).rating).toBe('HOT');
    run("UPDATE settings SET value='60' WHERE key='bant_threshold'");
  });
  it("FR-98: BUG-014 filters lists, direct IDs and child records and blocks out-of-scope writes", () => {
    const f=fixture(), outsider={id:999,role:'SALES' as const};
    const lead=run("INSERT INTO leads(company_name,company_norm,contact_name,owner_id) VALUES ('Scoped','scoped','Contact',901)").id;
    expect(getLead(lead,outsider)).toBeUndefined();
    expect(listLeads({user:outsider}).some(r=>r.id===lead)).toBe(false);
    expect(getOpportunity(f.opp,outsider)).toBeUndefined();
    expect(listOpportunities({user:outsider}).some(r=>r.id===f.opp)).toBe(false);
    expect(recordVisible(outsider,'invoice',f.invoice)).toBe(false);
    expect(recordVisible({id:999,role:'SALES_MANAGER'},'opportunity',f.opp)).toBe(false);
    expect(recordVisible({id:999,role:'PRESALES'},'opportunity',f.opp)).toBe(false);
    expect(()=>updateLead({type:'USER',id:999,role:'SALES',name:'Other'},lead,{notes:'attack'})).toThrow(/phạm vi/);
    expect(getLead(lead,{id:901,role:'SALES'})).toBeDefined();
  });
  it("FR-49: BUG-018 cannot create a quote during DEVELOP", () => {
    const f = fixture();
    expect(() => createQuote(sales, f.opp)).toThrow(/Đề xuất giải pháp/);
    expect(get("SELECT id FROM quotes WHERE opportunity_id=?", f.opp)).toBeUndefined();
  });
  it("FR-56: BUG-018 accepted quote cannot bypass the CLOSE stage", () => {
    const f = fixture();
    const pl = get<{id:number}>("SELECT id FROM price_lists LIMIT 1")!.id;
    run("UPDATE opportunities SET stage='PROPOSE',price_list_id=? WHERE id=?", pl,f.opp);
    const q = createQuote(sales, f.opp);
    run("UPDATE quote_versions SET status='ACCEPTED' WHERE id=?", q.versionId);
    run("UPDATE opportunities SET stage='DEVELOP' WHERE id=?",f.opp);
    expect(() => getAcceptedQuoteVersion(q.versionId)).toThrow(/CLOSE|Tạo đơn hàng/);
  });
  it("FR-69: BUG-024 records an unallocated payment without inventing an invoice FK", () => {
    const f=fixture();
    const id=recordPayment(finance,{accountId:f.account,amount:100,paidAt:'2026-10-27'});
    expect(get<{invoice_id:number|null}>("SELECT invoice_id FROM payments WHERE id=?",id)?.invoice_id).toBeNull();
  });
  it("FR-69: BUG-024 rejects cross-account and cross-currency allocations atomically", () => {
    const f=fixture(), other=fixture();
    const id=recordPayment(finance,{accountId:f.account,amount:1000,paidAt:'2026-10-27'});
    expect(()=>allocatePayment(finance,id,[{invoiceId:other.invoice,amount:100}])).toThrow(/doanh nghiệp/);
    run("UPDATE orders SET currency='USD' WHERE id=?",f.order);
    expect(()=>allocatePayment(finance,id,[{invoiceId:f.invoice,amount:100}])).toThrow(/tiền/);
    expect(get<{n:number}>("SELECT count(*) n FROM payment_allocations WHERE payment_id=?",id)?.n).toBe(0);
  });
  it("FR-70: BUG-025 gateway success waits for finance reconciliation and is idempotent", () => {
    const f=fixture(), code=`GATE-${sequence}`;
    run("INSERT INTO payment_requests(code,invoice_id,amount) VALUES (?,?,1000)",code,f.invoice);
    expect(handleOnlinePaymentCallback(code,'SUCCESS').success).toBe(true);
    expect(handleOnlinePaymentCallback(code,'SUCCESS').success).toBe(true);
    expect(get<{status:string,paid_amount:number}>("SELECT status,paid_amount FROM invoices WHERE id=?",f.invoice)).toEqual({status:'ISSUED',paid_amount:0});
    expect(get<{source:string,reconciliation_status:string}>("SELECT source,reconciliation_status FROM payments WHERE reference=?",`GATEWAY-${code}`)).toEqual({source:'GATEWAY',reconciliation_status:'UNMATCHED'});
  });
  it("HG8: BUG-026 no fabricated recipient and independent review cannot self-approve", () => {
    const f=fixture(); run("UPDATE invoices SET status='DRAFT' WHERE id=?",f.invoice);
    run("INSERT OR REPLACE INTO settings(key,value) VALUES ('invoice_independent_review','true')");
    expect(()=>reviewInvoiceDraft(finance,f.invoice)).toThrow(/độc lập/);
    run("INSERT OR REPLACE INTO settings(key,value) VALUES ('invoice_independent_review','false')");
    expect(()=>issueInvoice(finance,f.invoice)).toThrow(/email|Email/);
    expect(get<{status:string}>("SELECT status FROM invoices WHERE id=?",f.invoice)?.status).toBe('DRAFT');
  });
  it("FR-97: BUG-015 refuses null password hashes and disables demo login by default", async () => {
    run("UPDATE users SET password_hash=NULL WHERE id=901");
    expect(await authenticateWithPassword("review@sms.local", "anything")).toBeNull();
    vi.stubEnv("SMS_DEMO_LOGIN", "false");
    const fd = new FormData(); fd.set("userId", "901");
    await expect(loginAction(fd)).rejects.toThrow(/redirect:\/login/);
    vi.unstubAllEnvs();
  });
  it("FR-96: BUG-015 creates unique random credentials instead of a shared default", () => {
    const first = createUser(sales, { name: "One", email: "one@review.local", role: "SALES" });
    const hash = get<{password_hash:string}>("SELECT password_hash FROM users WHERE id=?", first)!.password_hash;
    expect(verifyPassword("Password123!", hash)).toBe(false);
  });
  it("HG3: BUG-017 blocks Authority zero in both single and batch conversions", () => {
    const lead = run("INSERT INTO leads (company_name,company_norm,contact_name,owner_id,bant_budget,bant_authority,bant_need,bant_timeline,bant_score) VALUES ('Review','review','Contact',901,25,0,25,25,75)").id;
    expect(() => convertLeadToOpportunity(sales, lead, {})).toThrow(/người quyết định/);
    expect(batchConvertLeads(sales, [lead]).converted).toBe(0);
    expect(get<{status:string}>("SELECT status FROM leads WHERE id=?", lead)?.status).toBe("OPEN");
  });
});
