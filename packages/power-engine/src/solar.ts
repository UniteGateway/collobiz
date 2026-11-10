/**
 * Module 2 — solar generation engine (physics-based, 15-minute resolution, 8,760 h).
 *
 * Chain per interval: solar position (NOAA approximations) → clear-sky GHI (Haurwitz) scaled to the month's mean daily GHI
 * and a day weather factor → DNI/DHI split (Erbs) → plane-of-array irradiance (isotropic sky, Liu–Jordan) → cell temperature
 * (NOCT model) → DC power with temperature coefficient, DC losses, degradation, availability → inverter efficiency and AC clipping.
 *
 * Weather inputs default to ILLUSTRATIVE monthly values for the latitude. Replace them with PVGIS / NASA POWER data
 * (see `WeatherSource`) before relying on the results. Nothing here is a measured value.
 */
import { DAYS_PER_YEAR, DT_H, STEPS_PER_DAY, type PlantConfig } from './config';

export interface MonthlyClimate {
  /** Mean daily global horizontal irradiation, kWh/m²/day, Jan..Dec. */
  ghiKwhM2Day: number[];
  /** Mean daily ambient temperature min/max, °C, Jan..Dec. */
  tMinC: number[];
  tMaxC: number[];
  /** Day-to-day variability (0..1) of the daily weather factor, Jan..Dec. Monsoon months are higher. */
  variability: number[];
}
export type WeatherSource = { kind: 'illustrative' | 'pvgis' | 'nasa_power' | 'user'; label: string; retrievedAt?: string };

/** Illustrative climate for coastal Andhra Pradesh (~15.8°N). Planning placeholders only — not measured data. */
export const ILLUSTRATIVE_AP_CLIMATE: MonthlyClimate = {
  ghiKwhM2Day: [5.3, 6.0, 6.5, 6.7, 6.5, 5.5, 4.8, 4.9, 5.0, 4.9, 4.8, 4.9],
  tMinC: [19, 21, 24, 27, 28, 27, 26, 26, 25, 24, 21, 19],
  tMaxC: [30, 33, 36, 38, 40, 37, 34, 33, 33, 32, 30, 29],
  variability: [0.08, 0.07, 0.08, 0.1, 0.12, 0.25, 0.3, 0.3, 0.28, 0.25, 0.18, 0.1],
};

export type WeatherScenario = 'typical' | 'sunny' | 'monsoon_heavy' | 'low_production';
/** Multipliers applied to monthly irradiation per scenario (stress cases for planning, not forecasts). */
export const SCENARIO_FACTORS: Record<WeatherScenario, { label: string; all: number; monsoon: number }> = {
  typical: { label: 'Typical year', all: 1, monsoon: 1 },
  sunny: { label: 'Sunny year (+5%)', all: 1.05, monsoon: 1.05 },
  monsoon_heavy: { label: 'Heavy monsoon (Jun–Oct −25%)', all: 1, monsoon: 0.75 },
  low_production: { label: 'Low production year (−12%)', all: 0.88, monsoon: 0.88 },
};
const MONSOON = new Set([5, 6, 7, 8, 9]); // Jun..Oct (0-based)

const RAD = Math.PI / 180;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const monthOfDay = (doy: number) => { let d = doy; for (let m = 0; m < 12; m++) { if (d < MONTH_DAYS[m]) return m; d -= MONTH_DAYS[m]; } return 11; };
export const dateOfDay = (doy: number, year = 2027) => new Date(Date.UTC(year, 0, 1 + doy));

/** Deterministic pseudo-random in [0,1) so scenarios are reproducible. */
function rand(seed: number) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

/** Solar zenith cosine and incidence cosine on the tilted plane for day-of-year and local clock hour. */
export function sunGeometry(doy: number, localHour: number, site: PlantConfig['site']) {
  const g = (2 * Math.PI / 365) * (doy + (localHour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTimeMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const solarTimeH = localHour + (eqTimeMin + 4 * site.longitude - 60 * site.utcOffsetHours) / 60;
  const ha = (solarTimeH - 12) * 15 * RAD;
  const lat = site.latitude * RAD;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  // Incidence on a plane tilted β facing azimuth γ (180 = south), standard Duffie–Beckman form.
  const beta = site.tiltDeg * RAD, gamma = (site.azimuthDeg - 180) * RAD;
  const cosI = Math.sin(decl) * Math.sin(lat) * Math.cos(beta) - Math.sin(decl) * Math.cos(lat) * Math.sin(beta) * Math.cos(gamma)
    + Math.cos(decl) * Math.cos(lat) * Math.cos(beta) * Math.cos(ha) + Math.cos(decl) * Math.sin(lat) * Math.sin(beta) * Math.cos(gamma) * Math.cos(ha)
    + Math.cos(decl) * Math.sin(beta) * Math.sin(gamma) * Math.sin(ha);
  const i0 = 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)); // extraterrestrial normal, W/m²
  return { cosZ, cosI, i0 };
}

