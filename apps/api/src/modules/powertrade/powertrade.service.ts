/**
 * POWERTRADE engines: power-scenario comparison (reuses the Power Lab engine with provenance) and energy + business
 * matching across Green Park, Trading, XCHANGE and other POWERTRADE members. Deterministic rules; every match carries its
 * reasons, required agreements, regulatory conditions and missing information. No percentages are shown as proof.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { deliveredCost, illustrativeTariffs, SEED_OFFTAKE_RULES, ruleFor } from '@unite/power-engine';
import { INDIA_STATES, PT_ARRANGEMENTS, PT_REQUIRED_DOCS, PT_DOCUMENTS, type PtArrangement, type PtObjective, type PtModel } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { energyListings, organizations, ptContributions, ptEnergyNeeds, ptProfiles, tradeRequirements, xchangeListings } from '../../db/schema';

type Need = typeof ptEnergyNeeds.$inferSelect;
/** Power-engine jurisdiction code for a state name or ISO code ("Telangana" / "IN-TG" → "TS"). */
export function stateCode(s: string): string {
  const iso = INDIA_STATES.find(([c, n]) => n.toLowerCase() === s.toLowerCase() || c.toLowerCase() === s.toLowerCase() || c.slice(3).toLowerCase() === s.toLowerCase())?.[0];
  const two = (iso ?? s).replace(/^IN-/, '').toUpperCase().slice(0, 2);
  return ({ TG: 'TS', OR: 'OD' } as Record<string, string>)[two] ?? two;
}

export interface ScenarioRow {
  arrangement: PtArrangement; label: string; eligible: boolean; findings: { severity: 'block' | 'warning' | 'info'; message: string }[];
  landedPaisePerKwh: number | null; monthlyUnitsCovered: number; monthlySavingPaise: number | null; capitalNeeded: boolean; complexity: number;
  charges: { label: string; perKwh: number; provenance: string }[]; illustrativeShare: number; requiredDocs: string[];
}

@Injectable()
export class PowertradeService {
  constructor(@InjectDb() private db: Db) {}

  async latestNeed(orgId: string) {
    const [n] = await this.db.select().from(ptEnergyNeeds).where(eq(ptEnergyNeeds.orgId, orgId)).orderBy(desc(ptEnergyNeeds.createdAt)).limit(1);
    return n ?? null;
  }

