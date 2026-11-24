'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CHANNEL_ROLES } from '@collabiz/types';
import { ErrorState, LoadingState } from '@collabiz/ui';
import { ChannelApplyForm, ChannelMatcher } from '@/components/BrandChannels';
import { useQuery } from '@/lib/hooks';
import { PageHero } from '@/components/PageHero';

interface P { slug: string; logo?: string | null; heroImage?: string | null; name: string; tagline: string; roles: string[]; buyers: string; oem: { status: string; partner: string | null } | null }

function Inner() {
  const q = useQuery<{ items: P[] }>('/public/brand-products');
  const sp = useSearchParams();
  const [pick, setPick] = useState<{ product?: string; role?: string; type?: string; sizes?: { warehouse: string; showroom: string } }>({});
  useEffect(() => { const product = sp.get('product') ?? undefined; if (product) setPick({ product, role: sp.get('role') ?? undefined, type: sp.get('type') ?? undefined }); }, [sp]);
  return (
    <div className="cz-page" data-screen="partner-with-unite">
      <PageHero layout="split" tone="earth" image="trade-warehouse-team" second="/photos/sunora-luxe-tin.webp" eyebrow="Sell Unite products" title="Become a Unite distributor, dealer, store or franchise."
        lead="Unite brand products are made by established manufacturers and sold through partners like you. Find the product and role that fit your business, then apply in two minutes."
        actions={<><a href="#fit-h" className="cz-btn cz-btn-accent cz-btn-lg">Find my fit</a><a href="#apply" className="cz-btn cz-btn-secondary cz-btn-lg">Apply now</a></>} />
      <div className="cz-container">
      <section aria-labelledby="pp-h">
        <h2 id="pp-h">Unite brand products</h2>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
          <div className="cz-board-grid">{q.data.items.map((p) => (
            <article key={p.slug} className="cz-card cz-board-card" data-brand-product={p.slug}>
              {p.heroImage && <img src={p.heroImage} alt="" className="cz-brand-photo" loading="lazy" />}{p.logo && <img src={p.logo} alt={`${p.name} logo`} className="cz-brand-logo" loading="lazy" />}
              <h3>{p.name}</h3><p className="cz-muted">{p.tagline}. Sold to {p.buyers}.</p>
              <p style={{ fontSize: 14 }}>Partners: {p.roles.map((r) => CHANNEL_ROLES.find((x) => x.code === r)?.label).join(', ')}</p>
              {p.oem && <p className="cz-muted" style={{ fontSize: 13.5 }}>Made under the Unite brand by {p.oem.partner ?? 'an approved manufacturer'} · {p.oem.status}</p>}
              <div className="cz-board-links"><Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/businesses/${p.slug}`}>Product page</Link></div>
            </article>
          ))}</div>
        )}
      </section>
      <section className="cz-card" aria-labelledby="fit-h" style={{ marginTop: 24 }}>
        <h2 id="fit-h" style={{ marginTop: 0 }}>Which product fits my business?</h2>
        <ChannelMatcher onPick={(product, role, type, sizes) => { setPick({ product, role, type, sizes }); document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }); }} />
      </section>
      <section className="cz-card" aria-labelledby="ap-h" id="apply" style={{ marginTop: 24 }}>
        <h2 id="ap-h" style={{ marginTop: 0 }}>Apply</h2>
        <ChannelApplyForm product={pick.product} role={pick.role} businessType={pick.type} sizes={pick.sizes} />
      </section>
      <p className="cz-muted" style={{ marginTop: 16, fontSize: 14 }}>Applying is free. Territories, margins and terms are set in each partner agreement with Unite; nothing here is an offer of a dealership or a promise of income.</p>
      </div>
    </div>
  );
}
export default function PartnerWithUnite() { return <Suspense><Inner /></Suspense>; }
