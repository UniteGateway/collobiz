'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, EmptyState, Skeleton, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface Offer { id: string; name: string; label: string; terms: string; endsAt: string; stores: string[] | null; scope: string; sectors: string[] }
interface Voucher { code: string; offer: string; label: string; endsAt: string; stores: string[] | string; message: string }

/** In-store offers: claim a voucher to show at any participating Unite store or franchise. No sign-in needed. */
export default function StoreOffers() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [claiming, setClaiming] = useState<Offer | null>(null);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  useEffect(() => { api.get<Offer[]>('/public/store/offers').then(setOffers).catch(() => setOffers([])); }, []);
  return (
    <div className="cz-container cz-section" style={{ maxWidth: 860 }}>
      <p className="cz-eyebrow">COLLABIZ store · in-store offers</p>
      <h1>Offers at Unite stores</h1>
      <p style={{ fontSize: 17, color: 'var(--cz-grey-700)' }}>Get a voucher here and show it with your mobile number at the store. Shopping online? Offers apply automatically in the <Link href="/store">online store</Link>.</p>
      {voucher && (
        <Alert tone="success" title={`${voucher.label} — ${voucher.offer}`}>
          <span className="cz-code" data-voucher={voucher.code} style={{ display: 'inline-block', margin: '6px 0' }}>{voucher.code}</span><br />
          {voucher.message} Valid until {new Date(voucher.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} at {Array.isArray(voucher.stores) ? voucher.stores.join(', ') : voucher.stores.toLowerCase()}. Take a screenshot of this code.
        </Alert>
      )}
      {!offers ? <Skeleton height={200} /> : !offers.length ? <div className="cz-card"><EmptyState icon="award" title="No in-store offers right now">Check back soon, or browse the online store.</EmptyState></div> : (
        <div className="cz-stack" style={{ gap: 12 }}>{offers.map((o) => (
          <div key={o.id} className="cz-card cz-stack" style={{ gap: 8 }} data-offer={o.name}>
            <span className="cz-offer-badge">{o.label}</span>
            <h2 style={{ margin: 0 }}>{o.name}</h2>
            <p style={{ margin: 0 }}>{o.terms}</p>
            <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{o.scope === 'all' ? 'All products' : o.scope === 'sectors' ? o.sectors.join(', ') : 'Selected products'} · {o.stores ? o.stores.join(', ') : 'All participating stores'} · until {new Date(o.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>
            <div><Button onClick={() => setClaiming(o)}>Get voucher</Button></div>
          </div>
        ))}</div>
      )}
      <Claim offer={claiming} onClose={() => setClaiming(null)} onDone={(v) => { setClaiming(null); setVoucher(v); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </div>
  );
}

function Claim({ offer, onClose, onDone }: { offer: Offer | null; onClose: () => void; onDone: (v: Voucher) => void }) {
  const [f, setF] = useState({ name: '', phone: '', consent: false });
  const claim = useMutation(async () => { const v = await api.post<Voucher>(`/public/store/offers/${offer!.id}/voucher`, f); onDone(v); return v; });
  return (
    <Dialog open={!!offer} onClose={onClose} title={offer ? `Voucher: ${offer.name}` : 'Voucher'}>
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); claim.run(); }} noValidate>
        {claim.error && <Alert tone="danger">{claim.error}</Alert>}
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} error={claim.fieldErrors.name} />
        <TextInput label="Mobile number" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} error={claim.fieldErrors.phone} hint="The store checks this number when you use the voucher" />
        <Checkbox label="I agree to the offer terms. One voucher per mobile number." checked={f.consent} onChange={(ev) => setF({ ...f, consent: ev.target.checked })} />
        <div style={{ marginTop: 8 }}><Button type="submit" loading={claim.pending} disabled={!f.consent}>Get my voucher</Button></div>
      </form>
    </Dialog>
  );
}
