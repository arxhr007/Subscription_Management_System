// Proves "nothing is billed twice": rewind a subscription's billing pointer to its very first period
// (as if a job crashed or was triggered twice), run billing twice, and check no invoice was duplicated.
import 'dotenv/config';
import { runBilling } from '../src/lib/billing';
import { loadClock } from '../src/lib/clock';
import { prisma } from '../src/lib/db';

await loadClock();
const sub = await prisma.subscription.findFirst({
  where: { status: 'ACTIVE', invoices: { some: {} }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] },
  include: { invoices: { orderBy: { periodStart: 'asc' }, select: { periodStart: true } } },
  orderBy: { startDate: 'asc' },
});
if (!sub) throw new Error('No active subscription with invoices — seed the database first');

const before = sub.invoices.length;
const pointer = sub.nextInvoiceDate;
console.log(`${sub.number}: ${before} invoices, next period ${pointer?.toISOString().slice(0, 10)}`);

await prisma.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: sub.invoices[0].periodStart } });
console.log(`Rewound pointer to ${sub.invoices[0].periodStart!.toISOString().slice(0, 10)} and running billing twice…`);
const first = await runBilling({ actor: 'idempotency check' });
const second = await runBilling({ actor: 'idempotency check' });

const after = await prisma.invoice.count({ where: { subscriptionId: sub.id } });
const restored = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
const dupes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
  'SELECT COUNT(*) AS n FROM (SELECT subscriptionId, periodStart FROM Invoice WHERE subscriptionId IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1)',
);

console.log('Run 1:', first);
console.log('Run 2:', second);
const ok = after === before && Number(dupes[0].n) === 0 && restored.nextInvoiceDate?.getTime() === pointer?.getTime();
console.log(`${sub.number}: ${after} invoices (was ${before}); duplicate periods in DB: ${dupes[0].n}; pointer restored: ${restored.nextInvoiceDate?.getTime() === pointer?.getTime()}`);
console.log(ok ? '✅ PASS — nothing was billed twice' : '❌ FAIL');
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
