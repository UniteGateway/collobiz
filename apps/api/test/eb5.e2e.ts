/**
 * GO EB5 on the real API: partner onboarding by compliance, protected leads with duplicate claims, role-scoped views
 * (partners never see contact details or documents), client application, consultations, legal gates on agreements
 * and invoices, client signature, finance verification activating the engagement, encrypted documents, case
 * provenance, evidence-gated projects and compliance-only compensation.
 */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, login, loginAll, resetDatabase, seed } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3c50000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('GO EB5', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let s: Record<string, string>;
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app);
    s = { admin: await login(app, 'citrus.admin@goeb5.example', { mfa: true }), manager: await login(app, 'manager@goeb5.example', { mfa: true }), attorney: await login(app, 'attorney@goeb5.example', { mfa: true }), client: await login(app, 'client@goeb5.example') };
  });
  afterAll(async () => { await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, tok: string, b: object = {}) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const prospect = { fullName: 'Rohan Kapoor', country: 'India', city: 'Mumbai', email: 'rohan.kapoor@example.com', phone: '+91 98111 22233', readiness: 'Funds ready', timeline: '3–6 months', contactPreference: 'Email', consent: true };
  let leadId: string;

  it('roles: module visible only to authorised users; staff roles need two-step sign-in', async () => {
    expect((await get('/eb5/me', t.ravi).expect(200)).body).toMatchObject({ visible: false, roles: [] });
    expect((await get('/eb5/me', s.admin).expect(200)).body.roles).toContain('citrus_admin');
    expect((await get('/eb5/me', t.meera).expect(200)).body.roles).toContain('bd_partner');
    await get('/eb5/leads', t.ravi).expect(200).expect((r) => expect(r.body).toEqual([]));
    await get('/eb5/partners', t.meera).expect(403);
    await get('/eb5/settings', s.admin).expect(200).expect((r) => expect(r.body.schedule).toEqual({ total: 20_000_000, commencement: 2_000_000, balance: 18_000_000 }));
  });

  it('partners: compliance approves only with signed agreement and I-956K assessment; a partner sees status only', async () => {
    const ap = (await post('/eb5/partners/apply', t.ravi, { kind: 'financial_consultant', role: 'referral_consultant', jurisdiction: 'India', specialization: 'Gujarat business families', contactEmail: 'ravi@sunrise.example' }).expect(201)).body;
    await post('/eb5/partners/apply', t.ravi, { kind: 'financial_consultant', role: 'referral_consultant', jurisdiction: 'India', specialization: 'Gujarat business families', contactEmail: 'ravi@sunrise.example' }).expect(409);
    await post('/eb5/leads', t.ravi, prospect).expect(403); // not approved yet
    await post(`/eb5/partners/${ap.id}/review`, s.manager, { decision: 'approve', note: 'All good here', i956kStatus: 'pending', agreementStatus: 'signed' }).expect(403);
    await post(`/eb5/partners/${ap.id}/review`, t.compliance, { decision: 'approve', note: 'Agreement pending', i956kStatus: 'pending', agreementStatus: 'sent' }).expect(400);
    await post(`/eb5/partners/${ap.id}/review`, t.compliance, { decision: 'approve', note: 'Assess first', i956kStatus: 'not_assessed', agreementStatus: 'signed' }).expect(400);
    await post(`/eb5/partners/${ap.id}/review`, t.compliance, { decision: 'approve', note: 'Agreement signed; I-956K under review by counsel', i956kStatus: 'pending', agreementStatus: 'signed' }).expect(200);
    expect((await get('/eb5/me', t.ravi).expect(200)).body.roles).toContain('referral_consultant');
  });

  it('leads: protected, duplicate claims go to compliance, partners never see contact details', async () => {
    await post('/eb5/leads', t.ravi, { ...prospect, consent: false }).expect(400);
    const l = (await post('/eb5/leads', t.ravi, prospect).expect(201)).body;
    expect(l).toMatchObject({ duplicate: false }); leadId = l.id;
    const dup = (await post('/eb5/leads', t.meera, { ...prospect, fullName: 'R. Kapoor', email: 'ROHAN.KAPOOR@example.com' }).expect(201)).body;
    expect(dup.duplicate).toBe(true); expect(JSON.stringify(dup)).not.toMatch(/Sunrise|EB5L-2026-100003/);
    const mine = (await get('/eb5/leads', t.ravi).expect(200)).body;
    expect(mine).toHaveLength(1); expect(mine[0]).toMatchObject({ relation: 'partner', status: 'Introduced' });
    expect(JSON.stringify(await get(`/eb5/leads/${leadId}`, t.ravi).then((r) => r.body))).not.toMatch(/rohan\.kapoor|98111/);
    await get(`/eb5/leads/${leadId}`, t.meera).expect(404); // another partner's lead
    const full = (await get(`/eb5/leads/${leadId}`, s.manager).expect(200)).body;
    expect(full.contact).toMatchObject({ email: 'rohan.kapoor@example.com' });
    const disputes = (await get('/eb5/disputes', t.compliance).expect(200)).body;
    await post(`/eb5/leads/${disputes[0].id}/ownership`, t.compliance, { decision: 'keep_existing', note: 'First introduction by Sunrise is time-stamped earlier' }).expect(200);
    await post(`/eb5/leads/${leadId}/stage`, s.manager, { stage: 8, note: 'Trying to skip' }).expect(400); // signature stage follows the record
    await post(`/eb5/leads/${leadId}/stage`, s.manager, { stage: 2, note: 'Spoke on the phone' }).expect(200);
  });

  it('client application: draft, photo, submit with full validation; staff review', async () => {
    const attorneyId = (await get(`/eb5/leads/${leadId}`, s.manager)).body.staff.find((x: any) => x.role === 'attorney').id;
    await post(`/eb5/leads/${leadId}/assign`, s.manager, { attorneyId, followUpOn: '2026-12-01' }).expect(200);
    const inv = (await post(`/eb5/leads/${leadId}/invite-client`, s.manager).expect(200)).body;
    expect(inv.newAccount).toBe(true);
    await api(app).post('/v1/auth/invitations/accept').send({ token: inv.devInviteToken, password: 'Collabiz#2026x' }).expect((r) => expect([200, 201]).toContain(r.status));
    const c = await login(app, 'rohan.kapoor@example.com', { password: 'Collabiz#2026x' });
    await put('/eb5/applications/mine', c, { data: { fullName: 'Rohan Kapoor' } }).expect(200);
    await api(app).post('/v1/eb5/applications/mine/photo').set(auth(c)).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(200);
    await post('/eb5/applications/mine/submit', c).expect(400);
    const full = { fullName: 'Rohan Kapoor',
      personal: { dateOfBirth: '1980-05-01', nationality: 'Indian', countryOfResidence: 'India', cityState: 'Mumbai, Maharashtra', residentialAddress: '12 Marine Drive, Mumbai 400020', mobile: '+91 98111 22233', email: 'rohan.kapoor@example.com' },
      professional: { occupation: 'Business owner', designation: 'Managing Director', companyName: 'Kapoor Textiles', natureOfBusiness: 'Textile exports' },
      family: { maritalStatus: 'Married', spouseName: 'Anita Kapoor', numberOfChildren: 2, childrenAges: '12, 9', familyMembersProposed: 'Spouse and two children' },
      purpose: { objectives: ["Children's education in the USA", 'U.S. permanent residency through EB-5'] },
      readiness: { budgetBand: '$800,000 - $1,049,999', timeline: 'Within 6 months', sourceOfFunds: ['Business income'] },
      history: { visitedUsa: true, holdsUsVisa: true, appliedPermanentResidency: false, visaRefusal: false, workingWithOther: false, currentVisaCategory: 'B1/B2' },
      preferences: { meetingMode: 'Video call', preferredDateTime: 'Weekday evenings IST', referralSource: 'Sunrise Traders' },
      consents: { preliminaryAssessment: true, authorizeContact: true, finalizeFeesBeforePaidServices: true }, signature: 'Rohan Kapoor', datePlace: '20 Nov 2026, Mumbai' };
    await put('/eb5/applications/mine', c, { data: full }).expect(200);
    const sub = (await post('/eb5/applications/mine/submit', c).expect(200)).body;
    await put('/eb5/applications/mine', c, { data: full }).expect(409);
    await get(`/eb5/applications/${sub.id}`, t.ravi).expect(404);
    expect((await get(`/eb5/applications/${sub.id}`, s.manager).expect(200)).body.data.fullName).toBe('Rohan Kapoor');
    await get(`/eb5/applications/${sub.id}/photo`, s.manager).expect(200).expect('content-type', /image\/png/);
    await post(`/eb5/applications/${sub.id}/review`, s.manager, { note: 'Complete; book attorney review' }).expect(200);
    s.rohan = c;
  });

  it('consultations: schedule, complete with follow-up', async () => {
    const cns = (await post('/eb5/consultations', s.manager, { leadId, scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), timezone: 'Asia/Kolkata', mode: 'Online', kind: 'Attorney', durationMin: 45 }).expect(201)).body;
    expect((await get('/eb5/consultations', s.attorney).expect(200)).body.some((x: any) => x.id === cns.id)).toBe(true);
    await post(`/eb5/consultations/${cns.id}`, s.manager, { status: 'completed', attendance: 'Client attended', notes: 'Discussed eligibility questions for the attorney', followUp: { title: 'Send agreement draft', dueOn: '2026-12-05' } }).expect(200);
    expect((await get('/eb5/tasks', s.manager).expect(200)).body.some((x: any) => x.title === 'Send agreement draft')).toBe(true);
  });

  it('agreements and invoices stay blocked until counsel approves; then sign, invoice, verify activates', async () => {
    const ag = (await post('/eb5/agreements', s.manager, { leadId }).expect(201)).body;
    const d = (await get(`/eb5/agreements/${ag.id}`, s.manager).expect(200)).body;
    expect(d.body).toMatch(/^LEGAL DRAFT — NOT FOR EXECUTION/); expect(d.body).toMatch(/between CITRUS360 LLC, USA, operating the GO EB5 brand/); expect(d.body).toMatch(/No instruction in this Agreement authorizes payment of investment capital to Consultant/); expect(d.body).toMatch(/Client address: 12 Marine Drive/); expect(d.body).toMatch(/SCHEDULE B — FEE MILESTONES/);
    await get(`/eb5/agreements/${ag.id}`, s.rohan).expect(404); // not sent yet
    await post(`/eb5/agreements/${ag.id}/transition`, s.manager, { to: 'Internal Review' }).expect(200);
    await post(`/eb5/agreements/${ag.id}/transition`, t.compliance, { to: 'Legal Approved' }).expect(409); // gates closed
    await post('/eb5/settings/gates/agreementTemplateApproved', s.manager, { approved: true, reference: 'Counsel letter ref ABC-1' }).expect(403);
    for (const g of ['agreementTemplateApproved', 'feesApproved']) await post(`/eb5/settings/gates/${g}`, t.compliance, { approved: true, reference: 'Counsel opinion ref TEST-2026-01' }).expect(200);
    await post(`/eb5/agreements/${ag.id}/transition`, t.compliance, { to: 'Legal Approved' }).expect(200);
    await post(`/eb5/agreements/${ag.id}/transition`, s.manager, { to: 'Sent to Client' }).expect(200);
    const view = (await get(`/eb5/agreements/${ag.id}`, s.rohan).expect(200)).body;
    expect(view.state).toBe('Viewed');
    await post(`/eb5/agreements/${ag.id}/sign`, s.rohan, { fullName: 'Someone Else', agree: true, bodyHash: view.bodyHash }).expect(400);
    await post(`/eb5/agreements/${ag.id}/sign`, s.rohan, { fullName: 'rohan kapoor', agree: true, bodyHash: view.bodyHash }).expect(200);
    await post('/eb5/invoices', s.admin, { leadId, kind: 'commencement', description: 'per agreement' }).expect(409); // not counter-signed + invoicing gate
    await post(`/eb5/agreements/${ag.id}/transition`, s.admin, { to: 'Counter-Signed' }).expect(200);
    await post('/eb5/invoices', s.admin, { leadId, kind: 'commencement', description: 'per agreement' }).expect(409); // invoicing gate closed
    await post('/eb5/settings/gates/invoicingApproved', t.compliance, { approved: true, reference: 'CITRUS360 billing channel approved, ref BILL-1' }).expect(200);
    const inv = (await post('/eb5/invoices', s.admin, { leadId, kind: 'commencement', description: 'per agreement' }).expect(201)).body;
    expect(inv).toMatchObject({ amountCents: 2_000_000, ledger: 'consultancy', status: 'issued' });
    await post('/eb5/invoices', s.admin, { leadId, kind: 'milestone', amountCents: 18_000_001, description: 'Too much' }).expect(409);
    await post('/eb5/ledger/track', s.admin, { leadId, ledger: 'investment', amountCents: 80_000_000, description: 'Investment paid directly to the project escrow (tracking only)' }).expect(201);
    await post(`/eb5/invoices/${inv.id}/verify`, t.finance, { bankReference: 'BANK-1', clearedOn: '2026-11-20' }).expect(409); // nothing reported
    await post(`/eb5/invoices/${inv.id}/report-payment`, s.rohan, { reference: 'SWIFT-REF-77' }).expect(200);
    await post(`/eb5/invoices/${inv.id}/verify`, s.admin, { bankReference: 'BANK-1', clearedOn: '2026-11-20' }).expect(403);
    expect((await post(`/eb5/invoices/${inv.id}/verify`, t.finance, { bankReference: 'BANK-1', clearedOn: '2026-11-20' }).expect(200)).body.receipt).toMatch(/^C360-RCPT-/);
    const lead = (await get(`/eb5/leads/${leadId}`, s.manager).expect(200)).body;
    expect(lead.stageLabel).toBe('Consultancy Active');
    expect((await get(`/eb5/agreements/${ag.id}`, s.manager).expect(200)).body.state).toBe('Active');
    const ledgers = (await get('/eb5/invoices', t.finance).expect(200)).body.ledgers;
    expect(ledgers.find((l: any) => l.code === 'investment').totals).toEqual({ tracked: 80_000_000 });
    expect(ledgers.find((l: any) => l.code === 'consultancy').totals.verified).toBe(2_000_000);
    expect((await get('/eb5/invoices', s.rohan).expect(200)).body.invoices.every((i: any) => i.ledger === 'consultancy')).toBe(true);
  });

  it('documents are encrypted, private, access-logged; case updates carry provenance', async () => {
    const d = (await post('/eb5/documents/request', s.manager, { leadId, category: 'Passport', title: 'Passport bio page' }).expect(201)).body;
    await api(app).post(`/v1/eb5/documents/${d.id}/upload`).set(auth(s.rohan)).attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' }).expect(200);
    await get(`/eb5/documents/${d.id}`, t.ravi).expect(404); // the introducing partner never sees documents
    const f = await get(`/eb5/documents/${d.id}/file`, s.manager).expect(200);
    expect(Buffer.from(f.body).toString('latin1').startsWith('%PDF')).toBe(true);
    const meta = (await get(`/eb5/documents/${d.id}`, s.manager).expect(200)).body;
    expect(meta.access.map((a: any) => a.action)).toEqual(expect.arrayContaining(['upload', 'download']));
    await post(`/eb5/documents/${d.id}/review`, s.manager, { decision: 'accept' }).expect(200);
    await post(`/eb5/cases/${leadId}/milestones`, s.manager, { stage: 2, statusSource: 'attorney_verified', note: 'Attorney says eligible' }).expect(403);
    await post(`/eb5/cases/${leadId}/milestones`, s.manager, { stage: 2, statusSource: 'internal', note: 'Waiting for attorney review', visibleToClient: true }).expect(400);
    await post(`/eb5/cases/${leadId}/milestones`, s.attorney, { stage: 2, statusSource: 'attorney_verified', note: 'Attorney eligibility review completed', visibleToClient: true }).expect(201);
    await post(`/eb5/cases/${leadId}/milestones`, s.manager, { stage: 3, statusSource: 'document_supported', note: 'Source-of-funds file started', evidenceDocumentId: d.id }).expect(201);
    const portal = (await get('/eb5/portal', s.rohan).expect(200)).body;
    expect(portal.caseUpdates).toHaveLength(1); expect(portal.disclaimer).toMatch(/not a law firm/);
    await get(`/eb5/cases/${leadId}`, t.ravi).expect(404);
  });

  it('projects need verified evidence to go offering; compensation stays disabled and manual', async () => {
    const proj = (await get('/eb5/projects', s.manager).expect(200)).body.find((p: any) => /Texas Solar/.test(p.name));
    expect(proj.offeringStatus).toBe('proposed');
    await post(`/eb5/projects/${proj.id}/status`, s.manager, { offeringStatus: 'offering', note: 'Trying too early' }).expect(409);
    await post(`/eb5/projects/${proj.id}/claims`, s.manager, { key: 'teaDetermination', action: 'submit', evidence: 'Short' }).expect(400);
    await post(`/eb5/projects/${proj.id}/claims`, s.manager, { key: 'teaDetermination', action: 'submit', evidence: 'State TEA letter dated 2026-10-01, ref TX-TEA-001' }).expect(200);
    await post(`/eb5/projects/${proj.id}/claims`, s.manager, { key: 'teaDetermination', action: 'verify', evidence: 'Checked it myself today' }).expect(403);
    expect((await post(`/eb5/projects/${proj.id}/claims`, t.compliance, { key: 'teaDetermination', action: 'verify', evidence: 'Letter checked against the state register' }).expect(200)).body.claimsList[0].status).toBe('verified');
    await get('/eb5/compensation', s.manager).expect(403);
    const partners = (await get('/eb5/partners', t.compliance).expect(200)).body;
    const c = (await post('/eb5/compensation', t.compliance, { partnerId: partners[0].id, description: 'Proposed fixed referral fee to be reviewed by counsel' }).expect(201)).body;
    await post(`/eb5/compensation/${c.id}/decide`, t.compliance, { decision: 'approve', legalReference: 'Counsel memo ref COMP-01' }).expect(409); // compensation gate closed
    expect((await get('/eb5/compensation', t.compliance).expect(200)).body.enabled).toBe(false);
    const dash = (await get('/eb5/dashboard', s.admin).expect(200)).body;
    expect(dash.collections.verifiedCents).toBe(2_000_000); expect(dash.leads.possibleDuplicates).toBe(1);
    const csv = await get('/eb5/reports?format=csv', s.admin).expect(200);
    expect(csv.text).toMatch(/^Partner,Introduced/);
    expect((await get('/eb5/audit', t.compliance).expect(200)).body.length).toBeGreaterThan(10);
  });

  it('public website: enquiries and the online application create protected leads; spam trap; duplicates create nothing new', async () => {
    const enq = { kind: 'consultation', fullName: 'Website Visitor', email: 'visitor.web@example.com', phone: '+91 90909 80808', country: 'India', interest: 'Texas solar project', readiness: 'Funds available now', consent: true };
    await api(app).post('/v1/eb5/public/enquiries').send({ ...enq, website: 'spam.example' }).expect(400);
    await api(app).post('/v1/eb5/public/enquiries').send({ ...enq, consent: false }).expect(400);
    expect((await api(app).post('/v1/eb5/public/enquiries').send(enq).expect(201)).body.reference).toMatch(/^EB5L-/);
    const form = { fullName: 'Lakshmi Iyer', personal: { dateOfBirth: '1979-02-02', nationality: 'Indian', countryOfResidence: 'India', cityState: 'Chennai, Tamil Nadu', residentialAddress: '4 Boat Club Road, Chennai', mobile: '+91 94444 11111', email: 'lakshmi.iyer@example.com' },
      professional: { occupation: 'Doctor' }, family: { maritalStatus: 'Married', numberOfChildren: 1 }, purpose: { objectives: ['Family relocation'] },
      readiness: { budgetBand: '$1,050,000 and above', timeline: 'Within 12 months', sourceOfFunds: ['Personal savings', 'Property sale'] },
      history: { visitedUsa: true, holdsUsVisa: false, appliedPermanentResidency: false, visaRefusal: false, workingWithOther: false }, preferences: { meetingMode: 'Video call' },
      consents: { preliminaryAssessment: true, authorizeContact: true, finalizeFeesBeforePaidServices: true }, signature: 'Lakshmi Iyer', datePlace: 'Chennai' };
    await api(app).post('/v1/eb5/public/applications').send({ ...form, consents: { ...form.consents, finalizeFeesBeforePaidServices: false } }).expect(400);
    const r = (await api(app).post('/v1/eb5/public/applications').send(form).expect(201)).body;
    expect(r.reference).toMatch(/^EB5A-/); expect(r.devInviteToken).toBeTruthy();
    const apps = (await get('/eb5/applications', s.manager).expect(200)).body;
    expect(apps.find((a: any) => a.code === r.reference)).toMatchObject({ status: 'submitted', country: 'India' });
    const again = (await api(app).post('/v1/eb5/public/applications').send(form).expect(201)).body;
    expect(again.reference).toBeNull();
    await api(app).post('/v1/auth/invitations/accept').send({ token: r.devInviteToken, password: 'Collabiz#2026y' }).expect(200);
    const lk = await login(app, 'lakshmi.iyer@example.com', { password: 'Collabiz#2026y' });
    expect((await get('/eb5/portal', lk).expect(200)).body.application.code).toBe(r.reference);
  });

  it('settings: changing the contracting entity withdraws the template approval', async () => {
    const st = (await get('/eb5/settings', s.admin).expect(200)).body;
    expect(st.gates.find((g: any) => g.key === 'agreementTemplateApproved').approved).toBe(true);
    const body = { consultancyEntity: 'Unite Group Inc.', entityJurisdiction: 'USA', consultantAddress: '244 Fifth Avenue, Suite #1849, New York, NY 10001', consultantEmail: 'info@goeb5.in', governingLaw: '', disputeForum: '', summaryBusinessDays: 10, indicativeInvestmentUsd: 800000, consultancyFeeUsd: 200000, commencementPct: 10 };
    const after = (await put('/eb5/settings', s.admin, body).expect(200)).body;
    expect(after.consultancyEntity).toBe('Unite Group Inc.');
    expect(after.gates.find((g: any) => g.key === 'agreementTemplateApproved').approved).toBe(false);
    expect(after.gates.find((g: any) => g.key === 'feesApproved').approved).toBe(true);
  });
});
