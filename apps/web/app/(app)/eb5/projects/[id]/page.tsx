'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { id: string; name: string; sponsor: string; regionalCenter: string | null; location: string; sector: string; description: string; offeringStatus: string; investmentThresholdUsd: number | null; linkedClients: number;
  claimsList: { key: string; label: string; status: string; evidence?: string; reviewNote?: string; at?: string }[]; milestones: { at: string; status: string; note: string }[] }

/** One project: evidence-gated claims and offering status. */
export default function Eb5Project() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<P>(`/eb5/projects/${id}`);
  const [ev, setEv] = useState<Record<string, string>>({});
  const [st, setSt] = useState({ offeringStatus: 'in_preparation', note: '' });
  const act = useMutation(async (fn: () => Promise<unknown>) => { await fn(); q.reload(); return true; });
  const p = q.data;
  return (
    <Screen page={{ key: 'eb5-project', title: p?.name ?? 'EB-5 project', access: 'authenticated' }} eyebrow="GO EB5 · Projects">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : <>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        {p.offeringStatus === 'proposed' && <Alert tone="warning" title="Proposed only">Not USCIS-approved, not confirmed as a targeted employment area or rural, and not offering-ready. Do not present it to clients as investable.</Alert>}
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Project">
            <dl className="cz-dl"><dt>Sponsor</dt><dd>{p.sponsor}</dd><dt>Regional center</dt><dd>{p.regionalCenter ?? '—'}</dd><dt>Location</dt><dd>{p.location}</dd><dt>Sector</dt><dd>{p.sector}</dd>
              <dt>Offering status</dt><dd><Badge s={p.offeringStatus === 'proposed' ? 'pending' : p.offeringStatus} label={p.offeringStatus.replace('_', ' ')} /></dd><dt>Clients linked</dt><dd>{p.linkedClients}</dd></dl>
            <p style={{ marginBottom: 0 }}>{p.description}</p>
          </Card>
          <Card title="Offering status">
            {has('citrus_admin', 'business_manager', 'regional_center', 'super_admin') ? <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); act.run(() => api.post(`/eb5/projects/${id}/status`, st)); }}>
              <Select label="Set status" value={st.offeringStatus} onChange={(e) => setSt({ ...st, offeringStatus: e.target.value })} options={[{ value: 'proposed', label: 'Proposed' }, { value: 'in_preparation', label: 'In preparation' }, { value: 'offering', label: 'Offering (all claims verified)' }, { value: 'closed', label: 'Closed' }]} />
              <TextInput label="Note" value={st.note} onChange={(e) => setSt({ ...st, note: e.target.value })} />
              <div><Button type="submit" size="sm">Update status</Button></div>
            </form> : <p className="cz-muted">Managed by the GO EB5 team.</p>}
            <ul className="cz-ws-list" style={{ marginTop: 10 }}>{p.milestones.map((m, i) => <li key={i}><span>{m.status.replace('_', ' ')} — {m.note}</span><span className="cz-muted">{day(m.at)}</span></li>)}</ul>
          </Card>
        </div>
        <Card title="Evidence-gated claims" className="cz-mt">
          <ul className="cz-eb5-gates">{p.claimsList.map((c) => (
            <li key={c.key}>
              <div style={{ flex: '1 1 240px' }}><strong style={{ fontSize: 14 }}>{c.label}</strong>{c.evidence && <div className="cz-muted" style={{ fontSize: 12 }}>Evidence: {c.evidence}{c.reviewNote ? ` · Review: ${c.reviewNote}` : ''}</div>}</div>
              <Badge s={c.status === 'none' ? 'pending' : c.status} label={c.status === 'none' ? 'No evidence' : c.status.replace('_', ' ')} />
              <div className="cz-row" style={{ gap: 6, width: '100%', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}><TextArea label={c.status === 'evidence_submitted' ? 'Verification note' : 'Evidence (document, issuer, date, reference)'} rows={1} value={ev[c.key] ?? ''} onChange={(e) => setEv({ ...ev, [c.key]: e.target.value })} /></div>
                {c.status !== 'evidence_submitted' && has('citrus_admin', 'business_manager', 'regional_center', 'super_admin') && <Button size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/eb5/projects/${id}/claims`, { key: c.key, action: 'submit', evidence: ev[c.key] ?? '' }))}>Submit evidence</Button>}
                {c.status === 'evidence_submitted' && has('compliance', 'super_admin') && <><Button size="sm" onClick={() => act.run(() => api.post(`/eb5/projects/${id}/claims`, { key: c.key, action: 'verify', evidence: ev[c.key] ?? '' }))}>Verify</Button><Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/eb5/projects/${id}/claims`, { key: c.key, action: 'reject', evidence: ev[c.key] ?? '' }))}>Reject</Button></>}
              </div>
            </li>
          ))}</ul>
        </Card>
      </>}
    </Screen>
  );
}
