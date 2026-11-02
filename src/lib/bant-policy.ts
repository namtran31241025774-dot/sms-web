import {assert} from './domain';
export const BANT_SCORES=[0,8,15,25] as const;
export function requireBantLevel(value:number){assert(BANT_SCORES.includes(value as 0|8|15|25),'BANT phải dùng mức 0, 8, 15 hoặc 25');return value;}
/** REBUILD-01 Q1: end user/influencer is not an identified decision maker. */
export function bantQualified(total:number,authority:number,threshold:number){return total>=threshold && authority===25;}
