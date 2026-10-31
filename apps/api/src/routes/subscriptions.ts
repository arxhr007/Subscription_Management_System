import { Router } from 'express';
import { z } from 'zod';
import {
  addInterval, listQuerySchema, priceInvoice, SUB_STATUSES, subscriptionSchema, templateSchema, transitionError,
  type SubStatus,
} from '@brightloop/shared';
import { staffOnly } from '../lib/auth';
import { audit } from '../lib/audit';
import { activateSubscription, invoiceNextPeriod, loadPricingContext, pricingLines, refreshSubscriptionTotals, renewSubscription } from '../lib/billing';
import { now } from '../lib/clock';
import { nextNumber, prisma, type Tx } from '../lib/db';
import { broadcast } from '../lib/events';
import { HttpError, notFound, paging, parse } from '../lib/http';

type LineInput = { productId: string; variantId: string | null; quantity: number; unitPrice: number | null };

/** Resolves product/variant prices and checks every line; errors point at the exact field (lines.2.quantity). */
export async function resolveLines(db: Tx | typeof prisma, lines: LineInput[], minQuantity = 1) {
  const products = await db.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } }, include: { variants: true } });
  const fields: Record<string, string> = {};
  const out = lines.map((l, i) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p || !p.active) { fields[`lines.${i}.productId`] = 'This product is not available'; return null; }
    const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : null;
    if (l.variantId && !v) { fields[`lines.${i}.variantId`] = 'This variant does not belong to the product'; return null; }
    if (l.quantity < minQuantity) { fields[`lines.${i}.quantity`] = `The plan needs at least ${minQuantity}`; return null; }
    return {
      productId: p.id, variantId: v?.id ?? null, quantity: l.quantity,
      description: v ? `${p.name} (${v.attribute}: ${v.value})` : p.name,
      unitPrice: l.unitPrice ?? p.salesPrice + (v?.extraPrice ?? 0),
    };
  });
  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted lines', fields);
  return out as NonNullable<(typeof out)[number]>[];
}

async function loadPlan(db: Tx | typeof prisma, planId: string, startDate: Date) {
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) throw new HttpError(400, 'Choose an active plan', { planId: 'This plan is not active' });
  if ((plan.startDate && startDate < plan.startDate) || (plan.endDate && startDate > plan.endDate)) {
    throw new HttpError(400, 'The plan is not available on that start date', { startDate: 'Outside the plan’s availability dates' });
  }
  return plan;
}

export const subscriptionsRouter = Router();
subscriptionsRouter.use(staffOnly);

subscriptionsRouter.get('/', async (req, res) => {
  const q = parse(listQuerySchema.extend({ planId: z.string().optional() }), req.query);
  const where = {
    ...(q.status && SUB_STATUSES.includes(q.status as SubStatus) ? { status: q.status } : {}),
    ...(q.planId ? { planId: q.planId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q } }, { customer: { name: { contains: q.q } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where, orderBy: { createdAt: 'desc' }, ...paging(q.page, q.pageSize),
      select: {
        id: true, number: true, status: true, startDate: true, expiryDate: true, nextInvoiceDate: true, periodTotal: true, mrr: true,
        customer: { select: { id: true, name: true } }, plan: { select: { id: true, name: true, interval: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

subscriptionsRouter.get('/counts', async (_req, res) => {
  const rows = await prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } });
  res.json(Object.fromEntries(rows.map((r) => [r.status, r._count._all])));
});

subscriptionsRouter.get('/options', async (req, res) => {
  const q = String(req.query.q ?? '').slice(0, 60);
  const items = await prisma.subscription.findMany({
    where: q ? { OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }] } : {}, take: 20, orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, customer: { select: { name: true } } },
  });
  res.json({ items });
});

export async function subscriptionDetail(id: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: {
      customer: true, plan: true, lines: { include: { product: true } },
      invoices: { orderBy: { periodStart: 'desc' }, take: 24, select: { id: true, number: true, status: true, issueDate: true, dueDate: true, total: true, amountPaid: true, periodStart: true, periodEnd: true } },
    },
  });
  if (!sub) throw notFound('Subscription');
  const [timeline, ctx] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: 'subscription', entityId: id }, orderBy: { at: 'desc' }, take: 50 }),
    loadPricingContext(),
  ]);
  // What the next invoice will look like, with today's discount and tax rules applied.
  const nextAt = sub.nextInvoiceDate ?? sub.startDate;
  const nextInvoice = sub.status === 'CLOSED' ? null : {
    periodStart: nextAt, periodEnd: addInterval(nextAt, sub.plan.interval as never),
    ...priceInvoice(pricingLines(sub), { discounts: ctx.discounts, taxes: ctx.taxes, at: nextAt, subscriptionId: sub.id }),
  };
  return { ...sub, timeline, nextInvoice, now: now() };
}

