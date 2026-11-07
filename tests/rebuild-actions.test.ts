import {it,expect,vi} from 'vitest';
import {get,run} from '@/lib/db';
import {act} from '@/lib/action';
import {createQuoteAction} from '@/app/(app)/opportunities/actions';
import {quoteLines} from '@/lib/services/quotes';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth',()=>({requirePermission:vi.fn(async()=>({id:1,name:'Nguyễn Văn An',role:'SALES'}))}));
vi.mock('@/lib/action',async(original)=>({...await original<typeof import('@/lib/action')>(),act:vi.fn(async(_back,fn)=>fn())}));
it('FR-50 F9 BUG-055: create-quote action returns a real numeric route and inherits projected quantities at the price-list price',async()=>{
 const a=run("INSERT INTO accounts(name,name_norm) VALUES ('Quote action','quoteaction')").id;
 const opp=run("INSERT INTO opportunities(code,name,account_id,owner_id,stage,price_list_id,solution_confirmed) VALUES (?,'Quote action',?,1,'PROPOSE',1,1)",`QA-${a}`,a).id;
 run('INSERT INTO opportunity_items(opportunity_id,product_id,quantity,unit_price,amount) VALUES (?,1,2,1,2)',opp);
 const fd=new FormData();fd.set('id',String(opp));await createQuoteAction(fd);
 const result=await vi.mocked(act).mock.results.at(-1)!.value as {redirectTo:string};
 expect(result.redirectTo).toMatch(/^\/quotes\/\d+\?v=\d+$/);
 const version=Number(new URL(result.redirectTo,'http://localhost').searchParams.get('v'));
 expect(quoteLines(version)[0].quantity).toBe(2);expect(quoteLines(version)[0].unit_price).toBeGreaterThan(1);
 expect(get<{solution_confirmed:number}>('SELECT solution_confirmed FROM opportunities WHERE id=?',opp)?.solution_confirmed).toBe(1);
});
