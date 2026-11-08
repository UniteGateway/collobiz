'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SECTORS, COUNTRIES } from '@collabiz/types';
import { Alert, Button, EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface App { id: string; country: string; countryName: string; sectors: string[]; status: string; decisionReason: string | null; createdAt: string; org: string }
const STATUS: Record<string, [string, string]> = { submitted: ['Under review', 'info'], approved: ['Approved', 'success'], rejected: ['Not approved', 'warning'], withdrawn: ['Withdrawn', 'neutral'] };

/** Screen 120 — Country partner registration. Unite Group reviews every application. */
export default function CountryPartner() {
  const q = useQuery<{ applications: App[] }>('/global/country-partner/applications');
  const [f, setF] = useState({ country: 'AE', sectors: [] as string[], localEntity: '', localRegistration: '', teamSize: '3', plan: '', refName: '', refContact: '' });
  const m = useMutation(async () => {
    await api.post('/global/country-partner/applications', { country: f.country, sectors: f.sectors, localEntity: f.localEntity, localRegistration: f.localRegistration, teamSize: Number(f.teamSize), plan: f.plan, references: f.refName ? [{ name: f.refName, contact: f.refContact }] : [] });
    await q.reload(); return true;
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (c: string) => setF({ ...f, sectors: f.sectors.includes(c) ? f.sectors.filter((x) => x !== c) : [...f.sectors, c].slice(0, 5) });
  return (
    <Screen id="120" title="Become a country partner" description="Represent the COLLABIZ network in a market outside India: source local demand, partner with Unite Group companies, and earn on the business you bring.">
      <div className="cz-help">
        <form className="cz-card cz-sched" onSubmit={(e) => { e.preventDefault(); m.run(); }} aria-labelledby="cp-h">
          <h2 id="cp-h" className="cz-help-h cz-sched-wide" style={{ margin: 0 }}>Application</h2>
          {m.data && <Alert tone="success" title="Application sent.">Unite Group will review it and reply by notification.</Alert>}
          {m.error && <div className="cz-sched-wide"><Alert tone="danger">{m.error}{Object.values(m.fieldErrors).length ? ` — ${Object.values(m.fieldErrors).join('; ')}` : ''}</Alert></div>}
          <label>Country<select className="cz-select" value={f.country} onChange={set('country')}>{COUNTRIES.filter(([c]) => c !== 'IN').map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <label>Local company<input className="cz-input" value={f.localEntity} onChange={set('localEntity')} placeholder="Registered entity in that country" /></label>
          <label>Registration number<input className="cz-input" value={f.localRegistration} onChange={set('localRegistration')} /></label>
          <fieldset className="cz-sched-wide cz-chipset"><legend>Sectors (up to 5)</legend>{SECTORS.map((sct) => <label key={sct.code} data-on={f.sectors.includes(sct.code) || undefined}><input type="checkbox" checked={f.sectors.includes(sct.code)} onChange={() => toggle(sct.code)} />{sct.name}</label>)}</fieldset>
          <label>Team size<input className="cz-input" inputMode="numeric" value={f.teamSize} onChange={(e) => setF({ ...f, teamSize: e.target.value.replace(/\D/g, '') })} /></label>
          <label>Reference (optional)<input className="cz-input" value={f.refName} onChange={set('refName')} placeholder="Client or partner name" /></label>
          <label>Reference contact<input className="cz-input" value={f.refContact} onChange={set('refContact')} placeholder="Email or phone" /></label>
          <label className="cz-sched-wide">First-year plan<textarea className="cz-input" rows={5} value={f.plan} onChange={set('plan')} placeholder="Who you will serve, which products or services, and what you expect to deliver in the first year (at least 50 characters)." /></label>
          <div className="cz-sched-wide"><Button type="submit" variant="accent" loading={m.pending} disabled={!f.sectors.length || f.plan.trim().length < 50 || !f.localEntity || !f.localRegistration}>Submit application</Button></div>
        </form>
        <section aria-labelledby="my-h">
          <h2 id="my-h" className="cz-help-h">Your applications</h2>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={120} /> : !q.data.applications.length ? <div className="cz-card"><EmptyState icon="map" title="No applications yet" /></div> : (
            <ul className="cz-review-list">{q.data.applications.map((a) => (
              <li key={a.id} className="cz-card cz-review">
                <div className="cz-review-head"><strong>{a.countryName}</strong><StatusBadge status={a.status} tone={STATUS[a.status]?.[1] as never} label={STATUS[a.status]?.[0] ?? a.status} /></div>
                <span className="cz-muted" style={{ fontSize: 13 }}>Sent {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {a.decisionReason && <p>{a.decisionReason}</p>}
                {a.status === 'approved' && <Link href="/global/territory" className="cz-link-arrow">Open your territory<Icon name="arrow" size={14} /></Link>}
              </li>
            ))}</ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
