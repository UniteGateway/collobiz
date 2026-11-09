'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { INDIA_STATES, type PricedLine } from '@collabiz/types';
import { Alert, Button, Checkbox, Dialog, Segmented, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface Product { ref: string; name: string; sector: string; price: number; description: string; kind: 'kit' | 'item'; capacityKw?: number; system?: string; offer: { id: string; label: string; name: string } | null }
interface Store { products: Product[]; offers: { id: string; name: string; label: string; terms: string; endsAt: string; maxFreePerOrder: number }[] }
interface Priced { lines: PricedLine[]; subtotal: number; freeValue: number }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const CART_KEY = 'cz-store-cart';
const load = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '{}'); } catch { return {}; } };
const keep = (c: Record<string, number>) => { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* private mode */ } };

/** COLLABIZ online store — Unite Solar kits and energy products, with live offers (e.g. buy one get one). No sign-in needed. */
export default function OnlineStore() {
  const [store, setStore] = useState<Store | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [priced, setPriced] = useState<Priced | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [placed, setPlaced] = useState<{ code: string; message: string; subtotal: number; freeValue: number } | null>(null);
  useEffect(() => { setCart(load()); api.get<Store>('/public/store').then(setStore).catch(() => setErr('The store could not be loaded. Please try again.')); }, []);
  const lines = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([ref, qty]) => ({ ref, qty })), [cart]);
  useEffect(() => {
    keep(cart);
    if (!lines.length) { setPriced(null); return; }
    const h = setTimeout(() => api.post<Priced>('/public/store/price', { lines }).then(setPriced).catch(() => { setCart({}); setPriced(null); }), 200);
    return () => clearTimeout(h);
  }, [cart, lines]);
  const add = (ref: string, d: number) => setCart((c) => ({ ...c, [ref]: Math.max(0, Math.min(100, (c[ref] ?? 0) + d)) }));
  const cats = store ? ['all', ...new Set(store.products.map((p) => p.sector))] : [];
  const list = (store?.products ?? []).filter((p) => cat === 'all' || p.sector === cat);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="cz-container cz-section">
      <p className="cz-eyebrow">COLLABIZ store · by Unite Group</p>
      <h1>Solar and energy-saving products</h1>
      <p style={{ fontSize: 17, color: 'var(--cz-grey-700)', maxWidth: 720 }}>Order online and Unite will call you to confirm delivery, installation and payment. Live offers are applied automatically. Prefer a shop? <Link href="/store/offers">Get an in-store voucher</Link>.</p>
      {store?.offers.map((o) => <Alert key={o.id} tone="success" title={`${o.label} — ${o.name}`}>{o.terms} Ends {new Date(o.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.</Alert>)}
      {err ? <Alert tone="danger">{err}</Alert> : !store ? <Skeleton height={400} /> : placed ? (
        <div className="cz-card cz-stack" style={{ gap: 10, maxWidth: 640 }}>
          <h2>Order {placed.code} received</h2>
          <p style={{ margin: 0 }}>{placed.message}</p>
          <p style={{ margin: 0 }}>To pay: <strong>{rupees(placed.subtotal)}</strong>{placed.freeValue ? <> · free items worth <strong>{rupees(placed.freeValue)}</strong></> : null}</p>
          <div><Button variant="secondary" onClick={() => setPlaced(null)}>Back to the store</Button></div>
        </div>
      ) : (
        <div className="cz-ws-cols" style={{ marginTop: 20 }}>
          <div className="cz-stack" style={{ gap: 14 }}>
            <div className="cz-ws-scroll"><Segmented label="Category" value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'all' ? 'All' : c }))} /></div>
            <div className="cz-product-grid">{list.map((p) => (
              <article key={p.ref} className="cz-product" data-product={p.name}>
                {p.offer && <span className="cz-offer-badge">{p.offer.label}</span>}
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <span className="cz-price">{rupees(p.price)}</span>
                {cart[p.ref] ? (
                  <span className="cz-qty" role="group" aria-label={`Quantity of ${p.name}`}><button type="button" aria-label="One less" onClick={() => add(p.ref, -1)}>−</button><span>{cart[p.ref]}</span><button type="button" aria-label="One more" onClick={() => add(p.ref, 1)}>+</button></span>
                ) : <Button size="sm" onClick={() => add(p.ref, 1)} aria-label={`Add ${p.name} to cart`}>Add to cart</Button>}
              </article>
            ))}</div>
          </div>
          <aside className="cz-ws-side cz-sticky-side" id="cart">
            <div className="cz-card" aria-live="polite">
              <h2 style={{ fontSize: 17 }}>Your cart {count ? `(${count})` : ''}</h2>
              {!priced ? <p className="cz-muted" style={{ margin: 0 }}>Your cart is empty.</p> : (
                <>
                  {priced.lines.map((l) => (
                    <div key={l.ref} className="cz-cart-line" data-cart-line={l.name}>
                      <span>{l.qty} × {l.name}</span><strong>{rupees(l.lineTotal)}</strong>
                      {l.freeQty > 0 && <span className="cz-free" style={{ gridColumn: '1 / -1' }}>+ {l.freeQty} free ({l.promotionName})</span>}
                    </div>
                  ))}
                  <div className="cz-cart-line"><strong>To pay</strong><strong>{rupees(priced.subtotal)}</strong>{priced.freeValue > 0 && <span className="cz-free" style={{ gridColumn: '1 / -1' }}>You get {rupees(priced.freeValue)} free</span>}</div>
                  <Button onClick={() => setCheckout(true)} style={{ width: '100%', marginTop: 10 }}>Place order</Button>
                  <p className="cz-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Prices include GST. Delivery and installation charges, if any, are confirmed on the call before you pay.</p>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      {priced && !placed && <div className="cz-cart-bar"><span><strong>{count} in cart</strong> · {rupees(priced.subtotal)}{priced.freeValue ? ` · ${rupees(priced.freeValue)} free` : ''}</span><Button size="sm" onClick={() => setCheckout(true)}>Place order</Button></div>}
      <Checkout open={checkout} lines={lines} onClose={() => setCheckout(false)} onDone={(r) => { setCheckout(false); setCart({}); setPlaced(r); }} />
    </div>
  );
}

