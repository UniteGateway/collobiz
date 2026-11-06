'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 154 — Collaboration Team Creation (team or named-party consortium). */
function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const kindParam = params.get('kind') === 'consortium' ? 'consortium' : 'team';
  const mine = useQuery<any>('/me/opportunities');
  const [f, setF] = useState({ name: '', purpose: '', kind: kindParam, opportunityId: params.get('opportunity') ?? '' });
  const m = useMutation(async () => { const t = await api.post<any>('/teams', { ...f, opportunityId: f.opportunityId || undefined }); router.push(`/teams/${t.id}/invite`); return t; });
  const opps = [...(mine.data?.owned ?? []), ...(mine.data?.applications ?? []).map((a: any) => a.opportunity)];
  return (
    <Screen id="154" description="The lead organization creates the team, invites partners, sets roles and proposes commercial sharing. Every member signs the team NDA before seeing private details.">
      <Card>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <TextInput label="Team name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={m.fieldErrors.name} />
          <TextArea label="Purpose and scope" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} error={m.fieldErrors.purpose} hint="Shown to invitees before they sign the NDA — keep confidential buyer details out of it" />
          <div className="cz-grid cz-grid-2">
            <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'team', label: 'Collaboration team' }, { value: 'consortium', label: 'Consortium (agreement among named parties)' }]} />
            <Select label="Linked opportunity (optional)" value={f.opportunityId} onChange={(e) => setF({ ...f, opportunityId: e.target.value })} placeholder="None" options={opps.map((o: any) => ({ value: o.id, label: `${o.code} · ${o.title}` }))} />
          </div>
          <Button type="submit" loading={m.pending}>Create and invite partners</Button>
        </form>
      </Card>
    </Screen>
  );
}
export default function NewTeam() { return <Suspense><Inner /></Suspense>; }
