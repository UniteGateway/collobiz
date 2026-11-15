/**
 * Modules 7–8 — open-access delivered cost (intra-state and interstate).
 *
 * Every charge comes from a TariffRecord with provenance (verified / user / illustrative), dates and, where relevant, the
 * order it comes from. Waivers and exemptions are records with explicit conditions; they apply only when the user has
 * confirmed each condition for the project — never by default.
 *
 * Energy chain (injection → consumer):
 *   E_received = E_injected × Π (1 − loss_i)   over the networks used (source STU, ISTS, destination STU, DISCOM)
 * Charges are computed on the basis each record states (per kWh injected or received, per MW of capacity per month/day,
 * per day, or % of energy). Landed cost per kWh received = (PPA × E_injected + Σ charges) / E_received.
 */
import type { Provenance } from './prices';
export type ChargeType =
  | 'transmission' | 'wheeling' | 'transmission_loss' | 'distribution_loss' | 'sldc' | 'rldc' | 'css' | 'additional_surcharge'
  | 'banking' | 'ists_charge' | 'ists_loss' | 'electricity_duty' | 'green_premium' | 'scheduling';
export type ChargeUnit = 'Rs/kWh' | 'Rs/kW/month' | 'Rs/MW/day' | 'Rs/day' | 'Rs/month' | '%';
export const CHARGE_LABELS: Record<ChargeType, string> = {
  transmission: 'Transmission charges', wheeling: 'Distribution wheeling charges', transmission_loss: 'Transmission losses', distribution_loss: 'Distribution losses',
  sldc: 'SLDC charges', rldc: 'RLDC / scheduling (interstate)', css: 'Cross-subsidy surcharge', additional_surcharge: 'Additional surcharge', banking: 'Banking charges',
  ists_charge: 'ISTS transmission charges', ists_loss: 'ISTS losses', electricity_duty: 'Electricity duty / tax', green_premium: 'Green energy premium', scheduling: 'Scheduling / deviation provisions',
};

export interface TariffRecord {
  key: string; jurisdiction: string; chargeType: ChargeType; unit: ChargeUnit; value: number;
  /** Applies only at or above / below these receiving voltages, if set. */
  minKv?: number | null; maxKv?: number | null;
  provenance: Provenance; orderTitle?: string | null; orderUrl?: string | null; orderDate?: string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null; version: number; notes?: string | null;
  /** For waivers/exemptions: this record reduces another charge when its conditions are confirmed. */
  waiver?: { waives: ChargeType; fraction: number; conditions: string[] } | null;
}

export type Structure = 'third_party' | 'group_captive' | 'captive' | 'green_open_access';
export interface RouteInputs {
  sourceState: string; destinationState: string;
  receivingKv: number; capacityMw: number; energyInjectedMwh: number; // per year
  structure: Structure;
  /** Physically connected to the ISTS (CTU). A state (STU) connection does not qualify for ISTS access on its own. */
  istsConnected: boolean;
  /** Conditions the user has confirmed for this project, by waiver key, e.g. { 'ISTS.waiver': ['commissioning_date', ...] }. */
  confirmedConditions: Record<string, string[]>;
  ppaRsKwh: number; consumerTariffRsKwh: number; developerBears: ChargeType[];
  asOf: string; // ISO date for selecting effective records
  bankedMwh?: number;
}

export interface ChargeLine { key: string; jurisdiction: string; type: ChargeType; label: string; basis: string; rs: number; perKwhReceived: number; provenance: Provenance; source: string; waived: number; waiverNote?: string }
export interface RouteResult {
  networks: string[]; lossFactors: { label: string; pct: number }[];
  energyInjectedMwh: number; energyReceivedMwh: number; lines: ChargeLine[];
  chargesRs: number; landedRsKwh: number; buyerSavingRsKwh: number; developerNetRsKwh: number;
  flags: string[]; illustrativeShare: number;
}

const inForce = (r: TariffRecord, d: string) => (!r.effectiveFrom || r.effectiveFrom <= d) && (!r.effectiveTo || r.effectiveTo >= d);
/** Latest version in force for each key. */
export function current(records: TariffRecord[], asOf: string) {
  const best = new Map<string, TariffRecord>();
  for (const r of records) if (inForce(r, asOf)) { const b = best.get(r.key); if (!b || r.version > b.version) best.set(r.key, r); }
  return [...best.values()];
}

