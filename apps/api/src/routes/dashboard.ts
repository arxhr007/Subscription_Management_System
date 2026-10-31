import { Router } from 'express';
import { z } from 'zod';
import { agingBucket, type AgingBucket } from '@brightloop/shared';
import { staffOnly } from '../lib/auth';
import { now } from '../lib/clock';
import { prisma } from '../lib/db';
import { parse } from '../lib/http';

export const dashboardRouter = Router();
dashboardRouter.use(staffOnly);

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function dashboardData(opts: { months?: number; planId?: string } = {}) {
  const months = opts.months ?? 12;
  const at = now();
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - (months - 1), 1));
  const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const subWhere = opts.planId ? { planId: opts.planId } : {};
  const invWhere = opts.planId ? { subscription: { planId: opts.planId } } : {};
  const payWhere = opts.planId ? { invoice: { subscription: { planId: opts.planId } } } : {};
  const in30 = new Date(at.getTime() + 30 * 86_400_000);
  const ago30 = new Date(at.getTime() - 30 * 86_400_000);

  const [statusRows, mrr, outstanding, overdueRows, payments, invoiced, mrrByPlan, plans, renewalsDue, closed30, collectedThisMonth] = await Promise.all([
    prisma.subscription.groupBy({ by: ['status'], where: subWhere, _count: { _all: true } }),
    prisma.subscription.aggregate({ where: { ...subWhere, status: 'ACTIVE' }, _sum: { mrr: true } }),
    prisma.invoice.aggregate({ where: { ...invWhere, status: 'CONFIRMED' }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.findMany({
      where: { ...invWhere, status: 'CONFIRMED', dueDate: { lt: at } }, orderBy: { dueDate: 'asc' },
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { name: true } } },
    }),
    prisma.payment.findMany({ where: { ...payWhere, date: { gte: from, lte: at } }, select: { date: true, amount: true } }),
    prisma.invoice.findMany({ where: { ...invWhere, status: { not: 'CANCELLED' }, issueDate: { gte: from, lte: at } }, select: { issueDate: true, total: true } }),
    prisma.subscription.groupBy({ by: ['planId'], where: { ...subWhere, status: 'ACTIVE' }, _sum: { mrr: true }, _count: { _all: true } }),
    prisma.plan.findMany({ select: { id: true, name: true } }),
    prisma.subscription.count({ where: { ...subWhere, status: { in: ['ACTIVE', 'PAUSED'] }, expiryDate: { lte: in30 } } }),
    prisma.subscription.count({ where: { ...subWhere, status: 'CLOSED', updatedAt: { gte: ago30 } } }),
    prisma.payment.aggregate({ where: { ...payWhere, date: { gte: monthStart, lte: at } }, _sum: { amount: true } }),
  ]);

  const series: Record<string, { month: string; collected: number; invoiced: number }> = {};
  for (let i = 0; i < months; i++) {
    const k = monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)));
    series[k] = { month: k, collected: 0, invoiced: 0 };
  }
  for (const p of payments) { const s = series[monthKey(p.date)]; if (s) s.collected += p.amount; }
  for (const i of invoiced) { const s = series[monthKey(i.issueDate)]; if (s) s.invoiced += i.total; }

  const aging: Record<AgingBucket, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const i of overdueRows) aging[agingBucket(i.dueDate, at)] += i.total - i.amountPaid;

  const counts = Object.fromEntries(statusRows.map((r) => [r.status, r._count._all]));
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const totalMrr = mrr._sum.mrr ?? 0;
  const active = counts.ACTIVE ?? 0;

  return {
    now: at,
    kpis: {
      activeSubscriptions: active,
      mrr: totalMrr,
      arr: totalMrr * 12,
      arpa: active ? Math.round(totalMrr / active) : 0,
      collectedThisMonth: collectedThisMonth._sum.amount ?? 0,
      outstanding: (outstanding._sum.total ?? 0) - (outstanding._sum.amountPaid ?? 0),
      outstandingCount: outstanding._count._all,
      overdue: overdueRows.reduce((s, i) => s + i.total - i.amountPaid, 0),
      overdueCount: overdueRows.length,
      renewalsDue,
      churn30: active + closed30 ? closed30 / (active + closed30) : 0,
    },
    statusCounts: counts,
    series: Object.values(series),
    aging: Object.entries(aging).filter(([k]) => k !== 'current').map(([bucket, amount]) => ({ bucket, amount })),
    mrrByPlan: mrrByPlan.map((r) => ({ planId: r.planId, plan: planName.get(r.planId) ?? '—', mrr: r._sum.mrr ?? 0, count: r._count._all })).sort((a, b) => b.mrr - a.mrr),
    topOverdue: overdueRows.slice(0, 8).map((i) => ({ id: i.id, number: i.number, customer: i.customer.name, dueDate: i.dueDate, amountDue: i.total - i.amountPaid })),
  };
}

dashboardRouter.get('/', async (req, res) => {
  const q = parse(z.object({ months: z.coerce.number().int().refine((m) => [3, 6, 12].includes(m)).default(12), planId: z.string().optional() }), req.query);
  res.json(await dashboardData({ months: q.months, planId: q.planId || undefined }));
});
