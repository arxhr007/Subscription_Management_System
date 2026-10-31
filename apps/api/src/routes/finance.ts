// Invoices, payments, the billing run and bank-statement reconciliation.
import { Router } from 'express';
import { z } from 'zod';
import { csvToObjects, formatMoney, label, listQuerySchema, paymentSchema, rankMatches, toCents, type OpenInvoice } from '@brightloop/shared';
import { staffOnly } from '../lib/auth';
import { audit } from '../lib/audit';
import { runAllJobs } from '../lib/billing';
import { now } from '../lib/clock';
import { prisma, type Tx } from '../lib/db';
import { broadcast } from '../lib/events';
import { HttpError, notFound, paging, parse } from '../lib/http';
import { sendMail } from '../lib/mail';

// ---------- Shared helpers (also used by the portal) ----------

export async function invoiceDetail(id: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: true, payments: { orderBy: { date: 'desc' } }, customer: true, subscription: { select: { id: true, number: true, plan: { select: { name: true, interval: true } } } } },
  });
  if (!inv) throw notFound('Invoice');
  const at = now();
  return { ...inv, amountDue: inv.total - inv.amountPaid, overdue: inv.status === 'CONFIRMED' && inv.dueDate < at, now: at };
}

export async function recordPayment(tx: Tx, p: { invoiceId: string; method: string; amount: number; date: Date; note: string | null }, actor: string) {
  const inv = await tx.invoice.findUnique({ where: { id: p.invoiceId } });
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'CONFIRMED') throw new HttpError(409, inv.status === 'PAID' ? 'This invoice is already paid' : 'Confirm the invoice before recording a payment');
  const due = inv.total - inv.amountPaid;
  if (p.amount > due) throw new HttpError(400, 'Payment is more than the amount due', { amount: `At most ${formatMoney(due)} is due` });
  const payment = await tx.payment.create({ data: p });
  const amountPaid = inv.amountPaid + p.amount;
  const paid = amountPaid >= inv.total;
  await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid, status: paid ? 'PAID' : 'CONFIRMED', paidAt: paid ? p.date : null } });
  await audit(tx, 'invoice', inv.id, paid ? 'Paid' : 'Part payment', `${formatMoney(p.amount)} by ${label(p.method)}`, actor);
  return payment;
}

// ---------- Invoices ----------

export const invoicesRouter = Router();
invoicesRouter.use(staffOnly);

