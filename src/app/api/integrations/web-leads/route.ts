import {z} from 'zod';
import {integrationEndpoint} from '@/lib/integrations/http';
import {receiveWebLead} from '@/lib/services/inbound';
export const POST=integrationEndpoint('web-leads',z.object({company_name:z.string().min(1),contact_name:z.string().min(1),email:z.email(),phone:z.string().min(1),notes:z.string().optional(),owner_id:z.number().int().positive().optional()}).strict(),receiveWebLead);
