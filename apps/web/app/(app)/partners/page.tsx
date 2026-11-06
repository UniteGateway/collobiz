'use client';
import { useState } from 'react';
import { PARTNER_TYPES, SECTORS } from '@collabiz/types';
import { EmptyState, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PartnerCard } from '@/components/Teams';
import { useQuery } from '@/lib/hooks';

/** Screen 056 — Partner Directory & Profiles (verified partners; public profile fields only). */
export default function Directory() {
  const [f, setF] = useState({ q: '', sector: '', type: '' });
  const q = useQuery<any[]>('/partners', f);
  return (
    <Screen id="056" description="Verified COLLABIZ partners. Contact details, tax and bank data are never shown here; you connect through team invitations.">
      <div className="cz-grid cz-grid-3">
        <TextInput label="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name, headline or skill" />
        <Select label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
        <Select label="Business type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={PARTNER_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))} />
      </div>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No partners match" /> : <div className="cz-grid cz-grid-3">{q.data.map((p) => <PartnerCard key={p.id} p={p} />)}</div>}
    </Screen>
  );
}
