// Writes demo CSVs into /samples: a bank statement that matches currently open invoices, and a spreadsheet to import.
// Run `npm run samples -w apps/api` before a demo to refresh the bank statement against today's open invoices.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

export async function writeSamples(prisma: PrismaClient) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../samples');
  mkdirSync(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const open = await prisma.invoice.findMany({ where: { status: 'CONFIRMED' }, orderBy: { dueDate: 'asc' }, take: 10, include: { customer: true } });
  const amt = (c: number) => (c / 100).toFixed(2);
  const utr = (i: number) => `UTR${String(482910 + i * 7919).slice(0, 6)}`;
  const rows = ['date,description,reference,amount'];
  // 7 lines that carry the invoice number (some as INV-2026-00042) → auto-matched.
  open.slice(0, 7).forEach((inv, i) => rows.push(`${today},NEFT ${inv.customer.name.toUpperCase()}${i % 2 ? ' ' + inv.number.replace(/\//g, '-') : ''},${i % 2 ? utr(i) : inv.number},${amt(inv.total - inv.amountPaid)}`));
  // 1 line with only the customer name + exact amount → suggested, needs a click.
  if (open[7]) rows.push(`${today},UPI ${open[7].customer.name},${utr(7)},${amt(open[7].total - open[7].amountPaid)}`);
  // 1 line that matches nothing well, 1 debit that is not a payment.
  rows.push(`${today},IMPS TRANSFER,${utr(8)},${amt((open[8]?.total ?? 200000) - 1)}`);
  rows.push(`${today},Bank charges,,-150.00`);
  writeFileSync(resolve(dir, 'bank-statement.csv'), rows.join('\n') + '\n');

  writeFileSync(resolve(dir, 'subscriptions-import.csv'), [
    'customer_name,customer_email,plan,product,variant,quantity,start_date,expiry_date,unit_price,payment_term',
    'Kite Bakery,owner@kitebakery.in,Monthly,Brightloop CRM,Odoo,3,2026-03-01,,,NET_15',
    'Kite Bakery,owner@kitebakery.in,Monthly,Analytics Add-on,,2,2026-03-01,,,NET_15',
    'Riverstone Dental,admin@riverstonedental.in,Yearly Contract,Brightloop Books,Pro,6,2026-01-15,2027-01-15,,NET_30',
    'Pixel Prints,hello@pixelprints.in,Weekly Flex,Extra Storage 100 GB,,1,2026-09-01,,62.50,IMMEDIATE',
    'Bad Row Co,not-an-email,Monthly,Brightloop CRM,,2,2026-05-01,,,NET_15',
    'Tiny Seats Ltd,ops@tinyseats.in,Yearly Contract,Brightloop CRM,,2,2026-02-01,2027-02-01,,NET_30',
    'Ghost Plan Inc,ops@ghostplan.in,Platinum,Brightloop CRM,,2,2026-02-01,,,NET_30',
    'Late Dates LLP,ops@latedates.in,Monthly,Brightloop CRM,,2,2026-06-01,2026-05-01,,NET_15',
  ].join('\n') + '\n');
  console.log(`  Sample CSVs written to ${dir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const prisma = new PrismaClient();
  writeSamples(prisma).finally(() => prisma.$disconnect());
}