/** Haurwitz clear-sky GHI, W/m². */
export const clearSkyGhi = (cosZ: number) => (cosZ > 0.01 ? 1098 * cosZ * Math.exp(-0.057 / cosZ) : 0);

/** Erbs diffuse fraction from clearness index. */
export function erbsDiffuseFraction(kt: number) {
  if (kt <= 0.22) return 1 - 0.09 * kt;
  if (kt <= 0.8) return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  return 0.165;
}

export interface SolarInterval {
  /** Index 0..35039, day of year, interval in day (0..95), local hour at interval start. */
  i: number; doy: number; step: number; hour: number;
  ghi: number; poa: number; tCell: number; // W/m², °C
  dcMw: number; // after DC losses, temperature, degradation, availability
  acPreClipMw: number; // DC × inverter efficiency
  acMw: number; // after AC clipping at the inverter rating
  clippedMw: number;
}
export interface SolarYear {
  intervals: SolarInterval[];
  /** Energy totals, MWh. */
  dcMwh: number; acMwh: number; clippedMwh: number;
  /** CUF on two explicit denominators. */
  cufDc: { value: number; denominator: string };
  cufAc: { value: number; denominator: string };
  monthlyAcMwh: number[];
  peakAcMw: number;
  irradianceScale: number;
  weather: WeatherSource;
}

export interface SolarOptions { year?: number; scenario?: WeatherScenario; climate?: MonthlyClimate; weather?: WeatherSource; operatingYear?: number; irradianceScale?: number }

/** Degradation factor for operating year n (1-based): (1 − firstYear) × (1 − annual)^(n−1). */
export const degradationFactor = (s: PlantConfig['solar'], operatingYear: number) => (1 - s.firstYearDegradation) * (1 - s.annualDegradation) ** Math.max(0, operatingYear - 1);

export function simulateSolarYear(p: PlantConfig, o: SolarOptions = {}): SolarYear {
  const climate = o.climate ?? ILLUSTRATIVE_AP_CLIMATE;
  const scen = SCENARIO_FACTORS[o.scenario ?? 'typical'];
  const scale = o.irradianceScale ?? 1;
  const deg = degradationFactor(p.solar, o.operatingYear ?? 1);
  const { solar, site } = p;
  const beta = site.tiltDeg * RAD;
  const out: SolarInterval[] = new Array(DAYS_PER_YEAR * STEPS_PER_DAY);
  let dc = 0, ac = 0, clip = 0, peak = 0;
  const monthly = new Array(12).fill(0);
  for (let doy = 0; doy < DAYS_PER_YEAR; doy++) {
    const m = monthOfDay(doy);
    // Clear-sky daily irradiation for this day (kWh/m²), to scale the clear-sky shape to the month's mean.
    let csDaily = 0;
    for (let s = 0; s < STEPS_PER_DAY; s++) csDaily += clearSkyGhi(sunGeometry(doy, (s + 0.5) * DT_H, site).cosZ) * DT_H / 1000;
    const monthFactor = scen.all * (MONSOON.has(m) ? scen.monsoon : 1);
    const v = climate.variability[m];
    // Day weather factor: mean 1, spread ±v (deterministic per day), so monthly means are preserved approximately.
    const dayFactor = Math.max(0.15, 1 + v * (2 * rand(doy + 1) - 1) * 1.6);
    const target = climate.ghiKwhM2Day[m] * monthFactor * dayFactor * scale;
    const k = csDaily > 0 ? target / csDaily : 0;
    for (let s = 0; s < STEPS_PER_DAY; s++) {
      const hour = s * DT_H;
      const g = sunGeometry(doy, hour + DT_H / 2, site);
      let ghi = clearSkyGhi(g.cosZ) * k;
      // Intra-day cloud noise grows with variability (monsoon afternoons).
      if (ghi > 0) ghi *= Math.max(0.2, 1 - v * 0.6 * rand(doy * 97 + s));
      let poa = 0;
      if (ghi > 0 && g.cosZ > 0.01) {
        const kt = Math.min(1, ghi / (g.i0 * g.cosZ));
        const dhi = ghi * erbsDiffuseFraction(kt);
        const dni = (ghi - dhi) / g.cosZ;
        poa = Math.max(0, dni * Math.max(0, g.cosI) + dhi * (1 + Math.cos(beta)) / 2 + ghi * site.albedo * (1 - Math.cos(beta)) / 2);
      }
      const tAmb = climate.tMinC[m] + (climate.tMaxC[m] - climate.tMinC[m]) * Math.max(0, Math.sin(((hour - 6) / 18) * Math.PI));
      const tCell = tAmb + poa * (solar.noctC - 20) / 800;
      const dcMw = poa > 0 ? solar.dcMwp * (poa / 1000) * (1 + solar.tempCoeffPerC * (tCell - 25)) * (1 - solar.dcLossFraction) * deg * solar.availability : 0;
      const pre = Math.max(0, dcMw * solar.inverterEfficiency);
      const acMw = Math.min(pre, solar.acMw);
      const i = doy * STEPS_PER_DAY + s;
      out[i] = { i, doy, step: s, hour, ghi, poa, tCell, dcMw: Math.max(0, dcMw), acPreClipMw: pre, acMw, clippedMw: pre - acMw };
      dc += Math.max(0, dcMw) * DT_H; ac += acMw * DT_H; clip += (pre - acMw) * DT_H; monthly[m] += acMw * DT_H;
      if (acMw > peak) peak = acMw;
    }
  }
  const hours = DAYS_PER_YEAR * 24;
  return {
    intervals: out, dcMwh: dc, acMwh: ac, clippedMwh: clip, monthlyAcMwh: monthly, peakAcMw: peak, irradianceScale: scale,
    cufDc: { value: ac / (solar.dcMwp * hours), denominator: `AC energy ÷ (${solar.dcMwp} MWp DC × ${hours} h)` },
    cufAc: { value: ac / (solar.acMw * hours), denominator: `AC energy ÷ (${solar.acMw} MW AC × ${hours} h)` },
    weather: o.weather ?? { kind: 'illustrative', label: 'Illustrative monthly climate for ~15.8°N — replace with PVGIS or NASA POWER data' },
  };
}

