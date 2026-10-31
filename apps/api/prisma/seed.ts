// Seeds a realistic Brightloop: ~1,500 customers, 5,000 subscriptions and their invoice/payment history,
// priced by the same engine the app uses. Deterministic (seeded PRNG) so every run looks the same.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { writeSamples } from '../scripts/samples';
import { addInterval, dueDateFor, PAYMENT_METHODS, priceInvoice, toMonthly, type DiscountRule, type Interval, type PaymentTerm, type PricingLine, type ProductType, type TaxRule } from '@brightloop/shared';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const NOW = new Date();
const TODAY = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));

// ---------- deterministic randomness ----------
let seed = 20261031;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY);

async function chunked<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>, size = 2000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  console.log('Seeding Brightloop…');
  const hash = (p: string) => bcrypt.hash(p, 10);

  // ---------- users ----------
  const admin = await prisma.user.create({ data: { email: 'admin@brightloop.test', name: 'Meera Admin', role: 'ADMIN', passwordHash: await hash('Admin@1234') } });
  await prisma.user.create({ data: { email: 'staff@brightloop.test', name: 'Ravi Sales', role: 'STAFF', passwordHash: await hash('Staff@1234') } });
  const demoUser = await prisma.user.create({ data: { email: 'customer@brightloop.test', name: 'Asha Retail', role: 'CUSTOMER', passwordHash: await hash('Customer@1234') } });

  // ---------- taxes ----------
  const taxRows = [
    { id: randomUUID(), name: 'GST 18%', rate: 18, productType: 'SERVICE', active: true },
    { id: randomUUID(), name: 'GST 18% (add-ons)', rate: 18, productType: 'ADDON', active: true },
    { id: randomUUID(), name: 'GST 12%', rate: 12, productType: 'GOODS', active: true },
  ];
  await prisma.tax.createMany({ data: taxRows });
  const taxes: TaxRule[] = taxRows.map((t) => ({ ...t, productType: t.productType as ProductType }));

  // ---------- products ----------
  const P = (name: string, type: ProductType, price: number, cost: number, notes: string, variants: [string, string, number][] = []) =>
    ({ id: randomUUID(), name, type, salesPrice: price * 100, costPrice: cost * 100, notes, variants: variants.map(([attribute, value, extra]) => ({ id: randomUUID(), attribute, value, extraPrice: extra * 100 })) });
  const products = [
    P('Brightloop CRM', 'SERVICE', 1200, 300, 'Per seat. Pipeline, contacts and quotes.', [['Brand', 'Odoo', 560], ['Brand', 'Standard', 0]]),
    P('Brightloop Books', 'SERVICE', 900, 200, 'Per seat. Accounting and GST returns.', [['Edition', 'Pro', 300]]),
    P('Analytics Add-on', 'ADDON', 400, 60, 'Dashboards and exports. Switch on or off anytime.'),
    P('Extra Storage 100 GB', 'ADDON', 250, 40, 'Billed per 100 GB block.'),
    P('POS Hardware Kit', 'GOODS', 1500, 900, 'Rented terminal + printer, swapped on failure.', [['Brand', 'Odoo', 560]]),
    P('Priority Support', 'SERVICE', 2000, 700, '4-hour response SLA, named engineer.'),
  ];
  for (const p of products) {
    await prisma.product.create({ data: { id: p.id, name: p.name, type: p.type, salesPrice: p.salesPrice, costPrice: p.costPrice, notes: p.notes, variants: { create: p.variants } } });
  }
  const [crm, books, analytics, storage, pos, support] = products;

  // ---------- plans ----------
  const plan = (name: string, interval: Interval, o: Partial<{ price: number; minQuantity: number; autoClose: boolean; closable: boolean; pausable: boolean; renewable: boolean; startDate: Date; endDate: Date }> = {}) =>
    ({ id: randomUUID(), name, interval, price: (o.price ?? 0) * 100, minQuantity: o.minQuantity ?? 1, autoClose: o.autoClose ?? false, closable: o.closable ?? true, pausable: o.pausable ?? false, renewable: o.renewable ?? true, startDate: o.startDate ?? null, endDate: o.endDate ?? null, active: true });
  const monthly = plan('Monthly', 'MONTHLY', { pausable: true });
  const yearly = plan('Yearly Contract', 'YEARLY', { minQuantity: 5, closable: false });
  const weekly = plan('Weekly Flex', 'WEEKLY', { pausable: true, price: 99 });
  const daily = plan('Daily Event Pass', 'DAILY', { autoClose: true, renewable: false });
  const promo = plan('Launch Promo 2026', 'MONTHLY', { autoClose: true, renewable: false, startDate: daysAgo(200), endDate: new Date(TODAY.getTime() + 60 * DAY) });
  const plans = [monthly, yearly, weekly, daily, promo];
  await prisma.plan.createMany({ data: plans });
  // Yearly periods cost 10× a month (2 months free); weekly ≈ ¼, daily ≈ 1/25.
  const multiplier: Record<Interval, number> = { MONTHLY: 1, YEARLY: 10, WEEKLY: 0.25, DAILY: 0.04 };

  // ---------- discounts ----------
  const seatDiscount = { id: randomUUID(), name: '10% off 5+ CRM seats', type: 'PERCENT', value: 10, scope: 'PRODUCT', minQuantity: 5, minAmount: 0, startDate: daysAgo(400), endDate: null, usageLimit: null, usedCount: 0, active: true };
  const festive = { id: randomUUID(), name: 'Festive ₹500 off', type: 'FIXED', value: 500_00, scope: 'SUBSCRIPTION', minQuantity: 0, minAmount: 5000_00, startDate: daysAgo(20), endDate: new Date(TODAY.getTime() + 25 * DAY), usageLimit: 40, usedCount: 0, active: true };
  await prisma.discount.create({ data: { ...seatDiscount, products: { connect: [{ id: crm.id }] } } });
  await prisma.discount.create({ data: festive });
  const discounts: DiscountRule[] = [{ ...seatDiscount, type: 'PERCENT', scope: 'PRODUCT', productIds: [crm.id], subscriptionIds: [] } as DiscountRule];

  // ---------- quotation templates ----------
  await prisma.quotationTemplate.create({
    data: {
      name: 'Enterprise CRM — yearly', validityDays: 15, planId: yearly.id, paymentTerm: 'NET_30', notes: 'Includes onboarding and priority support.',
      lines: { create: [{ productId: crm.id, variantId: crm.variants[0].id, quantity: 10, unitPrice: (crm.salesPrice + crm.variants[0].extraPrice) * 10 }, { productId: analytics.id, quantity: 10, unitPrice: analytics.salesPrice * 10 }, { productId: support.id, quantity: 1, unitPrice: support.salesPrice * 10 }] },
    },
  });
  await prisma.quotationTemplate.create({
    data: { name: 'Starter — monthly', validityDays: 7, planId: monthly.id, paymentTerm: 'IMMEDIATE', lines: { create: [{ productId: crm.id, quantity: 2 }, { productId: storage.id, quantity: 1 }] } },
  });

  // ---------- customers ----------
  const first = ['Asha', 'Vikram', 'Neha', 'Arjun', 'Priya', 'Kabir', 'Isha', 'Rohan', 'Zara', 'Dev', 'Ananya', 'Kunal', 'Meera', 'Sahil', 'Tara', 'Imran', 'Leela', 'Nikhil', 'Pooja', 'Rahul', 'Sana', 'Varun', 'Diya', 'Aman'];
  const brands = ['Sunrise', 'Bluepeak', 'Greenleaf', 'Northwind', 'Silverline', 'Lotus', 'Harbor', 'Crimson', 'Evergreen', 'Kaveri', 'Monsoon', 'Saffron', 'Indigo', 'Banyan', 'Coral', 'Granite', 'Peacock', 'Tulsi', 'Zenith', 'Orbit', 'Maple', 'Cedar', 'Nimbus', 'Aurora', 'Vertex', 'Pebble'];
  const kinds = ['Traders', 'Labs', 'Retail', 'Foods', 'Logistics', 'Clinics', 'Studios', 'Textiles', 'Motors', 'Pharma', 'Solutions', 'Exports', 'Kitchens', 'Hardware', 'Academy'];
  const cities = ['Ahmedabad', 'Pune', 'Bengaluru', 'Chennai', 'Jaipur', 'Kochi', 'Indore', 'Surat', 'Lucknow', 'Hyderabad', 'Mumbai', 'Delhi'];
  const customers: { id: string; name: string; email: string; company: string; phone: string; address: string; userId: string | null }[] = [];
  const used = new Set<string>();
  customers.push({ id: randomUUID(), name: 'Asha Retail', email: 'customer@brightloop.test', company: 'Asha Retail Pvt Ltd', phone: '+91 98250 11111', address: 'CG Road, Ahmedabad', userId: demoUser.id });
  while (customers.length < 1500) {
    const company = `${pick(brands)} ${pick(kinds)}`;
    const suffix = used.has(company) ? ` ${pick(cities)}` : '';
    const name = company + suffix;
    if (used.has(name)) continue;
    used.add(name);
    const contact = pick(first);
    customers.push({
      id: randomUUID(), name, company: `${name} Pvt Ltd`, userId: null,
      email: `${contact.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]+/g, '')}.in`,
      phone: `+91 9${int(100000000, 999999999)}`, address: `${int(1, 300)}, ${pick(['MG Road', 'Station Road', 'Ring Road', 'Link Road', 'Market Yard'])}, ${pick(cities)}`,
    });
  }
  await chunked(customers, (b) => prisma.customer.createMany({ data: b }));

  // ---------- subscriptions + history ----------
  type Line = { id: string; subscriptionId: string; productId: string; variantId: string | null; description: string; quantity: number; unitPrice: number; productType: ProductType };
  const subs: object[] = [], subLines: object[] = [], invoices: object[] = [], invLines: object[] = [], payments: object[] = [], audits: object[] = [];
  const seq: Record<string, number> = {};
  const number = (prefix: string, d: Date) => { const k = `${prefix}/${d.getUTCFullYear()}`; seq[k] = (seq[k] ?? 0) + 1; return `${k}/${String(seq[k]).padStart(5, '0')}`; };

  function makeLines(subscriptionId: string, interval: Interval, minQty: number): Line[] {
    const m = multiplier[interval];
    const line = (p: (typeof products)[number], qty: number, variant?: (typeof products)[number]['variants'][number]): Line => ({
      id: randomUUID(), subscriptionId, productId: p.id, variantId: variant?.id ?? null, quantity: qty, productType: p.type,
      description: variant ? `${p.name} (${variant.attribute}: ${variant.value})` : p.name,
      unitPrice: Math.round((p.salesPrice + (variant?.extraPrice ?? 0)) * m),
    });
    const core = chance(0.65) ? line(crm, Math.max(minQty, int(1, 12)), chance(0.4) ? crm.variants[0] : undefined) : line(books, Math.max(minQty, int(1, 8)), chance(0.3) ? books.variants[0] : undefined);
    const out = [core];
    if (chance(0.35)) out.push(line(analytics, Math.max(1, Math.round(core.quantity / 2))));
    if (chance(0.25)) out.push(line(storage, int(1, 4)));
    if (chance(0.08)) out.push(line(pos, int(1, 3), chance(0.5) ? pos.variants[0] : undefined));
    if (chance(0.06) && interval === 'YEARLY') out.push(line(support, 1));
    return out;
  }

  const demoCustomer = customers[0];
  for (let i = 0; i < 5000; i++) {
    const customer = i < 3 ? demoCustomer : customers[int(1, customers.length - 1)];
    const r = rand();
    const p = i === 0 ? monthly : i === 1 ? yearly : r < 0.62 ? monthly : r < 0.82 ? yearly : r < 0.92 ? weekly : r < 0.95 ? daily : promo;
    const interval = p.interval as Interval;
    const id = randomUUID();
    const s = rand();
    let status = s < 0.72 ? 'ACTIVE' : s < 0.86 ? 'CLOSED' : s < 0.89 ? 'PAUSED' : s < 0.93 ? 'QUOTATION' : s < 0.96 ? 'DRAFT' : 'CONFIRMED';
    if (i === 0) status = 'ACTIVE';
    if (i === 1) status = 'QUOTATION';
    if (p === daily && status === 'PAUSED') status = 'ACTIVE';

    const back = { MONTHLY: 420, YEARLY: 700, WEEKLY: 90, DAILY: 12 }[interval];
    let start = daysAgo(p === promo ? int(10, 190) : int(1, back));
    if (status === 'CONFIRMED' || status === 'DRAFT' || status === 'QUOTATION') start = new Date(TODAY.getTime() + int(1, 30) * DAY);
    let expiry: Date | null = null;
    if (interval === 'YEARLY') expiry = addInterval(start, 'YEARLY', chance(0.7) ? 1 : 2);
    else if (interval === 'DAILY') expiry = addInterval(start, 'DAILY', int(5, 20));
    else if (p === promo) expiry = addInterval(start, 'MONTHLY', 6);
    else if (chance(0.35)) expiry = addInterval(start, interval, interval === 'MONTHLY' ? 12 : 26);
    // A slice of yearly contracts that end soon, for the renewal radar.
    if (interval === 'YEARLY' && status === 'ACTIVE' && chance(0.12)) { expiry = new Date(TODAY.getTime() + int(-5, 28) * DAY); start = addInterval(expiry, 'YEARLY', -1); }

    const lines = makeLines(id, interval, p.minQuantity);
    if (i === 0) { lines.length = 0; lines.push({ id: randomUUID(), subscriptionId: id, productId: crm.id, variantId: crm.variants[0].id, description: 'Brightloop CRM (Brand: Odoo)', quantity: 6, unitPrice: crm.salesPrice + crm.variants[0].extraPrice, productType: 'SERVICE' }, { id: randomUUID(), subscriptionId: id, productId: storage.id, variantId: null, description: storage.name, quantity: 2, unitPrice: storage.salesPrice, productType: 'ADDON' }); start = daysAgo(150); expiry = null; }

    const pricing: PricingLine[] = lines.map((l) => ({ productId: l.productId, productType: l.productType, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));
    if (p.price > 0) pricing.unshift({ productId: `plan:${p.id}`, productType: 'SERVICE', description: `${p.name} — plan fee`, quantity: 1, unitPrice: p.price });
    const periodTotal = pricing.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    const term: PaymentTerm = interval === 'YEARLY' ? 'NET_30' : pick(['IMMEDIATE', 'NET_15', 'NET_15', 'NET_30'] as const);

    // Bill the periods that already happened.
    let closedAt: Date | null = null;
    if (status === 'CLOSED') {
      const latest = Math.min(TODAY.getTime(), expiry?.getTime() ?? TODAY.getTime());
      closedAt = new Date(start.getTime() + rand() * (latest - start.getTime()));
    }
    const billUntil = new Date(Math.min(TODAY.getTime(), closedAt?.getTime() ?? Infinity, expiry?.getTime() ?? Infinity));
    let periodStart = start;
    let n = 0;
    if (['ACTIVE', 'PAUSED', 'CLOSED'].includes(status)) {
      while (periodStart <= billUntil && n < 30) {
        if (expiry && periodStart >= expiry) break;
        const priced = priceInvoice(pricing, { discounts, taxes, at: periodStart, subscriptionId: id });
        const invId = randomUUID();
        const due = dueDateFor(periodStart, term);
        const age = (TODAY.getTime() - due.getTime()) / DAY;
        const paid = age > 60 ? chance(0.993) : age > 20 ? chance(0.93) : age > 0 ? chance(0.75) : chance(0.4);
        const payDate = new Date(Math.min(TODAY.getTime(), periodStart.getTime() + int(0, 25) * DAY));
        invoices.push({
          id: invId, number: number('INV', periodStart), subscriptionId: id, customerId: customer.id, status: paid ? 'PAID' : 'CONFIRMED',
          issueDate: periodStart, dueDate: due, periodStart, periodEnd: addInterval(periodStart, interval),
          subtotal: priced.subtotal, discountTotal: priced.discountTotal, taxTotal: priced.taxTotal, total: priced.total,
          amountPaid: paid ? priced.total : 0, paidAt: paid ? payDate : null, sentAt: periodStart,
        });
        for (const l of priced.lines) {
          invLines.push({ id: randomUUID(), invoiceId: invId, productId: l.productId.startsWith('plan:') ? null : l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, subtotal: l.subtotal, discount: l.discount, taxRate: l.taxRate, tax: l.tax, total: l.total, discountLabel: l.discountNames.join(', ') || null, taxLabel: l.taxNames.join(', ') || null });
        }
        if (paid) payments.push({ id: randomUUID(), invoiceId: invId, method: pick(PAYMENT_METHODS), amount: priced.total, date: payDate, note: null });
        periodStart = addInterval(periodStart, interval);
        n++;
      }
    }

    const createdAt = status === 'DRAFT' || status === 'QUOTATION' || status === 'CONFIRMED' ? daysAgo(int(0, 10)) : start;
    subs.push({
      id, number: number('SUB', createdAt), customerId: customer.id, planId: p.id, status, startDate: start, expiryDate: expiry,
      quotationExpiresAt: status === 'QUOTATION' ? new Date(TODAY.getTime() + int(2, 15) * DAY) : null,
      paymentTerm: term, autoRenew: interval === 'YEARLY' ? chance(0.7) : chance(0.3), notes: null,
      nextInvoiceDate: ['ACTIVE', 'PAUSED', 'CLOSED'].includes(status) ? periodStart : null,
      periodTotal, mrr: toMonthly(periodTotal, interval), closedReason: status === 'CLOSED' ? pick(['Customer cancelled', 'Downgraded to another plan', 'Reached expiry', 'Business closed']) : null,
      createdAt, updatedAt: closedAt ?? createdAt,
    });
    for (const { productType: _t, ...l } of lines) subLines.push(l);
    audits.push({ id: randomUUID(), entityType: 'subscription', entityId: id, action: 'Created', detail: 'Migrated from the old spreadsheet', actorName: 'Seed', at: createdAt });
    if (status === 'CLOSED') audits.push({ id: randomUUID(), entityType: 'subscription', entityId: id, action: 'Closed', detail: null, actorName: 'Ravi Sales', at: closedAt });
  }

  await chunked(subs, (b) => prisma.subscription.createMany({ data: b as never }));
  await chunked(subLines, (b) => prisma.subscriptionLine.createMany({ data: b as never }));
  await chunked(invoices, (b) => prisma.invoice.createMany({ data: b as never }));
  await chunked(invLines, (b) => prisma.invoiceLine.createMany({ data: b as never }));
  await chunked(payments, (b) => prisma.payment.createMany({ data: b as never }));
  await chunked(audits, (b) => prisma.auditLog.createMany({ data: b as never }));
  await prisma.sequence.createMany({ data: Object.entries(seq).map(([name, value]) => ({ name, value })) });
  await prisma.appClock.create({ data: { id: 1, offsetMs: 0n } });

  console.log(`  ${customers.length} customers, ${subs.length} subscriptions, ${invoices.length} invoices, ${payments.length} payments`);

  await writeSamples(prisma);
  console.log('\nLogins:\n  admin@brightloop.test / Admin@1234\n  staff@brightloop.test / Staff@1234\n  customer@brightloop.test / Customer@1234');
  void admin;
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