  /** Compares arrangements for the member's latest energy need. Open-access charges come from the power engine records. */
  compare(need: Need, state: string, input: { arrangements: PtArrangement[]; ppaPaisePerKwh: number; capacityMw: number; sourceState: string; cufPct: number; ownershipPct?: number; objective: PtObjective; verifiedBenefitsPaise: number }) {
    const dest = stateCode(state);
    const asOf = new Date().toISOString().slice(0, 10);
    const records = illustrativeTariffs();
    const tariffRs = need.tariffPaisePerKwh / 100;
    const cdKw = need.contractDemandKva * 0.95;
    const genMwh = input.capacityMw * (input.cufPct / 100) * 8760;
    const rows: ScenarioRow[] = input.arrangements.map((a) => {
      const meta = PT_ARRANGEMENTS[a];
      const findings: ScenarioRow['findings'] = [];
      let eligible = true; let landed: number | null = null; let received = genMwh; let charges: ScenarioRow['charges'] = []; let ill = 0;
      if (meta.openAccess) {
        const structure = a === 'third_party' ? 'third_party' : a === 'group_captive' ? 'group_captive' : 'captive';
        const elig = ruleFor(SEED_OFFTAKE_RULES, dest, structure, 'oa_min_contract_demand_kw');
        if (elig && cdKw < elig.value) { eligible = false; findings.push({ severity: 'block', message: `Contract demand ≈ ${cdKw.toFixed(0)} kW is below the ${elig.value} kW open-access threshold (${elig.confidence === 'verified' ? 'verified' : 'secondary source — confirm'}).` }); }
        else if (elig) findings.push({ severity: 'info', message: `Contract demand ≈ ${cdKw.toFixed(0)} kW meets the ${elig.value} kW open-access threshold (${elig.confidence === 'verified' ? 'verified' : 'secondary source — confirm'}).` });
        else findings.push({ severity: 'warning', message: `No eligibility rule recorded for ${dest} — confirm with the state regulations.` });
        if (a !== 'third_party') {
          const own = ruleFor(SEED_OFFTAKE_RULES, dest, 'group_captive', 'captive_min_ownership_pct');
          if (input.ownershipPct == null) { eligible = false; findings.push({ severity: 'block', message: 'Captive status is unresolved: enter the proposed equity share. Captive status is never assumed from a simple input.' }); }
          else if (own && input.ownershipPct < own.value && a === 'captive') { eligible = false; findings.push({ severity: 'block', message: `Equity ${input.ownershipPct}% is below the ${own.value}% captive ownership requirement.` }); }
          else findings.push({ severity: 'warning', message: `Captive qualification also needs the consumption test each year and legal review of the SPV — ${own ? `minimum collective ownership ${own.value}% (${own.source.slice(0, 90)}…)` : 'confirm the current rule'}.` });
        }
        const r = deliveredCost(records, { sourceState: input.sourceState, destinationState: dest, receivingKv: need.voltageKv, capacityMw: input.capacityMw, energyInjectedMwh: genMwh, structure, istsConnected: false, confirmedConditions: {}, ppaRsKwh: input.ppaPaisePerKwh / 100, consumerTariffRsKwh: tariffRs, developerBears: [], asOf });
        landed = Math.round(r.landedRsKwh * 100); received = r.energyReceivedMwh; ill = r.illustrativeShare;
        charges = r.lines.map((l) => ({ label: l.label, perKwh: Math.round(l.perKwhReceived * 10000) / 10000, provenance: l.provenance }));
        for (const fl of r.flags) findings.push({ severity: 'warning', message: fl });
        if (!records.some((x) => x.jurisdiction === dest)) findings.push({ severity: 'warning', message: `No charge records for ${dest}: network charges are not included — results are incomplete.` });
      } else {
        landed = input.ppaPaisePerKwh;
        const nm = ruleFor(SEED_OFFTAKE_RULES, dest, 'rooftop', 'net_metering_cap_kw');
        findings.push({ severity: 'info', message: a === 'rooftop_epc' ? 'You own the plant: the rate entered is treated as your levelised cost; capital is needed. Get a Unite Solar quote for the exact figure.' : 'Developer owns the plant and sells you power at the PPA rate; no capital needed.' });
        if (nm) findings.push({ severity: 'info', message: `Rooftop net-metering ceiling in ${dest}: ${nm.value} kW (${nm.confidence}).` });
        else findings.push({ severity: 'warning', message: `Rooftop net-metering limit for ${dest} is not recorded — confirm with the DISCOM.` });
        if (input.capacityMw * 1000 > need.contractDemandKva) findings.push({ severity: 'warning', message: 'Rooftop capacity is larger than the contract demand — check net-metering and roof area.' });
      }
      const coveredUnits = Math.min(need.monthlyUnits, Math.round((received * 1000) / 12));
      const saving = landed == null ? null : Math.round((need.tariffPaisePerKwh - landed) * coveredUnits);
      if (saving != null && saving <= 0) findings.push({ severity: 'warning', message: 'At these inputs this arrangement costs more than your present tariff.' });
      return { arrangement: a, label: meta.label, eligible, findings, landedPaisePerKwh: landed, monthlyUnitsCovered: coveredUnits, monthlySavingPaise: saving, capitalNeeded: meta.capex, complexity: meta.complexity, charges, illustrativeShare: ill, requiredDocs: PT_REQUIRED_DOCS[a.startsWith('rooftop') ? 'discounted_ppa' : a === 'group_captive' || a === 'captive' ? 'group_captive' : 'discounted_ppa'] };
    });
    const eligibleRows = rows.filter((r) => r.eligible && r.landedPaisePerKwh != null);
    const key: Record<PtObjective, (r: ScenarioRow) => number> = {
      lowest_tariff: (r) => r.landedPaisePerKwh!, max_savings: (r) => -(r.monthlySavingPaise ?? 0), lowest_capital: (r) => (r.capitalNeeded ? 1 : 0) * 1e12 - (r.monthlySavingPaise ?? 0),
      lowest_complexity: (r) => r.complexity * 1e12 - (r.monthlySavingPaise ?? 0), best_combined: (r) => -((r.monthlySavingPaise ?? 0) + input.verifiedBenefitsPaise),
    };
    const ranked = [...eligibleRows].sort((a, b) => key[input.objective](a) - key[input.objective](b)).map((r) => r.arrangement);
    const illustrative = rows.some((r) => r.illustrativeShare > 0) || rows.some((r) => !PT_ARRANGEMENTS[r.arrangement].openAccess);
    return { rows, ranked, objective: input.objective, illustrative, presentBillPaise: need.monthlyUnits * need.tariffPaisePerKwh,
      note: 'Comparison only. Network charges use the Power Lab records shown with their provenance (illustrative until verified orders are entered). No offer is executable until technical, commercial and regulatory approvals are recorded.' };
  }

