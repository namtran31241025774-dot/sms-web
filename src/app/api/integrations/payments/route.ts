import {z} from 'zod';
import {integrationEndpoint} from '@/lib/integrations/http';
import {handleOnlinePaymentCallback} from '@/lib/services/payments';
export const POST=integrationEndpoint('payments',z.object({code:z.string().min(1),status:z.enum(['SUCCESS','FAILED'])}).strict(),p=>handleOnlinePaymentCallback(p.code,p.status));
