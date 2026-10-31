import {Router} from 'express';
import {z} from 'zod';
import {profileSchema,activitySchema,intentSchema,buildAdvice,toMonthly,addInterval,type Interval} from '@brightloop/shared';
import {requireAuth} from '../lib/auth';
import {prisma} from '../lib/db';
import {parse,HttpError} from '../lib/http';
export const advisorRouter=Router();advisorRouter.use(requireAuth);
advisorRouter.get('/profile',async(req,res)=>res.json(await prisma.advisorProfile.findUnique({where:{userId:req.user!.id}})));
advisorRouter.put('/profile',async(req,res)=>{const d=parse(profileSchema,req.body);res.json(await prisma.advisorProfile.upsert({where:{userId:req.user!.id},create:{...d,userId:req.user!.id},update:d}))});
advisorRouter.get('/overview',async(req,res)=>{
 const userId=req.user!.id,now=new Date(),from=new Date(now.getTime()-90*86400000),until=new Date(now.getTime()+365*86400000);
 const [profile,subscriptions,activities,intentions,feedback]=await Promise.all([prisma.advisorProfile.findUnique({where:{userId}}),prisma.externalSubscription.findMany({where:{userId},orderBy:{name:'asc'}}),prisma.lifeActivity.findMany({where:{userId,endDate:{gte:from},startDate:{lte:until}},orderBy:{startDate:'asc'}}),prisma.subscriptionIntent.findMany({where:{userId},include:{subscription:true,activity:true},orderBy:{startDate:'asc'}}),prisma.advisorFeedback.findMany({where:{userId}})]);
 const recommendations=buildAdvice({subscriptions,activities,intentions,dismissed:feedback.filter(f=>f.action==='DISMISSED'||f.action==='NOT_RELEVANT'||f.action==='ACKNOWLEDGED').map(f=>f.recommendationKey),now});
 const active=subscriptions.filter(s=>s.status==='ACTIVE'),monthly=active.reduce((v,s)=>v+toMonthly(s.amount,s.interval as Interval),0);
 const potentialMonthly=recommendations.reduce((v,r)=>v+r.potentialMonthly,0);
 const categoryTotals=Object.entries(active.reduce<Record<string,number>>((m,s)=>{m[s.category]=(m[s.category]||0)+toMonthly(s.amount,s.interval as Interval);return m},{})).map(([category,amount])=>({category,amount}));
 const renewals: {id:string;title:string;date:Date;amount:number;type:string}[]=[];
 for(const s of active){if(!s.nextRenewal)continue;let d=s.nextRenewal;for(let i=0;i<400&&d<now;i++)d=addInterval(d,s.interval as Interval);for(let i=0;i<60&&d<=until;i++){renewals.push({id:`${s.id}:${d.toISOString()}`,title:s.name,date:d,amount:s.amount,type:'RENEWAL'});d=addInterval(d,s.interval as Interval)}}
 res.json({now,profile,subscriptions,activities,intentions,recommendations,categoryTotals,renewals,totals:{monthly,yearly:monthly*12,active:active.length,planned:subscriptions.filter(s=>s.status==='PLANNED').length,potentialMonthly,budget:profile?.budget??null,budgetRemaining:profile?.budget==null?null:profile.budget-monthly},feedback});
});
advisorRouter.get('/activities',async(req,res)=>res.json({items:await prisma.lifeActivity.findMany({where:{userId:req.user!.id},orderBy:{startDate:'asc'}})}));
advisorRouter.post('/activities',async(req,res)=>res.status(201).json(await prisma.lifeActivity.create({data:{...parse(activitySchema,req.body),userId:req.user!.id}})));
advisorRouter.put('/activities/:id',async(req,res)=>{const d=parse(activitySchema,req.body);const existing=await prisma.lifeActivity.findFirst({where:{id:String(req.params.id),userId:req.user!.id},select:{source:true}});if(!existing)throw new HttpError(404,'Activity not found');const r=await prisma.lifeActivity.updateMany({where:{id:String(req.params.id),userId:req.user!.id},data:{...d,kindLocked:existing.source==='GOOGLE'?true:undefined}});if(!r.count)throw new HttpError(404,'Activity not found');res.json({ok:true})});
advisorRouter.delete('/activities/:id',async(req,res)=>{const r=await prisma.lifeActivity.deleteMany({where:{id:String(req.params.id),userId:req.user!.id}});if(!r.count)throw new HttpError(404,'Activity not found');res.json({ok:true})});
advisorRouter.post('/intentions',async(req,res)=>{const d=parse(intentSchema,req.body),userId=req.user!.id;if(!await prisma.externalSubscription.findFirst({where:{id:d.subscriptionId,userId}}))throw new HttpError(404,'Subscription not found');if(d.activityId&&!await prisma.lifeActivity.findFirst({where:{id:d.activityId,userId}}))throw new HttpError(404,'Activity not found');res.status(201).json(await prisma.subscriptionIntent.create({data:{...d,userId}}))});
advisorRouter.patch('/intentions/:id',async(req,res)=>{const {status}=parse(z.object({status:z.enum(['PLANNED','DONE','DISMISSED'])}),req.body);const r=await prisma.subscriptionIntent.updateMany({where:{id:String(req.params.id),userId:req.user!.id},data:{status}});if(!r.count)throw new HttpError(404,'Intention not found');res.json({ok:true})});
advisorRouter.post('/feedback',async(req,res)=>{const d=parse(z.object({recommendationKey:z.string().min(1).max(1000),action:z.enum(['ACKNOWLEDGED','DISMISSED','NOT_RELEVANT','HELPFUL']),note:z.string().max(1000).default('')}),req.body);res.json(await prisma.advisorFeedback.upsert({where:{userId_recommendationKey:{userId:req.user!.id,recommendationKey:d.recommendationKey}},create:{...d,userId:req.user!.id},update:d}))});
