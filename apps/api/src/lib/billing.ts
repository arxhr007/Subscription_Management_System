import {
  addInterval, dueDateFor, priceInvoice, toMonthly,
  type DiscountRule, type Interval, type PaymentTerm, type PricingLine, type ProductType, type TaxRule,
} from '@brightloop/shared';
import { audit } from './audit';
import { now } from './clock';
import { isUniqueViolation, nextNumber, prisma, type Tx } from './db';
import { broadcast } from './events';

// ---------- Pricing context ----------

export interface PricingContext { discounts: DiscountRule[]; taxes: TaxRule[] }

export async function loadPricingContext(db: Tx | typeof prisma = prisma): Promise<PricingContext> {
  const [discounts, taxes] = await Promise.all([
    db.discount.findMany({ where: { active: true }, include: { products: { select: { id: true } }, subscriptions: { select: { id: true } } } }),
    db.tax.findMany({ where: { active: true } }),
  ]);
  return {
    discounts: discounts.map((d) => ({
      id: d.id, name: d.name, type: d.type as DiscountRule['type'], value: d.value, scope: d.scope as DiscountRule['scope'],
      minQuantity: d.minQuantity, minAmount: d.minAmount, startDate: d.startDate, endDate: d.endDate,
      usageLimit: d.usageLimit, usedCount: d.usedCount, active: d.active,
      productIds: d.products.map((p) => p.id), subscriptionIds: d.subscriptions.map((s) => s.id),
    })),
    taxes: taxes.map((t) => ({ id: t.id, name: t.name, rate: t.rate, productType: t.productType as ProductType | null, active: t.active })),
  };
}

type SubForPricing = {
  id: string;
  plan: { id: string; name: string; price: number; interval: string };
  lines: { productId: string; description: string; quantity: number; unitPrice: number; product: { type: string } }[];
};

/** The plan's base fee (if any) plus the subscription's product lines, as engine input. */
export function pricingLines(sub: SubForPricing): PricingLine[] {
  const lines: PricingLine[] = sub.lines.map((l) => ({
    productId: l.productId, productType: l.product.type as ProductType, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
  }));
  if (sub.plan.price > 0) lines.unshift({ productId: `plan:${sub.plan.id}`, productType: 'SERVICE', description: `${sub.plan.name} — plan fee`, quantity: 1, unitPrice: sub.plan.price });
  return lines;
}

/** Recomputes the cached per-period total and MRR used by lists and the dashboard. */
export async function refreshSubscriptionTotals(db: Tx, subscriptionId: string) {
  const sub = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true, lines: { include: { product: true } } } });
  const periodTotal = pricingLines(sub).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  await db.subscription.update({ where: { id: sub.id }, data: { periodTotal, mrr: toMonthly(periodTotal, sub.plan.interval as Interval) } });
}

// ---------- Invoicing ----------

type SubForBilling = SubForPricing & { customerId: string; paymentTerm: string; number: string; plan: SubForPricing['plan'] };

/**
 * Creates the invoice for one billing period. Safe to call any number of times: the
 * UNIQUE(subscriptionId, periodStart) key means a period can only ever be invoiced once.
 * Returns null when the period was already billed.
 */
