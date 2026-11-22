/** Title, description and link preview for each Unite product page (rendered on the server for search and sharing). */
import type { Metadata } from 'next';
import { appBrand, productUrl } from '@collabiz/types';
import { venturePhoto } from '@/lib/photos';

interface P { slug: string; name: string; tagline: string; summary: string; sector: string }

async function load(slug: string): Promise<P | null> {
  try {
    const r = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/v1/public/products/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as P) : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: 'Unite products', robots: { index: false } };
  const web = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const image = appBrand(p.slug)?.artwork ?? venturePhoto(p.slug, p.sector);
  const canonical = productUrl(p.slug, { productsDomain: process.env.PRODUCTS_DOMAIN || process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN || undefined, webUrl: web });
  const description = p.summary.replace(/\s*www\.[^\s]+$/, '').slice(0, 300);
  return {
    title: { absolute: `${p.name} — ${p.tagline}` }, description, alternates: { canonical },
    openGraph: { type: 'website', title: `${p.name} — ${p.tagline}`, description, url: canonical, siteName: 'Unite Group', images: [{ url: new URL(image, web).toString() }] },
    twitter: { card: 'summary_large_image', title: p.name, description },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