function Checkout({ open, lines, onClose, onDone }: { open: boolean; lines: { ref: string; qty: number }[]; onClose: () => void; onDone: (r: { code: string; message: string; subtotal: number; freeValue: number }) => void }) {
  const [c, setC] = useState({ name: '', phone: '', email: '', address: '', city: '', region: 'IN-MH', pincode: '', referralCode: '', consent: false });
  const place = useMutation(async () => { const r = await api.post<{ code: string; message: string; subtotal: number; freeValue: number }>('/public/store/orders', { lines, customer: { name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, region: c.region, pincode: c.pincode }, consent: c.consent, referralCode: c.referralCode || undefined }); onDone(r); return r; });
  const e = place.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Delivery details">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); place.run(); }} noValidate>
        {place.error && <Alert tone="danger">{place.error}</Alert>}
        <TextInput label="Name" autoComplete="name" value={c.name} onChange={(ev) => setC({ ...c, name: ev.target.value })} error={e['customer.name']} />
        <TextInput label="Mobile number" inputMode="tel" autoComplete="tel" value={c.phone} onChange={(ev) => setC({ ...c, phone: ev.target.value })} error={e['customer.phone']} />
        <TextInput label="E-mail (optional)" type="email" autoComplete="email" value={c.email} onChange={(ev) => setC({ ...c, email: ev.target.value })} error={e['customer.email']} />
        <TextArea label="Delivery address" rows={2} autoComplete="street-address" value={c.address} onChange={(ev) => setC({ ...c, address: ev.target.value })} error={e['customer.address']} />
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="City" value={c.city} onChange={(ev) => setC({ ...c, city: ev.target.value })} error={e['customer.city']} />
          <TextInput label="PIN code" inputMode="numeric" autoComplete="postal-code" value={c.pincode} onChange={(ev) => setC({ ...c, pincode: ev.target.value.replace(/\D/g, '').slice(0, 6) })} error={e['customer.pincode']} />
        </div>
        <Select label="State" value={c.region} onChange={(ev) => setC({ ...c, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        <TextInput label="Referral code (optional)" value={c.referralCode} onChange={(ev) => setC({ ...c, referralCode: ev.target.value.toUpperCase() })} />
        <Checkbox label="I agree to be contacted to confirm this order, and to the offer terms shown on the store." checked={c.consent} onChange={(ev) => setC({ ...c, consent: ev.target.checked })} />
        <div style={{ marginTop: 8 }}><Button type="submit" loading={place.pending} disabled={!c.consent}>Confirm order</Button></div>
        <p className="cz-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>No payment now. Unite calls you to confirm and shares a payment link or collects on delivery.</p>
      </form>
    </Dialog>
  );
}
