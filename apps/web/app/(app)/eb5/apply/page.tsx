'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SOURCE_OF_FUNDS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Eb5Notice } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Data = Record<string, Record<string, unknown> | string>;
interface Mine { lead: { code: string; fullName: string }; application: { id: string; code: string; status: string; data: Data; hasPhoto: boolean } | null }
const OBJECTIVES = ['Permanent residence for family', 'Education for children', 'Business expansion in the U.S.', 'Retirement', 'Diversification'];

/** GO EB5 preliminary consultancy application — save as you go, submit when complete. */
export default function Eb5Apply() {
  const q = useQuery<Mine>('/eb5/applications/mine');
  const [d, setD] = useState<Data>({});
  const [savedAt, setSavedAt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Unticked boxes and empty choice lists are real answers ("no", "none"), so they start with those values.
  useEffect(() => {
    if (!q.data) return;
    const base: Data = q.data.application?.data ?? { applicant: { fullName: q.data.lead.fullName } };
    const inv = (base.investment as Record<string, unknown>) ?? {}; const his = (base.history as Record<string, unknown>) ?? {};
    setD({ ...base, investment: { sourceOfFunds: [], objectives: [], ...inv }, history: { priorUsVisas: false, priorDenials: false, ...his } });
  }, [q.data]);
  const sec = (k: string) => (d[k] as Record<string, unknown>) ?? {};
  const set = (k: string, f: string, v: unknown) => setD({ ...d, [k]: { ...sec(k), [f]: v } });
  const val = (k: string, f: string) => (sec(k)[f] as string | undefined) ?? '';
  const save = useMutation(async () => { const r = await api.put<{ at: string }>('/eb5/applications/mine', { data: d }); setSavedAt(r.at); return r; });
  const photo = useMutation(async (file: File) => { const fd = new FormData(); fd.append('file', file); await api.upload('/eb5/applications/mine/photo', fd); q.reload(); return true; });
  const submit = useMutation(async () => { await api.put('/eb5/applications/mine', { data: d }); await api.post('/eb5/applications/mine/submit'); q.reload(); return true; });
  const ap = q.data?.application; const locked = !!ap && ap.status !== 'draft';
  const txt = (k: string, f: string, label: string, extra: Record<string, unknown> = {}) => <TextInput label={label} value={val(k, f)} onChange={(e) => set(k, f, e.target.value)} disabled={locked} error={submit.fieldErrors[`${k}.${f}`]} {...extra} />;
  const num = (k: string, f: string, label: string) => <TextInput label={label} inputMode="numeric" value={val(k, f) === '' ? '' : String(val(k, f))} onChange={(e) => set(k, f, e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} disabled={locked} error={submit.fieldErrors[`${k}.${f}`]} />;
  const sel = (k: string, f: string, label: string, opts: string[]) => <Select label={label} value={val(k, f)} onChange={(e) => set(k, f, e.target.value)} disabled={locked} options={[{ value: '', label: 'Choose' }, ...opts.map((o) => ({ value: o, label: o }))]} error={submit.fieldErrors[`${k}.${f}`]} />;
  return (
    <Screen page={{ key: 'eb5-apply', title: 'Preliminary consultancy application', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC" description="Please answer accurately. Your answers are encrypted and seen only by your GO EB5 manager and the advisors assigned to you. Do not upload passport scans or bank statements here — we request those separately through your secure portal.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <>
        {locked && <Alert tone="success" title={`Application ${ap?.code} submitted`}>Thank you. Your manager will review it. <Link href={`/eb5/applications/${ap?.id}/print`}>View or print</Link> · <Link href="/eb5/portal">Back to your portal</Link></Alert>}
        {submit.error && <Alert tone="danger" title={submit.error}>{Object.keys(submit.fieldErrors).length ? `Check: ${Object.keys(submit.fieldErrors).slice(0, 6).join(', ')}` : null}</Alert>}
        <form noValidate className="cz-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
          <Card title="1. Applicant">
            <div className="cz-grid cz-grid-2">
              {txt('applicant', 'fullName', 'Full name (as in passport)')}{txt('applicant', 'dateOfBirth', 'Date of birth', { type: 'date' })}
              {sel('applicant', 'gender', 'Gender', ['Female', 'Male', 'Other', 'Prefer not to say'])}{txt('applicant', 'nationality', 'Nationality')}{txt('applicant', 'countryOfResidence', 'Country of residence')}
            </div>
            <div className="cz-row" style={{ gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              {ap?.hasPhoto ? <img src={`/api/v1/eb5/applications/${ap.id}/photo`} alt="Your passport-size photo" width={88} height={112} style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #D0D5DD' }} /> : <span className="cz-eb5-a4-photo" style={{ width: 88, height: 112 }}>Passport-size photo (optional)</span>}
              {!locked && <><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Passport-size photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.run(f); }} />
                {!ap && <span className="cz-muted" style={{ fontSize: 12 }}>Save the draft first, then add a photo.</span>}{photo.error && <span className="cz-error-text">{photo.error}</span>}</>}
            </div>
          </Card>
          <Card title="2. Contact and address">
            <div className="cz-grid cz-grid-2">
              {txt('contact', 'email', 'Email', { type: 'email' })}{txt('contact', 'phone', 'Phone', { type: 'tel' })}{txt('contact', 'alternatePhone', 'Alternate phone (optional)')}
              {txt('address', 'line1', 'Address line 1')}{txt('address', 'line2', 'Address line 2 (optional)')}{txt('address', 'city', 'City')}{txt('address', 'state', 'State / province')}{txt('address', 'postalCode', 'Postal code')}{txt('address', 'country', 'Country')}
            </div>
          </Card>
          <Card title="3. Profession and family">
            <div className="cz-grid cz-grid-2">
              {txt('profession', 'occupation', 'Occupation')}{txt('profession', 'employerOrBusiness', 'Employer or business (optional)')}{num('profession', 'yearsInBusiness', 'Years in business / employment')}{txt('profession', 'industry', 'Industry')}
              {sel('family', 'maritalStatus', 'Marital status', ['Single', 'Married', 'Divorced', 'Widowed'])}{txt('family', 'spouseName', 'Spouse name (optional)')}{num('family', 'childrenUnder21', 'Children under 21')}
            </div>
          </Card>
          <Card title="4. Investment and source of funds">
            <div className="cz-grid cz-grid-2">{num('investment', 'budgetUsd', 'Proposed investment budget (USD)')}</div>
            <ChipSelect legend="Source of funds (categories only — no statements here)" options={SOURCE_OF_FUNDS.map((s) => ({ value: s, label: s }))} value={(sec('investment').sourceOfFunds as string[]) ?? []} onChange={(v) => !locked && set('investment', 'sourceOfFunds', v)} />
            {submit.fieldErrors['investment.sourceOfFunds'] && <p className="cz-error-text">{submit.fieldErrors['investment.sourceOfFunds']}</p>}
            <ChipSelect legend="What you hope to achieve" options={OBJECTIVES.map((s) => ({ value: s, label: s }))} value={(sec('investment').objectives as string[]) ?? []} onChange={(v) => !locked && set('investment', 'objectives', v)} />
          </Card>
          <Card title="5. U.S. immigration history and preferences">
            <div className="cz-stack" style={{ gap: 8 }}>
              <Checkbox label="I have held a U.S. visa before" checked={!!sec('history').priorUsVisas} onChange={(e) => set('history', 'priorUsVisas', e.target.checked)} disabled={locked} />
              <Checkbox label="I have had a U.S. visa or immigration application refused" checked={!!sec('history').priorDenials} onChange={(e) => set('history', 'priorDenials', e.target.checked)} disabled={locked} />
              <TextArea label="Details (optional)" rows={2} value={val('history', 'details')} onChange={(e) => set('history', 'details', e.target.value)} disabled={locked} />
            </div>
            <div className="cz-grid cz-grid-2" style={{ marginTop: 10 }}>
              {sel('preferences', 'consultationMode', 'Consultation', ['Online', 'In person'])}{txt('preferences', 'timezone', 'Your time zone', { placeholder: 'e.g. Asia/Kolkata' })}{txt('preferences', 'preferredLanguage', 'Preferred language (optional)')}
            </div>
          </Card>
          <Card title="6. Consent, declaration and signature">
            <div className="cz-stack" style={{ gap: 8 }}>
              <Checkbox label="I agree that GO EB5 (CITRUS360 LLC) may use this information to assess and provide consultancy services, and share it only with advisors assigned to me." checked={!!sec('consents').privacy} onChange={(e) => set('consents', 'privacy', e.target.checked)} disabled={locked} />
              <Checkbox label="I declare that the information is true and complete. I understand this is not legal advice and no visa outcome, timeline or return is promised." checked={!!sec('consents').declaration} onChange={(e) => set('consents', 'declaration', e.target.checked)} disabled={locked} />
              <TextInput label="Type your full name as your electronic signature" value={typeof d.signature === 'string' ? d.signature : ''} onChange={(e) => setD({ ...d, signature: e.target.value })} disabled={locked} error={submit.fieldErrors.signature} />
            </div>
          </Card>
          {!locked && <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button type="button" variant="secondary" onClick={() => save.run()} loading={save.pending}>Save draft</Button>
            <Button type="submit" loading={submit.pending}>Submit application</Button>
            {savedAt && <span className="cz-muted" style={{ fontSize: 13 }}>Draft saved</span>}{save.error && <span className="cz-error-text">{save.error}</span>}
          </div>}
        </form>
        <Eb5Notice compact />
      </>}
    </Screen>
  );
}