/** Which networks the energy crosses, from the connection point and the states involved. */
export function routeNetworks(r: RouteInputs) {
  const inter = r.sourceState !== r.destinationState;
  const nets: { label: string; jurisdiction: string; kind: 'STU' | 'ISTS' | 'DISCOM' }[] = [];
  if (!inter) {
    nets.push({ label: `${r.sourceState} transmission (STU)`, jurisdiction: r.sourceState, kind: 'STU' });
  } else {
    if (!r.istsConnected) nets.push({ label: `${r.sourceState} transmission to the ISTS (STU)`, jurisdiction: r.sourceState, kind: 'STU' });
    nets.push({ label: 'Inter-state transmission (ISTS)', jurisdiction: 'ISTS', kind: 'ISTS' });
    nets.push({ label: `${r.destinationState} transmission (STU)`, jurisdiction: r.destinationState, kind: 'STU' });
  }
  nets.push({ label: `${r.destinationState} distribution (DISCOM)`, jurisdiction: r.destinationState, kind: 'DISCOM' });
  return nets;
}

const applies = (rec: TariffRecord, kv: number) => (rec.minKv == null || kv >= rec.minKv) && (rec.maxKv == null || kv <= rec.maxKv);

export function deliveredCost(records: TariffRecord[], r: RouteInputs): RouteResult {
  const recs = current(records, r.asOf);
  const nets = routeNetworks(r);
  const flags: string[] = [];
  const inter = r.sourceState !== r.destinationState;
  if (inter && !r.istsConnected) flags.push(`Not connected to the ISTS: energy first crosses the ${r.sourceState} state network, whose charges and losses apply, before entering the ISTS.`);
  // Losses, in network order.
  let e = r.energyInjectedMwh;
  const lossFactors: { label: string; pct: number }[] = [];
  const pick = (jur: string, t: ChargeType) => recs.filter((x) => x.jurisdiction === jur && x.chargeType === t && applies(x, r.receivingKv));
  for (const n of nets) {
    const t: ChargeType = n.kind === 'ISTS' ? 'ists_loss' : n.kind === 'DISCOM' ? 'distribution_loss' : 'transmission_loss';
    for (const rec of pick(n.jurisdiction, t)) { lossFactors.push({ label: `${n.label} — ${rec.value}%`, pct: rec.value }); e *= 1 - rec.value / 100; }
  }
  const received = e;
  const kwhIn = r.energyInjectedMwh * 1000, kwhRec = received * 1000, kw = r.capacityMw * 1000;
  // Which charges apply by structure (statutory position summarised; confirm for the specific case).
  const surchargeExempt = r.structure === 'captive' || r.structure === 'group_captive';
  if (surchargeExempt) flags.push('Captive / group captive: cross-subsidy and additional surcharge are not levied only if captive conditions (ownership and consumption shares) are met and verified each year. Confirm on the AP Open Access page.');
  const lines: ChargeLine[] = [];
  const add = (rec: TariffRecord, rsGross: number, basis: string) => {
    // Waivers: only those whose every condition is confirmed for this project.
    const ws = recs.filter((w) => w.waiver && w.waiver.waives === rec.chargeType && (w.jurisdiction === rec.jurisdiction || w.jurisdiction === 'ALL'));
    let waived = 0; let note: string | undefined;
    for (const w of ws) {
      const ok = w.waiver!.conditions.every((c) => (r.confirmedConditions[w.key] ?? []).includes(c));
      if (ok) { waived += rsGross * w.waiver!.fraction; note = `${(w.waiver!.fraction * 100).toFixed(0)}% waived (${w.key}, conditions confirmed)`; }
      else note = `Waiver ${w.key} not applied — conditions not all confirmed`;
    }
    const rs = rsGross - Math.min(waived, rsGross);
    lines.push({ key: rec.key, jurisdiction: rec.jurisdiction, type: rec.chargeType, label: CHARGE_LABELS[rec.chargeType], basis, rs, perKwhReceived: kwhRec > 0 ? rs / kwhRec : 0, provenance: rec.provenance, source: rec.orderTitle ?? (rec.provenance === 'illustrative' ? 'Illustrative placeholder' : 'User-entered'), waived: Math.min(waived, rsGross), waiverNote: note });
  };
  const charge = (rec: TariffRecord) => {
    switch (rec.unit) {
      case 'Rs/kWh': return [rec.value * (rec.chargeType === 'wheeling' || rec.chargeType === 'css' || rec.chargeType === 'additional_surcharge' || rec.chargeType === 'electricity_duty' ? kwhRec : kwhIn), `₹${rec.value}/kWh × ${rec.chargeType === 'wheeling' || rec.chargeType === 'css' || rec.chargeType === 'additional_surcharge' || rec.chargeType === 'electricity_duty' ? 'kWh received' : 'kWh injected'}`] as const;
      case 'Rs/kW/month': return [rec.value * kw * 12, `₹${rec.value}/kW/month × ${r.capacityMw} MW × 12`] as const;
      case 'Rs/MW/day': return [rec.value * r.capacityMw * 365, `₹${rec.value}/MW/day × ${r.capacityMw} MW × 365`] as const;
      case 'Rs/day': return [rec.value * 365, `₹${rec.value}/day × 365`] as const;
      case 'Rs/month': return [rec.value * 12, `₹${rec.value}/month × 12`] as const;
      case '%': return [rec.chargeType === 'banking' ? (r.bankedMwh ?? 0) * 1000 * (rec.value / 100) * r.ppaRsKwh : 0, `${rec.value}% of banked energy`] as const;
    }
  };
  const chargeTypesByNet: Record<string, ChargeType[]> = { STU: ['transmission', 'sldc'], ISTS: ['ists_charge', 'rldc'], DISCOM: ['wheeling'] };
  for (const n of nets) for (const t of chargeTypesByNet[n.kind]) for (const rec of pick(n.jurisdiction, t)) { if (rec.waiver) continue; const [rs, basis] = charge(rec); add(rec, rs, basis); }
  // Destination-state consumer-side charges.
  for (const t of ['css', 'additional_surcharge', 'electricity_duty', 'banking', 'green_premium'] as ChargeType[]) {
    if (surchargeExempt && (t === 'css' || t === 'additional_surcharge')) continue;
    if (t === 'green_premium' && r.structure !== 'green_open_access') continue;
    if (t === 'banking' && !r.bankedMwh) continue;
    for (const rec of pick(r.destinationState, t)) { if (rec.waiver) continue; const [rs, basis] = charge(rec); add(rec, rs, basis); }
  }
  const chargesRs = lines.reduce((a, l) => a + l.rs, 0);
  const landed = kwhRec > 0 ? (r.ppaRsKwh * kwhIn + chargesRs) / kwhRec : 0;
  const devCharges = lines.filter((l) => r.developerBears.includes(l.type)).reduce((a, l) => a + l.rs, 0);
  const illus = lines.filter((l) => l.provenance === 'illustrative').reduce((a, l) => a + l.rs, 0);
  if (lines.some((l) => l.provenance === 'illustrative')) flags.push('Some charges are illustrative placeholders, not verified orders — the landed cost is indicative.');
  if (!lines.length) flags.push(`No tariff records found for this route — add ${r.destinationState} charges before relying on the result.`);
  return {
    networks: nets.map((n) => n.label), lossFactors, energyInjectedMwh: r.energyInjectedMwh, energyReceivedMwh: received, lines, chargesRs,
    landedRsKwh: landed, buyerSavingRsKwh: r.consumerTariffRsKwh - landed, developerNetRsKwh: kwhIn > 0 ? (r.ppaRsKwh * kwhIn - devCharges) / kwhIn : 0,
    flags, illustrativeShare: chargesRs > 0 ? illus / chargesRs : 0,
  };
}

