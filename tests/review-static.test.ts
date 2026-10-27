import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {QUALIFICATION_SYSTEM,OPPORTUNITY_SYSTEM} from '@/lib/agents/prompts';
describe('Review static contracts',()=>{
  it('FR-89: BUG-038 prompt includes qualification uncertainty and no-insight rules',()=>{
    expect(QUALIFICATION_SYSTEM).toContain('Authority > 0');
    expect(QUALIFICATION_SYSTEM).toContain('confidence < 0.6');
    expect(OPPORTUNITY_SYSTEM).toContain('NO_INSIGHT');
    expect(OPPORTUNITY_SYSTEM).toContain('TỐI ĐA 3');
  });
  it('FR-100: BUG-040 only actual test titles with a leading requirement code count',()=>{
    const fixture='// FR-99\ndescribe("FR-98",()=>{});\nit("FR-01: real test",()=>{});\nit("mentions FR-02 later",()=>{});\ntest.each([1])("HG3: real gate",()=>{});';
    const program=`import {testCodes} from './scripts/test-codes.mjs'; console.log(JSON.stringify(testCodes(${JSON.stringify(fixture)})));`;
    const output=execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8'});
    expect(JSON.parse(output)).toEqual(['FR-01','HG3']);
  });
});
