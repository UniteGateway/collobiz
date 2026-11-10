/**
 * Module 9 — industrial customer savings. All money in ₹, energy in kWh, monthly unless stated.
 *
 * Present bill  = Σ_band (kWh_band × rate_band) + demand charge × billed kVA + duty × kWh + fixed charges
 * Proposed bill = plant energy received × (PPA or peak-BESS tariff) + open-access charges on energy delivered
 *               + remaining energy from the discom at the present ToD rates (shortfall/backup)
 *               + demand charge × (billed kVA − agreed reduction) + duty × total kWh + fixed charges
 * Plant energy received at the consumer = energy delivered at injection × (1 − transmission and distribution losses).
 * Savings and percentages are indicative: they depend on the tariff and open-access charges actually applicable.
 */
export type TodBand = 'peak' | 'normal' | 'offpeak';
export interface ConsumerInputs {
  name: string; location: string; receivingVoltageKv: number;
  contractDemandKva: number; billedDemandKva: number;
  monthlyKwh: number;
  /** Share of monthly consumption in each ToD band (sums to 1). */
  todShare: Record<TodBand, number>;
  /** Present energy rate by ToD band, ₹/kWh (from the consumer's bill). */
  rate: Record<TodBand, number>;
  demandChargeRsKvaMonth: number;
  electricityDutyRsKwh: number;
  fixedChargesRsMonth: number;
  /** Contracted plant supply and its terms. */
  contractYears: number;
  ppaTariffRsKwh: number; peakBessTariffRsKwh: number;
  ppaEscalation: number; discomEscalation: number; // per year, fractions
  openAccessChargesRsKwh: number; // per kWh delivered (from Module 7)
  lossFraction: number; // transmission + distribution losses on the open-access route
  demandReductionKva: number; // demand the consumer can surrender to the discom (0 if none)
  backupPremiumRsKwh: number; // extra over normal tariff for backup / standby energy, if charged
}
export interface PlantSupply {
  /** Monthly energy injected for this consumer, MWh: solar direct and battery (peak). */
  solarMwh: number; batteryMwh: number;
  /** Of the battery energy, the part delivered in the peak band, MWh. */
  batteryPeakMwh: number;
}

const kwh = (mwh: number) => mwh * 1000;
export function presentBill(c: ConsumerInputs) {
  const bands = (['peak', 'normal', 'offpeak'] as TodBand[]).map((b) => ({ band: b, kwh: c.monthlyKwh * c.todShare[b], rs: c.monthlyKwh * c.todShare[b] * c.rate[b] }));
  const energy = bands.reduce((a, b) => a + b.rs, 0);
  const demand = c.demandChargeRsKvaMonth * c.billedDemandKva;
  const duty = c.electricityDutyRsKwh * c.monthlyKwh;
  return { bands, energy, demand, duty, fixed: c.fixedChargesRsMonth, total: energy + demand + duty + c.fixedChargesRsMonth };
}

