import {describe,it,expect} from 'vitest';
import {externalSubscriptionSchema,suggestExternalSubscriptions,receiptCandidate} from './external';
describe('external subscription review',()=>{
 it('detects recurring merchants but does not classify all Amazon shopping as Prime',()=>{
  const results=suggestExternalSubscriptions('date,description,amount\n2026-09-12,NETFLIX,-649\n2026-10-12,NETFLIX,-649\n2026-10-13,AMAZON MARKETPLACE,-500\n');
  expect(results).toHaveLength(1);expect(results[0]).toMatchObject({name:'Netflix',amount:649,interval:'MONTHLY',nextRenewal:'2026-11-12',confidence:'LIKELY_RECURRING'});
 });
 it('marks a single charge as unconfirmed and rejects malformed imports',()=>{
  expect(suggestExternalSubscriptions('date,description,debit\n2026-10-01,AMAZON PRIME,1499')[0]?.confidence).toBe('NEEDS_REVIEW');
  expect(()=>suggestExternalSubscriptions('merchant,total\nNetflix,649')).toThrow();
 });
 it('rejects executable URLs and impossible dates',()=>{
  const data={name:'Netflix',amount:'649',interval:'MONTHLY',nextRenewal:'2026-02-30',managementUrl:'javascript:alert(1)'};
  expect(externalSubscriptionSchema.safeParse(data).success).toBe(false);
  expect(externalSubscriptionSchema.parse({...data,nextRenewal:'2026-02-28',managementUrl:'https://www.netflix.com/YourAccount'}).amount).toBe(64900);
 });
});

describe('receipt suggestions',()=>{
 it('keeps uncertain receipt amounts empty instead of guessing',()=>{
 const c=receiptCandidate({id:'a',threadId:'b',subject:'Netflix receipt',sender:'Netflix',snippet:'INR 499 paid; INR 649 next month',date:'2026-10-01'});
 expect(c?.amount).toBeNull();expect(c?.confidence).toBe('NEEDS_REVIEW');
 });
 it('extracts an unambiguous INR amount and ignores unrelated merchants',()=>{
 expect(receiptCandidate({id:'a',threadId:'b',subject:'Your Netflix payment',sender:'Netflix',snippet:'You paid INR 649',date:'2026-10-01'})?.amount).toBe(649);
 expect(receiptCandidate({id:'a',threadId:'b',subject:'Amazon shopping invoice',sender:'Amazon',snippet:'INR 649',date:'2026-10-01'})).toBeNull();
 });
});
