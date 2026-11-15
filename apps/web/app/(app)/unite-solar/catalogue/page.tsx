'use client';
import { useState } from 'react';
import { Alert, SearchInput, Segmented, Skeleton, EmptyState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { inr, pct, type Product } from '@/components/UniteSolar';


/** Product catalogue — 14 categories with MRP, customer and partner prices, GST/HSN, warranty and the maximum commission. */
export default function Catalogue() {
  const [cat, setCat] = useState(''); const [q, setQ] = useState('');
  const r = useQuery<{ categories: { key: string; label: string; count: number }[]; products: Product[] }>('/network/products', { category: cat || undefined, q: q || undefined });
  return (
    <Screen page={{ key: 'unite-solar-catalogue', title: 'Product catalogue', access: 'partner' }} description="Unite Solar products and kits. Prices are set by Unite; your earning on a sale is either the resale margin (own stock) or the product commission (Unite-fulfilled), never both.">
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : (
        <div className="cz-stack" style={{ gap: 14 }}>
          <SearchInput label="Search products" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU or brand" />
          {r.data && <div className="cz-scroll-x"><Segmented label="Category" value={cat} onChange={setCat} options={[{ value: '', label: 'All' }, ...r.data.categories.filter((c) => c.count || c.key === cat).map((c) => ({ value: c.key, label: `${c.label} (${c.count})` }))]} /></div>}
          {!r.data ? <Skeleton height={300} /> : !r.data.products.length ? <div className="cz-card"><EmptyState title="No products match" /></div> : (
            <div className="cz-us-products">
              {r.data.products.map((p) => (
                <article key={p.id} className="cz-card" aria-label={p.name} data-sku={p.sku}>
                  <span className="cz-muted" style={{ fontSize: 12 }}>{r.data!.categories.find((c) => c.key === p.category)?.label} · {p.sku}</span>
                  <h2 style={{ margin: '4px 0', fontSize: 16 }}>{p.name}</h2>
                  <p style={{ fontSize: 13.5, margin: '0 0 8px' }}>{p.specification}</p>
                  <dl className="cz-us-prices"><dt>Customer price</dt><dd>{inr(p.customerPrice)}</dd><dt>MRP</dt><dd>{inr(p.mrp)}</dd><dt>Partner price</dt><dd>{inr(p.partnerPrice)}</dd><dt>Commission (max)</dt><dd>{pct(p.commissionBps)}</dd></dl>
                  <p className="cz-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{p.brand} · HSN {p.hsn} · GST {pct(p.gstBps)} · warranty {p.warrantyMonths >= 12 ? `${p.warrantyMonths / 12} yr` : `${p.warrantyMonths} mo`}{p.serialised ? ' · serial-tracked' : ''}</p>
                  {p.datasheetUrl && <a href={p.datasheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Datasheet</a>}
                  {p.installation && <p className="cz-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{p.installation}</p>}
                </article>
              ))}
            </div>
          )}
          <Alert tone="info">Prices exclude GST. The commission shown is the maximum for that product; your plan may cap it lower.</Alert>
        </div>
      )}
    </Screen>
  );
}
