import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { forgotSchema, loginSchema, resetSchema, signupSchema, staffSchema } from '@brightloop/shared';
import { adminOnly, clearSession, rateLimit, requireAuth, setSession } from '../lib/auth';
import { audit } from '../lib/audit';
import { prisma } from '../lib/db';
import { HttpError, parse } from '../lib/http';
import { sendMail } from '../lib/mail';

export const authRouter = Router();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

authRouter.post('/signup', rateLimit(10, 15 * 60_000), async (req, res) => {
  const d = parse(signupSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    throw new HttpError(409, 'An account with this email already exists', { email: 'An account with this email already exists' });
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10), role: 'CUSTOMER' } });
    // If staff already created this customer, link the new login to it instead of duplicating.
    await tx.customer.upsert({ where: { email: d.email }, create: { name: d.name, email: d.email, userId: u.id }, update: { userId: u.id } });
    return u;
  });
  setSession(res, user.id);
  res.status(201).json({ id: user.id, role: user.role });
});

authRouter.post('/login', rateLimit(10, 15 * 60_000), async (req, res) => {
  const d = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: d.email } });
  if (!user || !(await bcrypt.compare(d.password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect');
  setSession(res, user.id);
  res.json({ id: user.id, role: user.role });
});

authRouter.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

authRouter.get('/me', requireAuth, (req, res) => res.json(req.user));

authRouter.post('/forgot', rateLimit(5, 15 * 60_000), async (req, res) => {
  const d = parse(forgotSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: d.email } });
  if (user) {
    const token = randomBytes(32).toString('hex');
    await prisma.resetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    await sendMail(user.email, 'Reset your Brightloop password',
      `Hi ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${WEB}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this email.`);
  }
  // Same answer either way so nobody can probe which emails have accounts.
  res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
});

authRouter.post('/reset', rateLimit(10, 15 * 60_000), async (req, res) => {
  const d = parse(resetSchema, req.body);
  const rec = await prisma.resetToken.findUnique({ where: { tokenHash: sha256(d.token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await bcrypt.hash(d.password, 10) } }),
    prisma.resetToken.updateMany({ where: { userId: rec.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
});

// ---------- Staff management (admin only) ----------

export const usersRouter = Router();
usersRouter.use(adminOnly);

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  res.json({ items: users });
});

usersRouter.post('/', async (req, res) => {
  const d = parse(staffSchema, req.body);
  const user = await prisma.user.create({ data: { email: d.email, name: d.name, role: 'STAFF', passwordHash: await bcrypt.hash(d.password, 10) }, select: { id: true, name: true, email: true, role: true } });
  await audit(prisma, 'user', user.id, 'Staff created', user.email, req.user!.name);
  res.status(201).json(user);
});
