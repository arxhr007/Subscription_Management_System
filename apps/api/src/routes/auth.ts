import { connectGmail } from '../lib/gmail';
import { Router } from 'express';
import { loginSchema, signupSchema, staffSchema } from '@brightloop/shared';
import { adminOnly, clearSession, rateLimit, requireAuth, setSession } from '../lib/auth';
import { audit } from '../lib/audit';
import { prisma } from '../lib/db';
import { HttpError, parse } from '../lib/http';
import { supabase, oauthClient } from '../lib/supabase';

export const authRouter = Router();
const publicUser = { id: true, name: true, email: true, role: true, createdAt: true } as const;

async function createAccount(d: { name: string; email: string; password: string }, role: 'CUSTOMER' | 'STAFF') {
  // Never claim an existing customer profile based on an unverified email address.
  if (await prisma.user.findUnique({ where: { email: d.email } }) || await prisma.customer.findUnique({ where: { email: d.email } })) {
    throw new HttpError(409, 'This email is already registered. Contact your administrator.');
  }
  const client = supabase(true);
  const { data, error } = await client.auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true });
  if (error || !data.user) throw new HttpError(400, 'Unable to create account. Check the email and password.');
  try {
    return await prisma.user.create({ data: {
      authId: data.user.id, email: d.email, name: d.name, role,
      ...(role === 'CUSTOMER' ? { customer: { create: { name: d.name, email: d.email } } } : {}),
    }, select: publicUser });
  } catch (error) {
    await client.auth.admin.deleteUser(data.user.id);
    throw error;
  }
}

authRouter.post('/signup', rateLimit(10, 900_000), async (req, res) => {
  res.status(201).json(await createAccount(parse(signupSchema, req.body), 'CUSTOMER'));
});
authRouter.post('/login', rateLimit(10, 900_000), async (req, res) => {
  const d = parse(loginSchema, req.body);
  const { data, error } = await supabase().auth.signInWithPassword(d);
  if (error || !data.session) throw new HttpError(401, 'Email or password is incorrect');
  const user = await prisma.user.findUnique({ where: { authId: data.user.id }, select: publicUser });
  if (!user) throw new HttpError(403, 'No application profile is linked. Contact your administrator.');
  setSession(res, data.session);
  res.json(user);
});
authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.bl_session;
  if (token) await supabase(true).auth.admin.signOut(token, 'local');
  clearSession(res);
  res.json({ ok: true });
});
authRouter.get('/me', requireAuth, (req, res) => res.json(req.user));

export const usersRouter = Router();
usersRouter.use(adminOnly);
usersRouter.get('/', async (_req, res) => res.json({ items: await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] } }, select: publicUser, orderBy: { createdAt: 'asc' } }) }));
usersRouter.post('/', async (req, res) => {
  const user = await createAccount(parse(staffSchema, req.body), 'STAFF');
  await audit(prisma, 'user', user.id, 'Staff created', user.email, req.user!.name);
  res.status(201).json(user);
});

// Google grants identity only; it does not grant access to Play purchases or Gmail.
authRouter.get('/providers', async (_req,res) => {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '' }, signal: AbortSignal.timeout(5000) });
    const settings = await response.json() as { external?: { google?: boolean } };
    res.json({ google: response.ok && settings.external?.google === true });
  } catch { res.json({ google: false }); }
});
authRouter.get('/google', rateLimit(20,60_000), async (req,res) => {
  const gmail = req.query.gmail === '1';
  if (gmail && (!req.user || req.user.role !== 'CUSTOMER')) throw new HttpError(403,'Sign in as a customer before connecting Gmail');
  if (gmail) res.cookie('bl_gmail_user',req.user!.id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth',maxAge:600_000});
  else res.clearCookie('bl_gmail_user',{path:'/api/auth'});
  res.cookie('bl_oauth_popup', req.query.popup === '1' ? '1' : '0', { httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth',maxAge:600_000 });
  const { data,error } = await oauthClient(req,res).auth.signInWithOAuth({ provider:'google', options: { redirectTo: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/api/auth/callback`, skipBrowserRedirect:true, scopes: gmail ? 'https://www.googleapis.com/auth/gmail.readonly' : undefined, queryParams: gmail ? {prompt:'consent select_account',access_type:'offline'} : { prompt: 'select_account' } } });
  if (error || !data.url) return res.redirect('/login?oauth_error=unavailable');
  res.redirect(data.url);
});
authRouter.get('/callback', async(req,res) => {
  const gmailOwner = req.cookies?.bl_gmail_user as string | undefined;
  res.clearCookie('bl_gmail_user',{path:'/api/auth'});
  const popup = req.cookies?.bl_oauth_popup === '1';
  res.clearCookie('bl_oauth_popup',{path:'/api/auth'});
  const fail = (reason:string) => res.redirect(popup ? `/auth/complete?error=${reason}` : `/login?oauth_error=${reason}`);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code || !req.cookies?.bl_oauth_verifier) return fail('expired');
  const { data,error } = await oauthClient(req,res).auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) return fail('failed');
  if (gmailOwner) {
    const owner=await prisma.user.findUnique({where:{id:gmailOwner}});
    if (!owner || owner.role!=='CUSTOMER' || owner.authId!==data.user.id || !data.session.provider_token) return res.redirect('/portal/external?gmail_error=account');
    try { await connectGmail(owner.id,data.session.provider_token,data.session.provider_refresh_token); }
    catch { return res.redirect('/portal/external?gmail_error=permission'); }
    setSession(res,data.session);
    return res.redirect('/portal/external?gmail_connected=1');
  }
  const identity = data.user;
  let user = await prisma.user.findUnique({ where:{authId:identity.id} });
  if (!user) {
    const email = identity.email?.toLowerCase();
    if (!email || !identity.email_confirmed_at) return fail('unverified');
    // Never attach Google login to an existing application profile by email alone.
    if (await prisma.user.findUnique({where:{email}}) || await prisma.customer.findUnique({where:{email}})) return fail('existing');
    try {
      user = await prisma.user.create({data:{ authId:identity.id,email,name:String(identity.user_metadata?.full_name || email.split('@')[0]).slice(0,100),role:'CUSTOMER',customer:{create:{email,name:String(identity.user_metadata?.full_name || email.split('@')[0]).slice(0,100)}} }});
    } catch { user = await prisma.user.findUnique({where:{authId:identity.id}}); }
  }
  if (!user) return fail('failed');
  setSession(res,data.session);
  res.redirect(popup ? '/auth/complete' : user.role==='CUSTOMER'?'/portal':'/');
});
