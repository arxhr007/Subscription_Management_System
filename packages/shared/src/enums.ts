export const ROLES = ['ADMIN', 'STAFF', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const SUB_STATUSES = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INTERVALS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Interval = (typeof INTERVALS)[number];

export const PRODUCT_TYPES = ['SERVICE', 'GOODS', 'ADDON'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CARD', 'UPI', 'CASH', 'CHEQUE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Payment terms → days until the invoice is due. */
export const PAYMENT_TERMS = { IMMEDIATE: 0, NET_7: 7, NET_15: 15, NET_30: 30 } as const;
export type PaymentTerm = keyof typeof PAYMENT_TERMS;
export const PAYMENT_TERM_KEYS = Object.keys(PAYMENT_TERMS) as [PaymentTerm, ...PaymentTerm[]];

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_SCOPES = ['PRODUCT', 'SUBSCRIPTION'] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const LABELS: Record<string, string> = {
  DRAFT: 'Draft', QUOTATION: 'Quotation', CONFIRMED: 'Confirmed', ACTIVE: 'Active', PAUSED: 'Paused',
  CLOSED: 'Closed', PAID: 'Paid', CANCELLED: 'Cancelled', OVERDUE: 'Overdue',
  DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly',
  SERVICE: 'Service', GOODS: 'Goods', ADDON: 'Add-on',
  BANK_TRANSFER: 'Bank transfer', CARD: 'Card', UPI: 'UPI', CASH: 'Cash', CHEQUE: 'Cheque',
  IMMEDIATE: 'Immediate', NET_7: 'Net 7 days', NET_15: 'Net 15 days', NET_30: 'Net 30 days',
  PERCENT: 'Percentage', FIXED: 'Fixed amount', PRODUCT: 'Specific products', SUBSCRIPTION: 'Whole subscription',
  ADMIN: 'Admin', STAFF: 'Staff', CUSTOMER: 'Customer',
};
export const label = (k: string) => LABELS[k] ?? k;
