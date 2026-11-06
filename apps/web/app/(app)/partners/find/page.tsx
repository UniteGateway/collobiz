'use client';
import { useState } from 'react';
import { SECTORS } from '@collabiz/types';
import { EmptyState, LoadingState, Select, TextInput, ButtonLink } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PartnerCard } from '@/components/Teams';
import { useQuery } from '@/lib/hooks';
import { INDIA_STATES } from '@/lib/regions';

/** Screen 055 — Find Collaboration Partners (capability, geography and skill filters). */
export default function FindPartners() {
  const [f, setF] = useState({ q: '', sector: 'solar', region: '' });
  const q = useQuery<any[]>('/partners', f);
  return (
    <Screen id="055" actions={<ButtonLink href="/partners/ai-matches" variant="secondary">AI match suggestions</ButtonLink>}>
      <div className="cz-grid cz-grid-3">
        <Select label="Capability needed (sector)" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
        <Select label="Must cover" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="Any region" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        <TextInput label="Skill or keyword" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No partners with this capability yet" /> : (
        <div className="cz-grid cz-grid-3">{q.data.filter((p) => !p.isMe).map((p) => <PartnerCard key={p.id} p={p} actions={<ButtonLink size="sm" href={`/teams/builder?partner=${p.id}`}>Invite to a team</ButtonLink>} />)}</div>
      )}
    </Screen>
  );
}
