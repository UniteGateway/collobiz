/**
 * Hybrid Lab — wind generation, hourly (8,760 or 8,784 h).
 *
 * Bankable wind generation needs measured site data (met mast / LiDAR, ≥ 1 year, long-term corrected). Until that is
 * loaded, a SYNTHETIC series is produced from a monthly mean wind speed at a reference height, a Weibull shape k, a
 * diurnal pattern and hour-to-hour persistence (AR(1) on a Gaussian copula). It is labelled illustrative everywhere.
 *
 *   speed at hub        v_hub = v_ref · (h_hub / h_ref)^α                          (power-law shear)
 *   turbine output      P = powerCurve(v_hub)  per turbine (piecewise-linear table)
 *   plant output        P_plant = N · P · (1 − wake) · (1 − electrical) · availability, capped at the plant AC rating
 *
 * Generation is NEVER computed as capacity × an assumed CUF. A user-supplied hourly series can replace the synthetic one.
 */

export interface WindConfig {
  capacityMw: number;               // plant AC rating (turbines × rating, may be capped by the plant export limit)
  turbineRatingMw: number;
  hubHeightM: number;
  rotorDiameterM: number;
  /** Power curve: wind speed (m/s) → output (fraction of rating). Must start at 0 and be non-decreasing up to rated. */
  powerCurve: [number, number][];
  cutOutMs: number;
  shearExponent: number;            // α
  wakeLoss: number;                 // fraction
  electricalLoss: number;           // fraction (collection + transformer to the POI)
  availability: number;             // fraction
}
export interface WindResource {
  label: string;
  provenance: 'illustrative' | 'measured' | 'dataset';
  referenceHeightM: number;
  /** Monthly mean wind speed at the reference height, m/s (Jan..Dec). */
  monthlyMeanMs: number[];
  weibullK: number;
  /** Diurnal multiplier by local hour (24 values, mean ≈ 1). */
  diurnal: number[];
  /** Hour-to-hour persistence of the anomaly (0–0.99). */
  persistence: number;
}

/** A generic 3.0 MW-class pitch-regulated curve (IEC class II/III shape). Illustrative, not a specific OEM curve. */
export const GENERIC_CURVE_3MW: [number, number][] = [
  [0, 0], [2.9, 0], [3, 0.01], [4, 0.05], [5, 0.12], [6, 0.22], [7, 0.36], [8, 0.52], [9, 0.68], [10, 0.83], [11, 0.94], [12, 0.99], [12.5, 1], [25, 1],
];
export const DEFAULT_WIND: WindConfig = {
  capacityMw: 40, turbineRatingMw: 3, hubHeightM: 120, rotorDiameterM: 140, powerCurve: GENERIC_CURVE_3MW, cutOutMs: 25,
  shearExponent: 0.14, wakeLoss: 0.08, electricalLoss: 0.03, availability: 0.97,
};
/**
 * Illustrative south-Indian inland profile: strong south-west monsoon winds (May–Sep), weak post-monsoon and winter,
 * afternoon/evening maximum. Orders of magnitude only — replace with site measurements.
 */
export const ILLUSTRATIVE_SOUTH_INDIA_WIND: WindResource = {
  label: 'Illustrative south-India inland wind profile (synthetic — not site data)', provenance: 'illustrative', referenceHeightM: 100,
  monthlyMeanMs: [5.0, 4.8, 4.9, 5.3, 7.0, 8.6, 9.0, 8.5, 7.2, 4.9, 4.6, 4.9],
  weibullK: 2.1,
  diurnal: [0.92, 0.9, 0.88, 0.87, 0.86, 0.86, 0.85, 0.86, 0.9, 0.95, 1.0, 1.05, 1.1, 1.14, 1.17, 1.18, 1.17, 1.14, 1.1, 1.06, 1.02, 0.99, 0.96, 0.94],
  persistence: 0.9,
};

export const turbines = (w: WindConfig) => Math.max(0, Math.round(w.capacityMw / w.turbineRatingMw));
export function curveAt(curve: [number, number][], v: number, cutOut: number) {
  if (v >= cutOut || v <= curve[0][0]) return 0;
  for (let i = 1; i < curve.length; i++) {
    const [v1, p1] = curve[i - 1], [v2, p2] = curve[i];
    if (v <= v2) return p1 + ((p2 - p1) * (v - v1)) / (v2 - v1 || 1);
  }
  return curve[curve.length - 1][1];
}

