// One set of validation schemas, used by the web forms (live feedback) and the API (authoritative check).
// Forms send what the user typed (strings, amounts in rupees); the API parses them into typed values (amounts in paise).
import { z } from 'zod';
import { failedPasswordRules } from './password';
import { toCents } from './money';
import { DISCOUNT_SCOPES, DISCOUNT_TYPES, INTERVALS, PAYMENT_METHODS, PAYMENT_TERM_KEYS, PRODUCT_TYPES } from './enums';

const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const zEmail = z.string({ error: 'Email is required' }).trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address').max(120);

export const zPassword = z.string({ error: 'Password is required' }).max(128).superRefine((p, ctx) => {
  const failed = failedPasswordRules(p);
  if (failed.length) ctx.addIssue({ code: 'custom', message: `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}` });
});

const zName = (what = 'Name') => z.string().trim().min(2, `${what} must be at least 2 characters`).max(100, `${what} is too long`);
const zOptText = (max = 500) => z.preprocess(blankToNull, z.string().trim().max(max, `Keep it under ${max} characters`).nullable()).default(null);
const zId = (what: string) => z.string({ error: `Choose a ${what}` }).min(1, `Choose a ${what}`);

/** Amount typed in rupees (max 2 decimals) → integer paise. */
export const zMoney = (what = 'Amount') =>
  z.coerce.number({ error: `${what} must be a number` })
    .min(0, `${what} cannot be negative`)
    .max(100_000_000, `${what} is too large`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${what} can have at most 2 decimals`)
    .transform(toCents);

const zInt = (what: string, min: number, max: number) =>
  z.coerce.number({ error: `${what} must be a number` }).int(`${what} must be a whole number`).min(min, `${what} must be at least ${min}`).max(max, `${what} must be at most ${max}`);

const zDate = (what: string) => z.coerce.date({ error: `Enter a valid ${what}` });
const zOptDate = (what: string) => z.preprocess(blankToNull, zDate(what).nullable()).default(null);
const zBool = z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean());

// ---------- Auth ----------

export const signupSchema = z.object({ name: zName(), email: zEmail, password: zPassword, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export const loginSchema = z.object({ email: zEmail, password: z.string().min(1, 'Password is required') });
export const forgotSchema = z.object({ email: zEmail });
export const resetSchema = z.object({ token: z.string().min(10), password: zPassword, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export const staffSchema = z.object({ name: zName(), email: zEmail, password: zPassword });

// ---------- Master data ----------

export const customerSchema = z.object({
  name: zName(),
  email: zEmail,
  company: zOptText(120),
  phone: z.preprocess(blankToNull, z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number').nullable()).default(null),
  address: zOptText(300),
});

export const variantSchema = z.object({
  attribute: zName('Attribute'),
  value: z.string().trim().min(1, 'Value is required').max(60),
  extraPrice: zMoney('Extra price'),
});

export const productSchema = z.object({
  name: zName(),
  type: z.enum(PRODUCT_TYPES, { error: 'Choose a product type' }),
  salesPrice: zMoney('Sales price'),
  costPrice: zMoney('Cost price'),
  notes: zOptText(1000),
  active: zBool.default(true),
  variants: z.array(variantSchema).max(50).default([]),
});

export const planSchema = z.object({
  name: zName(),
  interval: z.enum(INTERVALS, { error: 'Choose how often it bills' }),
  price: zMoney('Price'),
  minQuantity: zInt('Minimum quantity', 1, 100_000),
  startDate: zOptDate('start date'),
  endDate: zOptDate('end date'),
  autoClose: zBool.default(false),
  closable: zBool.default(true),
  pausable: zBool.default(false),
  renewable: zBool.default(true),
  active: zBool.default(true),
}).refine((d) => !d.startDate || !d.endDate || d.endDate > d.startDate, { path: ['endDate'], message: 'End date must be after the start date' });

export const taxSchema = z.object({
  name: zName(),
  rate: z.coerce.number({ error: 'Rate must be a number' }).min(0, 'Rate cannot be negative').max(100, 'Rate cannot exceed 100%'),
  productType: z.preprocess(blankToNull, z.enum(PRODUCT_TYPES).nullable()).default(null),
  active: zBool.default(true),
});

export const discountSchema = z.object({
  name: zName(),
  type: z.enum(DISCOUNT_TYPES),
  value: z.coerce.number({ error: 'Value must be a number' }).positive('Value must be more than 0').max(100_000_000),
  scope: z.enum(DISCOUNT_SCOPES),
  minQuantity: zInt('Minimum quantity', 0, 100_000).default(0),
  minAmount: zMoney('Minimum purchase').default(0),
  startDate: zOptDate('start date'),
  endDate: zOptDate('end date'),
  usageLimit: z.preprocess(blankToNull, zInt('Usage limit', 1, 1_000_000).nullable()).default(null),
  productIds: z.array(z.string()).default([]),
  subscriptionIds: z.array(z.string()).default([]),
  active: zBool.default(true),
}).superRefine((d, ctx) => {
  if (d.type === 'PERCENT' && d.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot exceed 100' });
  if (d.scope === 'PRODUCT' && d.productIds.length === 0) ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Pick at least one product' });
  if (d.startDate && d.endDate && d.endDate <= d.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
}).transform((d) => ({ ...d, value: d.type === 'FIXED' ? toCents(d.value) : d.value }));

// ---------- Sales ----------

export const lineSchema = z.object({
  productId: zId('product'),
  variantId: z.preprocess(blankToNull, z.string().nullable()).default(null),
  quantity: zInt('Quantity', 1, 100_000),
  unitPrice: z.preprocess(blankToNull, zMoney('Unit price').nullable()).default(null), // null = product price + variant extra
});

export const templateSchema = z.object({
  name: zName(),
  validityDays: zInt('Validity', 1, 365),
  planId: zId('plan'),
  paymentTerm: z.enum(PAYMENT_TERM_KEYS),
  notes: zOptText(1000),
  lines: z.array(lineSchema).min(1, 'Add at least one product line'),
});

export const subscriptionSchema = z.object({
  customerId: zId('customer'),
  planId: zId('plan'),
  templateId: z.preprocess(blankToNull, z.string().nullable()).default(null),
  startDate: zDate('start date'),
  expiryDate: zOptDate('expiry date'),
  paymentTerm: z.enum(PAYMENT_TERM_KEYS),
  autoRenew: zBool.default(false),
  notes: zOptText(1000),
  lines: z.array(lineSchema).min(1, 'Add at least one product line'),
}).refine((d) => !d.expiryDate || d.expiryDate > d.startDate, { path: ['expiryDate'], message: 'Expiry must be after the start date' });

export const paymentSchema = z.object({
  invoiceId: zId('invoice'),
  method: z.enum(PAYMENT_METHODS, { error: 'Choose a payment method' }),
  amount: zMoney('Amount').refine((v) => v > 0, 'Amount must be more than 0'),
  date: zDate('payment date'),
  note: zOptText(500),
});

export const clockAdvanceSchema = z.object({ days: zInt('Days', 1, 400) });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().max(30).optional(),
  sort: z.string().max(30).optional(),
});

export type SignupInput = z.input<typeof signupSchema>;
export type ProductInput = z.input<typeof productSchema>;
export type PlanInput = z.input<typeof planSchema>;
export type SubscriptionInput = z.input<typeof subscriptionSchema>;
export type SubscriptionData = z.output<typeof subscriptionSchema>;
export type DiscountData = z.output<typeof discountSchema>;

/** Flattens a ZodError into { "field.path": "first message" } for forms and API responses. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
