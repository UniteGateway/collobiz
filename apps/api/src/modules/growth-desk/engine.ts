/**
 * Growth Desk engine: lawful-contact filter, explainable scoring and the outreach writer.
 * The writer is an adapter: `rules` (built in, no external calls) today; a language-model writer plugs in behind the same
 * interface when AI_PROVIDER is configured (Phase 2). Every draft carries its provider, prompt version and sources.
 */
import { CONTACT_SOURCE_LABELS, GROWTH_AUDIENCE_LABELS, INDIA_STATES, blockedClaimsIn, sectorName } from '@collabiz/types';

export interface AgentLike { name: string; product: string; audience: string; sectors: string[]; regions: string[]; countries: string[]; pitch: string; callToAction: string }
export interface ContactLike {
  id: string; organizationName: string; contactName: string | null; email: string | null; country: string; region: string | null; city: string | null;
  sector: string; kind: string; source: string; sourceDetail: string; lawfulBasis: string; optedOutAt: Date | null; tags: string[];
}
export type Skip = 'opted_out' | 'no_lawful_basis' | 'investor_needs_consent' | 'wrong_country' | 'wrong_sector' | 'wrong_kind';
export const SKIP_LABELS: Record<Skip, string> = {
  opted_out: 'Opted out', no_lawful_basis: 'No lawful basis to contact', investor_needs_consent: 'Investors need recorded consent',
  wrong_country: 'Outside the agent’s countries', wrong_sector: 'Different sector', wrong_kind: 'Not the kind of organisation this agent looks for',
};

const regionName = (code: string | null) => INDIA_STATES.find(([c]) => c === code)?.[1] ?? code ?? '';
const SOURCE_POINTS: Record<string, number> = { inbound_form: 20, opt_in_list: 20, partner_referral: 20, existing_customer: 20, event: 15, licensed_directory: 8, public_registry: 8, manual: 5 };

/** Hard rules first: a contact that fails one is never scored, drafted or contacted. */
export function eligibility(agent: AgentLike, c: ContactLike, suppressed: boolean): Skip | null {
  if (suppressed || c.optedOutAt) return 'opted_out';
  if (c.lawfulBasis === 'none') return 'no_lawful_basis';
  if (agent.audience === 'investors' && (c.kind !== 'investor' || c.lawfulBasis !== 'consent')) return c.kind !== 'investor' ? 'wrong_kind' : 'investor_needs_consent';
  if (agent.audience === 'associations' && c.kind !== 'association') return 'wrong_kind';
  if (c.kind === 'investor' && agent.audience !== 'investors') return 'wrong_kind';
  if (agent.countries.length && !agent.countries.includes(c.country)) return 'wrong_country';
  if (!agent.sectors.includes(c.sector)) return 'wrong_sector';
  return null;
}

/** Explainable 0–100 score. Reasons are shown to the reviewer next to every lead. */
export function scoreContact(agent: AgentLike, c: ContactLike, opts: { partnerNearby: boolean }) {
  const reasons: string[] = [];
  let s = 40;
  reasons.push(`Works in ${sectorName(c.sector)}, a sector this agent covers`);
  if (!agent.regions.length) { s += 10; }
  else if (c.region && agent.regions.includes(c.region)) { s += 20; reasons.push(`Located in ${regionName(c.region)}, a target region`); }
  else reasons.push('Outside the target regions');
  const sp = SOURCE_POINTS[c.source] ?? 0;
  s += sp;
  if (sp >= 15) reasons.push(`Warm source: ${CONTACT_SOURCE_LABELS[c.source]?.toLowerCase()}`);
  if (c.contactName) s += 5; else reasons.push('No named contact person yet');
  if (c.email) s += 5; else reasons.push('No e-mail address — call or visit instead');
  if (agent.audience === 'trade' && (c.country !== 'IN' || c.tags.some((t) => /import|export/i.test(t)))) { s += 10; reasons.push('Active in import or export'); }
  if (agent.audience === 'associations' && c.kind === 'association') s += 5;
  if (opts.partnerNearby) { s += 5; reasons.push('A verified partner works in this area and can follow up'); }
  return { score: Math.min(100, s), reasons };
}

export interface Draft { subject: string; body: string; sources: { type: string; ref: string }[]; provider: string; promptVersion: string; blocked: string[] }
export interface GrowthWriter { draft(agent: AgentLike & { issuer: string }, c: ContactLike, reasons: string[], unsubscribeUrl: string): Draft }

/** Built-in writer: personalised from the agent's approved pitch; never invents prices, claims or facts. */
export const rulesWriter: GrowthWriter = {
  draft(agent, c, reasons, unsubscribeUrl) {
    const hello = c.contactName ? `Dear ${c.contactName},` : `Dear ${c.organizationName} team,`;
    const place = [c.city, regionName(c.region)].filter(Boolean).join(', ');
    const subject = {
      partners: `Partner with Unite Group: ${agent.product}`,
      associations: `Collaboration proposal for ${c.organizationName}: ${agent.product}`,
      trade: `${agent.product} — supply enquiry for ${c.organizationName}`,
      investors: `${agent.product}: information you asked to receive`,
    }[agent.audience] ?? `${agent.product} for ${c.organizationName}`;
    const intro = {
      partners: `We are looking for capable partners${place ? ` in ${place}` : ''} to work with Unite Group on ${agent.product}.`,
      associations: `We would like to explore working with ${c.organizationName} and its members on ${agent.product}.`,
      trade: `We are writing about ${agent.product} for ${c.organizationName}.`,
      investors: `You asked to receive updates from Unite Group. This note is about ${agent.product}.`,
    }[agent.audience] ?? `We are writing to ${c.organizationName} about ${agent.product}.`;
    const why = `We thought of you because you work in ${sectorName(c.sector).toLowerCase()}${place ? ` and are based in ${place}` : ''}.`;
    const body = [
      hello, '', intro, '', agent.pitch.trim(), '', why, '', `${agent.callToAction.trim()}`, '', 'Kind regards,', `${agent.issuer} — Unite Group`, '',
      '—',
      `Why you received this: ${CONTACT_SOURCE_LABELS[c.source]?.toLowerCase() ?? c.source} (${c.sourceDetail}).`,
      `To stop receiving messages from Unite Group, open ${unsubscribeUrl}`,
    ].join('\n');
    return {
      subject, body, provider: 'rules', promptVersion: 'growth-rules-v1',
      sources: [{ type: 'agent_pitch', ref: agent.name }, { type: 'contact_source', ref: `${c.source}: ${c.sourceDetail}` }, ...reasons.slice(0, 3).map((r) => ({ type: 'match_reason', ref: r }))],
      blocked: blockedClaimsIn(`${subject}\n${agent.pitch}\n${agent.callToAction}`),
    };
  },
};

export const audienceLabel = (a: string) => GROWTH_AUDIENCE_LABELS[a] ?? a;
