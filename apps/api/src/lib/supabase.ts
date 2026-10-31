import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http';

export function supabase(admin = false) {
  const url = process.env.SUPABASE_URL;
  const key = admin ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Supabase is not configured on the server');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Store only the short-lived PKCE verifier; final session uses the app's HttpOnly cookies. */
export function oauthClient(req: import('express').Request, res: import('express').Response) {
  const values = new Map<string, string>();
  supabase(); // Validate environment before constructing the request-scoped client.
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storage: {
      getItem(name) { return name.endsWith('-code-verifier') ? values.get(name) ?? req.cookies?.bl_oauth_verifier ?? null : null; },
      setItem(name,value) { if (name.endsWith('-code-verifier')) { values.set(name,value); res.cookie('bl_oauth_verifier',value,{ httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth',maxAge:600_000 }); } },
      removeItem(name) { if (name.endsWith('-code-verifier')) { values.delete(name); res.clearCookie('bl_oauth_verifier',{path:'/api/auth'}); } },
    },
  } });
}
