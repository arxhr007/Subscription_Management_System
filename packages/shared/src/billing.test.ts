import { describe, expect, it } from 'vitest';
import { addInterval, agingBucket, priceInvoice, toMonthly, transitionError, type DiscountRule, type PricingLine, type TaxRule } from './billing';
import { allocate } from './money';
import { failedPasswordRules, isStrongPassword } from './password';
import { csvToObjects, rankMatches } from './recon';
import { discountSchema, signupSchema } from './schemas';

const at = new Date('2026-10-15T00:00:00Z');
const gst: TaxRule = { id: 't1', name: 'GST 18%', rate: 18, productType: null, active: true };
const line = (over: Partial<PricingLine> = {}): PricingLine => ({ productId: 'p1', productType: 'SERVICE', description: 'Seats', quantity: 1, unitPrice: 100_00, ...over });
const disc = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: 'd1', name: '10% off', type: 'PERCENT', value: 10, scope: 'SUBSCRIPTION', minQuantity: 0, minAmount: 0,
  startDate: null, endDate: null, usageLimit: null, usedCount: 0, active: true, productIds: [], subscriptionIds: [], ...over,
});

describe('addInterval', () => {
  it('clamps month end', () => {
    expect(addInterval(new Date('2026-01-31T00:00:00Z'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addInterval(new Date('2028-01-31T00:00:00Z'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2028-02-29');
  });
  it('handles daily, weekly, yearly', () => {
    const d = new Date('2026-03-10T00:00:00Z');
    expect(addInterval(d, 'DAILY', 3).toISOString().slice(0, 10)).toBe('2026-03-13');
    expect(addInterval(d, 'WEEKLY').toISOString().slice(0, 10)).toBe('2026-03-17');
    expect(addInterval(d, 'YEARLY').toISOString().slice(0, 10)).toBe('2027-03-10');
  });
});

describe('priceInvoice', () => {
  it('applies tax after discount', () => {
    const r = priceInvoice([line({ quantity: 2 })], { discounts: [disc()], taxes: [gst], at });
    expect(r.subtotal).toBe(200_00);
    expect(r.discountTotal).toBe(20_00);
    expect(r.taxTotal).toBe(32_40); // 18% of 180
    expect(r.total).toBe(212_40);
  });

  it('respects minimum quantity, dates and usage limit', () => {
    const seats = disc({ minQuantity: 5 });
    expect(priceInvoice([line({ quantity: 4 })], { discounts: [seats], taxes: [], at }).discountTotal).toBe(0);
    expect(priceInvoice([line({ quantity: 5 })], { discounts: [seats], taxes: [], at }).discountTotal).toBe(50_00);
    const expired = disc({ endDate: new Date('2026-10-01T00:00:00Z') });
    expect(priceInvoice([line()], { discounts: [expired], taxes: [], at }).discountTotal).toBe(0);
    const usedUp = disc({ usageLimit: 2, usedCount: 2 });
    expect(priceInvoice([line()], { discounts: [usedUp], taxes: [], at }).appliedDiscountIds).toEqual([]);
  });

  it('applies product discounts only to matching lines and caps fixed amounts', () => {
    const r = priceInvoice(
      [line({ productId: 'p1', unitPrice: 30_00 }), line({ productId: 'p2', unitPrice: 50_00 })],
      { discounts: [disc({ scope: 'PRODUCT', type: 'FIXED', value: 999_00, productIds: ['p1'] })], taxes: [], at },
    );
    expect(r.lines[0].discount).toBe(30_00);
    expect(r.lines[1].discount).toBe(0);
  });

  it('only taxes matching product types', () => {
    const goodsTax: TaxRule = { ...gst, productType: 'GOODS' };
    expect(priceInvoice([line()], { discounts: [], taxes: [goodsTax], at }).taxTotal).toBe(0);
  });

  it('spreads a subscription discount across lines without losing a paisa', () => {
    const r = priceInvoice([line({ unitPrice: 333 }), line({ unitPrice: 333 }), line({ unitPrice: 334 })], { discounts: [disc({ type: 'FIXED', value: 100 })], taxes: [], at });
    expect(r.lines.reduce((s, l) => s + l.discount, 0)).toBe(100);
    expect(r.total).toBe(900);
  });

  it('restricts discounts to listed subscriptions', () => {
    const vip = disc({ subscriptionIds: ['s1'] });
    expect(priceInvoice([line()], { discounts: [vip], taxes: [], at, subscriptionId: 's2' }).discountTotal).toBe(0);
    expect(priceInvoice([line()], { discounts: [vip], taxes: [], at, subscriptionId: 's1' }).discountTotal).toBe(10_00);
  });
});

describe('helpers', () => {
  it('allocate sums exactly', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });
  it('normalizes MRR', () => {
    expect(toMonthly(1200_00, 'YEARLY')).toBe(100_00);
    expect(toMonthly(100_00, 'MONTHLY')).toBe(100_00);
  });
  it('buckets aging', () => {
    expect(agingBucket(new Date('2026-10-20T00:00:00Z'), at)).toBe('current');
    expect(agingBucket(new Date('2026-08-01T00:00:00Z'), at)).toBe('61-90');
  });
  it('guards lifecycle transitions', () => {
    const flags = { pausable: false, closable: false, renewable: true };
    expect(transitionError('DRAFT', 'ACTIVE', flags)).toMatch(/Cannot/);
    expect(transitionError('ACTIVE', 'PAUSED', flags)).toMatch(/pausing/);
    expect(transitionError('ACTIVE', 'CLOSED', flags)).toMatch(/closed early/);
    expect(transitionError('QUOTATION', 'CONFIRMED', flags)).toBeNull();
  });
});

describe('password rules', () => {
  it('needs >8 chars, upper, lower, special', () => {
    expect(isStrongPassword('Abcdefg!1')).toBe(true);
    expect(isStrongPassword('Abcdef!1')).toBe(false); // exactly 8
    expect(failedPasswordRules('abcdefghij').map((r) => r.id)).toEqual(['upper', 'special']);
  });
  it('signup schema checks confirmation', () => {
    const r = signupSchema.safeParse({ name: 'Asha', email: 'A@X.io', password: 'Abcdefg!1', confirmPassword: 'nope' });
    expect(r.success).toBe(false);
  });
});

describe('schemas', () => {
  it('converts fixed discounts to paise and requires products for product scope', () => {
    const ok = discountSchema.parse({ name: 'Flat', type: 'FIXED', value: '12.50', scope: 'SUBSCRIPTION' });
    expect(ok.value).toBe(1250);
    expect(discountSchema.safeParse({ name: 'Bad', type: 'PERCENT', value: 120, scope: 'PRODUCT' }).success).toBe(false);
  });
});

describe('reconciliation', () => {
  const invoices = [
    { id: 'i1', number: 'INV/2026/00042', customerName: 'Acme Traders', amountDue: 1180_00 },
    { id: 'i2', number: 'INV/2026/00043', customerName: 'Zen Labs', amountDue: 1180_00 },
  ];
  it('auto-matches on invoice number + amount', () => {
    const r = rankMatches({ date: '2026-10-01', description: 'NEFT ACME TRADERS INV-2026-00042', reference: '', amount: 1180_00 }, invoices);
    expect(r.autoInvoiceId).toBe('i1');
  });
  it('does not auto-match on amount alone when ambiguous', () => {
    const r = rankMatches({ date: '2026-10-01', description: 'UPI transfer', reference: '', amount: 1180_00 }, invoices);
    expect(r.autoInvoiceId).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });
  it('parses quoted CSV', () => {
    expect(csvToObjects('Date,Description,Amount\r\n2026-10-01,"Acme, ""HQ""",10\n')).toEqual([{ date: '2026-10-01', description: 'Acme, "HQ"', amount: '10' }]);
  });
});
