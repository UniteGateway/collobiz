'use client';
import { Card, LoadingState, PageHeader, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface P { key: string; name: string; needs: string; manual: string; connected: boolean }

/** Integrations — outside services COLLABIZ is built to use, whether each is connected, what connecting needs, and the manual route meanwhile. */
export default function Integrations() {
  const q = useQuery<P[]>('/integrations');
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Integrations" breadcrumb="Workspace" description="Each of these needs an account, contract or approval before it can be switched on. Until then the feature tells users it is not connected and offers the manual route below." />
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <ul className="cz-ws-list">{q.data.map((p) => (
          <li key={p.key} data-integration={p.key} style={{ alignItems: 'flex-start' }}>
            <span><strong>{p.name}</strong><br /><span style={{ fontSize: 13.5 }}><strong>Needs:</strong> {p.needs}</span><br /><span className="cz-muted" style={{ fontSize: 13 }}><strong>Meanwhile:</strong> {p.manual}</span></span>
            <StatusBadge status={p.connected ? 'connected' : 'not_connected'} tone={p.connected ? 'success' : 'warning'} label={p.connected ? 'Connected' : 'Not connected'} />
          </li>
        ))}</ul>
      )}</Card>
    </div>
  );
}
