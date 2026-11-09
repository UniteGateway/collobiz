'use client';
import { useState } from 'react';
import { Alert, Button, EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Page { id: string; slug: string; locale: string; kind: string; title: string; body: string; version: number; status: string; updatedAt: string }
interface Rev { id: string; version: number; title: string; note: string | null; createdAt: string }
const EMPTY = { slug: '', locale: 'en-IN', kind: 'help', title: '', body: '', note: '' };

/** Screen 142 — Global content & CMS: versioned help and policy pages with full history. */
export default function Cms() {
  const { me } = useSession();
  const q = useQuery<Page[]>('/admin/content');
  const [sel, setSel] = useState<Page | null>(null);
  const [f, setF] = useState(EMPTY);
  const revs = useQuery<Rev[]>(sel ? `/admin/content/${sel.id}/revisions` : null);
  // The form is filled in the same step that selects a page, so nothing typed straight after a click can be overwritten.
  const choose = (p: Page | null) => { setSel(p); setF(p ? { slug: p.slug, locale: p.locale, kind: p.kind, title: p.title, body: p.body, note: '' } : EMPTY); };
  const save = useMutation(async (publish: boolean) => { const p = await api.put<Page>('/admin/content', { ...f, note: f.note || undefined, publish }); await q.reload(); choose(p); await revs.reload(); return publish ? 'Published.' : 'Draft saved.'; });
  const canPublish = f.kind !== 'policy' || me?.platformRoles.includes('super_admin');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v })); };
  return (
    <Screen id="142" title="Content" description="Help articles and policy pages, in each language. Every save is a new version; policy pages can only be published by a super admin.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <div className="cz-cms">
          <div className="cz-stack" style={{ gap: 10 }}>
            <Button variant="secondary" onClick={() => choose(null)}><Icon name="plus" size={15} />New page</Button>
            {!q.data.length ? <EmptyState icon="documents" title="No pages yet" /> : (
              <ul className="cz-cms-list">{q.data.map((p) => <li key={p.id}><button type="button" aria-current={sel?.id === p.id || undefined} onClick={() => choose(p)}><strong>{p.title}</strong><span className="cz-muted">{p.kind} · {p.locale} · v{p.version} · {p.status}</span></button></li>)}</ul>
            )}
          </div>
          <form className="cz-card cz-sched" onSubmit={(e) => { e.preventDefault(); save.run(false); }} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="cz-sched-wide cz-row" style={{ justifyContent: 'space-between' }}><h2 className="cz-help-h" style={{ margin: 0 }}>{sel ? `Edit · v${sel.version}` : 'New page'}</h2>{sel && <StatusBadge status={sel.status} />}</div>
            {save.data && <div className="cz-sched-wide"><Alert tone="success">{save.data}</Alert></div>}
            {save.error && <div className="cz-sched-wide"><Alert tone="danger">{save.error}</Alert></div>}
            <label>Address (slug)<input className="cz-input" value={f.slug} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); setF((x) => ({ ...x, slug: v })); }} disabled={!!sel} /></label>
            <label>Type<select className="cz-select" value={f.kind} onChange={set('kind')}><option value="help">Help article</option><option value="policy">Policy</option><option value="page">Page</option></select></label>
            <label>Language<select className="cz-select" value={f.locale} onChange={set('locale')} disabled={!!sel}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="ar-AE">Arabic</option><option value="fr-FR">French</option></select></label>
            <label className="cz-sched-wide">Title<input className="cz-input" value={f.title} onChange={set('title')} /></label>
            <label className="cz-sched-wide">Body<textarea className="cz-input" rows={10} value={f.body} onChange={set('body')} /></label>
            <label className="cz-sched-wide">Change note (optional)<input className="cz-input" value={f.note} onChange={set('note')} placeholder="What changed and why" /></label>
            <div className="cz-sched-wide cz-row" style={{ gap: 8 }}>
              <Button type="submit" variant="secondary" loading={save.pending} disabled={f.slug.length < 3 || f.title.trim().length < 3 || f.body.trim().length < 10}>Save draft</Button>
              <Button type="button" onClick={() => save.run(true)} disabled={!canPublish || f.slug.length < 3 || f.title.trim().length < 3 || f.body.trim().length < 10}>Publish</Button>
              {!canPublish && <span className="cz-muted" style={{ fontSize: 13 }}>Policy pages are published by a super admin.</span>}
            </div>
            {sel && revs.data && <div className="cz-sched-wide"><span className="cz-sched-label">History</span><ol className="cz-sheet-audit" style={{ marginTop: 8 }}>{revs.data.map((r) => <li key={r.id}><span className="cz-od-dot" /><div><strong>Version {r.version} — {r.title}</strong><span className="cz-muted">{new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{r.note ? ` · ${r.note}` : ''}</span></div></li>)}</ol></div>}
          </form>
        </div>
      )}
    </Screen>
  );
}
