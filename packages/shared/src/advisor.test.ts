import {describe,it,expect} from 'vitest';
import {buildAdvice} from './advisor';
const now=new Date('2026-10-31T00:00:00Z');
const sub=(o:Record<string,unknown>)=>({id:'1',name:'Svc',amount:1000,interval:'MONTHLY',nextRenewal:'2026-11-15',status:'ACTIVE',category:'AI',usage:'UNKNOWN',importance:3,purpose:'',...o}) as never;
describe('advisor rules',()=>{
 it('keeps high-usage service, never blind-cancels',()=>{const a=buildAdvice({subscriptions:[sub({usage:'HIGH',importance:2})],activities:[],intentions:[],now});expect(a[0]?.action).toBe('KEEP')});
 it('protects important service even with low usage',()=>{const a=buildAdvice({subscriptions:[sub({usage:'LOW',importance:5})],activities:[],intentions:[],now});expect(a.some(x=>x.action==='RECONSIDER'&&x.potentialMonthly>0)).toBe(false)});
 it('only suggests potential savings for low use + low importance',()=>{const a=buildAdvice({subscriptions:[sub({usage:'LOW',importance:1})],activities:[],intentions:[],now});expect(a[0]).toMatchObject({action:'RECONSIDER',potentialMonthly:1000})});
 it('delays future intention, prompts near start',()=>{const s=sub({status:'INTERESTED',nextRenewal:null});const far=buildAdvice({subscriptions:[s],activities:[],intentions:[{id:'i1',subscriptionId:'1',reason:'For exam',startDate:'2026-12-20',endDate:null,activityId:null,status:'PLANNED'}],now});expect(far[0]?.action).toBe('DELAY');const near=buildAdvice({subscriptions:[s],activities:[],intentions:[{id:'i1',subscriptionId:'1',reason:'For exam',startDate:'2026-11-05',endDate:null,activityId:null,status:'PLANNED'}],now});expect(near[0]?.action).toBe('SUBSCRIBE')});
 it('overlap is comparison only, zero assumed savings',()=>{const a=buildAdvice({subscriptions:[sub({id:'1',name:'A'}),sub({id:'2',name:'B'})],activities:[],intentions:[],now});const o=a.find(x=>x.action==='OVERLAP');expect(o?.potentialMonthly).toBe(0);expect(o?.reason).toContain('distinct')});
 it('respects dismissals and relevant upcoming activity keeps service',()=>{const a=buildAdvice({subscriptions:[sub({usage:'LOW',importance:1})],activities:[{id:'a1',title:'Final exam',kind:'EXAM',startDate:'2026-11-10',endDate:'2026-11-12'}],intentions:[],now});expect(a[0]?.action).toBe('KEEP')});
});