export const STATES: Record<string, string> = { AP: 'Andhra Pradesh', TS: 'Telangana', KA: 'Karnataka', TN: 'Tamil Nadu', MH: 'Maharashtra', OD: 'Odisha', GJ: 'Gujarat', RJ: 'Rajasthan' };

/**
 * Illustrative starting records so the calculators run. Every value is a PLACEHOLDER of a plausible order of magnitude —
 * not taken from any APERC/TGERC/KERC/TNERC/MERC/OERC/CERC order. Replace each with the verified figure and its order.
 */
export function illustrativeTariffs(): TariffRecord[] {
  const ill = { provenance: 'illustrative' as const, version: 1, notes: 'Placeholder — replace with the value and order in force', effectiveFrom: '2026-04-01' };
  const out: TariffRecord[] = [];
  const st = (j: string, tr: number, wh: number, tl: number, dl: number, css: number, as: number, ed: number) => out.push(
    { key: `${j}.transmission`, jurisdiction: j, chargeType: 'transmission', unit: 'Rs/kWh', value: tr, ...ill },
    { key: `${j}.wheeling`, jurisdiction: j, chargeType: 'wheeling', unit: 'Rs/kWh', value: wh, maxKv: 33, ...ill },
    { key: `${j}.transmission_loss`, jurisdiction: j, chargeType: 'transmission_loss', unit: '%', value: tl, ...ill },
    { key: `${j}.distribution_loss`, jurisdiction: j, chargeType: 'distribution_loss', unit: '%', value: dl, maxKv: 33, ...ill },
    { key: `${j}.sldc`, jurisdiction: j, chargeType: 'sldc', unit: 'Rs/day', value: 2000, ...ill },
    { key: `${j}.css`, jurisdiction: j, chargeType: 'css', unit: 'Rs/kWh', value: css, ...ill },
    { key: `${j}.additional_surcharge`, jurisdiction: j, chargeType: 'additional_surcharge', unit: 'Rs/kWh', value: as, ...ill },
    { key: `${j}.electricity_duty`, jurisdiction: j, chargeType: 'electricity_duty', unit: 'Rs/kWh', value: ed, ...ill },
    { key: `${j}.banking`, jurisdiction: j, chargeType: 'banking', unit: '%', value: 8, ...ill },
    { key: `${j}.green_premium`, jurisdiction: j, chargeType: 'green_premium', unit: 'Rs/kWh', value: 0.5, ...ill },
  );
  st('AP', 0.35, 0.6, 3.0, 5.0, 1.4, 0.6, 0.06);
  st('TS', 0.33, 0.55, 3.1, 5.2, 1.5, 0.5, 0.06);
  st('KA', 0.4, 0.65, 3.3, 5.5, 1.6, 0.7, 0.05);
  st('TN', 0.42, 0.7, 3.5, 6.0, 1.7, 0.6, 0.05);
  st('MH', 0.45, 0.8, 3.4, 6.5, 1.9, 1.0, 0.08);
  st('OD', 0.3, 0.5, 3.0, 6.0, 1.2, 0.4, 0.04);
  st('GJ', 0.38, 0.6, 3.2, 5.8, 1.5, 0.7, 0.07);
  st('RJ', 0.4, 0.65, 3.6, 6.2, 1.6, 0.8, 0.06);
  out.push(
    { key: 'ISTS.charge', jurisdiction: 'ISTS', chargeType: 'ists_charge', unit: 'Rs/kW/month', value: 300, ...ill },
    { key: 'ISTS.loss', jurisdiction: 'ISTS', chargeType: 'ists_loss', unit: '%', value: 3.0, ...ill },
    { key: 'ISTS.rldc', jurisdiction: 'ISTS', chargeType: 'rldc', unit: 'Rs/month', value: 15000, ...ill },
    { key: 'ISTS.waiver', jurisdiction: 'ISTS', chargeType: 'ists_charge', unit: 'Rs/kWh', value: 0, ...ill, notes: 'ISTS charge waiver for eligible solar/BESS: the share waived depends on commissioning date and the order in force. Placeholder fraction.',
      waiver: { waives: 'ists_charge', fraction: 0.5, conditions: ['ists_connected', 'eligible_technology', 'commissioning_date_within_window', 'supply_to_eligible_buyer'] } },
  );
  return out;
}
export const ISTS_WAIVER_CONDITIONS: Record<string, string> = {
  ists_connected: 'The plant is connected to the ISTS (not only to the state network)',
  eligible_technology: 'The technology (solar / co-located BESS) is covered by the waiver order',
  commissioning_date_within_window: 'Commissioning date falls within the window the order allows',
  supply_to_eligible_buyer: 'The power is sold to a buyer category the waiver covers',
};
