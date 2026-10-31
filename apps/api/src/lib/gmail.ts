import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {prisma} from './db';
import {HttpError} from './http';
function key(){const value=process.env.GMAIL_TOKEN_KEY||'';if(!/^[a-f0-9]{64}$/i.test(value))throw new HttpError(503,'Gmail token encryption is not configured');return Buffer.from(value,'hex')}
export function encryptToken(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64')}
export function decryptToken(value:string){const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')}
export async function connectGmail(userId:string,access:string,refresh?:string|null){
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new HttpError(403,'Gmail access was not granted. Enable Gmail API in Google Cloud, then connect again.');
 const profile=await response.json() as {emailAddress:string};
 const old=await prisma.gmailConnection.findUnique({where:{userId}});
 await prisma.gmailConnection.upsert({where:{userId},create:{userId,email:profile.emailAddress,accessToken:encryptToken(access),refreshToken:refresh?encryptToken(refresh):null,expiresAt:new Date(Date.now()+3500000)},update:{email:profile.emailAddress,accessToken:encryptToken(access),refreshToken:refresh?encryptToken(refresh):old?.refreshToken,expiresAt:new Date(Date.now()+3500000)}});
}
export async function gmailToken(userId:string){
 const connection=await prisma.gmailConnection.findUnique({where:{userId}});if(!connection)throw new HttpError(409,'Connect Gmail first');
 if(connection.expiresAt.getTime()>Date.now())return decryptToken(connection.accessToken);
 if(!connection.refreshToken)throw new HttpError(409,'Gmail access expired. Reconnect Gmail.');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:decryptToken(connection.refreshToken),client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||''}),signal:AbortSignal.timeout(10000)});
 const result=await response.json() as {access_token?:string;expires_in?:number};if(!response.ok||!result.access_token)throw new HttpError(409,'Gmail authorization expired or was revoked. Reconnect Gmail.');
 await prisma.gmailConnection.update({where:{userId},data:{accessToken:encryptToken(result.access_token),expiresAt:new Date(Date.now()+((result.expires_in||3600)-60)*1000)}});return result.access_token;
}
export async function gmailGet<T>(token:string,path:string):Promise<T>{
 for(let attempt=0;attempt<4;attempt++){
  let response:Response;
  try { response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}); }
  catch { if(attempt<3){await new Promise(r=>setTimeout(r,1000*2**attempt));continue}throw new HttpError(503,'Gmail is temporarily unreachable. Your review list is kept; resume the scan shortly.'); }
  if(response.ok)return response.json() as Promise<T>;
  const body=await response.json().catch(()=>({})) as {error?:{errors?:{reason?:string}[];status?:string}};
  const reasons=body.error?.errors?.map(e=>e.reason||'')||[];
  const limited=response.status===429||reasons.some(r=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(r));
  const transient=limited||response.status>=500;
  if(transient&&attempt<3){const retryAfter=Number(response.headers.get('retry-after'));await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(1000*2**attempt,Number.isFinite(retryAfter)?retryAfter*1000:0))));continue}
  // Only diagnostic codes are logged; never tokens, message ids, subjects or content.
  console.warn('[gmail]',{status:response.status,reasons});
  if(response.status===401)throw new HttpError(409,'Gmail access expired. Reconnect Gmail to continue.');
  if(response.status===404)throw new HttpError(404,'This email is no longer available.');
  if(limited)throw new HttpError(429,'Google temporarily limited mailbox requests. Your discoveries are safe; resume the scan in a moment.');
  if(response.status===403)throw new HttpError(403,'Google denied access to Gmail. Reconnect and grant read access, or check your Google account restrictions.');
  if(response.status===400)throw new HttpError(400,'The mailbox changed during scanning. Start a fresh scan to continue.');
  throw new HttpError(503,'Gmail is temporarily unavailable. Your discoveries are safe; resume the scan shortly.');
 }
 throw new HttpError(503,'Gmail is temporarily unavailable.');
}