invoicesRouter.get('/', async (req, res) => {
  const q = parse(listQuerySchema.extend({ customerId: z.string().optional() }), req.query);
  const at = now();
  const status =
    q.status === 'OVERDUE' ? { status: 'CONFIRMED', dueDate: { lt: at } }
      : q.status === 'OUTSTANDING' ? { status: 'CONFIRMED' }
        : q.status && ['DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED'].includes(q.status) ? { status: q.status } : {};
  const where = {
    ...status,
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q } }, { customer: { name: { contains: q.q } } }] } : {}),
  };
  const orderBy = q.status === 'OVERDUE' ? { dueDate: 'asc' as const } : { issueDate: 'desc' as const };
  const [items, total, sums] = await Promise.all([
    prisma.invoice.findMany({
      where, orderBy, ...paging(q.page, q.pageSize),
      select: {
        id: true, number: true, status: true, issueDate: true, dueDate: true, total: true, amountPaid: true,
        customer: { select: { id: true, name: true } }, subscription: { select: { id: true, number: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
  ]);
  res.json({
    items: items.map((i) => ({ ...i, overdue: i.status === 'CONFIRMED' && i.dueDate < at })),
    total, page: q.page, pageSize: q.pageSize,
    summary: { total: sums._sum.total ?? 0, paid: sums._sum.amountPaid ?? 0 },
  });
});

invoicesRouter.get('/:id', async (req, res) => {
  const timeline = await prisma.auditLog.findMany({ where: { entityType: 'invoice', entityId: req.params.id }, orderBy: { at: 'desc' } });
  res.json({ ...(await invoiceDetail(req.params.id)), timeline });
});

invoicesRouter.post('/:id/confirm', async (req, res) => {
  const r = await prisma.invoice.updateMany({ where: { id: req.params.id, status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
  if (!r.count) throw new HttpError(409, 'Only draft invoices can be confirmed');
  await audit(prisma, 'invoice', req.params.id, 'Confirmed', undefined, req.user!.name);
  broadcast('invoices');
  res.json(await invoiceDetail(req.params.id));
});

invoicesRouter.post('/:id/cancel', async (req, res) => {
  const r = await prisma.invoice.updateMany({ where: { id: req.params.id, status: { in: ['DRAFT', 'CONFIRMED'] }, amountPaid: 0 }, data: { status: 'CANCELLED' } });
  if (!r.count) throw new HttpError(409, 'Only unpaid draft or confirmed invoices can be cancelled');
  await audit(prisma, 'invoice', req.params.id, 'Cancelled', undefined, req.user!.name);
  broadcast('invoices');
  res.json(await invoiceDetail(req.params.id));
});

invoicesRouter.post('/:id/send', async (req, res) => {
  const inv = await invoiceDetail(req.params.id);
  if (inv.status === 'DRAFT' || inv.status === 'CANCELLED') throw new HttpError(409, 'Confirm the invoice before sending it');
  const lines = inv.lines.map((l) => `  • ${l.description} × ${l.quantity}: ${formatMoney(l.total)}`).join('\n');
  await sendMail(inv.customer.email, `Invoice ${inv.number} from Brightloop`,
    `Hi ${inv.customer.name},\n\nInvoice ${inv.number}\n${lines}\n\nTotal: ${formatMoney(inv.total)}\nAmount due: ${formatMoney(inv.amountDue)} by ${inv.dueDate.toISOString().slice(0, 10)}\n\nView and pay it in your Brightloop portal.`);
  await prisma.invoice.update({ where: { id: inv.id }, data: { sentAt: now() } });
  await audit(prisma, 'invoice', inv.id, 'Sent', inv.customer.email, req.user!.name);
  broadcast('invoices');
  res.json(await invoiceDetail(inv.id));
});

// ---------- Billing run ----------

export const billingRouter = Router();
billingRouter.use(staffOnly);

billingRouter.post('/run', async (req, res) => {
  const summary = await runAllJobs(req.user!.name);
  res.json(summary);
});

// ---------- Payments ----------

export const paymentsRouter = Router();
paymentsRouter.use(staffOnly);

paymentsRouter.get('/', async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where = {
    ...(q.status ? { method: q.status } : {}),
    ...(q.q ? { OR: [{ invoice: { number: { contains: q.q } } }, { invoice: { customer: { name: { contains: q.q } } } }, { note: { contains: q.q } }] } : {}),
  };
  const [items, total, sum] = await Promise.all([
    prisma.payment.findMany({
      where, orderBy: { date: 'desc' }, ...paging(q.page, q.pageSize),
      include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } } },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize, summary: { amount: sum._sum.amount ?? 0 } });
});

paymentsRouter.post('/', async (req, res) => {
  const d = parse(paymentSchema, req.body);
  const p = await prisma.$transaction((tx) => recordPayment(tx, d, req.user!.name));
  broadcast('payments', 'invoices');
  res.status(201).json(p);
});

// ---------- Bank-statement reconciliation ----------

export const reconcileRouter = Router();
reconcileRouter.use(staffOnly);

reconcileRouter.post('/preview', async (req, res) => {
  const { csv } = parse(z.object({ csv: z.string().min(1, 'The file is empty').max(2_000_000, 'Keep the file under 2 MB') }), req.body);
  const rows = csvToObjects(csv).slice(0, 1000);
  if (!rows.length) throw new HttpError(400, 'No rows found. The first row must be a header: date, description, reference, amount');
  if (!('amount' in rows[0]) || !('date' in rows[0])) throw new HttpError(400, 'The CSV needs at least “date” and “amount” columns');

  const open = await prisma.invoice.findMany({
    where: { status: 'CONFIRMED' },
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, customer: { select: { name: true } } },
  });
  const openInvoices: OpenInvoice[] = open.map((i) => ({ id: i.id, number: i.number, customerName: i.customer.name, amountDue: i.total - i.amountPaid }));
  const byId = new Map(openInvoices.map((i) => [i.id, i]));

  const out = rows.map((r, idx) => {
    const amountNum = Number(String(r.amount ?? '').replace(/[,₹\s]/g, ''));
    const date = new Date(r.date ?? '');
    const base = { row: idx + 2, date: r.date ?? '', description: r.description ?? r.narration ?? '', reference: r.reference ?? r.ref ?? '', amount: Number.isFinite(amountNum) ? toCents(amountNum) : 0 };
    if (Number.isNaN(date.getTime())) return { ...base, error: 'Unreadable date', candidates: [], autoInvoiceId: null };
    if (!Number.isFinite(amountNum) || amountNum <= 0) return { ...base, error: 'Not a credit (amount must be positive)', candidates: [], autoInvoiceId: null };
    const { candidates, autoInvoiceId } = rankMatches(base, openInvoices);
    return { ...base, error: null, autoInvoiceId, candidates: candidates.map((c) => ({ ...c, ...byId.get(c.invoiceId)! })) };
  });
  res.json({ rows: out, openInvoices: openInvoices.length });
});

reconcileRouter.post('/confirm', async (req, res) => {
  const { matches } = parse(z.object({
    matches: z.array(z.object({ invoiceId: z.string(), amount: z.number().int().positive(), date: z.coerce.date(), description: z.string().max(300).default('') })).min(1).max(1000),
  }), req.body);
  const results: { invoiceId: string; ok: boolean; error?: string }[] = [];
  for (const m of matches) {
    try {
      await prisma.$transaction((tx) => recordPayment(tx, { invoiceId: m.invoiceId, method: 'BANK_TRANSFER', amount: m.amount, date: m.date, note: `Bank statement: ${m.description}`.slice(0, 500) }, req.user!.name));
      results.push({ invoiceId: m.invoiceId, ok: true });
    } catch (e) {
      results.push({ invoiceId: m.invoiceId, ok: false, error: e instanceof HttpError ? e.message : 'Failed' });
    }
  }
  broadcast('payments', 'invoices');
  res.json({ recorded: results.filter((r) => r.ok).length, results });
});
