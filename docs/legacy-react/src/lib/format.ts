export { formatMoney as money, formatMoneyCompact as moneyShort, label } from '@brightloop/shared';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const date = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : '—');
/** yyyy-mm-dd for <input type="date">. */
export const isoDay = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');
/** Rupees string for money inputs, from paise. */
export const rupees = (cents: number | null | undefined) => (cents == null ? '' : String(cents / 100));

export function daysBetween(from: string | Date, to: string | Date) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

export function relativeDays(target: string | Date, now: string | Date) {
  const d = daysBetween(now, target);
  if (d === 0) return 'today';
  if (d > 0) return d === 1 ? 'tomorrow' : `in ${d} days`;
  return d === -1 ? 'yesterday' : `${-d} days ago`;
}

export const percent = (x: number) => `${(x * 100).toFixed(1)}%`;
