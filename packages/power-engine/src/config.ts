/**
 * Module 1 — plant configuration. Five capacities are kept distinct because they constrain different things:
 *  - solarDcMwp:          PV module nameplate at STC (DC). Denominator of DC CUF.
 *  - solarAcMw:           PV inverter AC rating. Caps solar output (clipping). Denominator of AC CUF.
 *  - bessPowerMw:         BESS inverter (PCS) AC rating — max charge and discharge rate.
 *  - gridExportMw:        Grid interconnection limit at the point of interconnection (POI) for all energy leaving the plant.
 *  - contractedMw:        Capacity promised to industrial consumers during the delivery window.
 * Values marked `illustrative` are planning assumptions to be replaced with site data; none of them are regulatory rates.
 */

export const EXPORT_VOLTAGES_KV = [33, 66, 110, 132, 220, 400] as const;
export type ExportVoltage = (typeof EXPORT_VOLTAGES_KV)[number];

export interface SiteConfig {
  name: string;
  location: string;
  latitude: number; // degrees north
  longitude: number; // degrees east
  utcOffsetHours: number; // 5.5 for IST
  tiltDeg: number;
  azimuthDeg: number; // 180 = facing south
  albedo: number;
}

export interface SolarConfig {
  dcMwp: number;
  acMw: number;
  /** Module power temperature coefficient, per °C (negative). */
  tempCoeffPerC: number;
  /** Nominal operating cell temperature, °C. */
  noctC: number;
  /** DC-side losses before the inverter (soiling, mismatch, wiring, LID), fraction. */
  dcLossFraction: number;
  /** Inverter conversion efficiency at typical load, fraction. */
  inverterEfficiency: number;
  /** First-year degradation and annual degradation thereafter, fractions. */
  firstYearDegradation: number;
  annualDegradation: number;
  /** Plant availability (outages), fraction. */
  availability: number;
}

export interface BessConfig {
  powerMw: number; // PCS AC rating, 5–35
  energyMwh: number; // nameplate, 20–200
  roundTripEfficiency: number; // AC-to-AC, e.g. 0.88
  minSocFraction: number; // reserve floor
  maxSocFraction: number; // ceiling
  initialSocFraction: number;
  /** Capacity fade per equivalent full cycle and per calendar year, fractions of nameplate. */
  fadePerCycle: number;
  fadePerYear: number;
  /** Augment back to nameplate when usable capacity falls below this share of the original. */
  augmentationThreshold: number;
  maxCyclesPerDay: number;
  /** Whether the BESS may charge from the grid. Defaults to false — solar-only charging. */
  gridChargingAllowed: boolean;
}

export interface DeliveryConfig {
  contractedMw: number; // 17
  windowStartHour: number; // 6
  windowEndHour: number; // 22 (exclusive)
  gridExportMw: number; // 35
  exportVoltageKv: ExportVoltage;
  collectionVoltageKv: number; // 33
  /** Peak (evening) period, used for prices and premium. */
  peakStartHour: number;
  peakEndHour: number;
}

export interface PlantConfig {
  site: SiteConfig;
  solar: SolarConfig;
  bess: BessConfig;
  delivery: DeliveryConfig;
}

export const DEFAULT_PLANT: PlantConfig = {
  site: { name: 'UNITE 40 MW Solar + BESS', location: 'Donakonda, Andhra Pradesh', latitude: 15.83, longitude: 79.48, utcOffsetHours: 5.5, tiltDeg: 15, azimuthDeg: 180, albedo: 0.2 },
  solar: { dcMwp: 40, acMw: 35, tempCoeffPerC: -0.0035, noctC: 45, dcLossFraction: 0.09, inverterEfficiency: 0.98, firstYearDegradation: 0.02, annualDegradation: 0.005, availability: 0.99 },
  bess: { powerMw: 17, energyMwh: 68, roundTripEfficiency: 0.88, minSocFraction: 0.1, maxSocFraction: 0.95, initialSocFraction: 0.1, fadePerCycle: 0.00004, fadePerYear: 0.01, augmentationThreshold: 0.8, maxCyclesPerDay: 1.5, gridChargingAllowed: false },
  delivery: { contractedMw: 17, windowStartHour: 6, windowEndHour: 22, gridExportMw: 35, exportVoltageKv: 132, collectionVoltageKv: 33, peakStartHour: 18, peakEndHour: 22 },
};

export const CUF_SCENARIOS = [0.19, 0.2, 0.21, 0.22] as const;

export interface ConfigIssue { field: string; message: string; severity: 'error' | 'warning' }
/** Checks ranges from the brief and physical consistency between the capacities. */
export function validatePlant(p: PlantConfig): ConfigIssue[] {
  const out: ConfigIssue[] = [];
  const err = (field: string, message: string) => out.push({ field, message, severity: 'error' });
  const warn = (field: string, message: string) => out.push({ field, message, severity: 'warning' });
  if (!(p.solar.dcMwp > 0)) err('solar.dcMwp', 'Must be more than 0');
  if (!(p.solar.acMw > 0)) err('solar.acMw', 'Must be more than 0');
  if (p.solar.acMw > p.solar.dcMwp) warn('solar.acMw', 'AC rating above DC — unusual (DC/AC ratio below 1)');
  if (p.bess.powerMw < 5 || p.bess.powerMw > 35) err('bess.powerMw', 'BESS power must be 5–35 MW');
  if (p.bess.energyMwh < 20 || p.bess.energyMwh > 200) err('bess.energyMwh', 'BESS energy must be 20–200 MWh');
  if (!(p.bess.roundTripEfficiency > 0.5 && p.bess.roundTripEfficiency <= 1)) err('bess.roundTripEfficiency', 'Round-trip efficiency must be between 50% and 100%');
  if (!(p.bess.minSocFraction >= 0 && p.bess.minSocFraction < p.bess.maxSocFraction && p.bess.maxSocFraction <= 1)) err('bess.soc', 'Need 0 ≤ minimum SOC < maximum SOC ≤ 100%');
  if (!EXPORT_VOLTAGES_KV.includes(p.delivery.exportVoltageKv)) err('delivery.exportVoltageKv', 'Choose 33, 66, 110, 132, 220 or 400 kV');
  if (p.delivery.contractedMw > p.delivery.gridExportMw) err('delivery.contractedMw', 'Contracted capacity exceeds the grid export limit');
  if (p.bess.powerMw > p.delivery.gridExportMw) warn('bess.powerMw', 'BESS power above the export limit cannot be fully used for export');
  if (p.delivery.windowEndHour <= p.delivery.windowStartHour) err('delivery.window', 'Window end must be after start');
  return out;
}

/** Number of 15-minute intervals per day and per (non-leap) year. */
export const STEPS_PER_HOUR = 4;
export const STEPS_PER_DAY = 96;
export const DT_H = 0.25;
export const DAYS_PER_YEAR = 365;
