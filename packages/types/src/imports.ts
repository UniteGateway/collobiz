import { z } from 'zod';

/* ───────────────────────── CSV ───────────────────────── */

/** RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF/LF, a leading BOM, and `;` or tab files detected from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const nl = src.search(/\r?\n/);
  const first = nl < 0 ? src : src.slice(0, nl);
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const sep = counts[0][1] > 1 ? counts[0][0] : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

/** Amount text → paise. Handles ₹, commas (Indian or Western grouping), `Cr`/`Dr` suffixes and brackets for negatives. */
export function parseAmount(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? Math.round(text * 100) : null;
  let t = text.replace(/[₹,\s]|INR|Rs\.?/gi, '');
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /dr$/i.test(t);
  t = t.replace(/[()]/g, '').replace(/^-/, '').replace(/(cr|dr)$/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const p = Math.round(Number(t) * 100);
  return neg ? -p : p;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** Indian bank date formats → ISO date. Day comes first (dd/mm/yyyy), never US month-first. */
export function parseDate(text: string | Date | null | undefined): string | null {
  if (!text) return null;
  if (text instanceof Date) return Number.isNaN(+text) ? null : text.toISOString().slice(0, 10);
  const t = text.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = /^(\d{1,2})[\s/-]([A-Za-z]{3,4})[\s/-](\d{2,4})$/.exec(t))) { d = +r[1]; m = MONTHS[r[2].toLowerCase()] ?? 0; y = +r[3]; }
  else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/* ───────────────────── Bank statements ───────────────────── */

const COLS = {
  date: /^(txn|tran|transaction|value|posting|book)?\.?\s*(date|dt)$|^date$/i,
  description: /narration|description|particulars|remarks|details|transaction remarks/i,
  reference: /ref|chq|cheque|utr|instrument/i,
  credit: /^(credit|deposit|cr)(\s*amo?u?n?t\.?)?(\s*\(inr\))?$|deposits?|credit amount|deposit amt/i,
  debit: /^(debit|withdrawal|dr)(\s*amo?u?n?t\.?)?(\s*\(inr\))?$|withdrawals?|debit amount|withdrawal amt/i,
  amount: /^(transaction\s*)?amount(\s*\(inr\))?$/i,
  drcr: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn type|debit\/credit)$/i,
  balance: /balance/i,
};
export interface StatementLine { seq: number; txnDate: string; description: string; reference: string | null; direction: 'credit' | 'debit'; amount: number; utr: string | null }
export interface ParsedStatement { layout: string; lines: StatementLine[]; skipped: { row: number; reason: string }[]; from: string | null; to: string | null }

/** Finds the header row (banks print account details above it) and maps the columns by name. */
export function detectStatementColumns(rows: string[][]) {
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const head = rows[h].map((c) => c.replace(/\s+/g, ' ').trim());
    const find = (re: RegExp, not: number[] = []) => head.findIndex((c, i) => !not.includes(i) && re.test(c));
    const date = find(COLS.date);
    const description = find(COLS.description);
    if (date < 0 || description < 0) continue;
    const credit = find(COLS.credit, [date, description]);
    const debit = find(COLS.debit, [date, description, credit]);
    const amount = find(COLS.amount, [date, description, credit, debit]);
    const drcr = find(COLS.drcr, [date, description, credit, debit, amount]);
    const reference = find(COLS.reference, [date, description, credit, debit, amount, drcr]);
    if (credit >= 0 || (amount >= 0 && drcr >= 0) || amount >= 0) {
      return { header: h, date, description, reference, credit, debit, amount, drcr, layout: credit >= 0 ? 'debit_credit_columns' : drcr >= 0 ? 'amount_with_dr_cr' : 'signed_amount' };
    }
  }
  return null;
}

/** UTR / transaction reference from NEFT, RTGS, IMPS and UPI narrations, e.g. `NEFT-HDFCN52026101012345-ACME`, `UPI/612345678901/…`. */
export function extractUtr(text: string): string | null {
  const t = text.toUpperCase();
  const rail = /(?:NEFT|RTGS|IMPS|UPI|INFT|NFT|MMT)[\s/:*-]+(?:[A-Z]+[\s/:*-]+)?([A-Z0-9]{10,22})/.exec(t);
  if (rail && /\d{6,}/.test(rail[1])) return rail[1];
  const bare = /\b([A-Z]{4}[RHN0-9]\d{6,17}|\d{12})\b/.exec(t);
  return bare ? bare[1] : null;
}

