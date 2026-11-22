'use client';
/**
 * GO EB5 Preliminary Consultancy Application — sections A to J of the paper form, used by the client portal (save and
 * resume) and by the public online application. Section K (office use) is completed by GO EB5 staff.
 */
import { EB5_APPLICATION_TERMS, EB5_APP_TIMELINES, EB5_BUDGET_BANDS, EB5_HISTORY_QUESTIONS, EB5_MEETING_MODES, EB5_OBJECTIVES, EB5_SCOPE_TEXT, SOURCE_OF_FUNDS } from '@collabiz/types';
import { TextArea, TextInput } from '@collabiz/ui';

export type AppData = Record<string, unknown> & { [section: string]: unknown };
type Sec = Record<string, unknown>;
export const EMPTY_APPLICATION: AppData = {
  fullName: '', personal: {}, professional: {}, family: { numberOfChildren: 0 }, purpose: { objectives: [] }, readiness: { sourceOfFunds: [] },
  history: {}, preferences: {}, consents: {}, signature: '', datePlace: '',
};

function Section({ code, title, children }: { code: string; title: string; children: React.ReactNode }) {
  return <section className="cz-eb5-sec" aria-labelledby={`sec-${code}`}><h2 id={`sec-${code}`}><span>{code}.</span> {title}</h2><div className="cz-eb5-sec-body">{children}</div></section>;
}
function Ticks({ legend, options, value, onChange, single, disabled, error }: { legend: string; options: readonly string[]; value: string[] | string | undefined; onChange: (v: string[] | string) => void; single?: boolean; disabled?: boolean; error?: string }) {
  const sel = single ? [value as string].filter(Boolean) : ((value as string[]) ?? []);
  return (
    <fieldset className="cz-eb5-ticks" disabled={disabled}>
      <legend>{legend}</legend>
      <div>{options.map((o) => (
        <label key={o}><input type={single ? 'radio' : 'checkbox'} name={legend} checked={sel.includes(o)} onChange={(e) => onChange(single ? o : e.target.checked ? [...sel, o] : sel.filter((x) => x !== o))} />{o}</label>
      ))}</div>
      {error && <p className="cz-error-text">{error}</p>}
    </fieldset>
  );
}

