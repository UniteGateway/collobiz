'use client';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { newIdempotencyKey, ApiError } from '@collabiz/types';
import { Alert, Button, Card, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 042 — Apply / Express Interest (atlas: mobile-first). Submission is idempotent. */
export default function ApplyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const opp = useQuery<any>(`/opportunities/${id}`);
  const key = useMemo(newIdempotencyKey, []);
  const [f, setF] = useState({ message: '', proposedValue: '' });
  const [failed, setFailed] = useState<{ label: string; detail: string }[]>([]);
  const m = useMutation(async () => {
    try {
      await api.request('POST', `/opportunities/${id}/apply`, { message: f.message, proposedValue: toMinor(f.proposedValue) }, { idempotencyKey: key });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setFailed(((e.body as any)?.checks ?? []));
      throw e;
    }
    router.push(`/opportunities/${id}`);
    return true;
  });
  return (
    <Screen id="042" description={opp.data ? `${opp.data.code} · ${opp.data.title}` : undefined}>
      <Card>
        {m.error && <Alert tone="danger">{m.error}{failed.length > 0 && <ul>{failed.map((c) => <li key={c.label}>{c.label}: {c.detail}</li>)}</ul>}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <TextArea label="Why your organization? (capability, references, availability)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={m.fieldErrors.message} />
          <TextInput label="Indicative proposed value ₹ (optional)" inputMode="decimal" value={f.proposedValue} onChange={(e) => setF({ ...f, proposedValue: e.target.value })} hint="Non-binding. Formal quotations happen in the tender/RFQ stage." />
          <Button type="submit" variant="accent" loading={m.pending}>Submit application</Button>
        </form>
      </Card>
    </Screen>
  );
}
