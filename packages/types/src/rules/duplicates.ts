/**
 * Duplicate lead scoring — §2.3: "Duplicate leads use evidence, timestamps and customer relationship
 * history rather than automatic first-click ownership." Scores feed a HUMAN review; never auto-rule.
 */
export interface LeadFingerprint {
  customerName: string;
  taxId?: string | null; // GSTIN / VAT / company registration
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  category?: string | null;
}

const STOP = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'co', 'company', 'the', 'and', '&', 'india', 'group', 'corp', 'corporation']);

export function normalizeName(n: string): string[] {
  return n.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}

export function nameSimilarity(a: string, b: string): number {
  const A = new Set(normalizeName(a));
  const B = new Set(normalizeName(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

const domain = (e?: string | null) => (e && e.includes('@') ? e.split('@')[1].toLowerCase().trim() : null);
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'icloud.com']);
const digits = (p?: string | null) => (p ? p.replace(/\D/g, '').slice(-10) : '');

export interface DuplicateResult { score: number; reasons: string[]; requiresReview: boolean }
export const DUPLICATE_REVIEW_THRESHOLD = 0.55;

export function duplicateScore(a: LeadFingerprint, b: LeadFingerprint): DuplicateResult {
  let score = 0;
  const reasons: string[] = [];
  if (a.taxId && b.taxId && a.taxId.replace(/\s/g, '').toUpperCase() === b.taxId.replace(/\s/g, '').toUpperCase()) {
    score += 0.5; reasons.push('Same tax / registration ID');
  }
  const sim = nameSimilarity(a.customerName, b.customerName);
  if (sim > 0) { score += 0.25 * sim; if (sim >= 0.5) reasons.push(`Customer name ${Math.round(sim * 100)}% similar`); }
  const da = domain(a.email), db = domain(b.email);
  if (da && db && da === db && !FREE_MAIL.has(da)) { score += 0.1; reasons.push(`Same email domain (${da})`); }
  const pa = digits(a.phone), pb = digits(b.phone);
  if (pa.length >= 8 && pa === pb) { score += 0.1; reasons.push('Same contact phone'); }
  if (a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase() && a.category && a.category === b.category) {
    score += 0.05; reasons.push('Same city and category');
  }
  score = Math.min(1, Math.round(score * 1000) / 1000);
  return { score, reasons, requiresReview: score >= DUPLICATE_REVIEW_THRESHOLD };
}
