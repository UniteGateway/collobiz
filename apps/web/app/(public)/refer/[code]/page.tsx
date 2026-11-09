'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { INDIA_STATES, SOLAR_SEGMENT_LABELS } from '@collabiz/types';
import { Alert, Button, Checkbox, Segmented, Select, Skeleton, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface Landing { by: string; subsidy: number; kits: { id: string; name: string; capacityKw: number; price: number }[] }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Public page behind a solar referral link: a friend asks Unite Solar to call them. No sign-in. */
export default function ReferLanding() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<Landing | null>(null);
  const [bad, setBad] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', city: '', region: 'IN-MH', segment: 'residential', bill: '', consent: false });
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { api.get<Landing>(`/public/solar/refer/${code}`).then(setInfo).catch(() => setBad(true)); }, [code]);
  const send = useMutation(async () => {
    const r = await api.post<{ message: string }>(`/public/solar/refer/${code}`, { name: f.name, phone: f.phone, city: f.city, region: f.region, segment: f.segment, monthlyBill: f.bill ? Math.round(Number(f.bill) * 100) : undefined, consent: f.consent });
    setDone(r.message); return r;
  });
  const e = send.fieldErrors;
  return (
    <div className="cz-container cz-section" style={{ maxWidth: 720 }}>
      {bad ? <Alert tone="warning" title="This link is not valid">Ask the person who shared it for their referral link again, or visit the COLLABIZ store.</Alert> : !info ? <Skeleton height={300} /> : (
        <>
          <p className="cz-eyebrow">Unite Solar · invited by {info.by}</p>
          <h1>Cut your electricity bill with rooftop solar</h1>
          <p style={{ fontSize: 17, color: 'var(--cz-grey-700)' }}>{info.by} thinks solar could work for you. Tell us a little about your bill and a Unite Solar adviser will call you with a free estimate. Homes can get up to <strong>{rupees(info.subsidy)}</strong> government subsidy under PM Surya Ghar.</p>
          <div className="cz-figures" style={{ margin: '20px 0' }}>{info.kits.map((k) => <div key={k.id} className="cz-figure"><span>{k.capacityKw} kW on-grid kit</span><strong>{rupees(k.price)}</strong><small>before subsidy, incl. GST</small></div>)}</div>
          {done ? <Alert tone="success" title="Thank you">{done}</Alert> : (
            <form className="cz-card cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); send.run(); }} noValidate>
              <h2 style={{ marginBottom: 8 }}>Ask for a call back</h2>
              {send.error && <Alert tone="danger">{send.error}</Alert>}
              <Segmented label="For" value={f.segment} onChange={(v) => setF({ ...f, segment: v })} options={Object.entries(SOLAR_SEGMENT_LABELS).map(([value, label]) => ({ value, label }))} />
              <div className="cz-grid cz-grid-2" style={{ gap: '0 16px', marginTop: 12 }}>
                <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} error={e.name} />
                <TextInput label="Mobile number" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} error={e.phone} />
                <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} error={e.city} />
                <Select label="State" value={f.region} onChange={(ev) => setF({ ...f, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
                <TextInput label="Monthly electricity bill (₹, optional)" inputMode="numeric" value={f.bill} onChange={(ev) => setF({ ...f, bill: ev.target.value.replace(/\D/g, '') })} />
              </div>
              <Checkbox label="I agree to be contacted by Unite Solar by phone or WhatsApp about solar for my home or business." checked={f.consent} onChange={(ev) => setF({ ...f, consent: ev.target.checked })} />
              {e.consent && <p className="cz-error-text">{e.consent}</p>}
              <div style={{ marginTop: 10 }}><Button type="submit" loading={send.pending} disabled={!f.consent}>Request a call back</Button></div>
              <p className="cz-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Your details are used only to contact you about solar and are not shared outside Unite Group. {info.by} sees your first name and city, not your number.</p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
