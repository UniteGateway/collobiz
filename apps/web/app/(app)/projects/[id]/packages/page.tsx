'use client';
import { useState } from 'react';
import { PACKAGE_CATEGORIES, PACKAGE_CATEGORY_LABELS, PACKAGE_STATUS_LABELS, SECTORS } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, Dialog, EmptyState, LoadingState, ProgressBar, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ProjectTabs, fmtDate, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Bid { id: string; organization: string; organizationId: string; amount: number; days: number; note: string; status: string }
interface Pkg { id: string; code: string; category: string; categoryLabel: string; title: string; scope: string; budget: number; closesAt: string; status: string; winner: string | null; awardedValue: number | null; awardedOrgId: string | null; progress: number; bids: Bid[] }
interface Res { project: { id: string; code: string; title: string; value: number }; canManage: boolean; totals: { packages: number; budgeted: number; remaining: number; awarded: number; progress: number }; packages: Pkg[]; note: string }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { draft: 'neutral', open: 'info', awarded: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' };

/** Screen 168 — Work packages: split a project into packages, take bids, award, and roll progress up to the project. */
export default function ProjectPackages() {
  const pr = useProject();
  const q = useQuery<Res>(`/projects/${pr.id}/packages`);
  const { me } = useSession();
  const [adding, setAdding] = useState(false);
  const act = useMutation(async (path: string, b: object) => { await api.post(`/projects/${pr.id}/packages/${path}`, b); q.reload(); return true; });
  const prog = useMutation(async (pid: string, progress: number) => { await api.post(`/packages/${pid}/progress`, { progress }); q.reload(); return true; });
  const [pv, setPv] = useState<Record<string, string>>({});
  const d = q.data;
  const myOrg = me?.activeOrg?.id;
  return (
    <Screen page={{ key: 'work-packages', title: 'Work packages', access: 'partner' }} description={d ? `${d.project.code} — ${d.project.title}` : undefined}
      actions={d?.canManage ? <Button onClick={() => setAdding(true)}>Add package</Button> : undefined}>
      <ProjectTabs id={pr.id} role={pr.data?.role} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Project value</span><strong>{rupees(d.project.value)}</strong><small>packages split this — not extra revenue</small></div>
            <div className="cz-figure"><span>In packages</span><strong>{rupees(d.totals.budgeted)}</strong><small>{rupees(d.totals.remaining)} not yet packaged</small></div>
            <div className="cz-figure"><span>Awarded</span><strong>{rupees(d.totals.awarded)}</strong><small>{d.totals.packages} packages</small></div>
            <div className="cz-figure"><span>Progress</span><strong>{d.totals.progress}%</strong><small>weighted by budget</small></div>
          </div>
          {(act.error || prog.error) && <Alert tone="danger">{act.error ?? prog.error}</Alert>}
          {!d.packages.length ? <Card><EmptyState icon="projects" title="No packages yet">{d.canManage ? 'Split civil, electrical, procurement, installation or O&M work into packages and invite verified partners to bid.' : 'The project manager has not split this project.'}</EmptyState></Card> : d.packages.map((w) => (
            <Card key={w.id}>
              <div data-package={w.title} className="cz-stack" style={{ gap: 8 }}>
                <div className="cz-lead-head"><strong>{w.title}</strong><span className="cz-muted">{w.categoryLabel} · {w.code} · budget {rupees(w.budget)}{w.status === 'open' ? ` · bids close ${fmtDate(w.closesAt)}` : ''}</span><span style={{ marginLeft: 'auto' }}><StatusBadge status={w.status} tone={TONE[w.status]} label={PACKAGE_STATUS_LABELS[w.status]} /></span></div>
                <p style={{ margin: 0, fontSize: 14 }}>{w.scope}</p>
                {w.winner && <p style={{ margin: 0, fontSize: 14 }}>Awarded to <strong>{w.winner}</strong> for {rupees(w.awardedValue)}</p>}
                {['in_progress', 'completed'].includes(w.status) && <ProgressBar value={w.status === 'completed' ? 100 : w.progress} label={`Progress ${w.status === 'completed' ? 100 : w.progress}%`} />}
                {d.canManage && w.status === 'draft' && <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => act.run(`${w.id}/status`, { status: 'open' })}>Open for bids</Button><Button size="sm" variant="ghost" onClick={() => act.run(`${w.id}/status`, { status: 'cancelled' })}>Cancel</Button></div>}
                {d.canManage && w.status === 'open' && (w.bids.length ? (
                  <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Bids for {w.title}</caption>
                    <thead><tr><th scope="col">Bidder</th><th scope="col" style={{ textAlign: 'right' }}>Amount</th><th scope="col" style={{ textAlign: 'right' }}>Days</th><th scope="col">Note</th><th scope="col"><span className="cz-sr-only">Action</span></th></tr></thead>
                    <tbody>{w.bids.map((b) => <tr key={b.id} data-bid={b.organization}><td data-label="Bidder"><strong>{b.organization}</strong></td><td data-label="Amount" style={{ textAlign: 'right' }}>{rupees(b.amount)}</td><td data-label="Days" style={{ textAlign: 'right' }}>{b.days}</td><td data-label="Note">{b.note}</td><td data-label=""><Button size="sm" onClick={() => act.run(`${w.id}/award`, { bidId: b.id })}>Award</Button></td></tr>)}</tbody>
                  </table></div>
                ) : <p className="cz-muted" style={{ margin: 0 }}>No bids yet. Eligible verified partners have been notified.</p>)}
                {d.canManage && w.status === 'in_progress' && <div><Button size="sm" variant="secondary" onClick={() => act.run(`${w.id}/status`, { status: 'completed' })}>Mark completed</Button></div>}
                {w.status === 'in_progress' && w.awardedOrgId === myOrg && (
                  <form className="cz-row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); prog.run(w.id, Number(pv[w.id])); }}>
                    <div style={{ width: 160 }}><TextInput label="Your progress (%)" inputMode="numeric" value={pv[w.id] ?? ''} onChange={(e) => setPv({ ...pv, [w.id]: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
                    <Button size="sm" type="submit" disabled={!pv[w.id]}>Update</Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
          <AddPackage open={adding} projectId={pr.id} remaining={d.totals.remaining} onClose={() => setAdding(false)} onDone={() => { setAdding(false); q.reload(); }} />
        </>
      )}
    </Screen>
  );
}

function AddPackage({ open, projectId, remaining, onClose, onDone }: { open: boolean; projectId: string; remaining: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: 'civil', title: '', scope: '', budget: '', closes: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10), sectors: [] as string[], certs: '' });
  const save = useMutation(async () => {
    const r = await api.post(`/projects/${projectId}/packages`, { category: f.category, title: f.title, scope: f.scope, budget: Math.round(Number(f.budget) * 100), closesAt: new Date(`${f.closes}T18:00:00+05:30`).toISOString(), eligibility: { sectors: f.sectors, regions: [], certifications: f.certs.split(',').map((x) => x.trim()).filter(Boolean) } });
    onDone(); return r;
  });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Add a work package">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Category" value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value })} options={PACKAGE_CATEGORIES.map((c) => ({ value: c, label: PACKAGE_CATEGORY_LABELS[c] }))} />
        <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} />
        <TextArea label="Scope" rows={3} value={f.scope} onChange={(ev) => setF({ ...f, scope: ev.target.value })} error={e.scope} />
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="Budget (₹)" inputMode="numeric" value={f.budget} onChange={(ev) => setF({ ...f, budget: ev.target.value.replace(/\D/g, '') })} error={e.budget} hint={`Up to ${rupees(remaining)} left`} />
          <TextInput label="Bids close" type="date" value={f.closes} onChange={(ev) => setF({ ...f, closes: ev.target.value })} error={e.closesAt} />
        </div>
        <ChipSelect legend="Partner sectors (none = any)" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} value={f.sectors} onChange={(v) => setF({ ...f, sectors: v })} max={3} />
        <TextInput label="Required certifications (comma separated, optional)" value={f.certs} onChange={(ev) => setF({ ...f, certs: ev.target.value })} />
        <div><Button type="submit" loading={save.pending} disabled={!f.title || !f.scope || !f.budget}>Save as draft</Button></div>
      </form>
    </Dialog>
  );
}
