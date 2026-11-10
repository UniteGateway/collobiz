import { z } from 'zod';
import { parseAmount } from './imports';

/* ───────────────────── Indian identifiers ───────────────────── */

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** GSTIN check character (GSTN's published mod-36 algorithm over the first 14 characters). */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = B36.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return B36[(36 - (sum % 36)) % 36];
}
export const GSTIN_RE = /^(0[1-9]|[1-3][0-9]|9[79])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTE][A-Z]\d{4}[A-Z]$/;
/** Format and checksum. Says nothing about whether the registration is active — that needs a live lookup. */
export function isValidGstin(g: string) {
  const v = g.trim().toUpperCase();
  return GSTIN_RE.test(v) && gstinCheckChar(v.slice(0, 14)) === v[14];
}
export const isValidPan = (p: string) => PAN_RE.test(p.trim().toUpperCase());
/** The PAN embedded in a GSTIN (characters 3–12). */
export const panOfGstin = (g: string) => g.trim().toUpperCase().slice(2, 12);
/** GST state code → state (first two digits of a GSTIN). */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};
/** Indian mobile → 10 digits (drops +91 / 0 prefixes and spaces). */
export function normalizeIndianMobile(p: string): string | null {
  if (/^\s*0\d{2,4}[\s-]+\d{6,8}\s*$/.test(p)) return null; // STD code + number, e.g. 080-41234567, is a landline
  const d = p.replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/* ───────────────────── Bulk import ───────────────────── */

export type FieldType = 'text' | 'gstin' | 'email' | 'mobile' | 'money' | 'int' | 'choice';
export interface FieldSpec { key: string; label: string; required?: boolean; type: FieldType; aliases: RegExp; choices?: readonly string[]; max?: number; hint?: string }
export const IMPORT_TARGETS = {
  customers: {
    label: 'Customers',
    fields: [
      { key: 'legalName', label: 'Company / customer name', required: true, type: 'text', aliases: /^(name|customer|company|party|legal ?name|customer ?name|party ?name|account ?name|ledger( ?name)?)$/i, max: 200 },
      { key: 'taxId', label: 'GSTIN', type: 'gstin', aliases: /gstin|gst ?(no|number|in)?$|gst ?reg/i },
      { key: 'contactName', label: 'Contact person', type: 'text', aliases: /contact( ?person| ?name)?$|^person$/i, max: 120 },
      { key: 'contactPhone', label: 'Mobile', type: 'mobile', aliases: /mobile|phone|contact ?no|cell|whatsapp/i },
      { key: 'contactEmail', label: 'Email', type: 'email', aliases: /e-?mail/i },
      { key: 'city', label: 'City', type: 'text', aliases: /^(city|town|location|place)$/i, max: 80 },
    ],
  },
  products: {
    label: 'Products',
    fields: [
      { key: 'name', label: 'Product name', required: true, type: 'text', aliases: /^(name|product|item|item ?name|product ?name|stock ?item|description of goods)$/i, max: 200 },
      { key: 'sku', label: 'SKU / item code', type: 'text', aliases: /sku|item ?code|part ?no|product ?code|^code$/i, max: 60 },
      { key: 'description', label: 'Description', type: 'text', aliases: /^(description|details|specification|specs?)$/i, max: 2000 },
      { key: 'unit', label: 'Unit', required: true, type: 'text', aliases: /^(unit|uom|units?|base ?units?)$/i, max: 20, hint: 'e.g. Nos, kg, m, set' },
      { key: 'price', label: 'Price (₹, excl. GST)', type: 'money', aliases: /price|rate|mrp|list ?price|selling/i },
      { key: 'moq', label: 'Minimum order', type: 'int', aliases: /moq|min(imum)? ?(order|qty)/i },
      { key: 'leadTimeDays', label: 'Lead time (days)', type: 'int', aliases: /lead ?time|delivery ?days|dispatch/i },
      { key: 'hsn', label: 'HSN / SAC', type: 'text', aliases: /hsn|sac/i, max: 10 },
    ],
  },
} as const satisfies Record<string, { label: string; fields: FieldSpec[] }>;
export type ImportTarget = keyof typeof IMPORT_TARGETS;
export const IMPORT_TARGET_KEYS = Object.keys(IMPORT_TARGETS) as ImportTarget[];

/** Finds the header row and guesses which column feeds each field; the person can change the mapping before importing. */
export function guessMapping(rows: string[][], target: ImportTarget) {
  const fields = IMPORT_TARGETS[target].fields as readonly FieldSpec[];
  let best = { header: 0, mapping: {} as Record<string, number>, hits: -1 };
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const head = rows[h].map((c) => c.replace(/[*:]/g, '').replace(/\s+/g, ' ').trim());
    const mapping: Record<string, number> = {};
    const used = new Set<number>();
    for (const f of fields) {
      const i = head.findIndex((c, j) => !used.has(j) && c && f.aliases.test(c));
      if (i >= 0) { mapping[f.key] = i; used.add(i); }
    }
    const hits = Object.keys(mapping).length;
    if (hits > best.hits) best = { header: h, mapping, hits };
  }
  return { header: best.header, mapping: best.mapping, columns: rows[best.header] ?? [] };
}

