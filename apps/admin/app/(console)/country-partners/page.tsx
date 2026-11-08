'use client';
import { useState } from 'react';
import { sectorName } from '@collabiz/types';
import { Alert, Button, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface App { id: string; org: string; country: string; countryName: string; sectors: string[]; localEntity: string; localRegistration: string; teamSize: number; plan: string; references: { name: string; contact: string }[]; status: string; decisionReason: string | null; createdAt: string }

/** Country partner applications (supports 120/121): Unite Group decides; never for its own organization. */
export default function CountryPartners() {
  const q = useQuery<{ applications: App[] }>('/global/country-partner/applications');
  return (
    <Screen id="131" title="Country partner applications" description="Approving grants a dated territory and the country-partner level. An exclusive territory can’t overlap another active exclusive one.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.applications.length ? <div className="cz-card"><EmptyState icon="map" title="No applications" /></div> : (
        <ul className="cz-review-list">{q.data.applications.map((a) => <Item key={a.id} a={a} onDone={q.reload} />)}</ul>
      )}
    </Screen>
  );
}

function Item({ a, onDone }: { a: App; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [exclusive, setExclusive] = useState(false);
  const m = useMutation(async (decision: 'approved' | 'rejected') => { await api.post(`/admin/global/country-partner/applications/${a.id}/decision`, { decision, reason, exclusive, months: 24 }); onDone(); return decision; });
  return (
    <li className="cz-card cz-review" data-application={a.id}>
      <div className="cz-review-head"><strong>{a.org} → {a.countryName}</strong><StatusBadge status={a.status} /></div>
      <span className="cz-muted" style={{ fontSize: 13 }}>{a.localEntity} · {a.localRegistration} · team of {a.teamSize} · {a.sectors.map(sectorName).join(', ')}</span>
      <p>{a.plan}</p>
      {a.references.length > 0 && <span className="cz-muted" style={{ fontSize: 13 }}>Reference: {a.references.map((r) => `${r.name} (${r.contact})`).join('; ')}</span>}
      {a.decisionReason && <p className="cz-muted">Decision: {a.decisionReason}</p>}
      {a.status === 'submitted' && (
        <div className="cz-stack" style={{ gap: 8 }}>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <textarea className="cz-input" rows={2} aria-label="Decision reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shared with the applicant (at least 10 characters)" />
          <label className="cz-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />Exclusive territory for these sectors</label>
          <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => m.run('approved')} disabled={reason.trim().length < 10} loading={m.pending}>Approve</Button><Button size="sm" variant="secondary" onClick={() => m.run('rejected')} disabled={reason.trim().length < 10}>Decline</Button></div>
        </div>
      )}
    </li>
  );
}