export function parseBankStatement(rows: string[][]): ParsedStatement {
  const c = detectStatementColumns(rows);
  if (!c) throw new Error('Could not find the statement table — it needs a date column, a narration/description column and credit/debit or amount columns.');
  const lines: StatementLine[] = [];
  const skipped: { row: number; reason: string }[] = [];
  for (let i = c.header + 1; i < rows.length; i++) {
    const r = rows[i];
    const txnDate = parseDate(r[c.date]);
    if (!txnDate) { if (r.some((x) => x)) skipped.push({ row: i + 1, reason: 'No transaction date (heading, total or blank row)' }); continue; }
    let direction: 'credit' | 'debit' | null = null, amount: number | null = null;
    if (c.credit >= 0) {
      const cr = parseAmount(r[c.credit]), dr = c.debit >= 0 ? parseAmount(r[c.debit]) : null;
      if (cr && cr > 0) { direction = 'credit'; amount = cr; } else if (dr && dr > 0) { direction = 'debit'; amount = dr; }
    } else {
      const a = parseAmount(r[c.amount]);
      if (a) {
        const flag = c.drcr >= 0 ? (r[c.drcr] ?? '').toUpperCase() : '';
        direction = flag.startsWith('C') ? 'credit' : flag.startsWith('D') ? 'debit' : a < 0 ? 'debit' : 'credit';
        amount = Math.abs(a);
      }
    }
    if (!direction || !amount) { skipped.push({ row: i + 1, reason: 'No credit or debit amount' }); continue; }
    const description = (r[c.description] ?? '').replace(/\s+/g, ' ').trim();
    const reference = c.reference >= 0 ? (r[c.reference] || '').trim() || null : null;
    lines.push({ seq: lines.length + 1, txnDate, description, reference, direction, amount, utr: extractUtr(`${reference ?? ''} ${description}`) });
  }
  const dates = lines.map((l) => l.txnDate).sort();
  return { layout: c.layout, lines, skipped, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

/* ───────────────────── Matching to invoices ───────────────────── */

export interface OpenInvoice { id: string; number: string; amount: number; outstanding: number; issuedAt: string | Date; counterparty: string; knownReferences?: string[] }
export interface StatementMatchSuggestion { invoiceId: string; number: string; score: number; kind: 'exact_reference' | 'full_amount' | 'part_amount'; reason: string }

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/**
 * Rules, not guesses: a line suggests an invoice when its narration names the invoice number or a reference seen before,
 * or when the amount equals (or, for a part payment, is less than) what is still outstanding and the payer's name appears.
 * Two equally good candidates are reported as ambiguous so a person chooses.
 */
export function suggestMatches(line: Pick<StatementLine, 'txnDate' | 'description' | 'reference' | 'amount' | 'utr'>, invoices: OpenInvoice[]): { best: StatementMatchSuggestion | null; candidates: StatementMatchSuggestion[]; ambiguous: boolean } {
  const text = norm(`${line.reference ?? ''} ${line.description}`);
  const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 4 && !['PRIVATE', 'LIMITED', 'TRADERS', 'SOLAR', 'INDIA', 'THE'].includes(w));
  const out: StatementMatchSuggestion[] = [];
  for (const inv of invoices) {
    if (inv.outstanding <= 0 || line.amount > inv.outstanding) continue;
    if (new Date(line.txnDate) < new Date(new Date(inv.issuedAt).toISOString().slice(0, 10))) continue;
    const named = words(inv.counterparty).some((w) => text.includes(w));
    if (text.includes(norm(inv.number)) || (line.utr && (inv.knownReferences ?? []).some((r) => norm(r).includes(norm(line.utr!))))) {
      out.push({ invoiceId: inv.id, number: inv.number, score: 100, kind: 'exact_reference', reason: `Narration names ${inv.number}` });
    } else if (line.amount === inv.outstanding) {
      out.push({ invoiceId: inv.id, number: inv.number, score: named ? 85 : 60, kind: 'full_amount', reason: `Amount equals the outstanding balance${named ? ` and names ${inv.counterparty}` : ''}` });
    } else if (named) {
      out.push({ invoiceId: inv.id, number: inv.number, score: 50, kind: 'part_amount', reason: `Part payment from ${inv.counterparty} (less than the outstanding balance)` });
    }
  }
  out.sort((a, b) => b.score - a.score);
  const ambiguous = out.length > 1 && out[0].score === out[1].score;
  return { best: out.length && !ambiguous ? out[0] : null, candidates: out.slice(0, 5), ambiguous };
}

export const STATEMENT_MATCH_STATUSES = ['unmatched', 'suggested', 'matched', 'ignored'] as const;
export const StatementMatchSchema = z.object({ invoiceId: z.string().uuid() });
