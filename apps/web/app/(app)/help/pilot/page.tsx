'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Skeleton } from '@collabiz/ui';
import { PILOT_CONTINUE, PILOT_CONTINUE_LABELS, PILOT_FEATURES, PILOT_FEATURE_LABELS } from '@collabiz/types';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Mine { lastAt: string | null; canAnswer: boolean; nextAt: string | null }
const STARS = ['Not useful', 'Slightly', 'Somewhat', 'Very', 'Extremely'];
const EASE = ['Very hard', 'Hard', 'Okay', 'Easy', 'Very easy'];
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Pilot check-in — a two-minute survey pilot partners send each week. */
export default function PilotFeedback() {
  const mine = useQuery<Mine>('/pilot-feedback/mine');
  const [f, setF] = useState({ usefulness: 0, ease: 0, recommend: -1, used: [] as string[], mostValuable: '', blockers: '', wishlist: '', continueUse: '', contactOk: false });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k: string) => setF((p) => ({ ...p, used: p.used.includes(k) ? p.used.filter((x) => x !== k) : [...p.used, k] }));
  const m = useMutation(async () => api.post('/pilot-feedback', { ...f, mostValuable: f.mostValuable || undefined, blockers: f.blockers || undefined, wishlist: f.wishlist || undefined, platform: 'web' }));
  const missing = [!f.usefulness && 'how useful it is', !f.ease && 'how easy it is', f.recommend < 0 && 'how likely you are to recommend it', !f.continueUse && 'whether you’ll keep using it'].filter(Boolean) as string[];
  return (
    <Screen page={{ key: 'pilot-feedback', title: 'Pilot check-in', access: 'authenticated' }}
      description="Two minutes, once a week. Tell Unite Group what works, what gets in your way and what to build next.">
      <div className="cz-pilot">
        {mine.error ? <ApiErrorView error={mine.error} onRetry={mine.reload} /> : !mine.data ? <Skeleton height={320} /> : m.data ? (
          <Alert tone="success" title="Thank you — your check-in reached the Unite Group pilot team">
            The team reads every answer. If you said we may contact you, someone may call about what you wrote. <Link href="/dashboard">Back to your dashboard</Link>
          </Alert>
        ) : !mine.data.canAnswer && mine.data.nextAt ? (
          <Alert tone="info" title="You’ve already checked in today">You sent your last check-in on {when(mine.data.lastAt!)}. You can send the next one after {when(mine.data.nextAt)}. For anything urgent, <Link href="/support/tickets?new=1">contact support</Link>.</Alert>
        ) : (
          <form className="cz-card cz-stack" style={{ gap: 22 }} onSubmit={(e) => { e.preventDefault(); if (!missing.length) m.run(); }} noValidate>
            {mine.data.lastAt && <p className="cz-muted" style={{ margin: 0 }}>Your last check-in: {when(mine.data.lastAt)}.</p>}
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <fieldset className="cz-pilot-q">
              <legend>1. How useful is COLLABIZ for your business so far?</legend>
              <div className="cz-rate"><div role="radiogroup" aria-label="Usefulness">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={f.usefulness === n} aria-label={`${n} of 5 — ${STARS[n - 1]}`} data-on={f.usefulness >= n || undefined} onClick={() => set('usefulness', n)}>★</button>)}</div><span className="cz-muted">{f.usefulness ? STARS[f.usefulness - 1] : 'Choose 1–5'}</span></div>
            </fieldset>
            <fieldset className="cz-pilot-q">
              <legend>2. How easy is it to use?</legend>
              <div className="cz-rate"><div role="radiogroup" aria-label="Ease of use">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={f.ease === n} aria-label={`${n} of 5 — ${EASE[n - 1]}`} data-on={f.ease >= n || undefined} onClick={() => set('ease', n)}>★</button>)}</div><span className="cz-muted">{f.ease ? EASE[f.ease - 1] : 'Choose 1–5'}</span></div>
            </fieldset>
            <fieldset className="cz-pilot-q">
              <legend>3. How likely are you to recommend COLLABIZ to another business partner?</legend>
              <div className="cz-scale" role="radiogroup" aria-label="Likelihood to recommend, 0 to 10">{Array.from({ length: 11 }, (_, n) => <button key={n} type="button" role="radio" aria-checked={f.recommend === n} onClick={() => set('recommend', n)}>{n}</button>)}</div>
              <div className="cz-scale-ends"><span>0 — Not at all likely</span><span>10 — Extremely likely</span></div>
            </fieldset>
            <fieldset className="cz-chipset">
              <legend>4. What did you use this week? (choose any)</legend>
              {PILOT_FEATURES.map((k) => <label key={k} data-on={f.used.includes(k) || undefined}><input type="checkbox" checked={f.used.includes(k)} onChange={() => toggle(k)} />{PILOT_FEATURE_LABELS[k]}</label>)}
            </fieldset>
            <label className="cz-sched-label">5. What was most valuable? (optional)<textarea className="cz-input" rows={2} maxLength={1000} value={f.mostValuable} onChange={(e) => set('mostValuable', e.target.value)} placeholder="For example: an offer we won, a lead we protected" /></label>
            <label className="cz-sched-label">6. What stopped you, confused you or didn’t work? (optional)<textarea className="cz-input" rows={3} maxLength={2000} value={f.blockers} onChange={(e) => set('blockers', e.target.value)} placeholder="Tell us the page and what happened" /></label>
            <label className="cz-sched-label">7. What one thing should we add or change? (optional)<textarea className="cz-input" rows={2} maxLength={2000} value={f.wishlist} onChange={(e) => set('wishlist', e.target.value)} /></label>
            <fieldset className="cz-chipset">
              <legend>8. Would you keep using COLLABIZ after the pilot?</legend>
              {PILOT_CONTINUE.map((k) => <label key={k} data-on={f.continueUse === k || undefined}><input type="radio" name="continueUse" checked={f.continueUse === k} onChange={() => set('continueUse', k)} />{PILOT_CONTINUE_LABELS[k]}</label>)}
            </fieldset>
            <label className="cz-inline-check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}><input type="checkbox" checked={f.contactOk} onChange={(e) => set('contactOk', e.target.checked)} />The pilot team may contact me about my answers.</label>
            {missing.length > 0 && <p className="cz-muted" style={{ margin: 0 }} aria-live="polite">Still to answer: {missing.join(', ')}.</p>}
            <div><Button type="submit" loading={m.pending} disabled={missing.length > 0}>Send check-in</Button></div>
          </form>
        )}
      </div>
    </Screen>
  );
}
