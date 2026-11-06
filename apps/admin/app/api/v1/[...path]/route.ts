/**
 * Same-origin API proxy resolved at RUNTIME (API_INTERNAL_URL), so one container image can be promoted
 * between environments. Keeps auth cookies first-party; forwards CSRF/tenant/idempotency headers and bodies.
 */
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
const HOP = new Set(['host', 'connection', 'content-length', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-connection', 'te', 'trailer']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const { path } = await ctx.params;
  const url = `${base}/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  // Client IP comes from the load balancer's X-Forwarded-For (already copied above); never blank it.
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ statusCode: 502, error: 'BadGateway', message: 'The COLLABIZ service is temporarily unavailable. Please try again shortly.' }, { status: 502 });
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie' && k.toLowerCase() !== 'content-encoding') out.set(k, v); });
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
