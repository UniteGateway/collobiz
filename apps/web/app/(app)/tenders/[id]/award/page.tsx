'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, Select } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TenderTabs, useTender } from '@/components/Tenders';
import { ContractPanel, ContractsTable } from '@/components/Contracts';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 074 — Award, LOI & Work Order: award documents drafted from the award, reviewed by a second person and signed by both parties. */
export default function AwardDocuments() {
  const t = useTender();
  const d = t.data;
  const list = useQuery<any[]>(d ? `/contracts?tenderId=${t.id}` : null);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState('loi');
  const create = useMutation(async () => { const c = await api.post<any>(`/tenders/${t.id}/contracts`, { kind }); list.reload(); setOpen(c.id); return c; });
  if (t.loading) return <Screen id="074"><LoadingState /></Screen>;
  if (t.error) return <Screen id="074"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const issuer = d.canManage;
  const current = open ?? list.data?.[0]?.id ?? null;
  return (
    <Screen id="074" title={d.title} description="Award documents start from the awarded bid. Each version is reviewed by someone other than its author; an approved version is locked permanently and both parties sign that exact text.">
      <TenderTabs t={d} />
      {d.status !== 'awarded' ? <Alert tone="info">Award documents become available once the tender is awarded.</Alert> : (
        <>
          {issuer && (
            <Card title="Draft an award document">
              {create.error && <Alert tone="danger">{create.error}</Alert>}
              <div className="cz-row" style={{ alignItems: 'flex-end' }}>
                <Select label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'loi', label: 'Letter of Intent' }, { value: 'work_order', label: 'Work Order' }, { value: 'contract', label: 'Contract' }]} />
                <Button onClick={() => create.run()} loading={create.pending}>Create draft from award</Button>
              </div>
            </Card>
          )}
          <Card title="Award documents">
            {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : !list.data!.length
              ? <EmptyState title={issuer ? 'No award documents yet' : 'No documents are ready for you yet'}>{issuer ? 'Create a Letter of Intent or Work Order from the award.' : 'You will be notified when a document is approved and ready to sign.'}</EmptyState>
              : <ContractsTable rows={list.data!} onOpen={setOpen} caption="Award documents" />}
          </Card>
          {current && <ContractPanel key={current} id={current} onChanged={list.reload} />}
        </>
      )}
    </Screen>
  );
}
