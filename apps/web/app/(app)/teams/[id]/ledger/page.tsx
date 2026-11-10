'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AGREEMENT_KINDS, AGREEMENT_KIND_LABELS, CONTRIBUTION_KINDS, CONTRIBUTION_KIND_LABELS, DECISION_RULES } from '@collabiz/types';
import { Alert, Button, Card, Dialog, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
interface L { team: { id: string; name: string; lead: string; isLead: boolean }; members: { orgId: string; name: string; role: string; sharePct: number | null }[]; myOrgId: string | null; note: string;
  contributions: { id: string; org: string; orgId: string; kind: string; description: string; pledgedValue: number; deliveredValue: number | null; evidence: string | null; mine: boolean; confirmed: boolean }[];
  ledger: { orgId: string; name: string; pledged: number; delivered: number; deliveredPct: number; agreedSharePct: number | null; flags: string[] }[];
  agreements: { id: string; kind: string; version: number; title: string; decisionRule: string; authority: string; body: string; status: string; approvals: { orgId: string; name: string; approved: boolean }[] }[] }

/** Consortium contributions (pledged vs delivered) and MoU / JV / amendment drafts every member approves. */
export default function TeamLedger() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<L>(`/teams/${id}/ledger`);
  const [dlg, setDlg] = useState<'pledge' | 'agreement' | { deliver: string } | null>(null);
  const act = useMutation(async (path: string) => { await api.post(path, {}); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'team-ledger', title: 'Contributions & MoU', access: 'partner' }} description={d ? `${d.team.name} · lead ${d.team.lead}` : undefined}
      actions={d?.myOrgId ? <span className="cz-row" style={{ gap: 8 }}><Button variant="secondary" onClick={() => setDlg('pledge')}>Record a contribution</Button><Button onClick={() => setDlg('agreement')}>Propose terms</Button></span> : undefined}>
      <TeamTabs id={id} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <Alert tone="info">{d.note}</Alert>
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          <Card title="Contribution ledger">
            <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Pledged and delivered contributions per member</caption>
              <thead><tr><th scope="col">Member</th><th scope="col" style={{ textAlign: 'right' }}>Pledged</th><th scope="col" style={{ textAlign: 'right' }}>Delivered (confirmed)</th><th scope="col" style={{ textAlign: 'right' }}>Share of delivery</th><th scope="col" style={{ textAlign: 'right' }}>Agreed share</th><th scope="col">Flags</th></tr></thead>
              <tbody>{d.ledger.map((l) => <tr key={l.orgId} data-ledger={l.name}><td data-label="Member"><strong>{l.name}</strong></td><td data-label="Pledged" style={{ textAlign: 'right' }}>{rupees(l.pledged)}</td><td data-label="Delivered" style={{ textAlign: 'right' }}>{rupees(l.delivered)}</td><td data-label="Share of delivery" style={{ textAlign: 'right' }}>{l.deliveredPct}%</td><td data-label="Agreed share" style={{ textAlign: 'right' }}>{l.agreedSharePct != null ? `${l.agreedSharePct}%` : '—'}</td><td data-label="Flags" style={{ color: l.flags.length ? 'var(--cz-warning)' : undefined }}>{l.flags.join('; ') || 'None'}</td></tr>)}</tbody>
            </table></div>
            <ul className="cz-ws-list" style={{ marginTop: 14 }}>{d.contributions.map((c) => (
              <li key={c.id} data-contribution={c.description}><span><strong>{c.org}</strong> · {CONTRIBUTION_KIND_LABELS[c.kind]}: {c.description}<br /><span className="cz-muted" style={{ fontSize: 13 }}>Pledged {rupees(c.pledgedValue)}{c.deliveredValue != null ? ` · delivered ${rupees(c.deliveredValue)} (${c.evidence})` : ''}</span></span>
                <StatusBadge status={c.confirmed ? 'confirmed' : c.deliveredValue != null ? 'pending' : 'pledged'} tone={c.confirmed ? 'success' : c.deliveredValue != null ? 'warning' : 'neutral'} label={c.confirmed ? 'Confirmed' : c.deliveredValue != null ? 'To confirm' : 'Pledged'} />
                {c.mine && <Button size="sm" variant="ghost" onClick={() => setDlg({ deliver: c.id })}>Record delivery</Button>}
                {d.team.isLead && !c.mine && c.deliveredValue != null && !c.confirmed && <Button size="sm" onClick={() => act.run(`/team-contributions/${c.id}/confirm`)}>Confirm</Button>}</li>
            ))}</ul>
          </Card>
          {d.agreements.map((a) => (
            <Card key={a.id} title={`${AGREEMENT_KIND_LABELS[a.kind]} v${a.version}: ${a.title}`}>
              <div data-agreement={a.title} className="cz-stack" style={{ gap: 8 }}>
                <span className="cz-row" style={{ gap: 8 }}><StatusBadge status={a.status} tone={a.status === 'approved' ? 'success' : a.status === 'proposed' ? 'info' : 'neutral'} label={a.status === 'approved' ? 'Approved by all members' : a.status === 'proposed' ? 'Waiting for approvals' : 'Superseded'} /></span>
                <p style={{ margin: 0, fontSize: 14 }}><strong>Decisions:</strong> {DECISION_RULES[a.decisionRule]} · <strong>Authority:</strong> {a.authority}</p>
                <pre className="cz-doc">{a.body}</pre>
                <p style={{ margin: 0, fontSize: 13.5 }}>{a.approvals.map((x) => `${x.name} ${x.approved ? '✓' : '…'}`).join(' · ')}</p>
                {a.status === 'proposed' && a.approvals.some((x) => x.orgId === d.myOrgId && !x.approved) && <div><Button size="sm" onClick={() => act.run(`/team-agreements/${a.id}/approve`)}>Approve this text</Button></div>}
              </div>
            </Card>
          ))}
          <Pledge teamId={id} open={dlg === 'pledge'} onClose={() => setDlg(null)} onDone={() => { setDlg(null); q.reload(); }} />
          <Deliver cid={typeof dlg === 'object' && dlg ? dlg.deliver : null} onClose={() => setDlg(null)} onDone={() => { setDlg(null); q.reload(); }} />
          <Agreement teamId={id} open={dlg === 'agreement'} onClose={() => setDlg(null)} onDone={() => { setDlg(null); q.reload(); }} />
        </>
      )}
    </Screen>
  );
}

