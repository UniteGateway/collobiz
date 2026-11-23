/** Sitemap of public pages, including every published Unite product page (subdomain URLs when configured). */
import type { MetadataRoute } from 'next';
import { productUrl } from '@collabiz/types';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const web = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const fixed = ['/', '/about', '/how-it-works', '/businesses', '/join', '/membership', '/opportunities', '/catalogue', '/go-eb5/apply'].map((p) => ({ url: `${web}${p}`, changeFrequency: 'weekly' as const }));
  let products: { slug: string }[] = [];
  try {
    const r = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/v1/public/products`, { cache: 'no-store' });
    if (r.ok) products = await r.json();
  } catch { /* API down: fixed pages only */ }
  const domain = process.env.PRODUCTS_DOMAIN || process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN || undefined;
  return [...fixed, ...products.map((p) => ({ url: productUrl(p.slug, { productsDomain: domain, webUrl: web }), changeFrequency: 'weekly' as const }))];
}
