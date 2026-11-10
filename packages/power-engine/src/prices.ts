/**
 * Price inputs used by dispatch and savings. Every value carries its provenance. Defaults are ILLUSTRATIVE placeholders
 * so the model runs — they are not APERC/CERC orders, exchange prices or a consumer's actual tariff.
 */
export type Provenance = 'verified' | 'user' | 'illustrative';
export interface Priced<T> { value: T; provenance: Provenance; source?: string; asOf?: string }

export interface PriceInputs {
  /** Solar PPA tariff to the industrial buyer, ₹/kWh at the delivery point. */
  ppaSolarRsKwh: Priced<number>;
  /** Tariff for BESS-shifted energy delivered in the peak window, ₹/kWh. */
  peakBessRsKwh: Priced<number>;
  /** Uncontracted / merchant sale price by hour of day (24 values), ₹/kWh. */
  merchantRsKwh: Priced<number[]>;
  /** Grid power price when grid charging or firming is allowed, by hour (24), ₹/kWh. */
  gridRsKwh: Priced<number[]>;
  /** Consumer's present tariff energy rate by hour (24), ₹/kWh — from the consumer's bill. */
  consumerTariffRsKwh: Priced<number[]>;
  /** Battery throughput cost used in dispatch to reflect degradation, ₹/kWh discharged. */
  degradationRsKwh: Priced<number>;
  /** Penalty per kWh of contracted energy not delivered (contract term), ₹/kWh. */
  shortfallPenaltyRsKwh: Priced<number>;
  /** Per-kWh open-access / transmission charges borne by the developer on delivered energy (from Module 7), ₹/kWh. */
  deliveryChargeRsKwh: Priced<number>;
}

const hours = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));
const ILL = 'Illustrative placeholder — replace with contract, exchange or bill data';

export const DEFAULT_PRICES: PriceInputs = {
  ppaSolarRsKwh: { value: 4.2, provenance: 'illustrative', source: ILL },
  peakBessRsKwh: { value: 6.5, provenance: 'illustrative', source: ILL },
  merchantRsKwh: { value: hours((h) => (h >= 18 && h < 23 ? 7.5 : h >= 10 && h < 16 ? 2.8 : 4.5)), provenance: 'illustrative', source: ILL },
  gridRsKwh: { value: hours((h) => (h >= 18 && h < 22 ? 8.5 : h >= 22 || h < 6 ? 5.5 : 7.0)), provenance: 'illustrative', source: ILL },
  consumerTariffRsKwh: { value: hours((h) => (h >= 18 && h < 22 ? 8.6 : h >= 22 || h < 6 ? 6.6 : 7.4)), provenance: 'illustrative', source: ILL },
  degradationRsKwh: { value: 0.6, provenance: 'illustrative', source: ILL },
  shortfallPenaltyRsKwh: { value: 1.0, provenance: 'illustrative', source: ILL },
  deliveryChargeRsKwh: { value: 0, provenance: 'illustrative', source: 'Set from the open-access calculator (Module 7)' },
};
