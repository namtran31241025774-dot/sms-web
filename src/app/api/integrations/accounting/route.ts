import {z} from 'zod';
import {integrationEndpoint} from '@/lib/integrations/http';
import {receiveAccountingPayment} from '@/lib/services/inbound';
export const POST=integrationEndpoint('accounting',z.object({accountId:z.number().int().positive(),amount:z.number().int().positive(),currency:z.string().length(3),paidAt:z.iso.datetime(),transactionId:z.string().min(1),allocations:z.array(z.object({invoiceId:z.number().int().positive(),amount:z.number().int().positive()}).strict())}).strict(),receiveAccountingPayment);
