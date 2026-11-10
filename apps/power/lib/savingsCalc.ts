import { z } from 'zod';
import { DT_H, savings, type ConsumerInputs } from '@unite/power-engine';
import type { YearSim } from './sim';

const n = z.coerce.number();
export const ConsumerSchema = z.object({
  name: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(120), receivingVoltageKv: n.positive(),
  contractDemandKva: n.positive(), billedDemandKva: n.min(0), monthlyKwh: n.positive(),
  todShare: z.object({ peak: n.min(0).max(1), normal: n.min(0).max(1), offpeak: n.min(0).max(1) }).refine((t) => Math.abs(t.peak + t.normal + t.offpeak - 1) < 0.001, 'ToD shares must add up to 100%'),
  rate: z.object({ peak: n.min(0), normal: n.min(0), offpeak: n.min(0) }),
  demandChargeRsKvaMonth: n.min(0), electricityDutyRsKwh: n.min(0), fixedChargesRsMonth: n.min(0),
  contractYears: n.int().min(1).max(30), ppaTariffRsKwh: n.min(0), peakBessTariffRsKwh: n.min(0), ppaEscalation: n.min(-0.1).max(0.2), discomEscalation: n.min(-0.1).max(0.2),
  openAccessChargesRsKwh: n.min(0), lossFraction: n.min(0).max(0.5), demandReductionKva: n.min(0), backupPremiumRsKwh: n.min(0),
  /** Share of the plant's delivered energy allocated to this consumer (1 = all of it). */
  allocation: n.min(0).max(1).default(1),
});

/** Monthly plant supply for the consumer from the simulated year (average month), scaled by allocation. */
export function supplyFromSim(sim: YearSim, allocation: number) {
  let solar = 0, battery = 0, batteryPeak = 0;
  const p = sim.plant;
  for (const d of sim.days) d.intervals.forEach((it, t) => {
    const h = t * DT_H;
    solar += it.sd * DT_H; battery += it.bd * DT_H;
    if (h >= p.delivery.peakStartHour && h < p.delivery.peakEndHour) batteryPeak += it.bd * DT_H;
  });
  const m = 12 / (sim.days.length / 365) ;
  return { solarMwh: (solar / m) * allocation, batteryMwh: (battery / m) * allocation, batteryPeakMwh: (batteryPeak / m) * allocation };
}

export function computeSavings(c: ConsumerInputs & { allocation: number }, sim: YearSim) {
  const supply = supplyFromSim(sim, c.allocation);
  return { supply, result: savings(c, supply) };
}
