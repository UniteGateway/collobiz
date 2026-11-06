'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, ButtonLink, EmptyState, Select, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { MatchCard } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { INDIA_STATES, toMinor } from '@/lib/regions';

/** Screen 057 — AI Partner Match Suggestions (explainable; human decides; consent-gated). */
function Inner() {
  const opportunityId = useSearchParams().get('opportunity') ?? undefined;
  const [f, setF] = useState({ sector: 'solar', region: '', value: '', certs: '' });
  const m = useMutation(() => api.post<any>('/partners/match', opportunityId ? { sector: f.sector, opportunityId } : { sector: f.sector, region: f.region || undefined, value: toMinor(f.value), requiredCertifications: f.certs.split(',').map((c) => c.trim()).filter(Boolean) }));
  return (
    <Screen id="057" description="Ranked on sector, geography, capacity, certifications and verified reputation. Partners who withdrew matching consent are never suggested. Suggestions never create commitments — you decide whom to invite.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }} className="cz-grid cz-grid-4" style={{ alignItems: 'end' }}>
        <Select label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
        <Select label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="Any" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        <TextInput label="Project value ₹" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <Button type="submit" loading={m.pending}>Suggest partners</Button>
      </form>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {m.data && (m.data.suggestions.length ? (
        <>
          {m.data.excludedForConsent > 0 && <p className="cz-muted">{m.data.excludedForConsent} partner(s) excluded because they have not consented to matching.</p>}
          <div className="cz-grid cz-grid-2">{m.data.suggestions.map((s: any) => <MatchCard key={s.partnerId} s={s} actions={<ButtonLink size="sm" href={`/teams/builder?partner=${s.partnerId}&score=${s.score}`}>Accept — invite to team</ButtonLink>} />)}</div>
        </>
      ) : <EmptyState title="No suitable partners found" />)}
    </Screen>
  );
}
export default function AiMatches() { return <Suspense><Inner /></Suspense>; }
