import { z } from 'zod';

/** COLLABIZ ONE extras: Business DNA Passport, Opportunity Rescue, 48-hour team challenge and Opportunity Revival. */

/* ───────────── Business DNA Passport ───────────── */
export type Evidence = 'evidenced' | 'self_declared';
export const EVIDENCE_LABELS: Record<Evidence, string> = { evidenced: 'Evidenced', self_declared: 'Self-declared' };
/** Turnover band from a figure in paise (bands, not exact figures, are shown to other companies). */
export function turnoverBand(paise: number | null | undefined) {
  if (paise == null) return null;
  const cr = paise / 1_00_00_000_00;
  return cr < 1 ? 'Under ₹1 crore' : cr < 5 ? '₹1–5 crore' : cr < 25 ? '₹5–25 crore' : cr < 100 ? '₹25–100 crore' : cr < 500 ? '₹100–500 crore' : 'Over ₹500 crore';
}
export const KYB_EVIDENCE: Record<string, string> = { gst_certificate: 'GST registration', incorporation_certificate: 'Company incorporation', pan: 'PAN', address_proof: 'Registered address', financials: 'Audited financial statements', udyam: 'MSME (Udyam) registration' };

/* ───────────── Opportunity Rescue ───────────── */
export const RESCUE_GAPS = {
  finance: { label: 'Finance or working capital', partnerTypes: ['finance_associate', 'investor'], words: /financ|capital|fund|invest|lend/i },
  technology: { label: 'Technology or design', partnerTypes: ['technology', 'consultant', 'manufacturer'], words: /design|engineer|technolog|software|automation|scada/i },
  manpower: { label: 'Manpower or crews', partnerTypes: ['contractor'], words: /crew|manpower|labou?r|install|erection|civil/i },
  equipment: { label: 'Equipment or machinery', partnerTypes: ['trader', 'distributor', 'manufacturer'], words: /equipment|machin|crane|rig|vehicle|tools|rental/i },
} as const;
export type RescueGap = keyof typeof RESCUE_GAPS;
/** Which gaps a partner could help close, from their business types and stated skills/services. */
export function gapsCovered(p: { partnerTypes: string[]; skills: string[]; services: string[] }, gaps: RescueGap[]) {
  const text = [...p.skills, ...p.services].join(' ');
  return gaps.filter((g) => RESCUE_GAPS[g].partnerTypes.some((t) => p.partnerTypes.includes(t)) || RESCUE_GAPS[g].words.test(text));
}
export const RescueCreateSchema = z.object({ gaps: z.array(z.enum(Object.keys(RESCUE_GAPS) as [RescueGap, ...RescueGap[]])).min(1), note: z.string().trim().min(20).max(2000) });
export const InterestSchema = z.object({ note: z.string().trim().min(10).max(1000), items: z.array(z.string().max(80)).min(1).max(10) });

/* ───────────── 48-hour team challenge ───────────── */
export const CHALLENGE_HOURS = 48;
export const ChallengeCreateSchema = z.object({ roles: z.array(z.string().trim().min(3).max(80)).min(1).max(12) });
/** Coverage of each requested role by verified partners' expressions of interest. */
export function challengeCoverage(roles: string[], interests: { org: string; roles: string[]; verified: boolean }[]) {
  const rows = roles.map((role) => {
    const by = interests.filter((i) => i.verified && i.roles.includes(role)).map((i) => i.org);
    return { role, covered: by.length > 0, partners: by };
  });
  return { rows, covered: rows.filter((r) => r.covered).length, total: rows.length, pct: rows.length ? Math.round((rows.filter((r) => r.covered).length / rows.length) * 100) : 0 };
}

/* ───────────── Opportunity Revival ───────────── */
/** Ways to make a lost or stalled opportunity work again — suggestions for the owner, never automatic changes. */
export function revivalSuggestions(o: { estimatedValue: number | null; status: string; sector: string }) {
  const out: { kind: string; title: string; detail: string }[] = [];
  const v = o.estimatedValue ?? 0;
  if (v >= 50_00_000_00) {
    const part = Math.round(v / 3 / 1_00_000_00) * 1_00_000_00;
    out.push({ kind: 'packages', title: 'Split into smaller work packages', detail: `Three packages of about ₹${(part / 100).toLocaleString('en-IN')} each let smaller specialists bid where one large contract could not be filled.` });
  }
  out.push({ kind: 'consortium', title: 'Bid as a consortium', detail: 'Combine partners whose experience and turnover together meet the qualification, with a lead member and agreed shares.' });
  out.push({ kind: 'phased', title: 'Propose a phased scope', detail: 'Offer a first phase the buyer can approve quickly, with later phases on agreed terms.' });
  if (['solar', 'power_equipment', 'manufacturing', 'trading'].includes(o.sector)) out.push({ kind: 'supply_only', title: 'Offer supply-only or installation-only', detail: 'Split equipment supply from installation so each part goes to the strongest partner.' });
  return out;
}
export const RevivalRequestSchema = z.object({ reason: z.string().trim().min(20).max(2000) });
export const RevivalDecisionSchema = z.object({ decision: z.enum(['approved', 'declined']), note: z.string().trim().max(1000).optional() });
