/**
 * Subdomains for Unite product pages: <subdomain>.<PRODUCTS_DOMAIN> serves /businesses/<slug>.
 * The base domain is configuration (NEXT_PUBLIC_PRODUCTS_DOMAIN), chosen and registered by Unite Group — nothing is
 * registered by the code. Subdomains are the slug unless a shorter, brand-like label is listed here.
 */
const ALIASES: Record<string, string> = {
  'nano-bazar': 'nanobazar', 'goodtime-live': 'goodtime', 'ai-teacher': 'aiteacher', 'digital-seed': 'digitalseed',
  'green-wallet': 'greenwallet', 'ev-saathi': 'evsaathi', 'u-meet': 'umeet', 'real-bricks': 'realbricks', 'hnw-club': 'hnwclub',
  'payslip-app': 'payslip', 'solar-village-mission': 'solarvillage', 'unite-powertek': 'powertek', 'power-partner': 'powerpartner',
  'unite-digital-bank': 'digitalbank', 'universal-trade-coin': 'utc', 'moveon-video': 'moveon', 'unite-learning': 'learning',
  'help-today': 'helptoday', 'unite-biofix': 'biofix', 'unite-aqua': 'aqua', 'unite-cement': 'cement', 'unite-steel': 'steel', 'unite-ply': 'ply', 'unite-carpets': 'carpets', 'unite-furniture': 'furniture',
};
/** Subdomains that belong to the platform itself and never resolve to a product. */
export const RESERVED_SUBDOMAINS = ['www', 'app', 'admin', 'api', 'power', 'mail', 'static', 'cdn', 'status', 'docs', 'auth', 'login'] as const;
/** Pages that are not Unite ventures but have their own subdomain. */
export const SPECIAL_SUBDOMAINS: Record<string, string> = { goeb5: '/go-eb5/apply' };

const SLUG_FOR = Object.fromEntries(Object.entries(ALIASES).map(([slug, sub]) => [sub, slug]));

export function productSubdomain(slug: string): string { return ALIASES[slug] ?? slug; }

/** Path a subdomain's home page shows, or null when it is not a product subdomain. */
export function subdomainPath(sub: string): string | null {
  const s = sub.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) || (RESERVED_SUBDOMAINS as readonly string[]).includes(s)) return null;
  if (SPECIAL_SUBDOMAINS[s]) return SPECIAL_SUBDOMAINS[s];
  return `/businesses/${SLUG_FOR[s] ?? s}`;
}

/** Full URL of a product page: the subdomain when a products domain is configured, otherwise the path on the main site. */
export function productUrl(slug: string, opts: { productsDomain?: string; webUrl?: string; ref?: string } = {}): string {
  const q = opts.ref ? `?ref=${encodeURIComponent(opts.ref)}` : '';
  if (opts.productsDomain) {
    const local = /^localhost(:\d+)?$/.test(opts.productsDomain); // development: sunx.localhost:3000
    return `${local ? 'http' : 'https'}://${productSubdomain(slug)}.${opts.productsDomain}/${q}`;
  }
  return `${opts.webUrl ?? ''}/businesses/${slug}${q}`;
}
