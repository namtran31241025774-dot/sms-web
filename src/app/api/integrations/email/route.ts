import {z} from 'zod';
import {integrationEndpoint} from '@/lib/integrations/http';
import {receiveEmail} from '@/lib/services/inbound';
export const POST=integrationEndpoint('email',z.object({entityType:z.enum(['lead','opportunity']),entityId:z.number().int().positive(),from:z.email(),to:z.email(),subject:z.string().min(1),body:z.string().min(1),messageId:z.string().min(1)}).strict(),receiveEmail);
