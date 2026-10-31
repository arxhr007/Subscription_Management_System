import {z} from 'zod';
import {zMoney} from './schemas';
import {toMonthly} from './billing';
import type {Interval} from './enums';
export const advisorCategories=['Entertainment','AI','Education','Productivity','Development','Cloud','Design','Gaming','Music','Lifestyle','Other'] as const;
export const activityKinds=['EXAM','PROJECT','HACKATHON','VACATION','TRAVEL','LEARNING','WORK','RELEASE','OTHER'] as const;
export const profileSchema=z.object({name:z.string().trim().min(2).max(100),occupation:z.enum(['STUDENT','PROFESSIONAL','FREELANCER','OTHER']),interests:z.array(z.string().trim().min(1).max(60)).max(30),activities:z.string().max(1000).default(''),budget:z.preprocess(v=>v===''||v==null?null:v,zMoney('Budget').nullable()),notifications:z.boolean().default(true)});
export const activitySchema=z.object({title:z.string().trim().min(2).max(150),description:z.string().max(2000).default(''),kind:z.enum(activityKinds),startDate:z.coerce.date(),endDate:z.coerce.date()}).refine(d=>d.endDate>=d.startDate,{path:['endDate'],message:'End must be on or after start'});
export const intentSchema=z.object({subscriptionId:z.string().min(1),activityId:z.string().nullable().optional(),reason:z.string().trim().min(3).max(1000),startDate:z.coerce.date(),endDate:z.preprocess(v=>v===''||v==null?null:v,z.coerce.date().nullable())}).refine(d=>!d.endDate||d.endDate>=d.startDate,{path:['endDate'],message:'End must be on or after start'});
export interface AdvisorSubscription{id:string;name:string;amount:number;interval:string;nextRenewal:Date|string|null;status:string;category:string;usage:string;importance:number;purpose:string}
export interface AdvisorActivity{id:string;title:string;kind:string;startDate:Date|string;endDate:Date|string}
export interface AdvisorIntent{id:string;subscriptionId:string;reason:string;startDate:Date|string;endDate:Date|string|null;activityId:string|null;status:string}
export interface Advice{key:string;action:'SUBSCRIBE'|'KEEP'|'RECONSIDER'|'DELAY'|'OVERLAP';title:string;reason:string;activity:string|null;financialImpact:string;potentialMonthly:number;ifIgnored:string;subscriptionId:string;priority:number;date:string|null}
const relevant:Record<string,string[]>={EXAM:['AI','Education','Productivity'],PROJECT:['AI','Productivity','Development','Cloud','Design'],HACKATHON:['AI','Development','Cloud','Design','Productivity'],VACATION:['Entertainment','Gaming','Music','Lifestyle'],TRAVEL:['Entertainment','Music','Lifestyle'],LEARNING:['Education','AI'],WORK:['AI','Productivity','Development','Design']};
export function buildAdvice(input:{subscriptions:AdvisorSubscription[];activities:AdvisorActivity[];intentions:AdvisorIntent[];dismissed?:string[];now?:Date}){
 const now=input.now||new Date(),day=86400000,month=now.toISOString().slice(0,7),advice:Advice[]=[];
 const days=(value:Date|string)=>Math.ceil((new Date(value).getTime()-now.getTime())/day);
 const monthly=(s:AdvisorSubscription)=>toMonthly(s.amount,s.interval as Interval);
 const leisureCats=['Entertainment','Gaming','Music','Lifestyle'];
 const exam=input.activities.find(a=>a.kind==='EXAM'&&days(a.endDate)>=0&&days(a.startDate)<=14);
 const examDone=input.activities.filter(a=>a.kind==='EXAM'&&days(a.endDate)<0&&days(a.endDate)>=-14).sort((a,b)=>+new Date(b.endDate)-+new Date(a.endDate))[0];
 const leisure=input.activities.find(a=>(a.kind==='VACATION'||a.kind==='TRAVEL')&&days(a.endDate)>=0&&days(a.startDate)<=30);
 for(const s of input.subscriptions){
  const upcoming=input.activities.find(a=>days(a.endDate)>=0&&days(a.startDate)<=30&&(relevant[a.kind]||[]).includes(s.category));
  const intent=input.intentions.filter(i=>i.subscriptionId===s.id&&i.status==='PLANNED'&&(!i.endDate||days(i.endDate)>=0)).sort((a,b)=>+new Date(a.startDate)-+new Date(b.startDate))[0];
  const renewal=s.nextRenewal?days(s.nextRenewal):null;
  const base={subscriptionId:s.id,activity:upcoming?.title||null,potentialMonthly:0,date:s.nextRenewal?new Date(s.nextRenewal).toISOString():null};
  let handled=false;
  if(leisureCats.includes(s.category)&&exam){
   if(s.status==='ACTIVE'&&s.importance<5&&s.interval!=='YEARLY'){advice.push({...base,key:`exam-hold:${s.id}:${new Date(exam.startDate).toISOString().slice(0,10)}`,action:'RECONSIDER',title:`Hold ${s.name} until “${exam.title}” is over`,reason:`Exam: ${new Date(exam.startDate).toISOString().slice(0,10)} → ${new Date(exam.endDate).toISOString().slice(0,10)}. Importance ${s.importance}/5.`,activity:exam.title,financialImpact:'Pausing before the next charge skips the exam-period cost.',potentialMonthly:monthly(s),ifIgnored:'It renews as normal during your exam period.',priority:days(exam.startDate)<=0?90:78});handled=true;}
   else if(s.status!=='ACTIVE'){advice.push({...base,key:`exam-delay:${s.id}:${new Date(exam.endDate).toISOString().slice(0,10)}`,action:'DELAY',title:`Take ${s.name} after “${exam.title}” ends`,reason:`Exam ends ${new Date(exam.endDate).toISOString().slice(0,10)}.`,activity:exam.title,date:new Date(exam.endDate).toISOString(),financialImpact:'No cost until you start it.',ifIgnored:'Stays on your list.',priority:72});handled=true;}
  }
  if(!handled&&leisureCats.includes(s.category)&&(examDone||leisure)){
   const when=examDone?{title:examDone.title,date:new Date(examDone.endDate),label:`“${examDone.title}” finished ${new Date(examDone.endDate).toISOString().slice(0,10)}`}:{title:leisure!.title,date:new Date(leisure!.startDate),label:`“${leisure!.title}” starts ${new Date(leisure!.startDate).toISOString().slice(0,10)}`};
   if(s.status!=='ACTIVE'){advice.push({...base,key:`leisure-start:${s.id}:${when.date.toISOString().slice(0,10)}`,action:'SUBSCRIBE',title:`Good time to take ${s.name}`,reason:`${when.label}.`,activity:when.title,date:when.date.toISOString(),financialImpact:'Costs the provider price when you start.',ifIgnored:'Stays on your list. No charge.',priority:66});handled=true;}
   else if(s.usage!=='LOW'){advice.push({...base,key:`leisure-keep:${s.id}:${when.date.toISOString().slice(0,10)}`,action:'KEEP',title:`Keep ${s.name} — your free window is here`,reason:`${when.label}.`,activity:when.title,financialImpact:'Current charge continues.',ifIgnored:'No change.',priority:58});handled=true;}
  }
  if(handled){/* schedule rule wins for this service */}
  else if(s.status==='ACTIVE'){
   if(s.usage==='HIGH'||s.importance>=4||upcoming){advice.push({...base,key:`keep:${s.id}:${month}:${upcoming?.id||''}`,action:'KEEP',title:`Keep ${s.name} in your plan`,reason:upcoming?`For “${upcoming.title}”.`:s.usage==='HIGH'?'You use it a lot.':'You marked it important.',financialImpact:`${s.interval.toLowerCase()} charge continues.`,ifIgnored:'No change.',priority:upcoming?70:35});}
   else if(s.usage==='LOW'&&s.importance<=2){advice.push({...base,key:`review:${s.id}:${s.nextRenewal?new Date(s.nextRenewal).toISOString().slice(0,10):month}`,action:'RECONSIDER',title:`Review ${s.name} before paying again`,reason:'Low use, low importance, nothing coming up that needs it.',financialImpact:'Cancelling before the next charge avoids it.',potentialMonthly:monthly(s),ifIgnored:'Renews as usual.',priority:renewal!==null&&renewal<=7?95:60});}
   else if(renewal!==null&&renewal>=0&&renewal<=7){advice.push({...base,key:`renewal:${s.id}:${new Date(s.nextRenewal!).toISOString().slice(0,10)}`,action:'RECONSIDER',title:`${s.name} renews ${renewal===0?'today':`in ${renewal} days`}`,reason:s.usage==='UNKNOWN'?'Usage not recorded yet.':'Check you still need it.',financialImpact:'Plan continues unless you change it.',ifIgnored:'Renews as usual.',priority:85});}
  }else if(intent){const wait=days(intent.startDate);advice.push({...base,key:`intent:${intent.id}:${new Date(intent.startDate).toISOString().slice(0,10)}`,action:wait>14?'DELAY':'SUBSCRIBE',title:wait>14?`Wait until closer to ${s.name}’s planned start`:`Review activating ${s.name}`,reason:`You planned this for ${new Date(intent.startDate).toISOString().slice(0,10)}: ${intent.reason}`,activity:input.activities.find(a=>a.id===intent.activityId)?.title||null,date:new Date(intent.startDate).toISOString(),financialImpact:wait>14?'Waiting avoids paying early.':'Adds the recurring cost when started.',ifIgnored:'Stays planned.',priority:wait>14?45:90});}
 }
 const categories=[...new Set(input.subscriptions.filter(s=>s.status==='ACTIVE'&&s.category!=='Other').map(s=>s.category))];
 const usageRank:Record<string,number>={HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0};
 for(const category of categories){const group=input.subscriptions.filter(s=>s.status==='ACTIVE'&&s.category===category);if(group.length>1){const ranked=[...group].sort((a,b)=>(b.importance-a.importance)||((usageRank[b.usage]||0)-(usageRank[a.usage]||0)));const keep=ranked[0]!,rotate=ranked.slice(1);advice.push({key:`overlap:${category}:${group.map(s=>s.id).sort().join(',')}:${month}`,action:'OVERLAP',title:`Don't run ${group.map(s=>s.name).join(' + ')} together — rotate them`,reason:`Same category. ${keep.name} scores higher on your importance and use — keep it, pause the rest, swap next month.`,activity:null,financialImpact:`Pausing ${rotate.map(s=>s.name).join(', ')} avoids the overlap charge.`,potentialMonthly:rotate.reduce((v,s)=>v+monthly(s),0),ifIgnored:'All keep charging.',subscriptionId:keep.id,priority:62,date:null});}}
 return advice.filter(a=>!input.dismissed?.includes(a.key)).sort((a,b)=>b.priority-a.priority).slice(0,20);
}
