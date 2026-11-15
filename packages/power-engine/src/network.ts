/**
 * Module 6 — voltage & evacuation. Illustrative engineering scenarios: line I²R losses, transformer no-load and load losses,
 * and indicative capital cost by voltage. These are planning estimates, NOT regulated charges (those live in tariff records,
 * Module 7–8) and NOT a substitute for a load-flow study or the transmission utility's connectivity terms.
 *
 *   Line current      I = P / (√3 · V · pf)                         (P in W, V line-to-line in V)
 *   Line loss         P_loss = 3 · I² · R_per_km · L                 (per circuit; split across circuits)
 *   Transformer loss  P_loss = P_noload + P_load,rated · (S / S_rated)²   (no-load loss whenever energised)
 */
import type { ExportVoltage } from './config';

export interface VoltageAssumption { kv: ExportVoltage; ohmPerKm: number; lineCapexCrPerKm: number; bayCapexCr: number; thermalLimitMw: number; label: string }
/** Typical conductor and cost figures per voltage — illustrative orders of magnitude for planning comparisons only. */
export const ILLUSTRATIVE_VOLTAGES: VoltageAssumption[] = [
  { kv: 33, ohmPerKm: 0.27, lineCapexCrPerKm: 0.18, bayCapexCr: 0.6, thermalLimitMw: 20, label: '33 kV (Dog/Wolf class)' },
  { kv: 66, ohmPerKm: 0.2, lineCapexCrPerKm: 0.3, bayCapexCr: 1.2, thermalLimitMw: 45, label: '66 kV' },
  { kv: 110, ohmPerKm: 0.16, lineCapexCrPerKm: 0.55, bayCapexCr: 2.0, thermalLimitMw: 90, label: '110 kV' },
  { kv: 132, ohmPerKm: 0.14, lineCapexCrPerKm: 0.7, bayCapexCr: 2.5, thermalLimitMw: 110, label: '132 kV (Panther class)' },
  { kv: 220, ohmPerKm: 0.07, lineCapexCrPerKm: 1.2, bayCapexCr: 4.5, thermalLimitMw: 250, label: '220 kV (Zebra class)' },
  { kv: 400, ohmPerKm: 0.03, lineCapexCrPerKm: 2.5, bayCapexCr: 12, thermalLimitMw: 700, label: '400 kV (twin Moose)' },
];

export interface Transformer { name: string; mva: number; noLoadLossKw: number; loadLossKwRated: number; capexCrPerMva: number }
export type ConnectivityStatus = 'not_applied' | 'applied' | 'in_principle' | 'granted';
export interface NetworkInputs {
  injectionKv: ExportVoltage; receivingKv: number; lineKm: number; circuits: 1 | 2; powerFactor: number;
  transformers: Transformer[];
  wheelingNetworks: ('STU' | 'DISCOM' | 'ISTS')[];
  interface: 'STU' | 'CTU';
  connectivity: ConnectivityStatus; meteringReady: boolean; schedulingArranged: boolean;
  evacuationCostCr: number; // other evacuation works (land, RoW), user-entered
}
export const DEFAULT_NETWORK: NetworkInputs = {
  injectionKv: 132, receivingKv: 132, lineKm: 18, circuits: 1, powerFactor: 0.98,
  transformers: [{ name: '33/132 kV pooling transformer', mva: 50, noLoadLossKw: 25, loadLossKwRated: 220, capexCrPerMva: 0.12 }],
  wheelingNetworks: ['STU'], interface: 'STU', connectivity: 'not_applied', meteringReady: false, schedulingArranged: false, evacuationCostCr: 3,
};

/** Line loss (MW) for a power flow (MW) on a given voltage. */
export function lineLossMw(pMw: number, v: VoltageAssumption, km: number, circuits: number, pf: number) {
  if (pMw <= 0) return 0;
  const iPerCircuit = (pMw * 1e6) / (Math.sqrt(3) * v.kv * 1e3 * pf) / circuits;
  return (3 * iPerCircuit ** 2 * v.ohmPerKm * km * circuits) / 1e6;
}
export function transformerLossMw(pMw: number, t: Transformer, pf: number, energised = true) {
  const s = pMw / pf;
  return ((energised ? t.noLoadLossKw : 0) + t.loadLossKwRated * (s / t.mva) ** 2) / 1000;
}

export interface NetworkResult {
  kv: ExportVoltage; label: string; lineLossMwh: number; transformerLossMwh: number; lossPct: number; capexCr: number; thermalOk: boolean; peakMw: number;
  lifetimeLossValueCr: number; totalCostCr: number;
}
/**
 * Annual losses from an export profile (MW, any time step) and the indicative capex for each candidate voltage, plus a
 * 25-year comparison (capex + value of lost energy) to rank the options.
 */
export function compareVoltages(exportMw: number[], stepHours: number, n: NetworkInputs, lossValueRsKwh: number, years = 25, discount = 0.09, voltages = ILLUSTRATIVE_VOLTAGES): NetworkResult[] {
  const energy = exportMw.reduce((a, p) => a + p * stepHours, 0);
  const peak = Math.max(0, ...exportMw);
  const annuity = (1 - (1 + discount) ** -years) / discount;
  return voltages.map((v) => {
    let line = 0, tx = 0;
    for (const p of exportMw) {
      line += lineLossMw(p, v, n.lineKm, n.circuits, n.powerFactor) * stepHours;
      for (const t of n.transformers) tx += transformerLossMw(p, t, n.powerFactor) * stepHours;
    }
    const capex = v.lineCapexCrPerKm * n.lineKm * n.circuits + v.bayCapexCr * 2 + n.transformers.reduce((a, t) => a + t.mva * t.capexCrPerMva, 0) + n.evacuationCostCr;
    const lossValue = ((line + tx) * 1000 * lossValueRsKwh) / 1e7 * annuity;
    return { kv: v.kv, label: v.label, lineLossMwh: line, transformerLossMwh: tx, lossPct: energy > 0 ? (line + tx) / energy : 0, capexCr: capex, thermalOk: peak <= v.thermalLimitMw * n.circuits, peakMw: peak, lifetimeLossValueCr: lossValue, totalCostCr: capex + lossValue };
  });
}

export interface NetworkFlag { severity: 'info' | 'warning' | 'critical'; message: string }
/** Approvals and arrangements that are not yet in place — shown wherever results depend on them. */
export function networkFlags(n: NetworkInputs): NetworkFlag[] {
  const f: NetworkFlag[] = [];
  if (n.connectivity !== 'granted') f.push({ severity: 'critical', message: `Grid connectivity is ${n.connectivity.replace(/_/g, ' ')} — export at ${n.injectionKv} kV is not established. Results assume it will be granted.` });
  if (!n.meteringReady) f.push({ severity: 'warning', message: 'Interface/ABT metering is not confirmed.' });
  if (!n.schedulingArranged) f.push({ severity: 'warning', message: 'Scheduling and forecasting arrangements with the load despatch centre are not in place.' });
  if (n.interface === 'STU' && n.wheelingNetworks.includes('ISTS')) f.push({ severity: 'warning', message: 'Connected to the state network (STU): reaching another state needs the state network first, then ISTS. A state connection at 132 kV does not by itself qualify for ISTS connectivity or waivers.' });
  if (n.receivingKv > 33 && n.wheelingNetworks.includes('DISCOM')) f.push({ severity: 'info', message: `The consumer receives at ${n.receivingKv} kV; check whether distribution wheeling and losses apply at that voltage.` });
  return f;
}
