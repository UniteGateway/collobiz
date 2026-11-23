'use client';
/** JOIN — "Join as any industry or collaborate with Unite Group": the wizard (public and in-app) and its draft. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { JOIN_INTENTS, SECTORS, suggestIntents, type JoinIntent, type SectorCode } from '@collabiz/types';
import { Alert, Button, Icon, TextInput, type IconName } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

const DRAFT = 'cz.join.draft';
export interface JoinDraft { sector: SectorCode; intents: JoinIntent[]; city?: string }
export function readDraft(): JoinDraft | null {
  try { const s = window.localStorage.getItem(DRAFT); return s ? (JSON.parse(s) as JoinDraft) : null; } catch { return null; }
}
const writeDraft = (d: JoinDraft | null) => { try { if (d) window.localStorage.setItem(DRAFT, JSON.stringify(d)); else window.localStorage.removeItem(DRAFT); } catch { /* private window */ } };

const STEPS = ['Your industry', 'How you want to collaborate', 'Join'];

export function JoinWizard({ initial, onSaved }: { initial?: Partial<JoinDraft>; onSaved?: () => void }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sector, setSector] = useState<SectorCode | null>((initial?.sector as SectorCode) ?? null);
  const [intents, setIntents] = useState<JoinIntent[]>((initial?.intents as JoinIntent[]) ?? []);
  const [city, setCity] = useState(initial?.city ?? '');
  const [touched, setTouched] = useState(!!initial?.intents?.length);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A draft saved before sign-up comes back here after the account is created.
  useEffect(() => {
    if (initial?.sector) return;
    const d = readDraft();
    if (d) { setSector(d.sector); setIntents(d.intents); setCity(d.city ?? ''); setTouched(true); setStep(2); }
  }, [initial?.sector]);

  const pickSector = (s: SectorCode) => { setSector(s); if (!touched) setIntents(suggestIntents(s)); setStep(1); };
  const toggle = (c: JoinIntent) => { setTouched(true); setIntents((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c])); };
  const draft = (): JoinDraft | null => (sector ? { sector, intents, city: city.trim() || undefined } : null);
  const hasOrg = !!me?.activeOrg;

  async function save() {
    const d = draft(); if (!d) return;
    setBusy(true); setError(null);
    try {
      await api.put('/join/profile', d);
      writeDraft(null);
      if (onSaved) onSaved(); else router.push('/board');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your choices'); } finally { setBusy(false); }
  }
  const keep = () => { const d = draft(); if (d) writeDraft(d); };

  return (
    <div className="cz-join" data-join-step={step}>
      <ol className="cz-join-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : undefined}>
            <button type="button" disabled={i > step || (i > 0 && !sector)} onClick={() => setStep(i)}><span>{i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-labelledby="join-s1">
          <h2 id="join-s1">Which industry are you in?</h2>
          <p className="cz-muted">Every industry is welcome. Pick the closest one; you can change it later.</p>
          <div className="cz-join-grid">
            {SECTORS.map((s) => (
              <button type="button" key={s.code} className="cz-join-tile" aria-pressed={sector === s.code} data-sector={s.code} onClick={() => pickSector(s.code)}>{s.name}</button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && sector && (
        <section aria-labelledby="join-s2">
          <h2 id="join-s2">How do you want to collaborate with Unite Group?</h2>
          <p className="cz-muted">Choose as many as you like. We suggested a few for {SECTORS.find((s) => s.code === sector)?.name}. Your board will show one card for each.</p>
          <div className="cz-join-intents">
            {JOIN_INTENTS.map((i) => {
              const on = intents.includes(i.code);
              return (
                <button type="button" key={i.code} className="cz-join-intent" aria-pressed={on} data-intent={i.code} onClick={() => toggle(i.code)}>
                  <span className="cz-join-ic"><Icon name={(on ? 'check' : i.icon) as IconName} size={20} /></span>
                  <span><strong>{i.label}</strong><small>{i.blurb}</small></span>
                </button>
              );
            })}
          </div>
          <div className="cz-join-actions">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button disabled={!intents.length} onClick={() => setStep(2)}>Continue</Button>
          </div>
          {!intents.length && <p className="cz-muted" role="status">Choose at least one way to collaborate.</p>}
        </section>
      )}

      {step === 2 && sector && (
        <section aria-labelledby="join-s3">
          <h2 id="join-s3">Your collaboration board is ready to build</h2>
          <p className="cz-muted">
            {SECTORS.find((s) => s.code === sector)?.name} · {intents.length} way{intents.length === 1 ? '' : 's'} to collaborate. Membership is free.
            Your board shows live opportunities for each choice, the Unite businesses that fit you, and why each one was matched.
          </p>
          <ul className="cz-join-summary">{intents.map((c) => <li key={c}>{JOIN_INTENTS.find((i) => i.code === c)?.label}</li>)}</ul>
          <div style={{ maxWidth: 360 }}><TextInput label="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} /></div>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="cz-join-actions">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            {loading ? null : hasOrg ? (
              <Button onClick={save} disabled={busy || !intents.length}>{busy ? 'Saving…' : 'Save and open my board'}</Button>
            ) : me ? (
              <Link className="cz-btn cz-btn-primary" href="/onboarding/account-type" onClick={keep}>Create my business account</Link>
            ) : (
              <>
                <Link className="cz-btn cz-btn-primary" href="/signup?next=/join" onClick={keep}>Join free</Link>
                <Link className="cz-btn cz-btn-secondary" href="/login?next=/join" onClick={keep}>I already have an account</Link>
              </>
            )}
          </div>
          {!loading && !hasOrg && <p className="cz-muted" style={{ fontSize: 14 }}>Your choices are kept on this device and saved to your board as soon as your business account is ready.</p>}
        </section>
      )}
    </div>
  );
}
