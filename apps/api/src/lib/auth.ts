import type { RequestHandler, Response } from 'express';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@brightloop/shared';
import { prisma } from './db';
import { HttpError } from './http';

const COOKIE = 'bl_session';
export interface SessionUser { id: string; role: Role; name: string; email: string; customerId: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: SessionUser } }
}

export function setSession(res: Response, session: Session) {
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
  res.cookie(COOKIE, session.access_token, { ...options, maxAge: session.expires_in * 1000 });
  res.cookie('bl_refresh', session.refresh_token, { ...options, maxAge: 7 * 86_400_000 });
}
export const clearSession = (res: Response) => { res.clearCookie(COOKIE, { path: '/' }); res.clearCookie('bl_refresh', { path: '/' }); };

export const loadUser: RequestHandler = async (req, res, next) => {
  let token = req.cookies?.[COOKIE];
  if (!token && !req.cookies?.bl_refresh) return next();
  const client = supabase();
  let identity = token ? await client.auth.getUser(token) : null;
  if (!identity?.data.user && req.cookies?.bl_refresh) {
    const refreshed = await client.auth.refreshSession({ refresh_token: req.cookies.bl_refresh });
    if (refreshed.error || !refreshed.data.session) { clearSession(res); return next(); }
    setSession(res, refreshed.data.session);
    token = refreshed.data.session.access_token;
    identity = await client.auth.getUser(token);
  }
  if (identity?.data.user) {
    const u = await prisma.user.findUnique({ where: { authId: identity.data.user.id }, include: { customer: { select: { id: true } } } });
    if (u && ['ADMIN', 'STAFF', 'CUSTOMER'].includes(u.role)) req.user = { id: u.id, role: u.role as Role, name: u.name, email: u.email, customerId: u.customer?.id ?? null };
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  next();
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have access to this');
  next();
};

export const staffOnly = requireRole('ADMIN', 'STAFF');
export const adminOnly = requireRole('ADMIN');

/** Tiny in-memory limiter for login / reset endpoints. */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { n: number; until: number }>();
  return (req, _res, next) => {
    const key = req.ip ?? 'unknown';
    const t = Date.now();
    for (const [k, v] of hits) if (v.until < t) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.until < t) hits.set(key, { n: 1, until: t + windowMs });
    else if (++h.n > max) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    next();
  };
}