  /** Energy + business matches for an organization. `hints` lets reverse matching add products and wants from plain words. */
  async matches(orgId: string, hints?: { products?: string[]; wantsPower?: boolean; monthlyUnits?: number | null }) {
    const [profile] = await this.db.select().from(ptProfiles).where(eq(ptProfiles.orgId, orgId)).limit(1);
    const need = await this.latestNeed(orgId);
    const contribs = await this.db.select().from(ptContributions).where(and(eq(ptContributions.orgId, orgId), eq(ptContributions.active, true)));
    const words = [...new Set([...contribs.flatMap((c) => (c.keywords.length ? c.keywords : c.title.toLowerCase().split(/[^a-z0-9]+/))), ...(hints?.products ?? [])].filter((w) => w.length >= 4 && !['with', 'from', 'and', 'supply', 'products', 'services', 'solar', 'power', 'energy', 'india'].includes(w)))].slice(0, 12);
    const out: { type: 'energy' | 'business' | 'partner'; partner: string; title: string; arrangement: string; reasons: string[]; agreements: string[]; regulatory: string[]; missing: string[]; risks: string[]; next: { label: string; href: string } }[] = [];
    const wantsPower = hints?.wantsPower || profile?.interests.includes('buy_power') || profile?.interests.includes('group_captive');
    const missing: string[] = [];
    if (!need) missing.push('Electricity profile (units, tariff, contract demand)');
    if (!contribs.length) missing.push('What you can contribute (products, capacity, services)');

    if (wantsPower) {
      const plants = await this.db.select({ l: energyListings, org: organizations.displayName }).from(energyListings).innerJoin(organizations, eq(organizations.id, energyListings.orgId))
        .where(and(eq(energyListings.side, 'plant'), eq(energyListings.status, 'live'), eq(energyListings.confidential, false), ne(energyListings.orgId, orgId))).orderBy(desc(energyListings.availableMw)).limit(20);
      const myState = profile ? stateCode(profile.state) : null;
      const ranked = [...plants].sort((a, b) => Number(myState != null && stateCode(b.l.state) === myState) - Number(myState != null && stateCode(a.l.state) === myState));
      for (const { l, org } of ranked.slice(0, 6)) {
        const reasons = [...(l.demo ? ['Sample listing (demonstration data)'] : []), `${l.availableMw ?? l.capacityMw} MW available${l.models.length ? ` · ${l.models.join(', ')}` : ''}`];
        if (myState && stateCode(l.state) === myState) reasons.push(`Same state (${l.state}) — intra-state open access`); else reasons.push(`In ${l.state} — inter-state charges and losses apply`);
        if (need && l.tariffRsKwh) reasons.push(`Indicative tariff ₹${l.tariffRsKwh}/kWh vs your ₹${(need.tariffPaisePerKwh / 100).toFixed(2)}/kWh (before network charges)`);
        out.push({ type: 'energy', partner: org, title: l.title, arrangement: 'Open-access / captive power supply', reasons, agreements: [PT_DOCUMENTS.ppa], regulatory: ['Open-access eligibility and state approvals', 'Introductions only through a licensed trader or the developer — COLLABIZ does not sell power'],
          missing: need ? [] : ['Your electricity profile'], risks: ['Tariff and availability are the listing owner’s statements until a PPA is signed'], next: { label: 'Ask for an introduction', href: '/energy' } });
      }
      out.push({ type: 'energy', partner: 'Unite Solar', title: 'Rooftop solar (EPC or RESCO)', arrangement: 'Rooftop EPC or developer-owned PPA', reasons: [need?.rooftopKwp ? `${need.rooftopKwp} kWp rooftop noted in your profile` : 'Uses your own roof; no open-access approval needed', 'Quote from your bill in minutes'],
        agreements: ['Unite Solar quote', 'EPC contract or RESCO PPA'], regulatory: ['DISCOM net-metering / connection approval'], missing: need ? [] : ['Your electricity profile'], risks: ['Roof suitability and shading are checked on site'], next: { label: 'Get a Unite Solar quote', href: '/unite-solar' } });
    }

    if (words.length) {
      const like = (col: unknown) => or(...words.map((w) => ilike(col as never, `%${w}%`)))!;
      const reqs = await this.db.select({ r: tradeRequirements, org: organizations.displayName }).from(tradeRequirements).innerJoin(organizations, eq(organizations.id, tradeRequirements.buyerOrgId))
        .where(and(eq(tradeRequirements.status, 'open'), ne(tradeRequirements.buyerOrgId, orgId), or(like(tradeRequirements.title), like(tradeRequirements.description), like(sql`${tradeRequirements.items}::text`)))).limit(8);
      for (const { r, org } of reqs) {
        const hit = words.filter((w) => `${r.title} ${r.description} ${JSON.stringify(r.items)}`.toLowerCase().includes(w));
        out.push({ type: 'business', partner: org, title: r.title, arrangement: 'Supply to a buyer’s requirement', reasons: [`Matches what you offer: ${hit.join(', ')}`, r.region ? `Delivery region: ${r.region}` : 'Open requirement on Trading'],
          agreements: [PT_DOCUMENTS.supply_agreement, PT_DOCUMENTS.purchase_order], regulatory: [], missing: [], risks: ['Buyer verifies specifications and price in a quotation'], next: { label: 'Quote on Trading', href: `/trading/quotations?requirement=${r.id}` } });
      }
      const xs = await this.db.select({ x: xchangeListings, org: organizations.displayName }).from(xchangeListings).innerJoin(organizations, eq(organizations.id, xchangeListings.orgId))
        .where(and(eq(xchangeListings.side, 'need'), eq(xchangeListings.status, 'active'), ne(xchangeListings.orgId, orgId), or(like(xchangeListings.title), like(xchangeListings.description)))).limit(6);
      for (const { x, org } of xs) {
        out.push({ type: 'business', partner: org, title: x.title, arrangement: `XCHANGE — accepts ${x.accepts.join(', ')}`, reasons: ['They need what you offer', `Region: ${x.region}`],
          agreements: ['XCHANGE deal with each leg valued', PT_DOCUMENTS.tax_review], regulatory: ['Barter is a taxable supply on both sides — GST on value of each leg'], missing: [], risks: ['Each leg is valued and invoiced separately'], next: { label: 'Open in XCHANGE', href: '/xchange' } });
      }
    }

    // Other POWERTRADE members who contribute what this member is looking for.
    const wantKinds = new Set<string>();
    if (profile?.interests.includes('epc_partner') || wantsPower) wantKinds.add('epc');
    if (profile?.interests.includes('export_import')) wantKinds.add('export');
    if (profile?.interests.includes('distributor') || profile?.interests.includes('find_customers')) wantKinds.add('distribution');
    if (wantKinds.size) {
      const ps = await this.db.select({ c: ptContributions, org: organizations.displayName, verified: organizations.verificationStatus }).from(ptContributions).innerJoin(organizations, eq(organizations.id, ptContributions.orgId))
        .innerJoin(ptProfiles, eq(ptProfiles.orgId, ptContributions.orgId))
        .where(and(eq(ptContributions.active, true), ne(ptContributions.orgId, orgId), eq(ptProfiles.shareProducts, true), sql`${ptContributions.kind} = any(${sql.raw(`array[${[...wantKinds].map((k) => `'${k}'`).join(',')}]`)})`)).limit(6);
      for (const { c, org, verified } of ps) out.push({ type: 'partner', partner: org, title: c.title, arrangement: `${c.kind === 'epc' ? 'EPC / installation partner' : c.kind === 'export' ? 'Export / import access' : 'Distribution partner'}`,
        reasons: [`Offers ${c.title}${c.locations ? ` in ${c.locations}` : ''}`, verified === 'verified' ? 'Verified business' : 'Verification pending'], agreements: [c.kind === 'epc' ? PT_DOCUMENTS.epc_agreement : PT_DOCUMENTS.mou], regulatory: [], missing: [], risks: verified === 'verified' ? [] : ['Business not yet verified'], next: { label: 'Propose a collaboration', href: `/powertrade/collaborations?with=${c.orgId}` } });
    }
    return { profileReady: !!profile, missing, items: out, engine: 'rules', note: 'Matches come from live listings and requirements on COLLABIZ, with the reason for each. They are leads to explore, not offers or guarantees.' };
  }

  requiredDocs(model: PtModel) { return PT_REQUIRED_DOCS[model]; }
}
