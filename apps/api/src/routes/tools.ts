// Time Machine, spreadsheet import and the local Outbox.
import { Router } from 'express';
import { z } from 'zod';
import { addInterval, clockAdvanceSchema, csvToObjects, PAYMENT_TERM_KEYS, toCents, zEmail, type Interval } from '@brightloop/shared';
import { adminOnly, requireAuth, staffOnly } from '../lib/auth';
import { audit } from '../lib/audit';
import { refreshSubscriptionTotals, runAllJobs } from '../lib/billing';
import { clockOffsetMs, now, setClockOffset } from '../lib/clock';
import { nextNumber, prisma } from '../lib/db';
import { broadcast } from '../lib/events';
import { HttpError, parse } from '../lib/http';

const DAY = 86_400_000;

// ---------- Time Machine ----------

export const clockRouter = Router();

clockRouter.get('/', requireAuth, (_req, res) => res.json({ now: now(), offsetDays: Math.round(clockOffsetMs() / DAY) }));

clockRouter.post('/advance', adminOnly, async (req, res) => {
  const { days } = parse(clockAdvanceSchema, req.body);
  const before = now();
  await setClockOffset(clockOffsetMs() + days * DAY);
  await audit(prisma, 'clock', 'clock', 'Time Machine', `+${days} day(s): ${before.toISOString().slice(0, 10)} → ${now().toISOString().slice(0, 10)}`, req.user!.name);
  const summary = await runAllJobs('Time Machine');
  broadcast('clock', 'subscriptions', 'invoices');
  res.json({ now: now(), offsetDays: Math.round(clockOffsetMs() / DAY), summary });
});

clockRouter.post('/reset', adminOnly, async (req, res) => {
  await setClockOffset(0);
  await audit(prisma, 'clock', 'clock', 'Time Machine', 'Back to real time', req.user!.name);
  broadcast('clock', 'subscriptions', 'invoices');
  res.json({ now: now(), offsetDays: 0 });
});

// ---------- Spreadsheet import ----------

export const importRouter = Router();
importRouter.use(staffOnly);

const rowSchema = z.object({
  customer_name: z.string().trim().min(2, 'Customer name is required'),
  customer_email: zEmail,
  plan: z.string().trim().min(1, 'Plan is required'),
  product: z.string().trim().min(1, 'Product is required'),
  variant: z.string().trim().optional().default(''),
  quantity: z.coerce.number({ error: 'Quantity must be a number' }).int('Quantity must be whole').min(1, 'Quantity must be at least 1'),
  start_date: z.coerce.date({ error: 'Unreadable start date' }),
  expiry_date: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.date({ error: 'Unreadable expiry date' }).nullable()).default(null),
  unit_price: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number({ error: 'Unit price must be a number' }).min(0).nullable()).default(null),
  payment_term: z.preprocess((v) => (v === '' || v == null ? 'NET_15' : String(v).toUpperCase()), z.enum(PAYMENT_TERM_KEYS, { error: 'Payment term must be IMMEDIATE, NET_7, NET_15 or NET_30' })),
});

importRouter.post('/subscriptions', async (req, res) => {
  const { csv, commit } = parse(z.object({ csv: z.string().min(1, 'The file is empty').max(2_000_000), commit: z.boolean().default(false) }), req.body);
  const rows = csvToObjects(csv).slice(0, 2000);
  if (!rows.length) throw new HttpError(400, 'No rows found. The first row must be the header.');

  const [plans, products] = await Promise.all([prisma.plan.findMany({ where: { active: true } }), prisma.product.findMany({ where: { active: true }, include: { variants: true } })]);
  const find = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name.toLowerCase() === name.toLowerCase());

  const checked = rows.map((raw, i) => {
    const r = rowSchema.safeParse(raw);
    if (!r.success) return { row: i + 2, raw, errors: r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`) };
    const d = r.data;
    const errors: string[] = [];
    const plan = find(plans, d.plan);
    const product = find(products, d.product);
    if (!plan) errors.push(`plan: “${d.plan}” does not exist`);
    if (!product) errors.push(`product: “${d.product}” does not exist`);
    const variant = d.variant && product ? product.variants.find((v) => v.value.toLowerCase() === d.variant.toLowerCase() || `${v.attribute}: ${v.value}`.toLowerCase() === d.variant.toLowerCase()) : null;
    if (d.variant && product && !variant) errors.push(`variant: “${d.variant}” is not a variant of ${product.name}`);
    if (plan && d.quantity < plan.minQuantity) errors.push(`quantity: plan needs at least ${plan.minQuantity}`);
    if (d.expiry_date && d.expiry_date <= d.start_date) errors.push('expiry_date: must be after start_date');
    return { row: i + 2, raw, errors, data: errors.length ? undefined : { ...d, plan: plan!, product: product!, variant } };
  });

  const valid = checked.filter((c) => c.data);
  if (!commit) return res.json({ total: rows.length, valid: valid.length, rows: checked.map(({ row, raw, errors }) => ({ row, raw, errors })) });

  const at = now();
  let created = 0;
  for (const c of valid) {
    const d = c.data!;
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({ where: { email: d.customer_email }, create: { name: d.customer_name, email: d.customer_email }, update: {} });
      // These were already billed in the old spreadsheet, so billing starts at the next period boundary.
      let next = d.start_date;
      for (let g = 0; next < at && g < 2000; g++) next = addInterval(next, d.plan.interval as Interval);
      const s = await tx.subscription.create({
        data: {
          number: await nextNumber(tx, 'SUB', at.getUTCFullYear()), customerId: customer.id, planId: d.plan.id,
          status: 'ACTIVE', startDate: d.start_date, expiryDate: d.expiry_date, paymentTerm: d.payment_term, nextInvoiceDate: next,
          lines: { create: [{ productId: d.product.id, variantId: d.variant?.id ?? null, quantity: d.quantity, description: d.variant ? `${d.product.name} (${d.variant.attribute}: ${d.variant.value})` : d.product.name, unitPrice: d.unit_price != null ? toCents(d.unit_price) : d.product.salesPrice + (d.variant?.extraPrice ?? 0) }] },
        },
      });
      await refreshSubscriptionTotals(tx, s.id);
      await audit(tx, 'subscription', s.id, 'Imported', `From spreadsheet row ${c.row}`, req.user!.name);
    });
    created++;
  }
  broadcast('subscriptions', 'customers');
  res.json({ total: rows.length, created, skipped: rows.length - created });
});

// ---------- Outbox (local mailbox) ----------

export const outboxRouter = Router();
const publicMailbox = process.env.DEV_MAILBOX_PUBLIC === 'true' && process.env.NODE_ENV !== 'production';

outboxRouter.get('/', publicMailbox ? (_req, _res, next) => next() : adminOnly, async (req, res) => {
  const to = typeof req.query.to === 'string' ? req.query.to.slice(0, 120) : undefined;
  const items = await prisma.email.findMany({ where: to ? { to: { contains: to } } : {}, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ items, public: publicMailbox });
});
