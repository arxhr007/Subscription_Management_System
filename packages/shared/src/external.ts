import { z } from 'zod';
import { csvToObjects } from './recon';
import { addInterval } from './billing';
import { zMoney } from './schemas';

export const externalSubscriptionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  amount: zMoney('Amount'),
  interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY']),
  nextRenewal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, 'Invalid date'),
  status: z.enum(['ACTIVE', 'CANCELLED']).default('ACTIVE'),
  managementUrl: z.union([z.literal(''), z.url().refine(s => new URL(s).protocol === 'https:', 'Use an HTTPS link')]).default(''),
  notes: z.string().trim().max(1000).default(''),
});
const providers = [
  { name: 'Netflix', match: /\bnetflix\b/i, managementUrl: 'https://www.netflix.com/YourAccount' },
  { name: 'Amazon Prime', match: /\bamazon\s*prime\b|\bprime\s*video\b/i, managementUrl: 'https://www.amazon.in/prime' },
  { name: 'Spotify', match: /\bspotify\b/i, managementUrl: 'https://www.spotify.com/account/' },
  { name: 'YouTube Premium', match: /youtube\s*(premium|music)/i, managementUrl: 'https://www.youtube.com/paid_memberships' },
  { name: 'Google Play', match: /google\s*play/i, managementUrl: 'https://play.google.com/store/account/subscriptions' },
];
/** Only proposes candidates. Charges are never proof of an active subscription. Amounts use rupees; debit or amount columns may be signed. */
export function suggestExternalSubscriptions(csv: string) {
  const rows = csvToObjects(csv);
  if (rows.length > 2000) throw new Error('Keep imports to 2,000 rows');
  if (!rows.length || !('date' in rows[0]!) || !('description' in rows[0]!)) throw new Error('CSV needs date, description and amount (or debit) columns');
  const groups = new Map<string, { provider: typeof providers[number]; charges: { date: string; amount: number }[] }>();
  for (const row of rows) {
    const provider = providers.find(p => p.match.test(row.description || ''));
    if (!provider) continue;
    const raw = row.debit || row.amount;
    const amount = Number(String(raw ?? '').replace(/[,₹\s]/g, ''));
    const date = row.date || '';
    if (!raw || !Number.isFinite(amount) || amount === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) continue;
    const group = groups.get(provider.name) || { provider, charges: [] };
    group.charges.push({ date, amount: Math.round(Math.abs(amount) * 100) });
    groups.set(provider.name, group);
  }
  return [...groups.values()].map(({ provider, charges }) => {
    charges.sort((a,b) => a.date.localeCompare(b.date));
    const last = charges.at(-1)!;
    const gap = charges.length > 1 ? (Date.parse(last.date) - Date.parse(charges.at(-2)!.date)) / 86_400_000 : null;
    const interval = gap && gap > 330 && gap < 400 ? 'YEARLY' : gap && gap >= 6 && gap <= 8 ? 'WEEKLY' : 'MONTHLY';
    const recurring = gap != null && ((gap >= 25 && gap <= 35) || (gap >= 330 && gap <= 400) || (gap >= 6 && gap <= 8));
    return { name: provider.name, amount: last.amount / 100, interval, nextRenewal: addInterval(new Date(last.date), interval).toISOString().slice(0,10), status: 'ACTIVE', managementUrl: provider.managementUrl, notes: '', evidence: `${charges.length} matching charge(s); latest ${last.date}. ${recurring ? 'Recurring pattern detected.' : 'Billing interval is unconfirmed.'} Review amount, status and renewal date.`, confidence: recurring ? 'LIKELY_RECURRING' : 'NEEDS_REVIEW' };
  });
}

export const receiptProviders = providers;
export function receiptCandidate(input:{id:string;threadId:string;subject:string;sender:string;snippet:string;date:string}) {
 const text=`${input.subject} ${input.sender} ${input.snippet}`;
 let provider=providers.find(p=>p.match.test(text));
 if(!provider && /\b(subscription|membership|renewal|renewed|recurring|monthly plan|annual plan)\b/i.test(input.subject+' '+input.snippet) && /receipt|invoice|payment|charged|paid|billing/i.test(input.subject+' '+input.snippet)){
  const display=input.sender.split('<')[0]!.replace(/["']/g,'').trim();
  const domain=input.sender.match(/@([a-z0-9.-]+)/i)?.[1];
  const name=(display&&!display.includes('@')?display:domain?.split('.')[0])?.slice(0,100);
  if(name)provider={name,match:/$^/,managementUrl:''};
 }
 if(!provider || !/receipt|invoice|paid|payment|charged|renew|membership|subscription/i.test(input.subject+' '+input.snippet))return null;
 const amounts=[...text.matchAll(/(?:₹|INR\s*|Rs\.?\s*)([\d,]+(?:\.\d{1,2})?)/gi)].map(m=>Number(m[1]!.replace(/,/g,''))).filter(n=>Number.isFinite(n)&&n>0);
 const unique=[...new Set(amounts)];
 const interval=/annual|yearly|per year/i.test(text)?'YEARLY':'MONTHLY';
 const parsed=new Date(input.date);const validDate=!Number.isNaN(parsed.getTime());
 return {name:provider.name,amount:unique.length===1?unique[0]:null,interval,nextRenewal:validDate?addInterval(parsed,interval).toISOString().slice(0,10):'',status:'ACTIVE',managementUrl:provider.managementUrl,notes:'',evidence:`Email: ${input.subject}. ${unique.length===1?'One INR amount found.':'Amount needs review.'} Confirm plan status and renewal date with the provider.`,confidence:'NEEDS_REVIEW',source:'gmail',sourceUrl:`https://mail.google.com/mail/u/0/#all/${input.threadId}`,receiptDate:validDate?parsed.toISOString():null};
}