export interface RowIssue { row: number; field: string; message: string }
/** Cleans and checks each row. Rows with a problem are reported, never silently fixed or dropped. */
export function validateImport(rows: string[][], target: ImportTarget, header: number, mapping: Record<string, number>) {
  const fields = IMPORT_TARGETS[target].fields as readonly FieldSpec[];
  const missing = fields.filter((f) => f.required && mapping[f.key] == null).map((f) => f.label);
  if (missing.length) return { records: [] as { row: number; data: Record<string, string | number | null> }[], issues: [] as RowIssue[], missing };
  const records: { row: number; data: Record<string, string | number | null> }[] = [];
  const issues: RowIssue[] = [];
  for (let r = header + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw.some((c) => c.trim())) continue;
    const data: Record<string, string | number | null> = {};
    let ok = true;
    for (const f of fields) {
      const v = mapping[f.key] == null ? '' : (raw[mapping[f.key]] ?? '').trim();
      const bad = (message: string) => { issues.push({ row: r + 1, field: f.label, message }); ok = false; };
      if (!v) { if (f.required) bad('Required'); data[f.key] = null; continue; }
      if (f.max && v.length > f.max) { bad(`Longer than ${f.max} characters`); continue; }
      switch (f.type) {
        case 'gstin': { const g = v.toUpperCase().replace(/\s/g, ''); if (!isValidGstin(g)) bad('Not a valid GSTIN (format or check digit)'); data[f.key] = g; break; }
        case 'email': if (!z.string().email().safeParse(v).success) bad('Not a valid email'); data[f.key] = v.toLowerCase(); break;
        case 'mobile': { const m = normalizeIndianMobile(v); if (!m) bad('Not a 10-digit Indian mobile'); data[f.key] = m; break; }
        case 'money': { const p = parseAmount(v); if (p == null || p < 0) bad('Not an amount'); data[f.key] = p; break; }
        case 'int': { const n = Number(v.replace(/,/g, '')); if (!Number.isInteger(n) || n < 0) bad('Not a whole number'); data[f.key] = n; break; }
        default: data[f.key] = v.replace(/\s+/g, ' ');
      }
    }
    if (ok) records.push({ row: r + 1, data });
  }
  // Duplicates inside the file: same GSTIN, or same name (and mobile) for customers; same SKU or name for products.
  const seen = new Map<string, number>();
  const keyOf = (d: Record<string, string | number | null>) => target === 'customers'
    ? (d.taxId ? `g:${d.taxId}` : `n:${String(d.legalName).toLowerCase()}|${d.contactPhone ?? ''}`)
    : (d.sku ? `s:${String(d.sku).toLowerCase()}` : `n:${String(d.name).toLowerCase()}`);
  const unique = records.filter((rec) => {
    const k = keyOf(rec.data);
    if (seen.has(k)) { issues.push({ row: rec.row, field: '—', message: `Duplicate of row ${seen.get(k)} in this file` }); return false; }
    seen.set(k, rec.row);
    return true;
  });
  return { records: unique, issues, missing };
}
export const dedupeKey = (target: ImportTarget, d: Record<string, unknown>) => target === 'customers'
  ? (d.taxId ? `g:${d.taxId}` : `n:${String(d.legalName).toLowerCase()}|${d.contactPhone ?? ''}`)
  : (d.sku ? `s:${String(d.sku).toLowerCase()}` : `n:${String(d.name).toLowerCase()}`);

export const CONSENT_BASES = { existing_customer: 'Existing customers we do business with', gave_consent: 'They gave consent to be contacted', own_records: 'Our own records for invoicing only — do not contact for marketing' } as const;
export const BulkCommitSchema = z.object({
  target: z.enum(IMPORT_TARGET_KEYS as [ImportTarget, ...ImportTarget[]]),
  header: z.number().int().min(0),
  mapping: z.record(z.string(), z.number().int().min(0)),
  sector: z.string().max(60).optional(),
  consentBasis: z.enum(Object.keys(CONSENT_BASES) as [keyof typeof CONSENT_BASES, ...(keyof typeof CONSENT_BASES)[]]).optional(),
  skipExisting: z.boolean().default(true),
});

/* ───────────────────── Tally ───────────────────── */

/** Tally groups whose ledgers are customers (Sundry Debtors and the usual sub-groups people create under it). */
export const TALLY_CUSTOMER_GROUPS = /sundry debtors|debtors|customers|trade receivables/i;
/** Tally "1,250.00/Nos" rate strings → { price (paise), unit }. */
export function parseTallyRate(rate: string | undefined | null) {
  if (!rate) return { price: null as number | null, unit: null as string | null };
  const [amt, unit] = String(rate).split('/');
  const p = parseAmount(amt.trim());
  return { price: p != null ? Math.abs(p) : null, unit: unit?.trim() || null };
}
