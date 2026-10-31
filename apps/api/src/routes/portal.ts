// Customer self-service: customers only ever see and act on their own records.
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../lib/auth';
import { now } from '../lib/clock';
import { prisma } from '../lib/db';
import { broadcast } from '../lib/events';
import { HttpError, notFound, parse } from '../lib/http';
import { invoiceDetail, recordPayment } from './finance';
import { renewById, subscriptionDetail, transitionSubscription } from './subscriptions';

export const portalRouter = Router();
portalRouter.use(requireRole('CUSTOMER'));

const myCustomerId = (req: { user?: { customerId: string | null } }) => {
  if (!req.user?.customerId) throw new HttpError(403, 'No customer profile is linked to this account');
  return req.user.customerId;
};

async function ownSubscription(id: string, customerId: string) {
  const s = await prisma.subscription.findUnique({ where: { id }, select: { customerId: true, status: true } });
  if (!s || s.customerId !== customerId) throw notFound('Subscription');
  return s;
}

portalRouter.get('/overview', async (req, res) => {
  const customerId = myCustomerId(req);
  const at = now();
  const [customer, subscriptions, invoices] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    prisma.subscription.findMany({
      where: { customerId, status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' },
      include: { plan: true, lines: true },
    }),
    prisma.invoice.findMany({
      where: { customerId, status: { not: 'DRAFT' } }, orderBy: { issueDate: 'desc' }, take: 60,
      select: { id: true, number: true, status: true, issueDate: true, dueDate: true, total: true, amountPaid: true, subscription: { select: { number: true } } },
    }),
  ]);
  const withFlags = invoices.map((i) => ({ ...i, overdue: i.status === 'CONFIRMED' && i.dueDate < at }));
  res.json({
    customer, subscriptions, invoices: withFlags, now: at,
    totals: { due: withFlags.filter((i) => i.status === 'CONFIRMED').reduce((s, i) => s + i.total - i.amountPaid, 0), overdue: withFlags.filter((i) => i.overdue).length },
  });
});

portalRouter.get('/subscriptions/:id', async (req, res) => {
  await ownSubscription(req.params.id, myCustomerId(req));
  const { timeline, ...detail } = await subscriptionDetail(req.params.id);
  res.json({ ...detail, timeline: timeline.filter((t) => t.action !== 'Edited') });
});

const ACTIONS = { accept: 'CONFIRMED', pause: 'PAUSED', resume: 'ACTIVE', close: 'CLOSED' } as const;

portalRouter.post('/subscriptions/:id/action', async (req, res) => {
  const { action } = parse(z.object({ action: z.enum(['accept', 'pause', 'resume', 'close', 'renew']) }), req.body);
  const sub = await ownSubscription(req.params.id, myCustomerId(req));
  const actor = `${req.user!.name} (customer)`;
  if (action === 'renew') await renewById(req.params.id, actor);
  else {
    if (action === 'accept' && sub.status !== 'QUOTATION') throw new HttpError(409, 'Only a quotation can be accepted');
    if (action === 'resume' && sub.status !== 'PAUSED') throw new HttpError(409, 'Only a paused subscription can be resumed');
    await transitionSubscription(req.params.id, ACTIONS[action], actor);
  }
  res.json({ ok: true });
});

portalRouter.get('/invoices/:id', async (req, res) => {
  const inv = await invoiceDetail(req.params.id);
  if (inv.customerId !== myCustomerId(req) || inv.status === 'DRAFT') throw notFound('Invoice');
  res.json(inv);
});

/** Simulated online payment (no real gateway in this prototype). */
portalRouter.post('/invoices/:id/pay', async (req, res) => {
  const { method } = parse(z.object({ method: z.enum(['CARD', 'UPI']) }), req.body);
  const inv = await invoiceDetail(req.params.id);
  if (inv.customerId !== myCustomerId(req)) throw notFound('Invoice');
  await prisma.$transaction((tx) => recordPayment(tx, { invoiceId: inv.id, method, amount: inv.amountDue, date: now(), note: 'Paid online via customer portal (simulated)' }, `${req.user!.name} (customer)`));
  broadcast('payments', 'invoices');
  res.json(await invoiceDetail(inv.id));
});