subscriptionsRouter.get('/:id', async (req, res) => res.json(await subscriptionDetail(req.params.id)));

subscriptionsRouter.post('/', async (req, res) => {
  const d = parse(subscriptionSchema, req.body);
  const sub = await prisma.$transaction(async (tx) => {
    const plan = await loadPlan(tx, d.planId, d.startDate);
    if (!(await tx.customer.findUnique({ where: { id: d.customerId } }))) throw new HttpError(400, 'Choose a customer', { customerId: 'Customer not found' });
    const lines = await resolveLines(tx, d.lines, plan.minQuantity);
    const template = d.templateId ? await tx.quotationTemplate.findUnique({ where: { id: d.templateId } }) : null;
    const at = now();
    const s = await tx.subscription.create({
      data: {
        number: await nextNumber(tx, 'SUB', at.getUTCFullYear()),
        customerId: d.customerId, planId: plan.id, templateId: template?.id ?? null,
        status: template ? 'QUOTATION' : 'DRAFT',
        quotationExpiresAt: template ? new Date(at.getTime() + template.validityDays * 86_400_000) : null,
        startDate: d.startDate, expiryDate: d.expiryDate, paymentTerm: d.paymentTerm, autoRenew: d.autoRenew, notes: d.notes,
        lines: { create: lines },
      },
    });
    await refreshSubscriptionTotals(tx, s.id);
    await audit(tx, 'subscription', s.id, 'Created', template ? `From template “${template.name}” as a quotation` : 'As draft', req.user!.name);
    return s;
  });
  broadcast('subscriptions');
  res.status(201).json(sub);
});

subscriptionsRouter.put('/:id', async (req, res) => {
  const d = parse(subscriptionSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Subscription');
    if (!['DRAFT', 'QUOTATION'].includes(existing.status)) throw new HttpError(409, 'Only draft or quotation subscriptions can be edited');
    const plan = await loadPlan(tx, d.planId, d.startDate);
    const lines = await resolveLines(tx, d.lines, plan.minQuantity);
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: existing.id } });
    await tx.subscription.update({
      where: { id: existing.id },
      data: { customerId: d.customerId, planId: plan.id, startDate: d.startDate, expiryDate: d.expiryDate, paymentTerm: d.paymentTerm, autoRenew: d.autoRenew, notes: d.notes, lines: { create: lines } },
    });
    await refreshSubscriptionTotals(tx, existing.id);
    await audit(tx, 'subscription', existing.id, 'Edited', undefined, req.user!.name);
  });
  broadcast('subscriptions');
  res.json(await subscriptionDetail(req.params.id));
});

/** Moves a subscription through its lifecycle, enforcing the plan's rules. Shared with the customer portal. */
export async function transitionSubscription(id: string, to: SubStatus, actor: string) {
  const sub = await prisma.subscription.findUnique({ where: { id }, include: { plan: true, customer: true } });
  if (!sub) throw notFound('Subscription');
  const err = transitionError(sub.status as SubStatus, to, sub.plan);
  if (err) throw new HttpError(409, err);
  const at = now();

  await prisma.$transaction(async (tx) => {
    if (to === 'QUOTATION') {
      const tpl = sub.templateId ? await tx.quotationTemplate.findUnique({ where: { id: sub.templateId } }) : null;
      const days = tpl?.validityDays ?? 30;
      await tx.subscription.update({ where: { id }, data: { status: 'QUOTATION', quotationExpiresAt: new Date(at.getTime() + days * 86_400_000) } });
      await audit(tx, 'subscription', id, 'Quotation sent', `Valid for ${days} days`, actor);
    } else if (to === 'CONFIRMED') {
      await tx.subscription.update({ where: { id }, data: { status: 'CONFIRMED', quotationExpiresAt: null } });
      await audit(tx, 'subscription', id, 'Confirmed', undefined, actor);
      if (sub.startDate <= at) await activateSubscription(tx, sub, actor);
    } else if (to === 'ACTIVE') {
      if (sub.status === 'PAUSED') {
        await tx.subscription.update({ where: { id }, data: { status: 'ACTIVE' } });
        await audit(tx, 'subscription', id, 'Resumed', undefined, actor);
      } else await activateSubscription(tx, sub, actor);
    } else if (to === 'PAUSED') {
      await tx.subscription.update({ where: { id }, data: { status: 'PAUSED' } });
      await audit(tx, 'subscription', id, 'Paused', 'Billing is on hold', actor);
    } else if (to === 'CLOSED') {
      await tx.subscription.update({ where: { id }, data: { status: 'CLOSED', closedReason: `Closed by ${actor}` } });
      await audit(tx, 'subscription', id, 'Closed', undefined, actor);
    } else if (to === 'DRAFT') {
      await tx.subscription.update({ where: { id }, data: { status: 'DRAFT', quotationExpiresAt: null } });
      await audit(tx, 'subscription', id, 'Back to draft', undefined, actor);
    }
  });

  broadcast('subscriptions');
}