export async function invoicePeriod(sub: SubForBilling, periodStart: Date, ctx: PricingContext, opts: { confirm: boolean; actor?: string }) {
  const interval = sub.plan.interval as Interval;
  const periodEnd = addInterval(periodStart, interval);

  const issueDate = periodStart;

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      // Transaction-scoped global invoice lock protects discount usage across workers.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(71001)::text`;
      const fresh = await loadPricingContext(tx);
      const priced = priceInvoice(pricingLines(sub), { discounts: fresh.discounts, taxes: fresh.taxes, at: periodStart, subscriptionId: sub.id });
      const number = await nextNumber(tx, 'INV', issueDate.getUTCFullYear());
      const inv = await tx.invoice.create({
        data: {
          number, subscriptionId: sub.id, customerId: sub.customerId, status: opts.confirm ? 'CONFIRMED' : 'DRAFT',
          issueDate, dueDate: dueDateFor(issueDate, sub.paymentTerm as PaymentTerm), periodStart, periodEnd,
          subtotal: priced.subtotal, discountTotal: priced.discountTotal, taxTotal: priced.taxTotal, total: priced.total,
          lines: {
            create: priced.lines.map((l) => ({
              productId: l.productId.startsWith('plan:') ? null : l.productId, description: l.description, quantity: l.quantity,
              unitPrice: l.unitPrice, subtotal: l.subtotal, discount: l.discount, taxRate: l.taxRate, tax: l.tax, total: l.total,
              discountLabel: l.discountNames.join(', ') || null, taxLabel: l.taxNames.join(', ') || null,
            })),
          },
        },
      });
      for (const id of priced.appliedDiscountIds) await tx.discount.update({ where: { id }, data: { usedCount: { increment: 1 } } });
      await tx.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: periodEnd } });
      await audit(tx, 'subscription', sub.id, 'Invoiced', `${number} for ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`, opts.actor);
      return inv;
    });
    // Keep the in-memory rules in step so usage limits hold within the same run.

    return invoice;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    await prisma.subscription.updateMany({ where: { id: sub.id, nextInvoiceDate: { lt: periodEnd } }, data: { nextInvoiceDate: periodEnd } });
    return null;
  }
}

const billingInclude = { plan: true, lines: { include: { product: { select: { type: true } } } } } as const;

/** Bills every active subscription whose next period has started (catching up missed periods). */
export async function runBilling(opts: { confirm?: boolean; actor?: string } = {}) {
  const at = now();
  const ctx = await loadPricingContext();
  const due = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE', nextInvoiceDate: { lte: at },
      // Past expiry there is nothing left to bill.
      OR: [{ expiryDate: null }, { expiryDate: { gt: prisma.subscription.fields.nextInvoiceDate } }],
    },
    include: billingInclude,
  });
  let created = 0, skipped = 0;
  for (const sub of due) {
    let periodStart = sub.nextInvoiceDate!;
    for (let guard = 0; periodStart <= at && guard < 400; guard++) {
      if (sub.expiryDate && periodStart >= sub.expiryDate) break;
      const inv = await invoicePeriod(sub, periodStart, ctx, { confirm: opts.confirm ?? true, actor: opts.actor });
      inv ? created++ : skipped++;
      periodStart = addInterval(periodStart, sub.plan.interval as Interval);
    }
  }
  if (created) broadcast('invoices', 'subscriptions');
  return { subscriptionsDue: due.length, invoicesCreated: created, duplicatesBlocked: skipped };
}

/** Bills one subscription's next period right now (the "Create invoice" button). */
export async function invoiceNextPeriod(subscriptionId: string, actor: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: billingInclude });
  const periodStart = sub.nextInvoiceDate ?? sub.startDate;
  const inv = await invoicePeriod(sub, periodStart, await loadPricingContext(), { confirm: false, actor });
  broadcast('invoices', 'subscriptions');
  return inv;
}

// ---------- Lifecycle jobs ----------

/** Number of whole plan intervals in the original term, used to renew for the same length. */
export function termIntervals(start: Date, expiry: Date, interval: Interval) {
  let n = 0;
  for (let d = start; d < expiry && n < 1000; n++) d = addInterval(d, interval);
  return Math.max(1, n);
}

export async function renewSubscription(db: Tx, sub: { id: string; startDate: Date; expiryDate: Date | null; plan: { interval: string } }, actor?: string) {
  if (!sub.expiryDate) return null;
  const interval = sub.plan.interval as Interval;
  const expiryDate = addInterval(sub.expiryDate, interval, termIntervals(sub.startDate, sub.expiryDate, interval));
  await db.subscription.update({ where: { id: sub.id }, data: { expiryDate } });
  await audit(db, 'subscription', sub.id, 'Renewed', `New expiry ${expiryDate.toISOString().slice(0, 10)}`, actor);
  return expiryDate;
}

