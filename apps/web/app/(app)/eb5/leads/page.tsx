'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ButtonLink, DataTable, LoadingState, Segmented } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, STAGE_GROUPS, day, useEb5 } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface L { id: string; code: string; fullName: string; country: string; relation: string; status?: string; stage?: number; stageLabel?: string; partner?: string; manager?: string | null; followUpOn?: string | null; createdAt: string; duplicate: boolean; readiness?: string }

/** Lead pipeline (staff) or my introductions (partners). */
export default function Eb5Leads() {
  const { has } = useEb5();
  const [q, setQ] = useState(''); const [view, setView] = useState('board');
  const r = useQuery<L[]>('/eb5/leads', { q: q.trim().length > 1 ? q.trim() : undefined });
  const staff = (r.data ?? []).some((l) => l.relation === 'staff');
  const rows = (r.data ?? []).filter((l) => !l.duplicate);
  return (
    <Screen page={{ key: 'eb5-leads', title: 'GO EB5 leads', access: 'authenticated' }} eyebrow="GO EB5" description="Protected introductions and the consultancy pipeline. Signature and payment stages move only when the record exists."
      actions={has('bd_partner', 'referral_consultant', 'business_manager', 'citrus_admin') ? <ButtonLink href="/eb5/leads/new" variant="accent">New lead</ButtonLink> : undefined}>
      <div className="cz-ugp-filters" role="group" aria-label="Lead filters">
        <label className="cz-mini-field" style={{ flex: 1, minWidth: 220 }}>Search<input aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or reference" /></label>
        {staff && <Segmented label="View" value={view} onChange={setView} options={[{ value: 'board', label: 'Pipeline' }, { value: 'list', label: 'List' }]} />}
      </div>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !r.data ? <LoadingState /> : staff && view === 'board' ? (
        <div className="cz-eb5-pipeline" role="list" aria-label="Lead pipeline">
          {STAGE_GROUPS.map(([name, stages]) => { const ls = rows.filter((l) => stages.includes(l.stage ?? 0)); return (
            <section key={name} className="cz-eb5-col" role="listitem" aria-label={`${name}: ${ls.length}`}>
              <h3><span>{name}</span><span>{ls.length}</span></h3>
              {ls.map((l) => <Link key={l.id} href={`/eb5/leads/${l.id}`} className="cz-eb5-card" data-lead={l.code}><strong>{l.fullName}</strong><span>{l.code} · {l.country}</span><span>{l.stageLabel}</span><span>{l.partner}{l.followUpOn ? ` · follow up ${day(l.followUpOn)}` : ''}</span></Link>)}
            </section>
          ); })}
        </div>
      ) : (
        <DataTable rows={r.data} caption="Leads" empty={<p className="cz-muted">No leads yet.</p>} columns={[
          { key: 'c', header: 'Lead', render: (l) => <span><Link href={`/eb5/leads/${l.id}`}>{l.fullName}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{l.code} · {l.country}</span></span> },
          { key: 's', header: 'Status', render: (l) => <Badge s={l.duplicate ? 'review' : l.stageLabel ?? l.status ?? ''} label={l.duplicate ? 'Ownership under review' : l.stageLabel ?? l.status} /> },
          ...(staff ? [{ key: 'p', header: 'Introduced by', render: (l: L) => l.partner ?? '—' }, { key: 'm', header: 'Manager', render: (l: L) => l.manager ?? 'Unassigned' }] : []),
          { key: 'd', header: 'Registered', render: (l) => day(l.createdAt) },
        ]} />
      )}
    </Screen>
  );
}