subscriptionsRouter.post('/:id/transition', async (req, res) => {
  const { to } = parse(z.object({ to: z.enum(SUB_STATUSES) }), req.body);
  await transitionSubscription(req.params.id, to, req.user!.name);
  res.json(await subscriptionDetail(req.params.id));
});

export async function renewById(id: string, actor: string) {
  const sub = await prisma.subscription.findUnique({ where: { id }, include: { plan: true } });
  if (!sub) throw notFound('Subscription');
  if (!sub.plan.renewable) throw new HttpError(409, 'This plan cannot be renewed');
  if (!['ACTIVE', 'PAUSED'].includes(sub.status)) throw new HttpError(409, 'Only active or paused subscriptions can be renewed');
  if (!sub.expiryDate) throw new HttpError(409, 'This subscription has no expiry date, so it never needs renewing');
  await prisma.$transaction((tx) => renewSubscription(tx, sub, actor));
  broadcast('subscriptions');
}

subscriptionsRouter.post('/:id/renew', async (req, res) => {
  await renewById(req.params.id, req.user!.name);
  res.json(await subscriptionDetail(req.params.id));
});

subscriptionsRouter.patch('/:id/auto-renew', async (req, res) => {
  const { autoRenew } = parse(z.object({ autoRenew: z.boolean() }), req.body);
  await prisma.subscription.update({ where: { id: req.params.id }, data: { autoRenew } });
  await audit(prisma, 'subscription', req.params.id, autoRenew ? 'Auto-renew on' : 'Auto-renew off', undefined, req.user!.name);
  broadcast('subscriptions');
  res.json(await subscriptionDetail(req.params.id));
});

subscriptionsRouter.post('/:id/invoice', async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!sub) throw notFound('Subscription');
  if (sub.status !== 'ACTIVE') throw new HttpError(409, 'Only active subscriptions can be invoiced');
  const inv = await invoiceNextPeriod(sub.id, req.user!.name);
  if (!inv) throw new HttpError(409, 'That period is already invoiced — nothing was billed twice');
  res.status(201).json(inv);
});

// ---------- Renewal radar ----------

export const renewalsRouter = Router();
renewalsRouter.use(staffOnly);

renewalsRouter.get('/', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const at = now();
  const items = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] }, expiryDate: { lte: new Date(at.getTime() + days * 86_400_000) } },
    orderBy: { expiryDate: 'asc' }, take: 300,
    select: {
      id: true, number: true, status: true, expiryDate: true, autoRenew: true, mrr: true,
      customer: { select: { name: true } }, plan: { select: { name: true, autoClose: true, renewable: true, closable: true } },
    },
  });
  res.json({ items, now: at });
});

// ---------- Quotation templates ----------

export const templatesRouter = Router();
templatesRouter.use(staffOnly);

templatesRouter.get('/', async (_req, res) => {
  const items = await prisma.quotationTemplate.findMany({ orderBy: { name: 'asc' }, include: { plan: true, lines: true } });
  res.json({ items });
});

templatesRouter.post('/', async (req, res) => {
  const d = parse(templateSchema, req.body);
  const lines = await resolveLines(prisma, d.lines);
  const t = await prisma.quotationTemplate.create({
    data: { name: d.name, validityDays: d.validityDays, planId: d.planId, paymentTerm: d.paymentTerm, notes: d.notes, lines: { create: lines.map((l, i) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: d.lines[i].unitPrice })) } },
  });
  broadcast('catalog');
  res.status(201).json(t);
});

templatesRouter.put('/:id', async (req, res) => {
  const d = parse(templateSchema, req.body);
  const lines = await resolveLines(prisma, d.lines);
  const t = await prisma.$transaction(async (tx) => {
    await tx.templateLine.deleteMany({ where: { templateId: req.params.id } });
    return tx.quotationTemplate.update({
      where: { id: req.params.id },
      data: { name: d.name, validityDays: d.validityDays, planId: d.planId, paymentTerm: d.paymentTerm, notes: d.notes, lines: { create: lines.map((l, i) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: d.lines[i].unitPrice })) } },
    });
  });
  broadcast('catalog');
  res.json(t);
});

templatesRouter.delete('/:id', async (req, res) => {
  await prisma.quotationTemplate.delete({ where: { id: req.params.id } });
  broadcast('catalog');
  res.json({ ok: true });
});
