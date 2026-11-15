'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Alert, Button, ButtonLink, DataTable, Select, Skeleton, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { PartnerGate, STATUS_TONE, inr, usePartner } from '@/components/UniteSolar';

interface Mkt { referralCode: string; referralLink: string; campaigns: { campaign: string; link: string }[]; attribution: { leads: number; byStatus: Record<string, number> }; assets: { id: string; kind: string; title: string; body: string; channel: string | null }[] }
interface Demo { materials: { id: string; name: string; kind: string; ownership: string; unitValue: number; chargeable: boolean; maxPerPartner: number }[]; requests: { id: string; name: string; ownership: string; qty: number; status: string; createdAt: string; partnerActions: string[] }[] }
const OWN: Record<string, string> = { company_owned: 'Unite-owned', partner_owned: 'Yours to keep', returnable: 'Returnable' };
const ACT: Record<string, string> = { confirmed: 'Confirm received', damaged: 'Report damage', returned: 'Mark returned' };

/** Marketing centre — QR referral link with campaign tracking, approved material, demo materials and training. */
export default function Marketing() {
  const p = usePartner();
  return (
    <Screen page={{ key: 'unite-solar-marketing', title: 'Marketing centre', access: 'partner' }} description="Every partner — franchise or store — gets the same marketing kit: referral QR, flyers, digital campaigns, demo materials and training.">
      <PartnerGate p={p} need={(u) => (['approved', 'agreement_signed', 'setup', 'live'].includes(u.status) ? null : 'The marketing centre opens once your application is approved.')}>{(u) => <Centre key={u.id} unitId={u.id} />}</PartnerGate>
    </Screen>
  );
}

function Centre({ unitId }: { unitId: string }) {
  const m = useQuery<Mkt>('/network/marketing');
  const d = useQuery<Demo>('/network/demo');
  const [qr, setQr] = useState<string | null>(null);
  const [req, setReq] = useState({ materialId: '', qty: '1' });
  useEffect(() => { if (m.data) QRCode.toDataURL(m.data.referralLink, { margin: 1, width: 220, color: { dark: '#011E48' } }).then(setQr).catch(() => setQr(null)); }, [m.data]);
  const ask = useMutation(async () => { await api.post(`/network/units/${unitId}/demo-requests`, { materialId: req.materialId, qty: Number(req.qty) }); d.reload(); });
  const step = useMutation(async (id: string, to: string) => { const note = to === 'confirmed' ? undefined : window.prompt(to === 'damaged' ? 'Describe the damage' : 'Return note') ?? undefined; await api.post(`/network/demo/${id}/status`, { to, note }); d.reload(); });
  if (m.error) return <ApiErrorView error={m.error} onRetry={m.reload} />;
  if (!m.data || !d.data) return <Skeleton height={420} />;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <section className="cz-card cz-row" aria-label="Referral QR" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {qr && <img src={qr} alt={`QR code for ${m.data.referralLink}`} width={180} height={180} />}
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Your referral link</h2>
          <p style={{ fontSize: 14, wordBreak: 'break-all' }}><a href={m.data.referralLink}>{m.data.referralLink}</a> · code <strong>{m.data.referralCode}</strong></p>
          <p style={{ fontSize: 14 }}>Customers who enquire through it are attributed to you: <strong>{m.data.attribution.leads}</strong> so far{Object.keys(m.data.attribution.byStatus).length ? ` (${Object.entries(m.data.attribution.byStatus).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}.</p>
          <details><summary style={{ cursor: 'pointer', fontSize: 14 }}>Campaign links</summary><ul style={{ fontSize: 13, wordBreak: 'break-all' }}>{m.data.campaigns.map((c) => <li key={c.campaign}><strong>{c.campaign.replace('_', ' ')}</strong>: {c.link}</li>)}</ul></details>
          {qr && <a href={qr} download={`unite-solar-${m.data.referralCode}.png`}>Download QR for flyers</a>}
        </div>
      </section>
      <section className="cz-card" aria-label="Demo materials">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Demo and display materials</h2>
        <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); ask.run(); }} noValidate>
          <Select label="Material" value={req.materialId} placeholder="Choose" onChange={(e) => setReq({ ...req, materialId: e.target.value })} options={d.data.materials.map((x) => ({ value: x.id, label: `${x.name} — ${OWN[x.ownership]}${x.chargeable ? ` (${inr(x.unitValue)})` : ''}, up to ${x.maxPerPartner}` }))} />
          <TextInput label="Qty" inputMode="numeric" value={req.qty} onChange={(e) => setReq({ ...req, qty: e.target.value.replace(/\D/g, '') })} error={ask.fieldErrors.qty} />
          <Button type="submit" loading={ask.pending} disabled={!req.materialId}>Request</Button>
        </form>
        {(ask.error || step.error) && <Alert tone="danger">{ask.error ?? step.error}</Alert>}
        <DataTable caption="My demo material requests" rows={d.data.requests} columns={[
          { key: 'n', header: 'Material', render: (r) => <>{r.qty} × {r.name}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{OWN[r.ownership]} · {r.createdAt.slice(0, 10)}</span></> },
          { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} label={r.status} /> },
          { key: 'a', header: '', render: (r) => <div className="cz-row" style={{ gap: 6 }}>{r.partnerActions.map((to) => <Button key={to} size="sm" variant={to === 'confirmed' ? 'primary' : 'ghost'} onClick={() => step.run(r.id, to)}>{ACT[to] ?? to}</Button>)}</div> },
        ]} />
      </section>
      <section className="cz-card" aria-label="Approved material">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Flyers, posts and guides</h2>
        {m.data.assets.length ? <ul style={{ fontSize: 14 }}>{m.data.assets.map((a) => <li key={a.id}><strong>{a.title}</strong> <span className="cz-muted">({a.kind}{a.channel ? `, ${a.channel}` : ''})</span></li>)}</ul> : <p className="cz-muted">Unite’s marketing team publishes approved material here.</p>}
        <div className="cz-row" style={{ gap: 8 }}><ButtonLink href="/resources" variant="secondary">All marketing resources</ButtonLink><ButtonLink href="/learning" variant="secondary">Training & certification</ButtonLink></div>
      </section>
    </div>
  );
}
