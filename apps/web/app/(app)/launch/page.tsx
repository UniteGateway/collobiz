'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ASSET_KINDS, ASSET_LABELS, INVEST_BANDS, TIME_COMMITMENTS } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, Checkbox, ChipSelect, Segmented, Select, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { STATE_OPTIONS } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface Model { code: string; title: string; summary: string; earns: string; firstSteps: string[]; score: number; uses: string[]; gaps: string[];
  offers: { id: string; title: string; city: string | null }[]; programmes: { slug: string; name: string; tagline: string; open: boolean }[]; lookingFor: number }
interface Result { have: string[]; place: string; models: Model[]; note: string }
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Launch — tell COLLABIZ what you have; get business models matched to real offers, programmes and demand. */
export default function Launch() {
  const router = useRouter();
  const [have, setHave] = useState<string[]>([]); const [useCollab, setUseCollab] = useState(false);
  const [state, setState] = useState(''); const [city, setCity] = useState(''); const [invest, setInvest] = useState('lt5l'); const [time, setTime] = useState('part_time');
  const [skills, setSkills] = useState(''); const [languages, setLanguages] = useState('');
  const profile = () => ({ have, useCollab, state: state || null, city: city || undefined, invest, time, skills: split(skills), languages: split(languages) });
  const match = useMutation(async () => api.post<Result>('/launch/match', profile()));
  const start = useMutation(async (model: string) => { const r = await api.post<{ id: string }>('/launch/plans', { model, profile: profile() }); router.push(`/launch/plans/${r.id}`); return r; });
  const r = match.data;
  return (
    <Screen page={{ key: 'launch', title: 'Have something? Start something.', access: 'partner' }} eyebrow="Launch"
      description="Tell COLLABIZ what you already have. We match it to business models that need it, then to real offers, approved Unite programmes and businesses looking for it — and track your plan until it earns."
      actions={<ButtonLink href="/launch/plans" variant="secondary">My launch plans</ButtonLink>}>
      <form noValidate className="cz-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); match.run(); }}>
        <Card title="1. What do you have?">
          <ChipSelect legend="Choose everything that applies" options={ASSET_KINDS.map((k) => ({ value: k, label: ASSET_LABELS[k] }))} value={have} onChange={setHave} />
          <Checkbox label="Also use what I listed in Collab" checked={useCollab} onChange={(e) => setUseCollab(e.target.checked)} />
          {match.fieldErrors.have && <p className="cz-error-text" role="alert">{match.fieldErrors.have}</p>}
        </Card>
        <Card title="2. A little about you">
          <div className="cz-grid cz-grid-2">
            <Select label="State" value={state} onChange={(e) => setState(e.target.value)} options={[{ value: '', label: 'Anywhere in India' }, ...STATE_OPTIONS]} />
            <TextInput label="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
            <TextInput label="Skills (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Solar installation, sales, Tally" />
            <TextInput label="Languages your team speaks" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Telugu, Hindi, English" />
          </div>
          <div className="cz-stack" style={{ gap: 10, marginTop: 12 }}>
            <Segmented label="Cash you can invest" value={invest} onChange={setInvest} options={INVEST_BANDS.map((b) => ({ value: b.code, label: b.label }))} />
            <Segmented label="Time you can give" value={time} onChange={setTime} options={TIME_COMMITMENTS.map((t) => ({ value: t.code, label: t.label }))} />
          </div>
        </Card>
        {match.error && !match.fieldErrors.have && <Alert tone="danger">{match.error}</Alert>}
        <div><Button type="submit" loading={match.pending}>Show me business models</Button></div>
      </form>

      {r && (
        <section aria-label="Business models for you" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>{r.models.length ? `${r.models.length} business models for what you have` : 'No model fits yet'}</h2>
          <p className="cz-muted" style={{ margin: '0 0 14px' }}>{r.place} · {r.note}</p>
          {start.error && <Alert tone="danger">{start.error}</Alert>}
          <div className="cz-launch-list">
            {r.models.map((m) => (
              <article key={m.code} className="cz-launch-model" data-model={m.code}>
                <div className="cz-launch-head">
                  <div><h3>{m.title}</h3><p>{m.summary}</p></div>
                  <div className="cz-launch-score" aria-label={`Fit ${m.score} out of 100`}><strong>{m.score}</strong><span>fit</span></div>
                </div>
                <p className="cz-launch-uses">Uses: {m.uses.map((u) => ASSET_LABELS[u as keyof typeof ASSET_LABELS] ?? u).join(' · ')} · <em>{m.earns}</em></p>
                {m.gaps.length > 0 && <p className="cz-launch-gap">To check: {m.gaps.join('; ')}</p>}
                <div className="cz-launch-cols">
                  <div><h4>Live offers ({m.offers.length})</h4>{m.offers.length ? <ul>{m.offers.map((o) => <li key={o.id}><Link href={`/opportunities/${o.id}`}>{o.title}</Link>{o.city ? ` · ${o.city}` : ''}</li>)}</ul> : <p className="cz-muted">None open right now.</p>}</div>
                  <div><h4>Unite programmes</h4>{m.programmes.length ? <ul>{m.programmes.map((p) => <li key={p.slug}><Link href={`/ventures/${p.slug}`}>{p.name}</Link>{p.open ? '' : ' · not open yet'}</li>)}</ul> : <p className="cz-muted">—</p>}</div>
                  <div><h4>Businesses looking for it</h4><p><strong style={{ fontSize: 22 }}>{m.lookingFor}</strong> <span className="cz-muted">declared this need on Collab</span></p></div>
                </div>
                <details><summary>First steps</summary><ol>{m.firstSteps.map((s) => <li key={s}>{s}</li>)}</ol></details>
                <div><Button variant="accent" onClick={() => start.run(m.code)} loading={start.pending}>Start this plan</Button></div>
              </article>
            ))}
          </div>
        </section>
      )}
    </Screen>
  );
}
