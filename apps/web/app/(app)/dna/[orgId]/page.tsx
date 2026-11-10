'use client';
import { useParams } from 'next/navigation';
import { Card, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Item { label: string; value: string; evidence: 'evidenced' | 'self_declared'; evidenceLabel: string; source: string }
interface D { name: string; city: string | null; verified: boolean; sections: { title: string; items: Item[] }[]; evidencedShare: number; note: string }

/** Business DNA Passport — what a company can do, and which of it is backed by evidence. */
export default function Dna() {
  const { orgId } = useParams<{ orgId: string }>();
  const q = useQuery<D>(`/dna/${orgId}`);
  const d = q.data;
  return (
    <Screen page={{ key: 'dna', title: d ? `${d.name} — Business DNA` : 'Business DNA', access: 'partner' }} description={d ? `${d.city ?? ''}${d.verified ? ' · Verified by Unite' : ''} · ${d.evidencedShare}% of items evidenced` : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          {d.sections.map((s) => (
            <Card key={s.title} title={s.title}>
              {!s.items.length ? <p className="cz-muted" style={{ margin: 0 }}>Nothing recorded.</p> : (
                <ul className="cz-ws-list">{s.items.map((i, k) => (
                  <li key={k} data-dna={i.label}><span><strong>{i.label}</strong> · {i.value}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{i.source}</span></span>
                    <StatusBadge status={i.evidence} tone={i.evidence === 'evidenced' ? 'success' : 'neutral'} label={i.evidenceLabel} /></li>
                ))}</ul>
              )}
            </Card>
          ))}
          <p className="cz-muted" style={{ fontSize: 12.5 }}>{d.note}</p>
        </>
      )}
    </Screen>
  );
}