/**
 * Finds the irradiance scale at which the plant reaches a target CUF on the chosen basis, by bisection on the weather input
 * (not by scaling output), so clipping and temperature effects stay physical. Used for the 19–22% CUF scenarios.
 */
export function calibrateToCuf(p: PlantConfig, target: number, basis: 'dc' | 'ac', o: Omit<SolarOptions, 'irradianceScale'> = {}) {
  let lo = 0.3, hi = 2.5, best = simulateSolarYear(p, { ...o, irradianceScale: 1 });
  const val = (y: SolarYear) => (basis === 'dc' ? y.cufDc.value : y.cufAc.value);
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    best = simulateSolarYear(p, { ...o, irradianceScale: mid });
    if (Math.abs(val(best) - target) < 1e-5) break;
    if (val(best) < target) lo = mid; else hi = mid;
  }
  const achievable = Math.abs(val(best) - target) < 0.002;
  return { year: best, achievable, note: achievable ? undefined : `A ${(target * 100).toFixed(1)}% ${basis.toUpperCase()} CUF is not reachable with this plant (clipping at ${p.solar.acMw} MW AC limits output).` };
}

/** Daily totals (MWh) from a year of intervals. */
export function dailyTotals(series: number[]) {
  const out: number[] = [];
  for (let d = 0; d < series.length / STEPS_PER_DAY; d++) { let t = 0; for (let s = 0; s < STEPS_PER_DAY; s++) t += series[d * STEPS_PER_DAY + s] * DT_H; out.push(t); }
  return out;
}

/** Hourly 8,760-row profile (average MW of the four 15-minute intervals). */
export function hourlyProfile(y: SolarYear) {
  const out: { hourOfYear: number; doy: number; hour: number; acMw: number; dcMw: number; ghi: number }[] = [];
  for (let h = 0; h < y.intervals.length / 4; h++) {
    const q = y.intervals.slice(h * 4, h * 4 + 4);
    out.push({ hourOfYear: h, doy: q[0].doy, hour: Math.floor(q[0].hour), acMw: q.reduce((a, x) => a + x.acMw, 0) / 4, dcMw: q.reduce((a, x) => a + x.dcMw, 0) / 4, ghi: q.reduce((a, x) => a + x.ghi, 0) / 4 });
  }
  return out;
}
