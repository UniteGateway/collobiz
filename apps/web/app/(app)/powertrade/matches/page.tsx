'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PT_MODELS, type PtModel } from '@collabiz/types';
import { Alert, Button, EmptyState, Segmented, Skeleton, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Match { type: 'energy' | 'business' | 'partner'; partner: string; title: string; arrangement: string; reasons: string[]; agreements: string[]; regulatory: string[]; missing: string[]; risks: string[]; next: { label: string; href: string } }
interface Resp { profileReady: boolean; missing: string[]; items: Match[]; note: string; parsed?: { monthlyUnits: number | null; products: string[]; wants: string[]; industry: string | null }; suggestedModels?: PtModel[] }
const EXAMPLES: [string, string][] = [
  ['Steel manufacturer', 'We are a steel manufacturer using 15 lakh units per month. We make solar module mounting structures and want cheaper renewable power and more customers.'],
  ['Textile factory', 'Textile mill consuming 8 lakh units per month in Tamil Nadu. We want group captive solar and export buyers for our yarn and fabric.'],
  ['Transformer manufacturer', 'We manufacture transformers and switchgear, use 4 lakh units per month, and want to supply Unite projects and buy discounted solar power.'],
  ['Cement manufacturer', 'Cement plant using 30 lakh units per month. We can supply cement for EPC projects and want renewable electricity.'],
  ['Retail chain', 'Retail chain with 12 stores using 60 thousand units per month. We want to sell solar products, earn commissions and reduce power bills.'],
  ['EPC contractor', 'EPC contractor offering installation and O&M; we want more projects and cheaper power for our workshop of 50 thousand units per month.'],
  ['Exporter', 'Exporter with international buyers for industrial products; we want to source from manufacturers and find import partners.'],
];
const KIND: Record<Match['type'], string> = { energy: 'Energy', business: 'Business', partner: 'Partner' };

function MatchList({ r }: { r: Resp }) {
  const [kind, setKind] = useState('');
  const items = r.items.filter((x) => !kind || x.type === kind);
  return (
    <>
      {r.missing.length > 0 && <Alert tone="info" title="Add more for better matches">{r.missing.join(' · ')} — <Link href="/powertrade/join">complete your profile</Link>.</Alert>}
      <Segmented label="Show" value={kind} onChange={setKind} options={[{ value: '', label: `All (${r.items.length})` }, { value: 'energy', label: 'Energy' }, { value: 'business', label: 'Business' }, { value: 'partner', label: 'Partners' }]} />
      {!items.length ? <EmptyState title="No matches yet">Add products with keywords buyers use, or your electricity profile. New requirements and plants are matched as they are published.</EmptyState> : (
        <div className="pt-matches">{items.map((m, i) => (
          <article key={i} className="cz-card pt-match" data-match={m.title} data-type={m.type}>
            <span className="pt-tag" data-type={m.type}>{KIND[m.type]}</span>
            <h3>{m.title}</h3>
            <p className="cz-muted" style={{ margin: 0 }}>{m.partner} · {m.arrangement}</p>
            <ul className="pt-reasons">{m.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
            {m.agreements.length > 0 && <p className="pt-small"><strong>Agreements:</strong> {m.agreements.join(' · ')}</p>}
            {m.regulatory.length > 0 && <p className="pt-small"><strong>Conditions:</strong> {m.regulatory.join(' · ')}</p>}
            {m.risks.length > 0 && <p className="pt-small"><strong>Risks:</strong> {m.risks.join(' · ')}</p>}
            {m.missing.length > 0 && <p className="pt-small"><strong>Missing:</strong> {m.missing.join(' · ')}</p>}
            <Link href={m.next.href} className="cz-btn cz-btn-secondary cz-btn-sm">{m.next.label}</Link>
          </article>
        ))}</div>
      )}
      <p className="cz-muted" style={{ fontSize: 13 }}>{r.note}</p>
    </>
  );
}

/** AI Energy + Business matches, and reverse matching from a plain description. */
export default function PtMatches() {
  const q = useQuery<Resp>('/powertrade/matches/recommended');
  const [text, setText] = useState('');
  const [rev, setRev] = useState<Resp | null>(null);
  const m = useMutation(async () => { setRev(await api.post<Resp>('/powertrade/matches/reverse', { text })); return true; });
  return (
    <Screen page={{ key: 'powertrade-matches', title: 'Energy + Business matches', access: 'partner' }} header={false}>
      <PtHeader title="Energy + Business matches" lead="What you need and what you can contribute, matched against live plants, buyer requirements, barter needs and partners on COLLABIZ." />
      <PtNav />
      <section className="cz-card cz-stack" style={{ gap: 10 }} aria-labelledby="rev-h">
        <h2 id="rev-h" style={{ margin: 0 }}>Describe your business — we’ll find the fits</h2>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-reverse">
          <TextArea label="In your own words" rows={3} placeholder="I have a steel factory consuming 15 lakh units per month. I manufacture structural steel and want cheaper electricity plus more customers." value={text} onChange={(e) => setText(e.target.value)} error={m.fieldErrors.text} />
          {m.error && !m.fieldErrors.text && <Alert tone="danger">{m.error}</Alert>}
          <div className="pt-interests" aria-label="Examples"><span className="cz-muted" style={{ fontSize: 13 }}>Try an example (sample text, matched against live records):</span>{EXAMPLES.map(([l, t]) => <button key={l} type="button" className="pt-pick" onClick={() => setText(t)}>{l}</button>)}</div>
          <div><Button type="submit" loading={m.pending}>Find my fits</Button></div>
        </form>
        {rev?.parsed && (
          <div className="pt-parsed" data-pt-parsed>
            <p><strong>We read:</strong> {rev.parsed.industry ? `${rev.parsed.industry} business · ` : ''}{rev.parsed.monthlyUnits ? `${rev.parsed.monthlyUnits.toLocaleString('en-IN')} units/month · ` : ''}{rev.parsed.products.length ? `offers ${rev.parsed.products.join(', ')} · ` : ''}{rev.parsed.wants.length ? `wants ${rev.parsed.wants.map((w) => w.replace(/_/g, ' ')).join(', ')}` : ''}</p>
            {!!rev.suggestedModels?.length && <p><strong>Ways to collaborate:</strong> {rev.suggestedModels.map((k) => PT_MODELS[k].label).join(' · ')}</p>}
          </div>
        )}
      </section>
      <section style={{ marginTop: 16 }} className="cz-stack">
        <h2 style={{ margin: 0 }}>{rev ? 'Fits for your description' : 'Recommended for you'}</h2>
        {rev ? <MatchList r={rev} /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : <MatchList r={q.data} />}
      </section>
    </Screen>
  );
}
