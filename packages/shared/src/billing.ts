import { allocate } from './money';
import { PAYMENT_TERMS, type DiscountScope, type DiscountType, type Interval, type PaymentTerm, type ProductType, type SubStatus } from './enums';

// ---------- Periods ----------

const DAY = 86_400_000;

/** Adds n billing intervals to a date (UTC). Month/year math clamps to month end: Jan 31 + 1 month = Feb 28/29. */
export function addInterval(date: Date, interval: Interval, n = 1): Date {
  const d = new Date(date.getTime());
  if (interval === 'DAILY') return new Date(d.getTime() + n * DAY);
  if (interval === 'WEEKLY') return new Date(d.getTime() + n * 7 * DAY);
  const months = interval === 'MONTHLY' ? n : 12 * n;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export const dueDateFor = (issue: Date, term: PaymentTerm) => new Date(issue.getTime() + PAYMENT_TERMS[term] * DAY);

/** Factor that converts one billing period's amount to a monthly amount (for MRR). */
export const MRR_FACTOR: Record<Interval, number> = { DAILY: 365 / 12, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 };
export const toMonthly = (periodAmount: number, interval: Interval) => Math.round(periodAmount * MRR_FACTOR[interval]);

// ---------- Subscription lifecycle ----------

export const SUB_TRANSITIONS: Record<SubStatus, SubStatus[]> = {
  DRAFT: ['QUOTATION', 'CLOSED'],
  QUOTATION: ['CONFIRMED', 'DRAFT', 'CLOSED'],
  CONFIRMED: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['PAUSED', 'CLOSED'],
  PAUSED: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export interface PlanFlags { pausable: boolean; closable: boolean; renewable: boolean }

/** Returns null when allowed, otherwise the reason it is blocked. */
export function transitionError(from: SubStatus, to: SubStatus, plan: PlanFlags): string | null {
  if (!SUB_TRANSITIONS[from].includes(to)) return `Cannot move a ${from.toLowerCase()} subscription to ${to.toLowerCase()}`;
  if (to === 'PAUSED' && !plan.pausable) return 'This plan does not allow pausing';
  if (to === 'CLOSED' && (from === 'ACTIVE' || from === 'PAUSED') && !plan.closable) return 'This plan cannot be closed early';
  return null;
}

// ---------- Pricing engine ----------

export interface PricingLine {
  productId: string;
  productType: ProductType;
  description: string;
  quantity: number;
  unitPrice: number; // cents
}

export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountType;
  value: number; // PERCENT: percent (e.g. 10); FIXED: cents
  scope: DiscountScope;
  minQuantity: number;
  minAmount: number; // cents
  startDate: Date | null;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  productIds: string[];
  subscriptionIds: string[]; // empty = any subscription
}

export interface TaxRule {
  id: string;
  name: string;
  rate: number; // percent
  productType: ProductType | null; // null = all products
  active: boolean;
}

export interface PricedLine extends PricingLine {
  subtotal: number;
  discount: number;
  net: number;
  taxRate: number;
  tax: number;
  total: number;
  discountNames: string[];
  taxNames: string[];
}

export interface PricedInvoice {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  appliedDiscountIds: string[];
}

export function isDiscountLive(d: DiscountRule, at: Date): boolean {
  if (!d.active) return false;
  if (d.startDate && at < d.startDate) return false;
  if (d.endDate && at > d.endDate) return false;
  if (d.usageLimit != null && d.usedCount >= d.usageLimit) return false;
  return true;
}

const discountAmount = (d: DiscountRule, base: number) =>
  Math.min(base, d.type === 'PERCENT' ? Math.round((base * d.value) / 100) : d.value);

const appliesToSubscription = (d: DiscountRule, subscriptionId?: string) =>
  d.subscriptionIds.length === 0 || (subscriptionId != null && d.subscriptionIds.includes(subscriptionId));

/**
 * Prices one invoice:
 *  1. line subtotal = qty × unit price
 *  2. best eligible product-scope discount per line
 *  3. best eligible subscription-scope discount on the remaining total, spread across lines pro rata
 *  4. tax per line from the admin's rules matching the product type
 * A discount that expired or used up its limit is skipped automatically.
 */
export function priceInvoice(
  input: PricingLine[],
  opts: { discounts: DiscountRule[]; taxes: TaxRule[]; at: Date; subscriptionId?: string },
): PricedInvoice {
  const live = opts.discounts.filter((d) => isDiscountLive(d, opts.at) && appliesToSubscription(d, opts.subscriptionId));
  const applied = new Set<string>();

  const lines: PricedLine[] = input.map((l) => {
    const subtotal = l.quantity * l.unitPrice;
    let best: { d: DiscountRule; amount: number } | null = null;
    for (const d of live) {
      if (d.scope !== 'PRODUCT' || !d.productIds.includes(l.productId)) continue;
      if (l.quantity < d.minQuantity || subtotal < d.minAmount) continue;
      const amount = discountAmount(d, subtotal);
      if (!best || amount > best.amount) best = { d, amount };
    }
    if (best && best.amount > 0) applied.add(best.d.id);
    const discount = best?.amount ?? 0;
    return {
      ...l, subtotal, discount, net: subtotal - discount, taxRate: 0, tax: 0, total: 0,
      discountNames: best && discount > 0 ? [best.d.name] : [], taxNames: [],
    };
  });

  const base = lines.reduce((s, l) => s + l.net, 0);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  let bestSub: { d: DiscountRule; amount: number } | null = null;
  for (const d of live) {
    if (d.scope !== 'SUBSCRIPTION' || totalQty < d.minQuantity || base < d.minAmount) continue;
    const amount = discountAmount(d, base);
    if (!bestSub || amount > bestSub.amount) bestSub = { d, amount };
  }
  if (bestSub && bestSub.amount > 0) {
    applied.add(bestSub.d.id);
    const shares = allocate(bestSub.amount, lines.map((l) => l.net));
    lines.forEach((l, i) => {
      l.discount += shares[i] ?? 0;
      l.net -= shares[i] ?? 0;
      if ((shares[i] ?? 0) > 0) l.discountNames.push(bestSub!.d.name);
    });
  }

  for (const l of lines) {
    const rules = opts.taxes.filter((t) => t.active && (t.productType == null || t.productType === l.productType));
    l.taxRate = rules.reduce((s, t) => s + t.rate, 0);
    l.taxNames = rules.map((t) => t.name);
    l.tax = Math.round((l.net * l.taxRate) / 100);
    l.total = l.net + l.tax;
  }

  const sum = (k: 'subtotal' | 'discount' | 'tax' | 'total') => lines.reduce((s, l) => s + l[k], 0);
  return {
    lines,
    subtotal: sum('subtotal'),
    discountTotal: sum('discount'),
    taxTotal: sum('tax'),
    total: sum('total'),
    appliedDiscountIds: [...applied],
  };
}

// ---------- Receivables ----------

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export function agingBucket(dueDate: Date, now: Date): AgingBucket {
  const days = Math.floor((now.getTime() - dueDate.getTime()) / DAY);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}
