import type {Role} from './domain';
/** C1–C6 pending. Preserve existing self-approval until explicitly configured.
 * Cashflow defaults to no access until the group selects roles. */
export function rebuildPolicy(){return {
  expertReviewerRole:'SALES_MANAGER' as Role,
  allowStageSelfApproval:process.env.SMS_ALLOW_STAGE_SELF_APPROVAL!=='false',
  cashflowRoles:(process.env.SMS_CASHFLOW_ROLES ?? '').split(',').map(r=>r.trim()).filter(r=>['SALES','SALES_MANAGER','PRESALES','FINANCE','DELIVERY','ADMIN'].includes(r)) as Role[],
};}
