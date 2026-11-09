/** Direct offers: shared vocabulary for API, web, admin and mobile. */
export const OFFER_KINDS = ['sell_products', 'marketing', 'project_work', 'manpower', 'local_presence', 'partnership'] as const;
export const OFFER_KIND_LABELS: Record<string, string> = {
  sell_products: 'Sell our products', marketing: 'Market our services', project_work: 'Deliver project work',
  manpower: 'Supply manpower', local_presence: 'Represent us locally (office / setup)', partnership: 'Partnership or joint venture',
};
export const OFFER_PRICING = ['unite_price', 'partner_quote', 'either'] as const;
export const OFFER_PRICING_LABELS: Record<string, string> = { unite_price: 'Unite Group sets the price', partner_quote: 'Partners quote their price', either: 'Accept our price or quote yours' };
export const REWARD_MODELS = ['commission', 'revenue_share', 'profit_share', 'equity', 'fixed_fee', 'reseller_margin'] as const;
export const REWARD_LABELS: Record<string, string> = {
  commission: 'Commission on sales', revenue_share: 'Revenue share', profit_share: 'Profit share', equity: 'Equity', fixed_fee: 'Fixed fee', reseller_margin: 'Reseller margin',
};
/** Rewards expressed as a percentage (stored in basis points); the rest are an amount in paise. */
export const PERCENT_REWARDS = new Set(['commission', 'revenue_share', 'profit_share', 'equity', 'reseller_margin']);
/** Rewards that are only indicative until a signed agreement exists in Contracts. */
export const AGREEMENT_REWARDS = new Set(['profit_share', 'equity']);
export const LOOKING_FOR = ['sell_products', 'marketing', 'project_work', 'manpower', 'local_presence', 'partnership', 'distribution'] as const;
export const LOOKING_FOR_LABELS: Record<string, string> = { ...OFFER_KIND_LABELS, distribution: 'Distribution' };
export const PRICE_UNITS = ['lump sum', 'per unit', 'per month', 'per person per month', 'per kW', 'per project'] as const;
/** "Commission on sales · 5%" / "Fixed fee · ₹2,00,000". */
export const rewardText = (model: string, bps?: number | null, amount?: number | null) =>
  `${REWARD_LABELS[model] ?? model}${PERCENT_REWARDS.has(model) ? (bps != null ? ` · ${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%` : '') : amount != null ? ` · ₹${Math.round(amount / 100).toLocaleString('en-IN')}` : ''}`;
