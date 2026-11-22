/**
 * Product subdomains: <subdomain>.<NEXT_PUBLIC_PRODUCTS_DOMAIN> shows that Unite product's page (e.g. sunx.example.com →
 * /businesses/sunx; goeb5.example.com → the GO EB5 online application). Only the home page is rewritten; every other
 * path (assets, /api/v1, links) is served as usual, so forms keep posting to the same-origin API proxy.
 * Without NEXT_PUBLIC_PRODUCTS_DOMAIN this does nothing. DNS (a wildcard record) and TLS are deployment tasks.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { subdomainPath } from '@collabiz/types';

export function proxy(req: NextRequest) {
  const domain = (process.env.PRODUCTS_DOMAIN || process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN || '').toLowerCase();
  if (!domain) return NextResponse.next();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
  if (!host.endsWith(`.${domain}`)) return NextResponse.next();
  const sub = host.slice(0, -(domain.length + 1));
  if (sub.includes('.')) return NextResponse.next(); // one level only
  const target = subdomainPath(sub);
  if (!target || req.nextUrl.pathname !== '/') return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ['/'] };
