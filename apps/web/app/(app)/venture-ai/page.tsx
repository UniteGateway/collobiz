'use client';
import Link from 'next/link';
import { VAI_ROLES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Widget } from '@/components/Powertrade';
import { OppList, SampleTag, VaiHeader, VaiNav, rupees, type VaiDash } from '@/components/VentureAi';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Venture AI command centre: invitations to answer, my Venture Rooms, my proposals and approved opportunities. */
export default function VentureAiHome() {
  const q = useQuery<VaiDash>('/venture-ai/dashboard');
  const respond = useMutation(async (id: string, decision: 'accept' | 'decline') => { await api.post(`/venture-ai/invitations/${id}/respond`, { decision }); q.reload(); return true; });
  const d = q.data;
  const mine = d?.opportunities.filter((o) => o.mine) ?? [];
  const open = d?.opportunities.filter((o) => o.status === 'approved' && !o.mine) ?? [];
  return (
    <Screen page={{ key: 'venture-ai', title: 'Venture AI', access: 'partner' }} header={false}>
      <VaiHeader><div className="pt-cta"><ButtonLink href="/venture-ai/new" variant="accent">Propose a product</ButtonLink><ButtonLink href="/venture-ai/opportunities" variant="ghost">Browse opportunities</ButtonLink></div></VaiHeader>
      <VaiNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <>
          {d.killSwitch && <Alert tone="warning">AI agents are paused by Unite. Scoring, financial models and matching still work — they are formulas, not AI.</Alert>}
          <div className="pt-kpis">
            <Widget icon="inbox" tone="amber" label="Invitations to answer" value={String(d.invitations.length)} />
            <Widget icon="teams" tone="green" label="My Venture Rooms" value={String(d.ventures.length)} />
            <Widget icon="sparkles" tone="violet" label="My proposals" value={String(mine.length)} href="/venture-ai/opportunities?mine=1" />
            <Widget icon="target" tone="blue" label="Open opportunities" value={String(open.length)} href="/venture-ai/opportunities" />
            <Widget icon="factory" tone="teal" label="My capability profile" value={d.capability ? `${d.capability.roles.length} roles` : 'Not set'} hint={d.capability ? 'Used for matching' : 'Add it to be matched'} href="/venture-ai/capabilities" />
            <Widget icon="zap" tone="indigo" label="AI assistance" value={d.provider === 'anthropic' ? 'Claude' : 'Rules templates'} hint={d.provider === 'anthropic' ? 'Labelled drafts, budget-capped' : 'No AI key connected yet'} />
          </div>
          {respond.error && <Alert tone="danger">{respond.error}</Alert>}
          {d.invitations.length > 0 && (
            <Card title="Invitations" subtitle="A Venture Room owner invited your business. Nothing about you is shared until you accept.">
              <ul className="vai-list">{d.invitations.map((i) => (
                <li key={i.id} data-invitation={i.venture}>
                  <div><strong>{VAI_ROLES[i.role]} · {i.venture}</strong><p>{i.message}</p>
                    <dl className="vai-dl">
                      {i.investmentPaise != null && <><dt>Investment asked</dt><dd>{rupees(i.investmentPaise)}</dd></>}
                      {i.earningsNote && <><dt>How you earn</dt><dd>{i.earningsNote}</dd></>}
                      {i.risksNote && <><dt>Risks</dt><dd>{i.risksNote}</dd></>}
                      {i.matchReasons?.length ? <><dt>Why you were matched</dt><dd>{i.matchReasons.join(' · ')}</dd></> : null}
                    </dl></div>
                  <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => respond.run(i.id, 'accept')} loading={respond.pending}>Accept</Button><Button size="sm" variant="ghost" onClick={() => respond.run(i.id, 'decline')}>Decline</Button></div>
                </li>))}</ul>
            </Card>
          )}
          <div className="vai-two">
            <Card title="My Venture Rooms">
              {d.ventures.length ? <ul className="vai-list">{d.ventures.map((v) => <li key={v.id}><div><Link href={`/venture-ai/rooms/${v.id}`}><strong>{v.name}</strong></Link> {v.sample && <SampleTag />}<p>{VAI_ROLES[v.role]} · {v.code}</p></div></li>)}</ul>
                : <EmptyState icon="teams" title="No Venture Rooms yet">A room opens when Unite approves your proposal, or when you accept an invitation.</EmptyState>}
            </Card>
            <Card title="My proposals" actions={<ButtonLink size="sm" href="/venture-ai/new" variant="ghost">New</ButtonLink>}>
              {mine.length ? <OppList rows={mine} /> : <EmptyState icon="sparkles" title="No proposals yet">Describe a problem, the market gap and the product that could fill it.</EmptyState>}
            </Card>
          </div>
          <Card title="Approved opportunities looking for members" subtitle="Open one to see the roles needed and whether your business fits.">
            {open.length ? <OppList rows={open} /> : <EmptyState icon="target" title="No open opportunities yet" />}
          </Card>
          <Card title="How Venture AI decides">
            <ul className="vai-rules">
              <li><strong>Scores</strong> — eight weighted criteria (demand 20, profitability 20, suppliers 15, advantage, capital, member capability, scalability 10 each, regulatory 5). A failed legal, financial, engineering or safety check blocks approval whatever the score.</li>
              <li><strong>Numbers</strong> — financial models and solar sizing are formulas you can check; the same inputs always give the same answer.</li>
              <li><strong>Evidence</strong> — every statement is a verified fact (with source and date), an assumption or a forecast.</li>
              <li><strong>People decide</strong> — agreements, payments, purchase orders and public claims need a human approval; AI drafts are labelled.</li>
            </ul>
          </Card>
        </>
      )}
    </Screen>
  );
}
