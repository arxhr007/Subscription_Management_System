// End-to-end API walkthrough of the "month at Brightloop" scenes. Needs the API running on :4000 with seed data.
// Usage: node apps/api/scripts/e2e.mjs   (moves the Time Machine forward, then resets it)
import fs from 'node:fs';

const B = 'http://localhost:4000/api';
const jar = {};
async function call(who, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', cookie: jar[who] ?? '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j, ms: r.headers.get('x-response-time') };
}
const ok = (cond, msg) => { console.log(cond ? '  ✔' : '  ✘', msg); if (!cond) process.exitCode = 1; };
for (let i = 0; i < 30; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

await call('admin', 'POST', '/auth/login', { email: 'admin@brightloop.test', password: 'Admin@1234' });
await call('staff', 'POST', '/auth/login', { email: 'staff@brightloop.test', password: 'Staff@1234' });
await call('cust', 'POST', '/auth/login', { email: 'customer@brightloop.test', password: 'Customer@1234' });

console.log('RBAC');
ok((await call('cust', 'GET', '/subscriptions')).s === 403, 'customer blocked from staff API');
ok((await call('staff', 'POST', '/users', { name: 'Eve', email: 'eve@x.in', password: 'Abcdefg!12' })).s === 403, 'staff cannot create staff');
ok((await call('staff', 'POST', '/discounts', {})).s === 403, 'staff cannot create discounts');
ok((await call('admin', 'POST', '/users', { name: 'Nina Ops', email: `nina${Date.now()}@brightloop.test`, password: 'Abcdefg!12' })).s === 201, 'admin creates staff');

console.log('Catalog');
const prods = (await call('admin', 'GET', '/products')).j.items;
const crm = prods.find((p) => p.name === 'Brightloop CRM');
const odoo = crm.variants.find((v) => v.value === 'Odoo');
ok(odoo.extraPrice === 56000, 'Odoo brand variant adds 560');
const plans = (await call('admin', 'GET', '/plans')).j.items;
const monthly = plans.find((p) => p.name === 'Monthly');
const badPlan = await call('admin', 'POST', '/plans', { name: 'X', interval: 'HOURLY', price: '-1', minQuantity: 0 });
ok(badPlan.s === 400 && badPlan.j.fields.interval && badPlan.j.fields.price && badPlan.j.fields.minQuantity, `plan validation → ${JSON.stringify(badPlan.j.fields)}`);

console.log('Discount: 25% for 5+ seats, usage limit 2');
ok((await call('admin', 'POST', '/discounts', { name: `Seats 25% ${Date.now()}`, type: 'PERCENT', value: '25', scope: 'PRODUCT', productIds: [crm.id], minQuantity: '5', usageLimit: '2' })).s === 201, 'discount created');

console.log('Quote → subscription');
const cust = (await call('staff', 'POST', '/customers', { name: 'Flow Test Co', email: `flow${Date.now()}@test.in`, phone: '+91 99999 00000' })).j;
const start = (await call('admin', 'GET', '/clock')).j.now.slice(0, 10);
const sub = await call('staff', 'POST', '/subscriptions', { customerId: cust.id, planId: monthly.id, startDate: start, paymentTerm: 'NET_15', lines: [{ productId: crm.id, variantId: odoo.id, quantity: '6' }] });
ok(sub.s === 201 && sub.j.status === 'DRAFT', `created ${sub.j.number} as draft`);
const tooFew = await call('staff', 'POST', '/subscriptions', { customerId: cust.id, planId: plans.find((p) => p.name === 'Yearly Contract').id, startDate: start, paymentTerm: 'NET_15', lines: [{ productId: crm.id, quantity: '2' }] });
ok(tooFew.s === 400 && tooFew.j.fields['lines.0.quantity'], `min quantity enforced → ${tooFew.j.fields?.['lines.0.quantity']}`);
const bad = await call('staff', 'POST', `/subscriptions/${sub.j.id}/transition`, { to: 'ACTIVE' });
ok(bad.s === 409, `illegal jump blocked → ${bad.j.error}`);
for (const to of ['QUOTATION', 'CONFIRMED']) await call('staff', 'POST', `/subscriptions/${sub.j.id}/transition`, { to });
let d = (await call('staff', 'GET', `/subscriptions/${sub.j.id}`)).j;
ok(d.status === 'ACTIVE', `confirmed with start=today → ${d.status}`);
ok(d.nextInvoice.discountTotal > 0, `next-invoice preview shows discount ₹${d.nextInvoice.discountTotal / 100}`);

console.log('Billing day');
const run1 = (await call('staff', 'POST', '/billing/run')).j;
const run2 = (await call('staff', 'POST', '/billing/run')).j;
d = (await call('staff', 'GET', `/subscriptions/${sub.j.id}`)).j;
ok(d.invoices.length === 1, `run1 ${JSON.stringify(run1)} / run2 ${JSON.stringify(run2)} → ${d.invoices.length} invoice`);
const inv = (await call('staff', 'GET', `/invoices/${d.invoices[0].id}`)).j;
ok(inv.lines[0].discount >= Math.round(6 * 176000 * 0.25) && /Seats 25%/.test(inv.lines[0].discountLabel) && inv.taxTotal > 0, `${inv.number}: subtotal ₹${inv.subtotal / 100}, discount ₹${inv.discountTotal / 100}, tax ₹${inv.taxTotal / 100}, total ₹${inv.total / 100}`);

console.log('Time Machine +31 days ×2');
let t = Date.now();
const tm1 = (await call('admin', 'POST', '/clock/advance', { days: 31 })).j;
console.log(`    +31d in ${Date.now() - t} ms`, JSON.stringify(tm1.summary));
t = Date.now();
const tm2 = (await call('admin', 'POST', '/clock/advance', { days: 31 })).j;
console.log(`    +31d in ${Date.now() - t} ms`, JSON.stringify(tm2.summary));
d = (await call('staff', 'GET', `/subscriptions/${sub.j.id}`)).j;
const invs = await Promise.all(d.invoices.map((i) => call('staff', 'GET', `/invoices/${i.id}`).then((r) => r.j)));
ok(invs.length === 3, `${invs.length} invoices after 2 months`);
const withDisc = invs.filter((i) => i.lines.some((l) => /Seats 25%/.test(l.discountLabel ?? ''))).length;
ok(withDisc === 2, `25% seat discount on exactly ${withDisc} invoices (usage limit 2), then stops`);
ok(invs.some((i) => i.overdue), 'first invoice now overdue');

console.log('Payments');
const target = invs.find((i) => i.status === 'CONFIRMED');
const over = await call('staff', 'POST', '/payments', { invoiceId: target.id, method: 'UPI', amount: String(target.amountDue / 100 + 1), date: start });
ok(over.s === 400 && over.j.fields.amount, `overpay blocked → ${over.j.fields?.amount}`);
const part = await call('staff', 'POST', '/payments', { invoiceId: target.id, method: 'UPI', amount: '100', date: start, note: 'part' });
const rest = await call('staff', 'POST', '/payments', { invoiceId: target.id, method: 'CASH', amount: String((target.amountDue - 10000) / 100), date: start });
ok(part.s === 201 && rest.s === 201 && (await call('staff', 'GET', `/invoices/${target.id}`)).j.status === 'PAID', 'two part payments → PAID');

console.log('Reconciliation');
const pre = (await call('staff', 'POST', '/reconcile/preview', { csv: fs.readFileSync(new URL('../../../samples/bank-statement.csv', import.meta.url), 'utf8') })).j;
console.log('    ', pre.rows.map((r) => (r.error ? `r${r.row}:ERR` : `r${r.row}:${r.autoInvoiceId ? 'AUTO' : r.candidates.length ? 'SUGGEST' : 'NONE'}(${r.candidates[0]?.score ?? 0})`)).join(' '));
ok(pre.rows.filter((r) => r.autoInvoiceId).length >= 6, 'most rows auto-match');

console.log('Portal');
const ov = (await call('cust', 'GET', '/portal/overview')).j;
ok(ov.subscriptions.every((s) => s.customerId === ov.customer.id), `customer sees only own: ${ov.subscriptions.length} subs, ${ov.invoices.length} invoices`);
ok((await call('cust', 'GET', `/portal/invoices/${inv.id}`)).s === 404, "cannot open another customer's invoice");
const q = ov.subscriptions.find((s) => s.status === 'QUOTATION');
if (q) ok((await call('cust', 'POST', `/portal/subscriptions/${q.id}/action`, { action: 'accept' })).s === 200, 'customer accepts quotation');
const due = ov.invoices.find((i) => i.status === 'CONFIRMED');
if (due) ok((await call('cust', 'POST', `/portal/invoices/${due.id}/pay`, { method: 'CARD' })).j.status === 'PAID', 'customer pays online');

console.log('Forgot password → Outbox');
await call('anon', 'POST', '/auth/forgot', { email: 'customer@brightloop.test' });
const mail = (await call('admin', 'GET', '/outbox')).j.items[0];
const token = mail.body.match(/token=([a-f0-9]+)/)[1];
ok((await call('anon', 'POST', '/auth/reset', { token, password: 'weak', confirmPassword: 'weak' })).s === 400, 'weak new password rejected');
ok((await call('anon', 'POST', '/auth/reset', { token, password: 'Customer@1234', confirmPassword: 'Customer@1234' })).s === 200, 'reset works');
ok((await call('anon', 'POST', '/auth/reset', { token, password: 'Customer@1234', confirmPassword: 'Customer@1234' })).s === 400, 'token is single-use');

console.log('Import preview');
const imp = await call('staff', 'POST', '/import/subscriptions', { csv: fs.readFileSync(new URL('../../../samples/subscriptions-import.csv', import.meta.url), 'utf8') });
console.log(`     ${imp.j.valid} valid of ${imp.j.total}`);
imp.j.rows.filter((r) => r.errors.length).forEach((r) => console.log(`     row ${r.row}: ${r.errors.join('; ')}`));
ok(imp.j.valid === 4, 'bad rows reported, good rows ready');

console.log('Back to real time');
await call('admin', 'POST', '/clock/reset');
const dash = await call('admin', 'GET', '/dashboard');
ok(dash.s === 200, `dashboard in ${dash.ms} ms`);
