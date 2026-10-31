import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@brightloop/shared';
import { prisma } from './db';
import { HttpError } from './http';

const COOKIE = 'bl_session';
const SECRET = process.env.JWT_SECRET ?? '';
if (SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters (see apps/api/.env.example)');

export interface SessionUser { id: string; role: Role; name: string; email: string; customerId: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: SessionUser } }
}

export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86_400_000 });
}
export const clearSession = (res: Response) => res.clearCookie(COOKIE);

/** Loads the user from the session cookie on every request (role changes apply immediately). */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, SECRET) as { sub: string };
    const u = await prisma.user.findUnique({ where: { id: sub }, include: { customer: { select: { id: true } } } });
    if (u) req.user = { id: u.id, role: u.role as Role, name: u.name, email: u.email, customerId: u.customer?.id ?? null };
  } catch { /* invalid or expired token → anonymous */ }
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
    const key = `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`;
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.until < t) hits.set(key, { n: 1, until: t + windowMs });
    else if (++h.n > max) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    next();
  };
}