export function proposedBill(c: ConsumerInputs, s: PlantSupply) {
  const received = { solar: kwh(s.solarMwh) * (1 - c.lossFraction), battery: kwh(s.batteryMwh) * (1 - c.lossFraction), batteryPeak: kwh(s.batteryPeakMwh) * (1 - c.lossFraction) };
  // Plant energy cannot exceed what the consumer uses in each band; anything beyond is not counted as a saving.
  const peakNeed = c.monthlyKwh * c.todShare.peak, otherNeed = c.monthlyKwh - peakNeed;
  const batteryPeakUsed = Math.min(received.batteryPeak, peakNeed);
  const plantOther = Math.min(received.solar + (received.battery - received.batteryPeak), otherNeed);
  const plantKwh = batteryPeakUsed + plantOther;
  const plantCharge = plantOther * c.ppaTariffRsKwh + batteryPeakUsed * c.peakBessTariffRsKwh;
  const delivered = kwh(s.solarMwh + s.batteryMwh); // charges are levied on energy scheduled/delivered at injection
  const oa = delivered * c.openAccessChargesRsKwh;
  // Remaining energy from the discom, priced band by band at present rates plus any backup premium.
  const remPeak = Math.max(0, peakNeed - batteryPeakUsed);
  const remOther = Math.max(0, otherNeed - plantOther);
  const otherAvgRate = otherNeed > 0 ? (c.monthlyKwh * c.todShare.normal * c.rate.normal + c.monthlyKwh * c.todShare.offpeak * c.rate.offpeak) / otherNeed : 0;
  const discomEnergy = remPeak * (c.rate.peak + c.backupPremiumRsKwh) + remOther * (otherAvgRate + c.backupPremiumRsKwh);
  const demand = c.demandChargeRsKvaMonth * Math.max(0, c.billedDemandKva - c.demandReductionKva);
  const duty = c.electricityDutyRsKwh * c.monthlyKwh;
  const total = plantCharge + oa + discomEnergy + demand + duty + c.fixedChargesRsMonth;
  return { plantKwh, plantCharge, openAccess: oa, discomKwh: remPeak + remOther, discomEnergy, demand, duty, fixed: c.fixedChargesRsMonth, total, lostKwh: delivered - (received.solar + received.battery), shortfallKwh: remPeak + remOther, coverage: c.monthlyKwh > 0 ? plantKwh / c.monthlyKwh : 0 };
}

export function savings(c: ConsumerInputs, s: PlantSupply) {
  const now = presentBill(c), next = proposedBill(c, s);
  const monthly = now.total - next.total;
  // Peak-hour saving: present peak energy cost minus what the same peak kWh cost under the proposal.
  const peakNow = now.bands.find((b) => b.band === 'peak')!.rs;
  const peakNeed = c.monthlyKwh * c.todShare.peak;
  const battPeak = Math.min(kwh(s.batteryPeakMwh) * (1 - c.lossFraction), peakNeed);
  const peakNext = battPeak * c.peakBessTariffRsKwh + (peakNeed - battPeak) * (c.rate.peak + c.backupPremiumRsKwh) + kwh(s.batteryPeakMwh) * c.openAccessChargesRsKwh;
  const years = Array.from({ length: Math.max(1, c.contractYears) }, (_, i) => {
    const disc = (1 + c.discomEscalation) ** i, ppa = (1 + c.ppaEscalation) ** i;
    const presentY = (now.energy + now.demand + now.duty + now.fixed) * 12 * disc;
    const proposedY = ((next.discomEnergy + next.demand + next.duty + next.fixed) * disc + (next.plantCharge * ppa) + next.openAccess * disc) * 12;
    return { year: i + 1, present: presentY, proposed: proposedY, saving: presentY - proposedY };
  });
  return {
    present: now, proposed: next, monthlySaving: monthly, annualSaving: monthly * 12, savingPct: now.total > 0 ? monthly / now.total : 0,
    peakSavingMonthly: peakNow - peakNext, years, lifetimeSaving: years.reduce((a, y) => a + y.saving, 0),
    shortfallCostMonthly: next.discomEnergy,
    note: 'Indicative. Depends on the consumer’s actual tariff order, open-access approvals and charges in force; not a guarantee of savings.',
  };
}

export const ILLUSTRATIVE_CONSUMER: ConsumerInputs = {
  name: 'Example industrial consumer', location: 'Andhra Pradesh', receivingVoltageKv: 132, contractDemandKva: 20000, billedDemandKva: 18000,
  monthlyKwh: 6_000_000, todShare: { peak: 0.22, normal: 0.58, offpeak: 0.2 }, rate: { peak: 8.6, normal: 7.4, offpeak: 6.6 },
  demandChargeRsKvaMonth: 475, electricityDutyRsKwh: 0.06, fixedChargesRsMonth: 0,
  contractYears: 25, ppaTariffRsKwh: 4.2, peakBessTariffRsKwh: 6.5, ppaEscalation: 0, discomEscalation: 0.02,
  openAccessChargesRsKwh: 1.1, lossFraction: 0.05, demandReductionKva: 0, backupPremiumRsKwh: 0,
};
