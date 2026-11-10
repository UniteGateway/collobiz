'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, LoadingState, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface R { project: string; region: string | null; gaps: { key: string; label: string }[]; note: string; myInterest: { items: string[]; note: string } | null }

/** A project team asking for help — offer what you can provide. */
export default function RescueOffer() {
  const { rid } = useParams<{ rid: string }>();
  const q = useQuery<R>(`/rescue/${rid}`);
  const [f, setF] = useState({ items: [] as string[], note: '' });
  const go = useMutation(async () => { await api.post(`/rescue/${rid}/interest`, f); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'rescue-offer', title: 'A project team needs help', access: 'partner' }} description={d?.project}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <Card>
          <p style={{ marginTop: 0 }}>{d.note}</p>
          {d.myInterest && <Alert tone="success">You offered: {d.myInterest.items.map((k) => d.gaps.find((g) => g.key === k)?.label ?? k).join(', ')}.</Alert>}
          {go.error && <Alert tone="danger">{go.error}</Alert>}
          {d.gaps.map((g) => <Checkbox key={g.key} label={g.label} checked={f.items.includes(g.key)} onChange={(e) => setF({ ...f, items: e.target.checked ? [...f.items, g.key] : f.items.filter((x) => x !== g.key) })} />)}
          <TextArea label="What you can provide" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Button onClick={() => go.run()} loading={go.pending} disabled={!f.items.length || f.note.trim().length < 10}>Offer to help</Button>
        </Card>
      )}
    </Screen>
  );
}