function Pledge({ teamId, open, onClose, onDone }: { teamId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: 'equipment', description: '', value: '' });
  const save = useMutation(async () => { await api.post(`/teams/${teamId}/contributions`, { kind: f.kind, description: f.description, pledgedValue: Math.round(Number(f.value || 0) * 100) }); onDone(); return true; });
  return (
    <Dialog open={open} onClose={onClose} title="Record a contribution">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={CONTRIBUTION_KINDS.map((k) => ({ value: k, label: CONTRIBUTION_KIND_LABELS[k] }))} />
        <TextInput label="What you will contribute" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <TextInput label="Value (₹)" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} />
        <div><Button type="submit" loading={save.pending} disabled={f.description.length < 5}>Pledge</Button></div>
      </form>
    </Dialog>
  );
}

function Deliver({ cid, onClose, onDone }: { cid: string | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ value: '', evidence: '' });
  const save = useMutation(async () => { await api.post(`/team-contributions/${cid}/deliver`, { deliveredValue: Math.round(Number(f.value || 0) * 100), evidence: f.evidence }); onDone(); return true; });
  return (
    <Dialog open={!!cid} onClose={onClose} title="Record delivery">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Value delivered (₹)" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} />
        <TextInput label="Evidence (log, challan, sign-off)" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>The lead member confirms deliveries before they count in the ledger.</p>
        <div><Button type="submit" loading={save.pending} disabled={!f.value || f.evidence.length < 5}>Save</Button></div>
      </form>
    </Dialog>
  );
}

function Agreement({ teamId, open, onClose, onDone }: { teamId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: 'mou', title: '', decisionRule: 'majority', authority: '', body: '' });
  const save = useMutation(async () => { await api.post(`/teams/${teamId}/agreements`, f); onDone(); return true; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Propose terms">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Type" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })} options={AGREEMENT_KINDS.map((k) => ({ value: k, label: AGREEMENT_KIND_LABELS[k] }))} />
        <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} />
        <Select label="How decisions are made" value={f.decisionRule} onChange={(ev) => setF({ ...f, decisionRule: ev.target.value })} options={Object.entries(DECISION_RULES).map(([value, label]) => ({ value, label }))} />
        <TextInput label="Who may sign and commit for the group" value={f.authority} onChange={(ev) => setF({ ...f, authority: ev.target.value })} error={e.authority} />
        <TextArea label="Terms" rows={6} value={f.body} onChange={(ev) => setF({ ...f, body: ev.target.value })} error={e.body} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>A draft until every member approves this exact text. Have it reviewed and signed formally where the law requires.</p>
        <div><Button type="submit" loading={save.pending}>Propose</Button></div>
      </form>
    </Dialog>
  );
}
