'use client';
import { useEffect, useMemo, useState } from 'react';
import { sectorName } from '@collabiz/types';
import { Alert, Button, EmptyState, Icon, Pagination, SearchInput, Segmented, Skeleton, StatusBadge, type IconName } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Row { id: string; code: string; title: string; sector: string; status: string; issuer: string; closesAt: string; publishedAt: string | null; openedAt: string | null; overdueToClose: boolean; submitted: number; withdrawn: number; evaluators: number }
interface Page { items: Row[]; total: number; summary: Record<'all' | 'live' | 'evaluating' | 'awarded' | 'draft' | 'cancelled' | 'closingSoon', number>; attention: { id: string; code: string; title: string; issue: 'overdue_close' | 'no_evaluators'; at: string }[] }

const PAGE = 15;
const STAGE_LABEL: Record<string, string> = { draft: 'Draft', published: 'Accepting bids', closed: 'Closed', opened: 'Bids opened', technical_evaluation: 'Technical evaluation', commercial_evaluation: 'Commercial evaluation', negotiation: 'Negotiation', awarded: 'Awarded', cancelled: 'Cancelled' };
const EVENT_LABEL: Record<string, string> = {
  'tender.created': 'Tender drafted', 'tender.published': 'Published to bidders', 'tender.closed': 'Bidding closed', 'tender.opened': 'Sealed bids opened', 'tender.awarded': 'Tender awarded', 'tender.cancelled': 'Tender cancelled',
  'tender.evaluator_assigned': 'Evaluator assigned', 'tender.technical_scored': 'Technical score recorded', 'tender.commercial_opened': 'Commercial envelopes opened', 'tender.admin_viewed': 'Viewed by platform administrator',
  'bid.submitted': 'Sealed bid submitted', 'bid.withdrawn': 'Bid withdrawn', 'bid.awarded': 'Bid awarded', 'bid.not_awarded': 'Bid not awarded', 'bid.disqualified': 'Bid disqualified',
};
const human = (a: string) => EVENT_LABEL[a] ?? a.split('.').pop()!.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const dt = (d?: string | null, time = false) => (d ? new Date(d).toLocaleString('en-IN', time ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const rel = (d: string) => {
  const days = Math.round((new Date(d).getTime() - Date.now()) / 86400_000);
  return days === 0 ? 'today' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;
};

/** Screen 137 — Tender administration: platform oversight of every tender's lifecycle, seals and audit trail. Never bid content. */
export default function TenderAdmin() {
  const [stage, setStage] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  useEffect(() => setPage(1), [stage, search]);
  const query = useMemo(() => ({ paged: 'true', limit: String(PAGE), offset: String((page - 1) * PAGE), stage, q: search }), [page, stage, search]);
  const q = useQuery<Page>('/admin/tenders', query);
  const d = useQuery<any>(sel ? `/admin/tenders/${sel}` : null);
  useEffect(() => {
    if (!sel) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [sel]);

  const s = q.data?.summary;
  const kpis: { key: string; label: string; value?: number; hint: string; icon: IconName; tone?: 'warn' }[] = [
    { key: 'live', label: 'Accepting bids', value: s?.live, hint: s ? `${s.closingSoon} closing within 7 days` : '', icon: 'tenders' },
    { key: 'evaluating', label: 'In evaluation', value: s?.evaluating, hint: 'Opened, scoring or negotiating', icon: 'audit' },
    { key: 'awarded', label: 'Awarded', value: s?.awarded, hint: 'Contracts follow award', icon: 'award' },
    { key: 'attention', label: 'Need attention', value: q.data?.attention.length, hint: 'Integrity exceptions', icon: 'warning', tone: 'warn' },
  ];

  return (
    <Screen id="137" title="Tenders" description="Oversight of tender integrity across the network. Bids stay sealed and encrypted: you see metadata, seal hashes and the audit trail — never bid content.">
      <div className="cz-ta">
        {/* ---------- KPI strip ---------- */}
        <div className="cz-ta-kpis">
          {kpis.map((k) => (
            <button key={k.key} type="button" className="cz-ta-kpi" data-tone={k.tone && (k.value ?? 0) > 0 ? k.tone : undefined} aria-pressed={k.key !== 'attention' && stage === k.key}
              onClick={() => (k.key === 'attention' ? document.getElementById('ta-attention')?.scrollIntoView({ behavior: 'smooth' }) : setStage(stage === k.key ? '' : k.key))}>
              <span className="cz-ta-kpi-top"><span>{k.label}</span><Icon name={k.icon} size={16} /></span>
              <strong>{k.value ?? <Skeleton height={28} width={48} />}</strong>
              <span className="cz-ta-kpi-hint">{k.hint}</span>
            </button>
          ))}
        </div>

        {/* ---------- Integrity exceptions ---------- */}
        {q.data && q.data.attention.length > 0 && (
          <section className="cz-ta-attention" id="ta-attention" aria-labelledby="att-h">
            <h2 id="att-h"><Icon name="warning" size={16} />Needs attention</h2>
            <ul>
              {q.data.attention.map((a) => (
                <li key={`${a.id}-${a.issue}`}>
                  <button type="button" onClick={() => setSel(a.id)}>
                    <span><strong>{a.title}</strong><span className="cz-mono">{a.code}</span></span>
                    <span className="cz-ta-issue">{a.issue === 'overdue_close' ? `Closing date passed ${rel(a.at)} — still accepting bids` : 'No evaluation panel assigned'}</span>
                    <Icon name="next" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Register ---------- */}
        <section className="cz-ta-register" aria-labelledby="reg-h">
          <div className="cz-ta-toolbar">
            <h2 id="reg-h" className="cz-sr-only">Tender register</h2>
            <div className="cz-ta-search"><SearchInput label="Search tenders" placeholder="Search title, TND code or issuer" value={text} onChange={(e) => setText(e.target.value)} /></div>
            <Segmented label="Stage" value={stage} onChange={setStage} options={[
              { value: '', label: `All${s ? ` ${s.all}` : ''}` }, { value: 'live', label: 'Live' }, { value: 'evaluating', label: 'Evaluating' }, { value: 'awarded', label: 'Awarded' }, { value: 'draft', label: 'Draft' }, { value: 'cancelled', label: 'Cancelled' },
            ]} />
          </div>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
            <div className="cz-ta-table-wrap">
              <table className="cz-ta-table cz-ta-cards">
                <caption className="cz-sr-only">Tenders</caption>
                <thead><tr><th scope="col">Tender</th><th scope="col">Issuer</th><th scope="col">Stage</th><th scope="col">Closes</th><th scope="col" className="cz-num">Sealed bids</th><th scope="col">Panel</th></tr></thead>
                <tbody>
                  {!q.data ? Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={6}><Skeleton height={20} /></td></tr>) : !q.data.items.length ? (
                    <tr><td colSpan={6}><EmptyState icon="tenders" title={search || stage ? 'No tenders match' : 'No tenders yet'}>{search || stage ? 'Try another search or stage.' : 'Tenders published by Unite Group companies and partners appear here.'}</EmptyState></td></tr>
                  ) : q.data.items.map((t) => (
                    <tr key={t.id} data-selected={sel === t.id || undefined} onClick={() => setSel(t.id)}>
                      <td className="cz-ta-tender">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSel(t.id); }} aria-label={`Inspect ${t.code}`}>{t.title}</button>
                        <span className="cz-muted"><span className="cz-mono">{t.code}</span> · {sectorName(t.sector)}</span>
                      </td>
                      <td className="cz-ta-issuer" title={t.issuer}>{t.issuer}</td>
                      <td>
                        <StatusBadge status={t.status} label={STAGE_LABEL[t.status] ?? t.status} />
                        {t.overdueToClose && <span className="cz-ta-flag"><Icon name="warning" size={12} />Past closing</span>}
                      </td>
                      <td className="cz-ta-date"><span>{dt(t.closesAt)}</span><span className="cz-muted">{rel(t.closesAt)}</span></td>
                      <td className="cz-num cz-ta-bids">{t.submitted}{t.withdrawn > 0 && <span className="cz-muted cz-ta-withdrawn"> +{t.withdrawn} withdrawn</span>}</td>
                      <td className="cz-ta-panel-cell">{t.evaluators ? <span className="cz-ta-panel"><Icon name="users" size={14} />{t.evaluators}<span className="cz-ta-sm"> evaluator{t.evaluators === 1 ? "" : "s"}</span></span> : t.status === 'draft' || t.status === 'cancelled' ? <span className="cz-muted">—</span> : <StatusBadge status="missing" tone="danger" label="None" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {q.data && q.data.total > PAGE && <Pagination page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} noun="tenders" />}
              {q.data && q.data.total <= PAGE && q.data.total > 0 && <p className="cz-ta-count">{q.data.total} tender{q.data.total === 1 ? '' : 's'}</p>}
            </div>
          )}
        </section>
      </div>

      {/* ---------- Inspector sheet ---------- */}
      {sel && (
        <>
          <div className="cz-sheet-scrim" onClick={() => setSel(null)} aria-hidden />
          <aside className="cz-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
            <div className="cz-sheet-head">
              <div>
                <span className="cz-mono cz-muted">{d.data?.code ?? ' '}</span>
                <h2 id="sheet-h">{d.data?.title ?? 'Loading tender…'}</h2>
                {d.data && <StatusBadge status={d.data.status} label={STAGE_LABEL[d.data.status] ?? d.data.status} />}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSel(null)} aria-label="Close inspector"><Icon name="close" size={18} /></Button>
            </div>
            <div className="cz-sheet-body">
              {d.error ? <ApiErrorView error={d.error} onRetry={d.reload} /> : !d.data ? <><Skeleton height={80} /><Skeleton height={160} style={{ marginTop: 16 }} /></> : (
                <>
                  <dl className="cz-sheet-facts">
                    <div><dt>Published</dt><dd>{dt(d.data.publishedAt, true)}</dd></div>
                    <div><dt>Closes</dt><dd>{dt(d.data.closesAt, true)}</dd></div>
                    <div><dt>Bids opened</dt><dd>{dt(d.data.openedAt, true)}</dd></div>
                    <div><dt>Sealed bids</dt><dd>{d.data.bids.length}</dd></div>
                  </dl>
                  {d.data.cancelReason && <Alert tone="warning" title="Cancelled.">{d.data.cancelReason}</Alert>}
                  <h3>Evaluation panel</h3>
                  {d.data.evaluators.length ? (
                    <ul className="cz-sheet-people">{d.data.evaluators.map((e: any) => <li key={e.name + e.role}><span className="cz-avatar" aria-hidden>{e.name.split(' ').map((x: string) => x[0]).join('').slice(0, 2)}</span><span><strong>{e.name}</strong><span className="cz-muted">{String(e.role).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())} evaluator</span></span></li>)}</ul>
                  ) : <p className="cz-muted">No evaluators assigned.</p>}
                  <h3>Bids <span className="cz-muted" style={{ fontWeight: 400, fontSize: 13 }}>· metadata only</span></h3>
                  <p className="cz-sheet-note"><Icon name="lock" size={14} />Bid content is never shown to administrators. Seal hashes let compliance confirm that what was opened is exactly what was submitted.</p>
                  {d.data.bids.length ? (
                    <ul className="cz-sheet-bids">
                      {d.data.bids.map((b: any) => (
                        <li key={b.id}>
                          <span><strong>{b.org}</strong><span className="cz-muted">Submitted {dt(b.submittedAt, true)}</span></span>
                          <StatusBadge status={b.status} label={String(b.status).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())} />
                          {b.sealedHash && <code className="cz-seal" title={b.sealedHash}><Icon name="lock" size={11} />{b.sealedHash.slice(0, 12)}…{b.sealedHash.slice(-6)}</code>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="cz-muted">No bids submitted.</p>}
                  <h3>Audit trail</h3>
                  <ol className="cz-sheet-audit">
                    {d.data.events.map((e: any, i: number) => (
                      <li key={i}><span className="cz-od-dot" /><div><strong>{human(e.action)}</strong>{e.reason && <span className="cz-muted"> — {e.reason}</span>}<span className="cz-muted"><time dateTime={e.at}>{dt(e.at, true)}</time> · <code>{e.action}</code></span></div></li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </Screen>
  );
}
