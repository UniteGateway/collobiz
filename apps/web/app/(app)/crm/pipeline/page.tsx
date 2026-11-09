'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from '@collabiz/types';
import { Alert, Button, Dialog, Grid, Kpi, LoadingState, Money, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

const LABEL = PIPELINE_STAGE_LABELS;

/** Screen 053 — Sales Pipeline Kanban. Moves use a keyboard-accessible stage selector (no drag-only interaction). */
export default function Pipeline() {
  const q = useQuery<any>('/crm/pipeline');
  const customers = useQuery<any[]>('/crm/customers');
  const [move, setMove] = useState<any>(null);
  const [m, setM] = useState({ stage: '', note: '', lostReason: '' });
  const [create, setCreate] = useState(false);
  const [n, setN] = useState({ customerId: '', title: '', value: '' });
  const doMove = useMutation(async () => { await api.post(`/crm/deals/${move.id}/move`, { stage: m.stage, note: m.note || undefined, lostReason: m.lostReason || undefined, expectedVersion: move.version }); setMove(null); q.reload(); return true; });
  const doCreate = useMutation(async () => { await api.post('/crm/deals', { customerId: n.customerId || customers.data?.[0]?.id, title: n.title, value: toMinor(n.value) }); setCreate(false); setN({ customerId: '', title: '', value: '' }); q.reload(); return true; });
  if (q.loading) return <Screen id="053"><LoadingState /></Screen>;
  if (q.error) return <Screen id="053"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const d = q.data;
  return (
    <Screen id="053" actions={<><Link href="/crm/customers" className="cz-btn cz-btn-secondary">Customers</Link><Button onClick={() => setCreate(true)}>New deal</Button></>}>
      <Grid cols={3}><Kpi label="Open deals" value={d.metrics.open} /><Kpi label="Open pipeline value" value={<Money minor={d.metrics.openValue} />} accent /><Kpi label="Win rate" value={d.metrics.winRate == null ? '—' : `${d.metrics.winRate}%`} /></Grid>
      <div className="cz-kanban" style={{ marginTop: 16 }} role="list" aria-label="Pipeline stages">
        {d.columns.map((c: any) => (
          <section key={c.stage} className="cz-kanban-col" role="listitem" aria-label={`${LABEL[c.stage]}: ${c.deals.length} deals`}>
            <h3><span>{LABEL[c.stage]}</span><span>{c.deals.length}</span></h3>
            <p className="cz-muted" style={{ fontSize: 12, marginTop: -6 }}><Money minor={c.value} /></p>
            {c.deals.map((x: any) => (
              <article key={x.id} className="cz-kanban-card" data-deal={x.title}>
                <strong>{x.title}</strong>
                <div className="cz-muted" style={{ fontSize: 12 }}><Link href={`/crm/customers/${x.customerId}`}>{x.customer}</Link></div>
                <div style={{ fontSize: 13 }}><Money minor={x.value} />{x.owner ? ` · ${x.owner}` : ''}</div>
                {x.lostReason && <div className="cz-muted" style={{ fontSize: 12 }}>Lost: {x.lostReason}</div>}
                {!['won', 'lost'].includes(x.stage) && <Button size="sm" variant="secondary" onClick={() => { setMove(x); setM({ stage: x.stage === 'negotiation' ? 'won' : PIPELINE_STAGES[PIPELINE_STAGES.indexOf(x.stage) + 1], note: '', lostReason: '' }); }}>Move</Button>}
              </article>
            ))}
          </section>
        ))}
      </div>
      <Dialog open={!!move} onClose={() => setMove(null)} title={`Move “${move?.title ?? ''}”`}>
        {doMove.error && <Alert tone="danger">{doMove.error}</Alert>}
        <Select label="New stage" value={m.stage} onChange={(e) => setM({ ...m, stage: e.target.value })} options={PIPELINE_STAGES.filter((s) => s !== move?.stage).map((s) => ({ value: s, label: LABEL[s] }))} />
        {m.stage === 'lost' && <TextInput label="Why was it lost?" value={m.lostReason} onChange={(e) => setM({ ...m, lostReason: e.target.value })} error={doMove.fieldErrors.lostReason} />}
        <TextArea label="Note (recorded in history)" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} />
        <div className="cz-row"><Button onClick={() => doMove.run()} loading={doMove.pending}>Move deal</Button><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button></div>
      </Dialog>
      <Dialog open={create} onClose={() => setCreate(false)} title="New deal">
        {doCreate.error && <Alert tone="danger">{doCreate.error}</Alert>}
        <Select label="Customer" value={n.customerId || customers.data?.[0]?.id || ''} onChange={(e) => setN({ ...n, customerId: e.target.value })} options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.legalName }))} />
        <TextInput label="Deal title" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} error={doCreate.fieldErrors.title} />
        <TextInput label="Value ₹" inputMode="decimal" value={n.value} onChange={(e) => setN({ ...n, value: e.target.value })} />
        <div className="cz-row"><Button onClick={() => doCreate.run()} loading={doCreate.pending}>Create</Button><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button></div>
      </Dialog>
    </Screen>
  );
}
