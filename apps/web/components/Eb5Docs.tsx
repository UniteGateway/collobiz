'use client';
/** A4 renderings (print or save as PDF from the browser) for the GO EB5 application, agreement and receipt. */
import { usd } from '@/components/Eb5';

type Data = Record<string, Record<string, unknown> | string | undefined>;
const v = (x: unknown) => (x === undefined || x === null || x === '' ? '—' : Array.isArray(x) ? x.join(', ') : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : String(x));
function Rows({ rows }: { rows: [string, unknown][] }) {
  return <dl className="cz-eb5-grid">{rows.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{v(x)}</dd></div>)}</dl>;
}

export function ApplicationSheet({ a }: { a: { code: string; status: string; submittedAt: string | null; signedName: string | null; hasPhoto: boolean; id: string; data: Data; brand: string; entity: string } }) {
  const s = (k: string) => (a.data[k] as Record<string, unknown>) ?? {};
  return (
    <article className="cz-eb5-a4" aria-label={`Application ${a.code}`}>
      <header className="cz-eb5-a4-head">
        <div><p style={{ margin: 0, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#475467' }}>{a.brand} · {a.entity}</p><h1>Preliminary Consultancy Application</h1>
          <p style={{ margin: '4px 0 0' }}>Reference <strong>{a.code}</strong> · {a.status === 'draft' ? 'Draft' : `Submitted ${a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}`}</p></div>
        {a.hasPhoto ? <img className="cz-eb5-a4-photo" src={`/api/v1/eb5/applications/${a.id}/photo`} alt="Applicant photograph" /> : <div className="cz-eb5-a4-photo">Photograph</div>}
      </header>
      <h2>1. Applicant</h2><Rows rows={[['Full name', s('applicant').fullName], ['Date of birth', s('applicant').dateOfBirth], ['Gender', s('applicant').gender], ['Nationality', s('applicant').nationality], ['Country of residence', s('applicant').countryOfResidence]]} />
      <h2>2. Contact and address</h2><Rows rows={[['Email', s('contact').email], ['Phone', s('contact').phone], ['Alternate phone', s('contact').alternatePhone], ['Address', [s('address').line1, s('address').line2].filter(Boolean).join(', ')], ['City', s('address').city], ['State', s('address').state], ['Postal code', s('address').postalCode], ['Country', s('address').country]]} />
      <h2>3. Profession and family</h2><Rows rows={[['Occupation', s('profession').occupation], ['Employer / business', s('profession').employerOrBusiness], ['Years', s('profession').yearsInBusiness], ['Industry', s('profession').industry], ['Marital status', s('family').maritalStatus], ['Spouse', s('family').spouseName], ['Children under 21', s('family').childrenUnder21]]} />
      <h2>4. Investment</h2><Rows rows={[['Proposed budget', s('investment').budgetUsd ? `$${Number(s('investment').budgetUsd).toLocaleString('en-US')}` : undefined], ['Source of funds', s('investment').sourceOfFunds], ['Objectives', s('investment').objectives]]} />
      <h2>5. U.S. immigration history and preferences</h2><Rows rows={[['Prior U.S. visas', s('history').priorUsVisas], ['Prior refusals', s('history').priorDenials], ['Details', s('history').details], ['Consultation', s('preferences').consultationMode], ['Time zone', s('preferences').timezone], ['Language', s('preferences').preferredLanguage]]} />
      <h2>6. Declaration</h2>
      <p>Privacy consent: {v(s('consents').privacy)} · Declaration: {v(s('consents').declaration)}. The applicant declares the information true and complete and understands that this is not legal advice and that no visa outcome, timeline or return is promised.</p>
      <p>Electronic signature: <strong>{a.signedName ?? (typeof a.data.signature === 'string' ? a.data.signature : '—')}</strong></p>
      <p style={{ fontSize: 11.5, color: '#475467', marginTop: 24 }}>Confidential. Prepared for {a.entity} consultancy assessment only. Investment capital is never paid to or held by {a.brand} or COLLABIZ.</p>
    </article>
  );
}

export function AgreementSheet({ ag }: { ag: { code: string; version: number; state: string; body: string; bodyHash: string; clientSignedName: string | null; clientSignedAt: string | null; counterSignedAt: string | null } }) {
  return (
    <article className="cz-eb5-a4" aria-label={`Agreement ${ag.code}`}>
      <header className="cz-eb5-a4-head"><div><h1>Consultancy Agreement</h1><p style={{ margin: '4px 0 0' }}>{ag.code} · version {ag.version} · {ag.state}</p></div></header>
      <div className="cz-eb5-body" style={{ marginTop: 16 }}>{ag.body}</div>
      <h2>Signatures</h2>
      <p>Client: {ag.clientSignedName ? `${ag.clientSignedName} — signed electronically ${new Date(ag.clientSignedAt!).toUTCString()}` : 'not signed'}</p>
      <p>For CITRUS360 LLC: {ag.counterSignedAt ? `counter-signed ${new Date(ag.counterSignedAt).toUTCString()}` : 'not counter-signed'}</p>
      <p style={{ fontSize: 11, color: '#475467' }}>Document fingerprint (SHA-256): <span className="cz-mono">{ag.bodyHash}</span></p>
    </article>
  );
}

export function ReceiptSheet({ inv }: { inv: { number: string; receiptNumber: string | null; description: string; amountCents: number; currency: string; status: string; verifiedAt: string | null; paymentReference: string | null; entity: string; lead: { code: string; fullName: string } } }) {
  return (
    <article className="cz-eb5-a4" aria-label={`Receipt ${inv.receiptNumber ?? inv.number}`}>
      <header className="cz-eb5-a4-head"><div><p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: '#475467' }}>{inv.entity}</p><h1>{inv.status === 'verified' ? 'Payment receipt' : 'Invoice'}</h1>
        <p style={{ margin: '4px 0 0' }}>{inv.status === 'verified' ? `Receipt ${inv.receiptNumber} for invoice ${inv.number}` : `Invoice ${inv.number}`}</p></div></header>
      <Rows rows={[['Client', `${inv.lead.fullName} (${inv.lead.code})`], ['Description', inv.description], ['Amount', `${usd(inv.amountCents)} ${inv.currency}`], ['Status', inv.status === 'verified' ? 'Payment verified by finance' : inv.status.replace('_', ' ')], ['Verified on', inv.verifiedAt ? new Date(inv.verifiedAt).toLocaleDateString('en-IN') : '—'], ['Payment reference', inv.paymentReference]]} />
      <p style={{ fontSize: 11.5, color: '#475467', marginTop: 24 }}>Consultancy fee only. EB-5 investment capital is paid under the project's offering documents and is never received by {inv.entity} or COLLABIZ.</p>
    </article>
  );
}
