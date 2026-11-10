'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCHANGE_CATEGORY_LABELS, isBalanced, type Cycle, type XListing } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { XchangeNav, inr } from '@/components/Xchange';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Res { cycles: (Cycle & { kind: string; parties: string[] })[]; oneWay: { mine: XListing; theirs: XListing; direction: string }[]; note: string }
interface DraftLeg { fromOrgId: string; toOrgId: string; from: string; to: string; listingId?: string; description: string; value: string; cash: string }

/** Screen 181 — XCHANGE matches: direct swaps, three- and four-way exchanges, and part-cash options. */
export default function XchangeMatches() {
  const q = useQuery<Res>('/xchange/matches');
  const [draft, setDraft] = useState<DraftLeg[] | null>(null);
  const fromCycle = (c: Cycle) => setDraft(c.legs.map((l) => ({ fromOrgId: l.from, toOrgId: l.to, from: l.offer.orgName, to: l.need.orgName, listingId: l.offer.id, description: l.offer.title, value: String(Math.round(Math.min(l.offer.value, l.need.value) / 100)), cash: '0' }))); // start from what both sides can agree
  const fromOneWay = (m: Res['oneWay'][number]) => {
    const offer = m.direction === 'they_need_my_offer' ? m.mine : m.theirs; const need = m.direction === 'they_need_my_offer' ? m.theirs : m.mine;
    // Part-cash: the matched supply, plus a counter-supply the receiver fills in; any difference is paid in cash.
    setDraft([{ fromOrgId: offer.orgId, toOrgId: need.orgId, from: offer.orgName, to: need.orgName, listingId: offer.id, description: offer.title, value: String(Math.round(offer.value / 100)), cash: '0' },
      { fromOrgId: need.orgId, toOrgId: offer.orgId, from: need.orgName, to: offer.orgName, description: '', value: '', cash: '0' }]);
  };
  return (
    <Screen page={{ key: 'xchange-matches', title: 'XCHANGE matches', access: 'partner' }} description="Exchanges that work from what you and other verified businesses have listed — including chains of three or four businesses where nobody could swap one-to-one.">
      <XchangeNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <>
          <Alert tone="info">{q.data.note}</Alert>
          {!q.data.cycles.length && !q.data.oneWay.length && <Card><EmptyState icon="trading" title="No matches yet">List both what you offer and what you need. Matches appear as other businesses list theirs.</EmptyState></Card>}
          {q.data.cycles.map((c, i) => (
            <Card key={i} title={c.kind === 'multi' ? `${c.legs.length}-way exchange` : 'Direct swap'} subtitle={`${c.parties.join(' · ')} · values differ by ${c.imbalancePct}% · match ${c.score}`}>
              <ol className="cz-timeline" data-cycle={c.parties.join('>')}>{c.legs.map((l, j) => <li key={j}><strong>{l.offer.orgName}</strong> supplies <strong>{l.offer.title}</strong> ({XCHANGE_CATEGORY_LABELS[l.offer.category]}, {inr(l.offer.value)}) to <strong>{l.need.orgName}</strong></li>)}</ol>
              <Button size="sm" onClick={() => fromCycle(c)}>Propose this exchange</Button>
            </Card>
          ))}
          {q.data.oneWay.length > 0 && (
            <Card title="Part-cash and cash options">
              <ul className="cz-ws-list">{q.data.oneWay.map((m, i) => <li key={i}><span><strong>{m.theirs.orgName}</strong> {m.direction === 'they_need_my_offer' ? 'needs' : 'offers'} {m.theirs.title} — {inr(m.theirs.value)}<br /><span className="cz-muted" style={{ fontSize: 13 }}>Your {m.mine.side}: {m.mine.title}</span></span><Button size="sm" variant="secondary" onClick={() => fromOneWay(m)}>Propose</Button></li>)}</ul>
            </Card>
          )}
          <Propose legs={draft} onClose={() => setDraft(null)} />
        </>
      )}
    </Screen>
  );
}

function Propose({ legs, onClose }: { legs: DraftLeg[] | null; onClose: () => void }) {
  const router = useRouter();
  const [ls, setLs] = useState<DraftLeg[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => { if (legs) setLs(legs); }, [legs]);
  const parsed = ls.map((l) => ({ fromOrgId: l.fromOrgId, toOrgId: l.toOrgId, value: Math.round(Number(l.value || 0) * 100), cash: Math.round(Number(l.cash || 0) * 100) }));
  const bal = ls.length ? isBalanced(parsed) : null;
  const send = useMutation(async () => { const r = await api.post<{ id: string }>('/xchange/deals', { note: note || undefined, legs: ls.map((l, i) => ({ fromOrgId: l.fromOrgId, toOrgId: l.toOrgId, listingId: l.listingId, description: l.description, value: parsed[i].value, cash: parsed[i].cash })) }); router.push(`/xchange/deals/${r.id}`); return r; });
  const name = (id: string) => ls.find((l) => l.fromOrgId === id)?.from ?? ls.find((l) => l.toOrgId === id)?.to ?? '';
  return (
    <Dialog open={!!legs} onClose={() => { setLs([]); onClose(); }} title="Propose an exchange">
      <div className="cz-stack" style={{ gap: 10 }}>
        {send.error && <Alert tone="danger">{send.error}</Alert>}
        {ls.map((l, i) => (
          <div key={i} className="cz-inset" style={{ padding: 12 }} data-leg={i}>
            <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>{l.from}</strong> → <strong>{l.to}</strong></p>
            <TextInput label="What is supplied" value={l.description} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <div className="cz-grid cz-grid-2" style={{ gap: '0 10px' }}>
              <TextInput label="Value (₹)" inputMode="numeric" value={l.value} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, value: e.target.value.replace(/\D/g, '') } : x)))} />
              <TextInput label={`Cash paid by ${l.to} (₹)`} inputMode="numeric" value={l.cash} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, cash: e.target.value.replace(/\D/g, '') } : x)))} />
            </div>
          </div>
        ))}
        {bal && <Alert tone={bal.ok ? 'success' : 'warning'} title={bal.ok ? 'Balanced' : 'Not balanced yet — adjust values or add cash'}>{bal.balances.map((b) => `${name(b.orgId)}: ${b.net >= 0 ? 'receives' : 'gives'} ${inr(Math.abs(b.net))} net`).join(' · ')}</Alert>}
        <TextInput label="Note to the other businesses (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>Every business must approve the same terms. Each supply is invoiced separately at open-market value.</p>
        <div><Button onClick={() => send.run()} loading={send.pending} disabled={!bal?.ok || ls.some((l) => l.description.trim().length < 5 || !Number(l.value))}>Send for approval</Button></div>
      </div>
    </Dialog>
  );
}
