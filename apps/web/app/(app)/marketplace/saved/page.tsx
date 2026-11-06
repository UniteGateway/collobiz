'use client';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { OpportunityCard, type Opp } from '@/components/Opportunities';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 037 — Saved Opportunities & Alerts. */
export default function SavedPage() {
  const q = useQuery<{ opportunities: Opp[]; searches: any[]; unavailable: number }>('/me/saved');
  const del = useMutation(async (id: string) => { await api.delete(`/me/saved-searches/${id}`); q.reload(); return true; });
  const unsave = useMutation(async (id: string) => { await api.delete(`/opportunities/${id}/save`); q.reload(); return true; });
  if (q.loading) return <Screen id="037"><LoadingState /></Screen>;
  if (q.error) return <Screen id="037"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const d = q.data!;
  return (
    <Screen id="037">
      {d.unavailable > 0 && <Alert tone="info">{d.unavailable} saved opportunit{d.unavailable === 1 ? 'y is' : 'ies are'} closed or no longer visible to you.</Alert>}
      <Card title="Saved opportunities">
        {!d.opportunities.length ? <EmptyState title="Nothing saved yet">Use “Save” on any opportunity.</EmptyState> : (
          <div className="cz-grid cz-grid-2">{d.opportunities.map((o) => <div key={o.id}><OpportunityCard o={o} /><Button size="sm" variant="ghost" onClick={() => unsave.run(o.id)}>Remove</Button></div>)}</div>
        )}
      </Card>
      <Card title="Saved searches & alerts">
        <DataTable caption="Saved searches" rows={d.searches} empty={<EmptyState title="No saved searches">Save a search from the marketplace to get alerts.</EmptyState>} columns={[
          { key: 'name', header: 'Name' },
          { key: 'query', header: 'Criteria', render: (s) => Object.entries(s.query).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ') || 'All' },
          { key: 'alert', header: 'Alerts', render: (s) => (s.alert ? 'On' : 'Off') },
          { key: 'lastAlertAt', header: 'Last alert', render: (s) => (s.lastAlertAt ? new Date(s.lastAlertAt).toLocaleString() : '—') },
          { key: 'a', header: '', render: (s) => <Button size="sm" variant="ghost" onClick={() => del.run(s.id)}>Delete</Button> },
        ]} />
      </Card>
    </Screen>
  );
}
