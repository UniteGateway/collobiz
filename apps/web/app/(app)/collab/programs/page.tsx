'use client';
import Link from 'next/link';
import { Alert, Button, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { code: string; title: string; company: string; summary: string; lookingForLabels: string[]; areas: string[]; note?: string; href?: string; open: boolean; watching: boolean }

/** Unite Group programmes — open only after the responsible company approves; ask to be told when one opens. */
export default function Programmes() {
  const q = useQuery<P[]>('/programmes');
  const toggle = useMutation(async (code: string, on: boolean) => { await api.post(`/programmes/${code}/notify-me`, { on }); q.reload(); return true; });
  return (
    <Screen page={{ key: 'collab-programs', title: 'Unite Group programmes', access: 'partner' }} eyebrow="Collab"
      description="Collaboration programmes run by Unite Group companies. A programme opens only after its responsible company approves it — until then you can ask to be told when it opens.">
      {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <div className="cz-prog-list">{q.data.map((p) => (
          <article key={p.code} className="cz-prog-card" data-programme={p.code}>
            <header><div><h2>{p.title}</h2><p className="cz-muted">{p.company}</p></div><StatusBadge status={p.open ? 'active' : 'pending'} label={p.open ? 'Open' : 'Not open yet'} /></header>
            <p>{p.summary}</p>
            <p className="cz-prog-looking"><strong>Looking for:</strong> {p.lookingForLabels.join(', ')}</p>
            <ul className="cz-chips" aria-label="Areas">{p.areas.slice(0, 8).map((a) => <li key={a} className="cz-chip">{a}</li>)}{p.areas.length > 8 && <li className="cz-chip">+{p.areas.length - 8} more</li>}</ul>
            {p.note && <p className="cz-muted" style={{ fontSize: 12.5 }}>{p.note}</p>}
            <div className="cz-row" style={{ gap: 8 }}>
              {p.open ? (p.href ? <Link className="cz-btn cz-btn-primary" href={p.href}>Apply</Link> : <Link className="cz-btn cz-btn-primary" href="/collab">Apply through Collab</Link>)
                : p.watching ? <><StatusBadge status="success" label="We will tell you when it opens" /><Button size="sm" variant="ghost" onClick={() => toggle.run(p.code, false)}>Stop</Button></>
                : <Button size="sm" variant="secondary" onClick={() => toggle.run(p.code, true)}>Notify me when it opens</Button>}
            </div>
          </article>
        ))}</div>
      )}
    </Screen>
  );
}
