// Bank-statement reconciliation: score how well a bank line matches an open invoice.

export interface BankLine { date: string; description: string; reference: string; amount: number } // amount in cents
export interface OpenInvoice { id: string; number: string; customerName: string; amountDue: number } // cents

export interface MatchCandidate { invoiceId: string; score: number; reasons: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/**
 * Scoring (max 100):
 *  +60 invoice number appears in description/reference (ignoring punctuation)
 *  +30 amount equals the amount due exactly (+10 if within 1%)
 *  +10 customer name words appear in the description
 */
export function scoreMatch(line: BankLine, inv: OpenInvoice): MatchCandidate {
  const text = norm(`${line.description} ${line.reference}`);
  const reasons: string[] = [];
  let score = 0;
  if (inv.number && text.includes(norm(inv.number))) { score += 60; reasons.push('invoice number'); }
  if (line.amount === inv.amountDue) { score += 30; reasons.push('exact amount'); }
  else if (inv.amountDue > 0 && Math.abs(line.amount - inv.amountDue) / inv.amountDue <= 0.01) { score += 10; reasons.push('amount ≈'); }
  const nameWords = words(inv.customerName);
  const desc = line.description.toLowerCase();
  if (nameWords.length && nameWords.some((w) => desc.includes(w))) { score += 10; reasons.push('customer name'); }
  return { invoiceId: inv.id, score, reasons };
}

export const AUTO_MATCH_SCORE = 80;

/** Best candidates for a line, highest score first. Auto-match only when the top one clears the bar and is unambiguous. */
export function rankMatches(line: BankLine, invoices: OpenInvoice[], limit = 3) {
  const ranked = invoices.map((inv) => scoreMatch(line, inv)).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  const auto = ranked.length > 0 && ranked[0]!.score >= AUTO_MATCH_SCORE && (ranked.length === 1 || ranked[1]!.score < ranked[0]!.score);
  return { candidates: ranked, autoInvoiceId: auto ? ranked[0]!.invoiceId : null };
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). Returns rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parses CSV with a header row into objects keyed by lower-cased, underscore-joined header names. */
export function csvToObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