// Deterministic PRNG so the same inputs always give the same series.
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (u: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
// Standard normal CDF (Abramowitz–Stegun 26.2.17).
function phi(x: number) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp((-x * x) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
// Γ(1 + 1/k) by Lanczos, for the Weibull scale from the mean.
function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

export const MONTH_DAYS_FOR = (year: number) => [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const hoursInYear = (year: number) => MONTH_DAYS_FOR(year).reduce((a, d) => a + d, 0) * 24;
export function monthOfHour(h: number, year: number) { let d = Math.floor(h / 24); const md = MONTH_DAYS_FOR(year); for (let m = 0; m < 12; m++) { if (d < md[m]) return m; d -= md[m]; } return 11; }

export interface WindYear { mw: number[]; hubSpeedMs: number[]; mwh: number; cuf: { value: number; denominator: string }; monthlyMwh: number[]; source: string; provenance: WindResource['provenance'] }
export interface WindOptions { year?: number; seed?: number; scale?: number; /** Multiplies speeds in chosen months, e.g. a weak-monsoon stress case. */ monthFactor?: number[] }

/** Hourly wind plant output for a year. */
export function simulateWindYear(w: WindConfig, r: WindResource, o: WindOptions = {}): WindYear {
  const year = o.year ?? 2027, H = hoursInYear(year), n = turbines(w), u = rng(o.seed ?? 20270101);
  const shear = (w.hubHeightM / r.referenceHeightM) ** w.shearExponent;
  const lossFactor = (1 - w.wakeLoss) * (1 - w.electricalLoss) * w.availability;
  const k = r.weibullK, g = gamma(1 + 1 / k);
  const mw: number[] = new Array(H), v: number[] = new Array(H), monthly = new Array(12).fill(0);
  let z = normal(u);
  for (let h = 0; h < H; h++) {
    z = r.persistence * z + Math.sqrt(1 - r.persistence ** 2) * normal(u);
    const m = monthOfHour(h, year), hod = h % 24;
    const mean = r.monthlyMeanMs[m] * (o.scale ?? 1) * (o.monthFactor?.[m] ?? 1) * r.diurnal[hod];
    const lambda = mean / g; // Weibull scale giving this mean
    const q = Math.min(1 - 1e-9, Math.max(1e-9, phi(z)));
    const vRef = lambda * (-Math.log(1 - q)) ** (1 / k); // inverse Weibull CDF of a persistent Gaussian anomaly
    v[h] = vRef * shear;
    mw[h] = Math.min(w.capacityMw, n * w.turbineRatingMw * curveAt(w.powerCurve, v[h], w.cutOutMs) * lossFactor);
    monthly[m] += mw[h];
  }
  const mwh = mw.reduce((a, x) => a + x, 0);
  return { mw, hubSpeedMs: v, mwh, monthlyMwh: monthly, cuf: { value: w.capacityMw > 0 ? mwh / (w.capacityMw * H) : 0, denominator: `${w.capacityMw} MW AC × ${H} h` }, source: r.label, provenance: r.provenance };
}

/** Uses a measured or dataset hourly series (MW at the POI) instead of the synthetic model. */
export function windFromSeries(series: number[], capacityMw: number, label: string, provenance: WindResource['provenance'] = 'measured', year = 2027): WindYear {
  const H = hoursInYear(year);
  if (series.length !== H) throw new Error(`Wind series has ${series.length} values; ${year} needs ${H} hourly values`);
  if (series.some((x) => !Number.isFinite(x) || x < 0 || x > capacityMw * 1.001)) throw new Error('Wind series values must be between 0 and the plant capacity');
  const monthly = new Array(12).fill(0); series.forEach((x, h) => { monthly[monthOfHour(h, year)] += x; });
  const mwh = series.reduce((a, x) => a + x, 0);
  return { mw: [...series], hubSpeedMs: [], mwh, monthlyMwh: monthly, cuf: { value: capacityMw > 0 ? mwh / (capacityMw * H) : 0, denominator: `${capacityMw} MW AC × ${H} h` }, source: label, provenance };
}
