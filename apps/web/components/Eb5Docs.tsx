'use client';
/** A4 renderings (print or save as PDF from the browser) for the GO EB5 application, agreement and receipt. */
import { usd } from '@/components/Eb5';

type Data = Record<string, Record<string, unknown> | string | undefined>;
const v = (x: unknown) => (x === undefined || x === null || x === '' ? '—' : Array.isArray(x) ? x.join(', ') : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : String(x));
function Rows({ rows }: { rows: [string, unknown][] }) {
  return <dl className="cz-eb5-grid">{rows.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{v(x)}</dd></div>)}</dl>;
}

export interface OfficeUse { manager: string | null; nextConsultation: string | null; feeReceived: string | null; receipt: string | null; status: string }
export function ApplicationSheet({ a, office }: { a: { code: string; status: string; submittedAt: string | null; signedName: string | null; hasPhoto: boolean; id: string; data: Data; brand: string; entity: string }; office?: OfficeUse | null }) {
  const s = (k: string) => (a.data[k] as Record<string, unknown>) ?? {};
  const h = s('history');
  const STATUS = ['Received', 'Assessment pending', 'Proposal issued', 'Agreement pending', 'Agreement executed', 'Process initiated'];
  return (
    <article className="cz-eb5-a4" aria-label={`Application ${a.code}`}>
      <header className="cz-eb5-a4-head">
        <div><img src="/brands/goeb5.png" alt="GO EB5" width={150} height={50} /><h1>Preliminary Consultancy Application</h1>
          <p style={{ margin: '4px 0 0' }}>Reference <strong>{a.code}</strong> · {a.status === 'draft' ? 'Draft' : `Submitted ${a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}`}</p></div>
        <div style={{ textAlign: 'right' }}><p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700 }}>{a.entity}<br /><span style={{ fontWeight: 400 }}>PRIVATE &amp; CONFIDENTIAL</span></p>
          {a.hasPhoto ? <img className="cz-eb5-a4-photo" src={`/api/v1/eb5/applications/${a.id}/photo`} alt="Applicant photograph" /> : <div className="cz-eb5-a4-photo">Passport-size photograph<br />35 × 45 mm</div>}</div>
      </header>
      <Rows rows={[['Full name (as per passport)', a.data.fullName]]} />
      <h2>A. Personal information</h2><Rows rows={[['Date of birth', s('personal').dateOfBirth], ['Nationality', s('personal').nationality], ['Country of residence', s('personal').countryOfResidence], ['City / State', s('personal').cityState], ['Residential address', s('personal').residentialAddress], ['Mobile / WhatsApp', s('personal').mobile], ['Email', s('personal').email]]} />
      <h2>B. Professional & business details</h2><Rows rows={[['Occupation', s('professional').occupation], ['Designation', s('professional').designation], ['Company / business', s('professional').companyName], ['Nature of business', s('professional').natureOfBusiness], ['Annual income range', s('professional').annualIncomeRange], ['Approx. net worth', s('professional').netWorth]]} />
      <h2>C. Family details</h2><Rows rows={[['Marital status', s('family').maritalStatus], ['Spouse', s('family').spouseName], ['Number of children', s('family').numberOfChildren], ['Age(s) of children', s('family').childrenAges], ['Family members proposed for EB-5', s('family').familyMembersProposed]]} />
      <h2>D. Purpose of consultancy</h2><Rows rows={[['Objectives', s('purpose').objectives], ['Other objectives', s('purpose').otherObjectives]]} />
      <h2>E. Investment readiness</h2><Rows rows={[['Indicative budget', s('readiness').budgetBand], ['Expected timeline', s('readiness').timeline], ['Source of funds', s('readiness').sourceOfFunds], ['Other source / comments', s('readiness').otherSourceComments]]} />
      <h2>F. Previous U.S. immigration history</h2><Rows rows={[['Previously visited the USA', h.visitedUsa], ['Currently hold a U.S. visa', h.holdsUsVisa], ['Applied for U.S. permanent residency', h.appliedPermanentResidency], ['Previous U.S. visa refusal', h.visaRefusal], ['Working with another consultant / attorney', h.workingWithOther], ['Current visa category', h.currentVisaCategory], ['Existing consultant / attorney', h.existingConsultant]]} />
      <h2>G. Consultation preferences</h2><Rows rows={[['Preferred meeting mode', s('preferences').meetingMode], ['Preferred date / time', s('preferences').preferredDateTime], ['Referral source / name', s('preferences').referralSource]]} />
      <h2>J. Applicant declaration</h2>
      <p style={{ margin: '0 0 6px' }}>Consents — preliminary assessment: {v(s('consents').preliminaryAssessment)} · contact about this enquiry: {v(s('consents').authorizeContact)} · finalize fees before paid services: {v(s('consents').finalizeFeesBeforePaidServices)}</p>
      <Rows rows={[['Applicant signature', a.signedName ?? a.data.signature], ['Date / Place', a.data.datePlace]]} />
      {office && <>
        <h2>K. For office use only</h2>
        <Rows rows={[['Assigned consultant', office.manager], ['Next consultation date', office.nextConsultation], ['Proposed fee / fee received', office.feeReceived], ['Receipt reference', office.receipt]]} />
        <p style={{ margin: '6px 0 0' }}>Application status: {STATUS.map((x) => <span key={x} style={{ marginRight: 10, fontWeight: x === office.status ? 700 : 400 }}>{x === office.status ? '☑' : '☐'} {x}</span>)}</p>
      </>}
      <p style={{ fontSize: 11.5, color: '#475467', marginTop: 24 }}>{a.brand} | Preliminary registration only — not a USCIS petition or investment agreement. Consultancy fees are not EB-5 capital; investment capital is never paid to or held by {a.entity} or COLLABIZ.</p>
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
