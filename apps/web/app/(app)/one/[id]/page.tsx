'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Card, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Step { key: string; title: string; status: 'done' | 'current' | 'todo'; summary: string; action?: { label: string; href: string } }
interface J { opportunity: { id: string; code: string; title: string; estimatedValue: number | null }; steps: Step[]; note: string }

/** Screen 178 — COLLABIZ ONE journey: one opportunity turned into a capable, coordinated business team. */
export default function OneJourney() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<J>(`/one/${id}`);
  const j = q.data;
  const done = j ? j.steps.filter((s) => s.status === 'done').length : 0;
  return (
    <Screen page={{ key: 'one-journey', title: j ? j.opportunity.title : 'COLLABIZ ONE', access: 'partner' }} description={j ? `${j.opportunity.code} · ${done} of 6 steps done` : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !j ? <LoadingState /> : (
        <>
          <ol className="cz-stepper" aria-label="Journey">{j.steps.map((s) => <li key={s.key} data-state={s.status === 'done' ? 'done' : s.status === 'current' ? 'current' : undefined}>{s.title}</li>)}</ol>
          <div className="cz-stack" style={{ gap: 12 }}>{j.steps.map((s, i) => (
            <Card key={s.key}>
              <div data-step={s.key} data-status={s.status} className="cz-row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="cz-auth-steps" style={{ margin: 0, display: 'block' }}><span style={{ margin: 0, background: s.status === 'done' ? 'var(--cz-green-700)' : s.status === 'current' ? 'var(--cz-navy-700)' : undefined, color: s.status === 'todo' ? undefined : '#fff' }}>{s.status === 'done' ? '✓' : i + 1}</span></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 17, margin: '2px 0 4px' }}>{s.title}</h2>
                  <p className="cz-muted" style={{ margin: 0, fontSize: 14 }}>{s.summary}</p>
                </div>
                {s.action && s.status !== 'todo' && <Link className={`cz-btn cz-btn-sm ${s.status === 'current' ? 'cz-btn-primary' : 'cz-btn-secondary'}`} href={s.action.href}>{s.action.label}</Link>}
              </div>
            </Card>
          ))}</div>
          <Alert tone="info">{j.note}</Alert>
        </>
      )}
    </Screen>
  );
}