export async function activateSubscription(db: Tx, sub: { id: string; startDate: Date; nextInvoiceDate: Date | null }, actor?: string) {
  await db.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', nextInvoiceDate: sub.nextInvoiceDate ?? sub.startDate } });
  await audit(db, 'subscription', sub.id, 'Activated', undefined, actor);
}

async function runLifecycle() {
  const at = now();
  let activated = 0, closed = 0, renewed = 0, quotesExpired = 0;

  for (const sub of await prisma.subscription.findMany({ where: { status: 'CONFIRMED', startDate: { lte: at } } })) {
    await prisma.$transaction((tx) => activateSubscription(tx, sub));
    activated++;
  }

  for (const sub of await prisma.subscription.findMany({ where: { status: 'QUOTATION', quotationExpiresAt: { lt: at } } })) {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CLOSED', closedReason: 'Quotation expired' } });
      await audit(tx, 'subscription', sub.id, 'Closed', 'Quotation validity ran out');
    });
    quotesExpired++;
  }

  const ending = await prisma.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAUSED'] }, expiryDate: { lte: at } }, include: { plan: true } });
  for (const sub of ending) {
    if (sub.plan.autoClose) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CLOSED', closedReason: 'Reached expiry (plan closes automatically)' } });
        await audit(tx, 'subscription', sub.id, 'Closed', 'Reached expiry, plan auto-closes');
      });
      closed++;
    } else if (sub.autoRenew && sub.plan.renewable) {
      // Renew repeatedly if the clock jumped past several terms.
      let s = { ...sub };
      for (let i = 0; s.expiryDate && s.expiryDate <= at && i < 50; i++) {
        const expiryDate = await prisma.$transaction((tx) => renewSubscription(tx, s, 'Auto-renew'));
        s = { ...s, expiryDate };
        renewed++;
      }
    }
    // Otherwise it stays open past expiry (billing stops) and shows in Renewals for a human decision.
  }

  if (activated + closed + renewed + quotesExpired) broadcast('subscriptions');
  return { activated, closed, renewed, quotesExpired };
}

// ---------- Orchestration ----------

let running: Promise<unknown> = Promise.resolve();

/** Runs lifecycle + billing one at a time (scheduler and Time Machine never overlap). */
export function runAllJobs(actor?: string) {
  const job = running.then(() => prisma.$transaction(async lock => {
    await lock.$queryRaw`SELECT pg_advisory_xact_lock(71002)::text`;
    for (const sub of await prisma.subscription.findMany({ where: { status: 'CONFIRMED', startDate: { lte: now() } } })) {
      await prisma.$transaction(tx => activateSubscription(tx, sub));
    }
    const catchup = await runBilling({ actor });
    const life1 = await runLifecycle();
    const billing = await runBilling({ actor });
    const life2 = await runLifecycle(); // renewals extend expiry → bill the new periods too
    const billing2 = await runBilling({ actor });
    return {
      activated: life1.activated + life2.activated,
      closed: life1.closed + life2.closed,
      renewed: life1.renewed + life2.renewed,
      quotesExpired: life1.quotesExpired + life2.quotesExpired,
      invoicesCreated: catchup.invoicesCreated + billing.invoicesCreated + billing2.invoicesCreated,
      duplicatesBlocked: catchup.duplicatesBlocked + billing.duplicatesBlocked + billing2.duplicatesBlocked,
    };
  }, { timeout: 300_000, maxWait: 10_000 }));
  running = job.catch(() => undefined);
  return job;
}

export function startScheduler() {
  const tick = () => runAllJobs().catch((e) => console.error('[scheduler]', e));
  tick();
  return setInterval(tick, 60_000);
}
