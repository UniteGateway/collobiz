/**
 * Module 3 — AC-coupled BESS model. Charge and discharge are AC-side MW at the PCS; the round-trip efficiency is split
 * evenly into charge and discharge efficiencies (ηc = ηd = √RTE) so that energy is conserved:
 *   SOC(t+1) = SOC(t) + ηc · Pcharge · Δt − Pdischarge · Δt / ηd
 * Usable energy is bounded by the reserve floor and the ceiling. Battery discharge is stored solar (or grid) energy,
 * never additional generation.
 */
import { DT_H, type BessConfig } from './config';

export const chargeEff = (b: BessConfig) => Math.sqrt(b.roundTripEfficiency);
export const dischargeEff = (b: BessConfig) => Math.sqrt(b.roundTripEfficiency);

export interface BessState { capacityMwh: number; socMwh: number }
export const socBounds = (b: BessConfig, capacityMwh: number) => ({ min: capacityMwh * b.minSocFraction, max: capacityMwh * b.maxSocFraction });
export const usableMwh = (b: BessConfig, capacityMwh = b.energyMwh) => capacityMwh * (b.maxSocFraction - b.minSocFraction);
export const durationHours = (b: BessConfig) => b.energyMwh / b.powerMw;

/**
 * One interval. Returns what the battery actually did after enforcing exclusivity, power and SOC limits.
 * Requests above what is possible are reduced, never exceeded.
 */
export function stepBess(b: BessConfig, st: BessState, chargeReqMw: number, dischargeReqMw: number) {
  if (chargeReqMw > 1e-9 && dischargeReqMw > 1e-9) throw new Error('BESS cannot charge and discharge in the same interval');
  const { min, max } = socBounds(b, st.capacityMwh);
  const ec = chargeEff(b), ed = dischargeEff(b);
  let charge = 0, discharge = 0;
  if (chargeReqMw > 0) charge = Math.min(chargeReqMw, b.powerMw, Math.max(0, (max - st.socMwh) / (ec * DT_H)));
  if (dischargeReqMw > 0) discharge = Math.min(dischargeReqMw, b.powerMw, Math.max(0, ((st.socMwh - min) * ed) / DT_H));
  const socMwh = st.socMwh + ec * charge * DT_H - (discharge * DT_H) / ed;
  return { charge, discharge, lossMwh: charge * DT_H * (1 - ec) + discharge * DT_H * (1 / ed - 1), next: { ...st, socMwh: Math.min(max, Math.max(min, socMwh)) } };
}

/**
 * Capacity over the project life: calendar fade per year plus cycle fade per equivalent full cycle. When usable capacity
 * falls below the augmentation threshold, modules are added back to nameplate (cost handled by the financial model).
 */
export function capacityTrajectory(b: BessConfig, cyclesPerYear: number, years = 25) {
  const out: { year: number; capacityMwh: number; augmentMwh: number; fadeFraction: number }[] = [];
  let cap = b.energyMwh;
  for (let y = 1; y <= years; y++) {
    let augment = 0;
    if (cap < b.energyMwh * b.augmentationThreshold) { augment = b.energyMwh - cap; cap = b.energyMwh; }
    out.push({ year: y, capacityMwh: cap, augmentMwh: augment, fadeFraction: 1 - cap / b.energyMwh });
    cap = Math.max(0, cap - b.energyMwh * (b.fadePerYear + b.fadePerCycle * cyclesPerYear));
  }
  return out;
}
