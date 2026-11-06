'use client';
import { useState } from 'react';
import { Card, DataTable, DescriptionList, Dialog, Grid, Kpi, StatusBadge, TextInput, LoadingState, Button } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Ev { seq: number; id: string; at: string; action: string; objectType: string; objectId: string | null; reason: string | null; actorEmail: string | null; ip: string | null; hash: string; beforeHash: string | null; afterHash: string | null; before: unknown; after: unknown }

/** Screen 141 — Audit Logs & Security Center. */
export default function AuditPage() {
  const [filters, setFilters] = useState({ action: '', objectType: '', objectId: '' });
  const log = useQuery<Ev[]>('/admin/audit', { ...filters, limit: 200 });
  const chain = useQuery<{ intact: boolean; checked: number; brokenAt: number | null }>('/admin/audit/verify');
  const sec = useQuery<{ failed24h: number; locked: number; admins_without_mfa: number; suspended: number }>('/admin/security/summary');
  const [sel, setSel] = useState<Ev | null>(null);
  return (
    <Screen id="141" description="Append-only, hash-chained record of every consequential action with actor, tenant, object, before/after hashes, IP and request ID.">
      <Grid cols={4}>
        <Kpi label="Chain integrity" value={chain.data ? (chain.data.intact ? 'Intact' : `Broken at #${chain.data.brokenAt}`) : '…'} accent={chain.data?.intact} />
        <Kpi label="Events verified" value={chain.data?.checked ?? '…'} />
        <Kpi label="Failed sign-ins (24 h)" value={sec.data?.failed24h ?? '…'} />
        <Kpi label="Admins without MFA" value={sec.data?.admins_without_mfa ?? '…'} />
      </Grid>
      <Card title="Events">
        <div className="cz-grid cz-grid-3">
          <TextInput label="Action contains" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="e.g. kyb, login" />
          <TextInput label="Object type" value={filters.objectType} onChange={(e) => setFilters({ ...filters, objectType: e.target.value })} placeholder="e.g. user, lead" />
          <TextInput label="Object ID" value={filters.objectId} onChange={(e) => setFilters({ ...filters, objectId: e.target.value })} />
        </div>
        {log.loading ? <LoadingState /> : log.error ? <ApiErrorView error={log.error} onRetry={log.reload} /> : (
          <DataTable caption="Audit events" rows={(log.data ?? []).map((e) => ({ ...e, id: String(e.seq) }))} columns={[
            { key: 'seq', header: '#', render: (e) => <span className="cz-mono">{e.seq}</span> },
            { key: 'at', header: 'Time', render: (e) => new Date(e.at).toLocaleString() },
            { key: 'action', header: 'Action', render: (e) => <StatusBadge status={e.action} tone="brand" label={e.action} /> },
            { key: 'object', header: 'Object', render: (e) => <span className="cz-mono">{e.objectType}{e.objectId ? `:${e.objectId.slice(0, 8)}` : ''}</span> },
            { key: 'actorEmail', header: 'Actor', render: (e) => e.actorEmail ?? 'system' },
            { key: 'reason', header: 'Reason', render: (e) => e.reason ?? '—' },
            { key: 'v', header: '', render: (e) => <Button size="sm" variant="ghost" onClick={() => setSel(e)}>Details</Button> },
          ]} />
        )}
      </Card>
      <Dialog open={!!sel} onClose={() => setSel(null)} title={`Audit event #${sel?.seq ?? ''}`}>
        {sel && <>
          <DescriptionList items={[['Action', sel.action], ['Object', `${sel.objectType} ${sel.objectId ?? ''}`], ['Actor', sel.actorEmail ?? 'system'], ['IP', sel.ip], ['Hash', <span key="h" className="cz-mono" style={{ wordBreak: 'break-all' }}>{sel.hash}</span>]]} />
          <h3 style={{ marginTop: 12 }}>Before</h3><pre className="cz-mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(sel.before, null, 2)}</pre>
          <h3>After</h3><pre className="cz-mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(sel.after, null, 2)}</pre>
          <Button variant="secondary" onClick={() => setSel(null)}>Close</Button>
        </>}
      </Dialog>
    </Screen>
  );
}
