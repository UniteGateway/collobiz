/**
 * Explainable AI opportunity matching — §4.2: sector, geography, capacity, certifications and user
 * consent; no autonomous contract promises. Output is a DRAFT suggestion for human accept/reject (§6.5).
 */
export interface MatchPartner {
  id: string;
  name: string;
  sectors: string[];
  regions: string[]; // country or state/city codes
  capacityMax?: number | null; // max project value they can execute (minor units)
  certifications: string[];
  reputationScore?: number | null; // 0-100
  verified: boolean;
  consentToMatch: boolean;
}
export interface MatchTarget {
  category: string;
  region?: string | null;
  value?: number | null;
  requiredCertifications?: string[];
}
export interface MatchFactor { factor: string; weight: number; score: number; detail: string }
export interface MatchSuggestion {
  partnerId: string;
  partnerName: string;
  score: number; // 0-100
  confidence: 'high' | 'medium' | 'low';
  factors: MatchFactor[];
  uncertainty: string[];
  disclaimer: string;
}

export const MATCH_DISCLAIMER = 'Draft recommendation for human review. It does not create, promise or change any contract, award or payment.';

export function scorePartner(p: MatchPartner, t: MatchTarget): MatchSuggestion | null {
  if (!p.consentToMatch || !p.verified) return null; // consent + verification gate
  const factors: MatchFactor[] = [];
  const uncertainty: string[] = [];
  const sector = p.sectors.includes(t.category) ? 1 : 0;
  factors.push({ factor: 'Sector', weight: 35, score: sector, detail: sector ? `Works in ${t.category}` : `No declared ${t.category} capability` });
  let geo = 0.5;
  if (!t.region) uncertainty.push('Opportunity location not specified');
  else geo = p.regions.includes(t.region) ? 1 : p.regions.some((r) => t.region!.startsWith(r) || r.startsWith(t.region!)) ? 0.7 : 0;
  factors.push({ factor: 'Geography', weight: 20, score: geo, detail: geo === 1 ? `Covers ${t.region}` : geo > 0 ? 'Partial coverage' : 'Outside declared coverage' });
  let cap = 0.5;
  if (t.value == null || p.capacityMax == null) uncertainty.push('Capacity or value data missing');
  else cap = p.capacityMax >= t.value ? 1 : Math.max(0, p.capacityMax / t.value);
  factors.push({ factor: 'Capacity', weight: 20, score: cap, detail: cap >= 1 ? 'Declared capacity sufficient' : `Capacity covers ${Math.round(cap * 100)}% of value` });
  const req = t.requiredCertifications ?? [];
  const cert = req.length ? req.filter((c) => p.certifications.includes(c)).length / req.length : 1;
  factors.push({ factor: 'Certifications', weight: 10, score: cert, detail: req.length ? `${Math.round(cert * 100)}% of required certifications` : 'No certifications required' });
  let rep = 0.5;
  if (p.reputationScore == null) uncertainty.push('No verified delivery history yet');
  else rep = p.reputationScore / 100;
  factors.push({ factor: 'Verified reputation', weight: 15, score: rep, detail: p.reputationScore == null ? 'Unrated' : `Reputation ${p.reputationScore}/100` });
  const score = Math.round(factors.reduce((s, f) => s + f.weight * f.score, 0));
  const confidence = uncertainty.length === 0 ? 'high' : uncertainty.length === 1 ? 'medium' : 'low';
  return { partnerId: p.id, partnerName: p.name, score, confidence, factors, uncertainty, disclaimer: MATCH_DISCLAIMER };
}

export function rankPartners(partners: MatchPartner[], t: MatchTarget, limit = 10): MatchSuggestion[] {
  return partners.map((p) => scorePartner(p, t)).filter((s): s is MatchSuggestion => !!s && s.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
