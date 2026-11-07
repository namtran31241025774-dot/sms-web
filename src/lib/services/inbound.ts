import {get,run,tx} from '../db';
import {assert} from '../domain';
import {emitEvent} from '../events';
import {createLead,type LeadInput} from './leads';
import {addActivity,audit} from './core';
import {allocatePayment,recordPayment,getPayment} from './payments';

export function receiveWebLead(input:LeadInput) {
  if(input.owner_id) assert(get("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('SALES','SALES_MANAGER')",input.owner_id),'Người nhận hồ sơ không hợp lệ');
  return {leadId:createLead({type:'INTEGRATION',name:'WEB_FORM'},{...input,source:'WEB'})};
}
export function receiveEmail(input:{entityType:'lead'|'opportunity';entityId:number;from:string;to:string;subject:string;body:string;messageId:string}) {
  return tx(()=>{
    const sender=input.from.trim().toLowerCase();
    let contactId:number|null=null;
    if(input.entityType==='lead') {
      const lead=get<{email:string|null;contact_id:number|null}>('SELECT email,contact_id FROM leads WHERE id=? AND deleted_at IS NULL AND merged_into_lead_id IS NULL',input.entityId);
      assert(lead,'Không tìm thấy hồ sơ');
      const contact=lead.contact_id ? get<{email:string}>('SELECT email FROM contacts WHERE id=?',lead.contact_id) : undefined;
      assert(sender===lead.email?.toLowerCase() || sender===contact?.email?.toLowerCase(),'Người gửi chưa liên kết hồ sơ');
      contactId=lead.contact_id;
    } else {
      const contact=get<{id:number}>(`SELECT c.id FROM contacts c JOIN opportunities o ON o.id=? WHERE lower(c.email)=? AND (c.id=o.primary_contact_id OR EXISTS(SELECT 1 FROM stakeholders s WHERE s.opportunity_id=o.id AND s.contact_id=c.id))`,input.entityId,sender);
      assert(contact,'Người gửi chưa liên kết cơ hội');contactId=contact.id;
    }
    const existing=get<{id:number;entity_type:string;entity_id:number}>('SELECT id,entity_type,entity_id FROM email_messages WHERE direction=\'IN\' AND provider_ref=?',input.messageId);
    if(existing) {
      assert(existing.entity_type===input.entityType && existing.entity_id===input.entityId,'Mã email đã gắn với hồ sơ khác');
      return {messageId:existing.id};
    }
    const messageId=run("INSERT INTO email_messages(entity_type,entity_id,to_email,subject,body,status,direction,contact_id,provider_ref) VALUES (?,?,?,?,?,'SENT','IN',?,?)",input.entityType,input.entityId,input.to,input.subject,input.body,contactId,input.messageId).id;
    addActivity({entityType:input.entityType,entityId:input.entityId,type:'EMAIL',direction:'IN',subject:input.subject,body:input.body,source:'INTEGRATION'});
    emitEvent(input.entityType==='lead'?'lead.email_received':'opportunity.key_field_changed',input.entityType==='lead'?{leadId:input.entityId}:{opportunityId:input.entityId});
    audit({type:'INTEGRATION',name:'EMAIL'},input.entityType,input.entityId,'EMAIL_RECEIVED',{details:{messageId}});
    return {messageId};
  });
}
export function receiveAccountingPayment(input:{accountId:number;amount:number;currency:string;paidAt:string;transactionId:string;allocations:Array<{invoiceId:number;amount:number}>}) {
  return tx(()=>{
    const actor={type:'INTEGRATION' as const,name:'ERP'};
    const existing=get<{id:number}>('SELECT id FROM payments WHERE external_transaction_id=?',input.transactionId);
    const paymentId=existing?.id ?? recordPayment(actor,{accountId:input.accountId,amount:input.amount,currency:input.currency,paidAt:input.paidAt,externalTransactionId:input.transactionId,reference:input.transactionId,source:'ERP'});
    const payment=getPayment(paymentId)!;
    assert(payment.account_id===input.accountId && payment.amount===input.amount && payment.currency===input.currency,'Giao dịch đối soát không khớp');
    if(input.allocations.length) allocatePayment(actor,paymentId,input.allocations);
    return {paymentId};
  });
}
