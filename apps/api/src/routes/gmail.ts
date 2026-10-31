import {z} from 'zod';
import {parse} from '../lib/http';
import {Router} from 'express';
import {receiptCandidate} from '@brightloop/shared';
import {requireRole,rateLimit} from '../lib/auth';
import {prisma} from '../lib/db';
import {gmailToken,gmailGet} from '../lib/gmail';
export const gmailRouter=Router();
gmailRouter.use(requireRole('CUSTOMER'));
gmailRouter.get('/',async(req,res)=>{const c=await prisma.gmailConnection.findUnique({where:{userId:req.user!.id},select:{email:true,connectedAt:true}});res.json({connected:!!c,...c})});
gmailRouter.delete('/',async(req,res)=>{await prisma.gmailConnection.deleteMany({where:{userId:req.user!.id}});res.json({ok:true})});
gmailRouter.post('/scan',rateLimit(90,60000),async(req,res)=>{
 const token=await gmailToken(req.user!.id);
 const {pageToken}=parse(z.object({pageToken:z.string().max(1024).optional()}),req.body||{});
 const list=await gmailGet<{messages?:{id:string;threadId:string}[];nextPageToken?:string}>(token,`messages?maxResults=30${pageToken?'&pageToken='+encodeURIComponent(pageToken):''}`);
 const candidates=new Map<string,NonNullable<ReturnType<typeof receiptCandidate>>>();
 const messages=list.messages||[];
 // Small batches bound Google requests and memory. No email body is persisted or sent to an LLM.
 for(let i=0;i<messages.length;i+=5){
  const batch=await Promise.all(messages.slice(i,i+5).map(m=>gmailGet<{id:string;threadId:string;snippet?:string;internalDate:string;payload?:{headers?:{name:string;value:string}[]}}>(token,`messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)));
  for(const m of batch){const headers=m.payload?.headers||[];const header=(name:string)=>headers.find(h=>h.name.toLowerCase()===name)?.value||'';const date=new Date(Number(m.internalDate)).toISOString();const c=receiptCandidate({id:m.id,threadId:m.threadId,subject:header('subject'),sender:header('from'),snippet:m.snippet||'',date});if(c){const old=candidates.get(c.name);if(!old||Date.parse(c.receiptDate||'')>Date.parse(old.receiptDate||''))candidates.set(c.name,c)}}
 }
 res.json({candidates:[...candidates.values()],scanned:messages.length,hasMore:!!list.nextPageToken,nextPageToken:list.nextPageToken||null});
});
