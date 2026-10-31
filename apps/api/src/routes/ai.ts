// "Ask Finance": a natural-language window onto the same read-only queries the dashboard uses.
// The assistant never touches SQL; it can only call the tools below. Without a key or internet the feature hides itself.
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Router } from 'express';
import { z } from 'zod';
import { formatMoney } from '@brightloop/shared';
import { staffOnly, rateLimit } from '../lib/auth';
import { now } from '../lib/clock';
import { prisma } from '../lib/db';
import { HttpError, parse } from '../lib/http';
import { dashboardData } from './dashboard';

const enabled = Boolean(process.env.DEEPSEEK_API_KEY);
const client = enabled ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com', timeout: 20_000, maxRetries: 1 }) : null;
function defineTool<T extends z.ZodType>(tool: { name: string; description: string; inputSchema: T; run: (input: z.output<T>) => Promise<string> }) {
  return { ...tool, execute: (input: unknown) => tool.run(tool.inputSchema.parse(input)) };
}
const DAY = 86_400_000;

const tools = [
  defineTool({
    name: 'get_kpis',
    description: 'Headline numbers: active subscriptions, MRR, ARR, collected this month, outstanding and overdue receivables, renewals due in 30 days, 30-day churn, monthly invoiced vs collected series, overdue aging buckets, MRR by plan.',
    inputSchema: z.object({ months: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional().describe('Length of the monthly series (default 12)') }),
    run: async ({ months }) => {
      const d = await dashboardData({ months: months ?? 12 });
      const m = (c: number) => formatMoney(c);
      return JSON.stringify({
        today: d.now.toISOString().slice(0, 10),
        kpis: { ...d.kpis, mrr: m(d.kpis.mrr), arr: m(d.kpis.arr), arpa: m(d.kpis.arpa), collectedThisMonth: m(d.kpis.collectedThisMonth), outstanding: m(d.kpis.outstanding), overdue: m(d.kpis.overdue), churn30: `${(d.kpis.churn30 * 100).toFixed(1)}%` },
        statusCounts: d.statusCounts,
        series: d.series.map((s) => ({ month: s.month, invoiced: m(s.invoiced), collected: m(s.collected) })),
        aging: d.aging.map((a) => ({ bucket: `${a.bucket} days`, amount: m(a.amount) })),
        mrrByPlan: d.mrrByPlan.map((p) => ({ plan: p.plan, subscriptions: p.count, mrr: m(p.mrr) })),
      });
    },
  }),
  defineTool({
    name: 'list_overdue_invoices',
    description: 'Unpaid confirmed invoices past their due date, oldest first, with customer and amount due.',
    inputSchema: z.object({
      min_days_overdue: z.number().int().min(0).max(3650).optional().describe('Only invoices at least this many days late'),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async ({ min_days_overdue, limit }) => {
      const at = now();
      const rows = await prisma.invoice.findMany({
        where: { status: 'CONFIRMED', dueDate: { lt: new Date(at.getTime() - (min_days_overdue ?? 0) * DAY) } },
        orderBy: { dueDate: 'asc' }, take: limit ?? 20,
        select: { number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { name: true, email: true } } },
      });
      return JSON.stringify(rows.map((r) => ({
        invoice: r.number, customer: r.customer.name, email: r.customer.email, dueDate: r.dueDate.toISOString().slice(0, 10),
        daysOverdue: Math.floor((at.getTime() - r.dueDate.getTime()) / DAY), amountDue: formatMoney(r.total - r.amountPaid),
      })));
    },
  }),
  defineTool({
    name: 'top_customers',
    description: 'Customers ranked by recurring revenue (MRR of active subscriptions) or by outstanding balance.',
    inputSchema: z.object({ by: z.enum(['mrr', 'outstanding']), limit: z.number().int().min(1).max(25).optional() }),
    run: async ({ by, limit }) => {
      const take = limit ?? 10;
      if (by === 'mrr') {
        const rows = await prisma.subscription.groupBy({ by: ['customerId'], where: { status: 'ACTIVE' }, _sum: { mrr: true }, orderBy: { _sum: { mrr: 'desc' } }, take });
        const names = new Map((await prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
        return JSON.stringify(rows.map((r) => ({ customer: names.get(r.customerId), mrr: formatMoney(r._sum.mrr ?? 0) })));
      }
      const rows = await prisma.invoice.groupBy({ by: ['customerId'], where: { status: 'CONFIRMED' }, _sum: { total: true, amountPaid: true } });
      const top = rows.map((r) => ({ id: r.customerId, due: (r._sum.total ?? 0) - (r._sum.amountPaid ?? 0) })).sort((a, b) => b.due - a.due).slice(0, take);
      const names = new Map((await prisma.customer.findMany({ where: { id: { in: top.map((r) => r.id) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
      return JSON.stringify(top.map((r) => ({ customer: names.get(r.id), outstanding: formatMoney(r.due) })));
    },
  }),
  defineTool({
    name: 'find_subscriptions',
    description: 'Search subscriptions by status, plan name, customer name, or expiring within N days. Returns up to 25 rows.',
    inputSchema: z.object({
      status: z.enum(['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
      plan_name: z.string().max(80).optional(),
      customer_name: z.string().max(80).optional(),
      expiring_within_days: z.number().int().min(0).max(365).optional(),
    }),
    run: async (q) => {
      const at = now();
      const where = {
        ...(q.status ? { status: q.status } : {}),
        ...(q.plan_name ? { plan: { name: { contains: q.plan_name } } } : {}),
        ...(q.customer_name ? { customer: { name: { contains: q.customer_name } } } : {}),
        ...(q.expiring_within_days != null ? { expiryDate: { lte: new Date(at.getTime() + q.expiring_within_days * DAY) } } : {}),
      };
      const [rows, count] = await Promise.all([
        prisma.subscription.findMany({ where, take: 25, orderBy: { mrr: 'desc' }, select: { number: true, status: true, expiryDate: true, mrr: true, customer: { select: { name: true } }, plan: { select: { name: true } } } }),
        prisma.subscription.count({ where }),
      ]);
      return JSON.stringify({ totalMatching: count, rows: rows.map((r) => ({ number: r.number, status: r.status, customer: r.customer.name, plan: r.plan.name, mrr: formatMoney(r.mrr), expiry: r.expiryDate?.toISOString().slice(0, 10) ?? null })) });
    },
  }),
];

const SYSTEM = `You are the finance assistant inside Brightloop's subscription billing system.
Answer questions about subscriptions, revenue, invoices, payments and receivables using only the tools provided; never guess numbers.
Amounts are in Indian rupees and already formatted by the tools — quote them as given.
Be brief: lead with the direct answer, then at most a few bullets. Use **bold** for key figures.
If a question is outside billing data, say what you can answer instead.`;

export const aiRouter = Router();
aiRouter.use(staffOnly);

aiRouter.get('/status', (_req, res) => res.json({ enabled }));

aiRouter.post('/ask', rateLimit(20, 60_000), async (req, res) => {
  if (!client) throw new HttpError(503, 'Ask Finance is not configured (set DEEPSEEK_API_KEY on the server).');
  const { question, history } = parse(z.object({
    question: z.string().trim().min(3, 'Ask a question').max(500, 'Keep the question under 500 characters'),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(10).default([]),
  }), req.body);

  try {
    const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: question }];
    const deadline = Date.now() + 45_000;
    for (let turn = 0; turn < 6; turn++) {
      if (Date.now() > deadline) throw new HttpError(504, 'Ask Finance took too long. Try a narrower question.');
      const result = await client.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', messages, max_tokens: 2000,
        tools: tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.inputSchema) } })),
      });
      const message = result.choices[0]?.message;
      if (!message) throw new HttpError(502, 'No response from Ask Finance');
      if (!message.tool_calls?.length) return res.json({ answer: message.content || 'No answer found in the billing data.' });
      if (message.tool_calls.length > 8) throw new HttpError(502, 'Too many tool calls requested');
      messages.push(message);
      for (const call of message.tool_calls) {
        if (call.type !== 'function') throw new HttpError(502, 'Unsupported tool call');
        const tool = tools.find(t => t.name === call.function.name);
        let content: string;
        try { content = tool ? await tool.execute(JSON.parse(call.function.arguments)) : 'Unknown tool'; }
        catch { content = 'Tool could not run. Check arguments; do not invent data.'; }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
    throw new HttpError(502, 'Ask Finance reached its query limit. Try a narrower question.');
  } catch (e) {
    if (e instanceof OpenAI.AuthenticationError) throw new HttpError(503, 'Ask Finance API key was rejected');
    if (e instanceof OpenAI.RateLimitError) throw new HttpError(429, 'Ask Finance is busy. Try again shortly.');
    if (e instanceof OpenAI.APIError) throw new HttpError(502, 'Ask Finance is temporarily unavailable');
    throw e;
  }
});