export function Eb5ApplicationForm({ value, onChange, errors = {}, locked, photoSlot, entity }: { value: AppData; onChange: (v: AppData) => void; errors?: Record<string, string>; locked?: boolean; photoSlot?: React.ReactNode; entity: string }) {
  const sec = (k: string) => (value[k] as Sec) ?? {};
  const set = (k: string, f: string, v: unknown) => onChange({ ...value, [k]: { ...sec(k), [f]: v } });
  const str = (k: string, f: string) => (sec(k)[f] as string | undefined) ?? '';
  const t = (k: string, f: string, label: string, extra: Record<string, unknown> = {}) => (
    <TextInput label={label} value={str(k, f)} onChange={(e) => set(k, f, e.target.value)} disabled={locked} error={errors[`${k}.${f}`]} {...extra} />
  );
  const num = (k: string, f: string, label: string) => (
    <TextInput label={label} inputMode="numeric" value={sec(k)[f] === undefined ? '' : String(sec(k)[f])} onChange={(e) => set(k, f, e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} disabled={locked} error={errors[`${k}.${f}`]} />
  );
  return (
    <div className="cz-eb5-form">
      <header className="cz-eb5-form-head">
        <img src="/brands/goeb5.png" alt="GO EB5 — U.S. Investor Visa Program" width={210} height={70} />
        <div><strong>{entity}</strong><span>PRIVATE &amp; CONFIDENTIAL</span></div>
      </header>
      <h1 className="cz-eb5-form-title">Preliminary Consultancy Application</h1>
      <p className="cz-muted" style={{ marginTop: 0 }}>Preliminary registration only — not a USCIS petition or investment agreement. Please do not attach passport copies or financial records at this stage.</p>
      <div className="cz-eb5-ident">
        <div className="cz-stack" style={{ gap: 10, flex: 1 }}>
          <TextInput label="Full name (as per passport)" value={(value.fullName as string) ?? ''} onChange={(e) => onChange({ ...value, fullName: e.target.value })} disabled={locked} error={errors.fullName} autoComplete="name" />
        </div>
        {photoSlot}
      </div>

      <Section code="A" title="Personal information">
        <div className="cz-grid cz-grid-2">
          {t('personal', 'dateOfBirth', 'Date of birth', { type: 'date' })}{t('personal', 'nationality', 'Nationality')}
          {t('personal', 'countryOfResidence', 'Country of residence')}{t('personal', 'cityState', 'City / State')}
        </div>
        <TextArea label="Residential address" rows={2} value={str('personal', 'residentialAddress')} onChange={(e) => set('personal', 'residentialAddress', e.target.value)} disabled={locked} error={errors['personal.residentialAddress']} />
        <div className="cz-grid cz-grid-2">{t('personal', 'mobile', 'Mobile / WhatsApp (with country code)', { type: 'tel', autoComplete: 'tel' })}{t('personal', 'email', 'Email address', { type: 'email', autoComplete: 'email' })}</div>
      </Section>

      <Section code="B" title="Professional & business details">
        <div className="cz-grid cz-grid-2">
          {t('professional', 'occupation', 'Occupation')}{t('professional', 'designation', 'Designation')}{t('professional', 'companyName', 'Company / Business name')}{t('professional', 'natureOfBusiness', 'Nature of business')}
          {t('professional', 'annualIncomeRange', 'Annual income range (optional)')}{t('professional', 'netWorth', 'Approximate net worth (optional)')}
        </div>
      </Section>

      <Section code="C" title="Family details">
        <Ticks legend="Marital status" single options={['Single', 'Married', 'Other']} value={str('family', 'maritalStatus')} onChange={(v) => set('family', 'maritalStatus', v)} disabled={locked} error={errors['family.maritalStatus']} />
        <div className="cz-grid cz-grid-2">
          {t('family', 'spouseName', 'Spouse name (if applicable)')}{num('family', 'numberOfChildren', 'Number of children')}
          {t('family', 'childrenAges', 'Age(s) of children')}{t('family', 'familyMembersProposed', 'Family members proposed for EB-5')}
        </div>
      </Section>

      <Section code="D" title="Purpose of consultancy">
        <Ticks legend="Select all applicable objectives" options={EB5_OBJECTIVES} value={sec('purpose').objectives as string[]} onChange={(v) => set('purpose', 'objectives', v)} disabled={locked} error={errors['purpose.objectives']} />
        <TextArea label="Other objectives / additional requirements" rows={2} value={str('purpose', 'otherObjectives')} onChange={(e) => set('purpose', 'otherObjectives', e.target.value)} disabled={locked} />
      </Section>

      <Section code="E" title="Investment readiness">
        <Ticks legend="Indicative investment budget (USD; not a legal eligibility determination)" single options={EB5_BUDGET_BANDS} value={str('readiness', 'budgetBand')} onChange={(v) => set('readiness', 'budgetBand', v)} disabled={locked} error={errors['readiness.budgetBand']} />
        <Ticks legend="Expected investment timeline" single options={EB5_APP_TIMELINES} value={str('readiness', 'timeline')} onChange={(v) => set('readiness', 'timeline', v)} disabled={locked} error={errors['readiness.timeline']} />
        <Ticks legend="Proposed source of funds" options={SOURCE_OF_FUNDS} value={sec('readiness').sourceOfFunds as string[]} onChange={(v) => set('readiness', 'sourceOfFunds', v)} disabled={locked} error={errors['readiness.sourceOfFunds']} />
        <TextArea label="Other source / comments (optional)" rows={2} value={str('readiness', 'otherSourceComments')} onChange={(e) => set('readiness', 'otherSourceComments', e.target.value)} disabled={locked} />
      </Section>

      <Section code="F" title="Previous U.S. immigration history">
        <div className="cz-eb5-yn" role="group" aria-label="Previous U.S. immigration history">
          {EB5_HISTORY_QUESTIONS.map((q) => (
            <fieldset key={q.key} disabled={locked}><legend>{q.label}</legend>
              <label><input type="radio" name={q.key} checked={sec('history')[q.key] === true} onChange={() => set('history', q.key, true)} />Yes</label>
              <label><input type="radio" name={q.key} checked={sec('history')[q.key] === false} onChange={() => set('history', q.key, false)} />No</label>
              {errors[`history.${q.key}`] && <span className="cz-error-text">{errors[`history.${q.key}`]}</span>}
            </fieldset>
          ))}
        </div>
        <div className="cz-grid cz-grid-2">{t('history', 'currentVisaCategory', 'Current visa category (if applicable)')}{t('history', 'existingConsultant', 'Existing consultant / attorney (optional)')}</div>
      </Section>

      <Section code="G" title="Consultation preferences">
        <Ticks legend="Preferred meeting mode" single options={EB5_MEETING_MODES} value={str('preferences', 'meetingMode')} onChange={(v) => set('preferences', 'meetingMode', v)} disabled={locked} error={errors['preferences.meetingMode']} />
        <div className="cz-grid cz-grid-2">{t('preferences', 'preferredDateTime', 'Preferred date / time')}{t('preferences', 'referralSource', 'Referral source / name')}</div>
      </Section>

      <Section code="H" title="Proposed consultancy scope"><p style={{ margin: 0 }}>{EB5_SCOPE_TEXT}</p></Section>

      <Section code="I" title="Consultancy fees & payment terms">
        <p style={{ margin: 0 }}>Registration, assessment and professional consultancy fees, applicable taxes, the payment schedule and refund / cancellation terms are agreed separately in writing before any paid work begins. Attorney fees, government charges, regional-center fees, investment capital, travel and third-party charges are separate unless expressly included. <strong>Consultancy fees are not EB-5 capital.</strong></p>
      </Section>

      <Section code="J" title="Terms & applicant declaration">
        <ol className="cz-eb5-terms">{EB5_APPLICATION_TERMS.map((x) => <li key={x}>{x}</li>)}</ol>
        <fieldset className="cz-eb5-ticks" disabled={locked}><legend>Applicant consent</legend>
          <div>{([['preliminaryAssessment', 'I consent to preliminary assessment'], ['authorizeContact', 'I authorize contact about this enquiry'], ['finalizeFeesBeforePaidServices', 'I agree to finalize fees before paid services']] as const).map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={sec('consents')[k] === true} onChange={(e) => set('consents', k, e.target.checked)} />{l}</label>
          ))}</div>
          {Object.keys(errors).some((k) => k.startsWith('consents')) && <p className="cz-error-text">All three consents are required.</p>}
        </fieldset>
        <div className="cz-grid cz-grid-2">
          <TextInput label="Applicant signature (type your full name)" value={(value.signature as string) ?? ''} onChange={(e) => onChange({ ...value, signature: e.target.value })} disabled={locked} error={errors.signature} />
          <TextInput label="Date / Place" value={(value.datePlace as string) ?? ''} onChange={(e) => onChange({ ...value, datePlace: e.target.value })} disabled={locked} error={errors.datePlace} placeholder="e.g. 22 Nov 2026, Hyderabad" />
        </div>
      </Section>
    </div>
  );
}
