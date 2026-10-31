import { Router } from 'express';
import { externalSubscriptionSchema, toMonthly, type Interval } from '@brightloop/shared';
import { requireRole } from '../lib/auth';
import { prisma } from '../lib/db';
import { HttpError, parse } from '../lib/http';

export const externalRouter = Router();
externalRouter.use(requireRole('CUSTOMER'));
externalRouter.get('/', async (req,res) => {
  const items = await prisma.externalSubscription.findMany({ where: { userId: req.user!.id }, orderBy: [{ status: 'asc' }, { nextRenewal: 'asc' }] });
  const active = items.filter(i => i.status === 'ACTIVE');
  const monthly = active.reduce((sum,i) => sum + toMonthly(i.amount,i.interval as Interval),0);
  res.json({ items, totals: { monthly, yearly: monthly * 12, active: active.length } });
});
externalRouter.post('/', async(req,res) => {
  const d = parse(externalSubscriptionSchema,req.body);
  res.status(201).json(await prisma.externalSubscription.create({ data: { ...d, nextRenewal: new Date(d.nextRenewal), userId: req.user!.id } }));
});
externalRouter.put('/:id', async(req,res) => {
  const d = parse(externalSubscriptionSchema,req.body);
  const result = await prisma.externalSubscription.updateMany({ where: { id: String(req.params.id), userId: req.user!.id }, data: { ...d, nextRenewal: new Date(d.nextRenewal) } });
  if (!result.count) throw new HttpError(404,'Subscription not found');
  res.json({ ok:true });
});
externalRouter.delete('/:id', async(req,res) => {
  const result = await prisma.externalSubscription.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!result.count) throw new HttpError(404,'Subscription not found');
  res.json({ ok:true });
});
