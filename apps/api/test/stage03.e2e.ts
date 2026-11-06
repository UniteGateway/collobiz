import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed, ACCOUNTS } from './helpers';
import type { SeedRefs } from '../src/db/seed';

const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% ${label} ${Math.random()}\n%%EOF`);

async function newVerifiedUser(app: INestApplication, email: string, fullName: string) {
  const r = await api(app).post('/v1/auth/register').send({ email, fullName, password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
  await api(app).post('/v1/auth/otp/verify').set(auth(r.body.accessToken)).send({ channel: 'email', code: r.body.devOtp }).expect(200);
  return r.body.accessToken as string;
}

/** Runs onboarding steps 013–021 for a company. */
async function onboardCompany(app: INestApplication, tok: string, fullName: string, gstin = '29AAACN1234M1Z3') {
  await api(app).post('/v1/onboarding/account-type').set(auth(tok)).send({ kind: 'company', partnerTypes: ['contractor'] }).expect(200);
  await api(app).put('/v1/onboarding/company').set(auth(tok)).send({ legalName: `${fullName} Projects Pvt Ltd`, registrationNumber: 'U12345KA2020PTC1', gstin, country: 'IN', city: 'Bengaluru' }).expect(200);
  await api(app).put('/v1/onboarding/industries').set(auth(tok)).send({ sectors: ['solar'], skills: ['Rooftop'], certifications: [], capacityMax: 1_00_00_000_00 }).expect(200);
  await api(app).put('/v1/onboarding/coverage').set(auth(tok)).send({ regions: ['IN-KA'], willingToTravel: true }).expect(200);
  await api(app).put('/v1/onboarding/profile').set(auth(tok)).send({ headline: 'Rooftop solar installer in Bengaluru', about: 'We install rooftop solar systems for commercial buildings across Karnataka.', services: ['EPC'], pastProjects: [], consentToMatch: true }).expect(200);
  for (const t of ['pan', 'incorporation_certificate', 'address_proof']) {
    await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', t).attach('file', PDF(t), { filename: `${t}.pdf`, contentType: 'application/pdf' }).expect(201);
  }
  await api(app).put('/v1/onboarding/bank-tax').set(auth(tok)).send({ accountHolder: fullName, accountNumber: '123456789012', ifsc: 'ICIC0001234', bankName: 'ICICI Bank', pan: 'ABCPN1234Q', gstRegistered: true, gstin }).expect(200);
  const ags = await api(app).get('/v1/onboarding/agreements').set(auth(tok)).expect(200);
  for (const a of ags.body) await api(app).post('/v1/onboarding/agreements/accept').set(auth(tok)).send({ templateCode: a.code, version: a.version, typedName: fullName }).expect(201);
}

describe('Stage 03 — onboarding and KYB', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  beforeAll(async () => {
    await resetDatabase();
    refs = await seed();
    app = await bootApp();
    t = await loginAll(app);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => { await pool.end(); await app.close(); });

  describe('partner onboarding flow (013–021)', () => {
    let tok: string;
    let orgId: string;
    it('requires a verified email before creating a partner account', async () => {
      const r = await api(app).post('/v1/auth/register').send({ email: 'unverified@example.com', fullName: 'Un Verified', password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
      await api(app).post('/v1/onboarding/account-type').set(auth(r.body.accessToken)).send({ kind: 'company', partnerTypes: ['trader'] }).expect(403);
    });
    it('013 creates the organization with the user as owner', async () => {
      tok = await newVerifiedUser(app, 'kiran@nova.example', 'Kiran Rao');
      const r = await api(app).post('/v1/onboarding/account-type').set(auth(tok)).send({ kind: 'company', partnerTypes: ['contractor', 'consultant'] }).expect(200);
      orgId = r.body.organizationId;
      const me = await api(app).get('/v1/auth/me').set(auth(tok)).expect(200);
      expect(me.body.activeOrg).toMatchObject({ id: orgId, verificationStatus: 'not_started' });
      expect(me.body.orgRoles).toEqual(['org_owner']);
    });
    it('015 validates company identifiers', async () => {
      const r = await api(app).put('/v1/onboarding/company').set(auth(tok)).send({ legalName: 'X', registrationNumber: '1', gstin: 'BAD', country: 'IND', city: '' }).expect(400);
      expect(r.body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['legalName', 'gstin', 'country', 'city']));
      await api(app).put('/v1/onboarding/individual').set(auth(tok)).send({ displayName: 'Kiran', profession: 'Engineer', city: 'Pune', country: 'IN', yearsExperience: 3 }).expect(400);
    });
    it('019 validates uploads by content, size and scan', async () => {
      await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', 'pan').attach('file', Buffer.from('not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
      await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', 'pan').attach('file', Buffer.from('%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), { filename: 'e.pdf', contentType: 'application/pdf' }).expect(400);
      await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', 'pan').attach('file', Buffer.from('MZ....'), { filename: 'evil.exe', contentType: 'application/x-msdownload' }).expect(400);
      await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', 'passport_selfie').attach('file', PDF('x'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
    });
    it('cannot submit before completing every step', async () => {
      const r = await api(app).post('/v1/onboarding/submit').set(auth(tok)).set('Idempotency-Key', 'early-submit-1').expect(400);
      expect(r.body.message).toMatch(/Complete these steps first/);
    });
    it('completes onboarding; bank data is masked everywhere', async () => {
      await onboardCompany(app, tok, 'Kiran Rao');
      const b = await api(app).get('/v1/onboarding/bank-tax').set(auth(tok)).expect(200);
      expect(b.body.accountMasked).toBe('••••9012');
      expect(JSON.stringify(b.body)).not.toContain('123456789012');
      const { rows } = await pool.query('select account_number_enc from bank_profiles where organization_id=$1', [orgId]);
      expect(rows[0].account_number_enc).not.toContain('123456789012');
      const audit = await api(app).get(`/v1/admin/audit?objectId=${orgId}&limit=500`).set(auth(t.compliance)).expect(200);
      expect(JSON.stringify(audit.body)).not.toContain('123456789012');
    });
    it('021 rejects a typed name that does not match the registered name', async () => {
      await api(app).post('/v1/onboarding/agreements/accept').set(auth(tok)).send({ templateCode: 'partner_terms', version: 1, typedName: 'Someone Else' }).expect(400);
    });
    it('022 submits (idempotent) and locks the profile', async () => {
      const s = await api(app).get('/v1/onboarding/status').set(auth(tok)).expect(200);
      expect(s.body.canSubmit).toBe(true);
      await api(app).post('/v1/onboarding/submit').set(auth(tok)).expect(400); // Idempotency-Key required
      const r1 = await api(app).post('/v1/onboarding/submit').set(auth(tok)).set('Idempotency-Key', 'kiran-submit-0001').expect(200);
      expect(r1.body.organization.verificationStatus).toBe('submitted');
      const r2 = await api(app).post('/v1/onboarding/submit').set(auth(tok)).set('Idempotency-Key', 'kiran-submit-0001').expect(200);
      expect(r2.headers['idempotent-replay']).toBe('true');
      await api(app).put('/v1/onboarding/coverage').set(auth(tok)).send({ regions: ['IN-TN'], willingToTravel: false }).expect(409);
    });

    describe('admin verification queue (130) — verified / rejected / re-upload states', () => {
      it('partners cannot access the queue; compliance can', async () => {
        await api(app).get('/v1/admin/verification/queue').set(auth(tok)).expect(403);
        const q = await api(app).get('/v1/admin/verification/queue').set(auth(t.compliance)).expect(200);
        expect(q.body.map((o: any) => o.id)).toContain(orgId);
      });
      it('illegal transitions are rejected (409)', async () => {
        const r = await api(app).post(`/v1/admin/verification/${orgId}/decision`).set(auth(t.compliance)).set('Idempotency-Key', 'k-illegal-1').send({ decision: 'verified', reason: 'Looks fine' }).expect(409);
        expect(r.body.error).toBe('InvalidTransition');
      });
      it('claims, requests re-upload with a reason the partner can see', async () => {
        await api(app).post(`/v1/admin/verification/${orgId}/claim`).set(auth(t.compliance)).expect(200);
        const d = await api(app).get(`/v1/admin/verification/${orgId}`).set(auth(t.compliance)).expect(200);
        const pan = d.body.documents.find((x: any) => x.docType === 'pan');
        await api(app).post(`/v1/admin/verification/documents/${pan.id}/review`).set(auth(t.compliance)).send({ status: 'rejected' }).expect(400);
        await api(app).post(`/v1/admin/verification/documents/${pan.id}/review`).set(auth(t.compliance)).send({ status: 'rejected', note: 'PAN copy is unreadable' }).expect(200);
        await api(app).post(`/v1/admin/verification/${orgId}/decision`).set(auth(t.compliance)).set('Idempotency-Key', 'k-verify-early').send({ decision: 'verified', reason: 'ok' }).expect(400);
        await api(app).post(`/v1/admin/verification/${orgId}/decision`).set(auth(t.compliance)).set('Idempotency-Key', 'k-reupload-1').send({ decision: 'reupload_requested', reason: 'Please upload a clear PAN copy' }).expect(200);
        const s = await api(app).get('/v1/onboarding/status').set(auth(tok)).expect(200);
        expect(s.body.organization.verificationStatus).toBe('reupload_requested');
        expect(s.body.history[0]).toMatchObject({ to: 'reupload_requested', reason: 'Please upload a clear PAN copy' });
        expect(s.body.rejectedDocs[0].reviewNote).toBe('PAN copy is unreadable');
        expect(s.body.canSubmit).toBe(false);
      });
      it('partner re-uploads and resubmits; duplicate-GSTIN flag blocks verification until cleared', async () => {
        await api(app).post('/v1/onboarding/kyb/documents').set(auth(tok)).field('docType', 'pan').attach('file', PDF('pan v2'), { filename: 'pan-v2.pdf', contentType: 'application/pdf' }).expect(201);
        await api(app).post('/v1/onboarding/submit').set(auth(tok)).set('Idempotency-Key', 'kiran-submit-0002').expect(200);
        // second company reusing Kiran's GSTIN triggers an automatic high-severity flag
        const tok2 = await newVerifiedUser(app, 'dup@clone.example', 'Dup Clone');
        await onboardCompany(app, tok2, 'Dup Clone', '29AAACN1234M1Z3');
        const sub = await api(app).post('/v1/onboarding/submit').set(auth(tok2)).set('Idempotency-Key', 'dup-submit-0001').expect(200);
        const dupOrg = sub.body.organization.id;
        const risk = await api(app).get('/v1/admin/risk').set(auth(t.compliance)).expect(200);
        const flag = risk.body.flags.find((f: any) => f.organizationId === dupOrg && f.kind === 'duplicate_tax_id');
        expect(flag).toMatchObject({ severity: 'high', source: 'automatic' });
        // verify Kiran: accept docs, verify
        await api(app).post(`/v1/admin/verification/${orgId}/claim`).set(auth(t.compliance)).expect(200);
        const d = await api(app).get(`/v1/admin/verification/${orgId}`).set(auth(t.compliance)).expect(200);
        for (const doc of d.body.documents) await api(app).post(`/v1/admin/verification/documents/${doc.id}/review`).set(auth(t.compliance)).send({ status: 'accepted' }).expect(200);
        const open = d.body.flags.filter((f: any) => f.status === 'open');
        for (const f of open) await api(app).post(`/v1/admin/risk/flags/${f.id}/clear`).set(auth(t.compliance)).send({ note: 'Original GSTIN holder confirmed via registry' }).expect(200);
        const v = await api(app).post(`/v1/admin/verification/${orgId}/decision`).set(auth(t.compliance)).set('Idempotency-Key', 'k-verify-final').send({ decision: 'verified', reason: 'All documents verified', riskLevel: 'low' }).expect(200);
        expect(v.body).toMatchObject({ verificationStatus: 'verified', membershipLevel: 'verified' });
        // reject the clone (rejected state)
        await api(app).post(`/v1/admin/verification/${dupOrg}/claim`).set(auth(t.compliance)).expect(200);
        await api(app).post(`/v1/admin/verification/${dupOrg}/decision`).set(auth(t.compliance)).set('Idempotency-Key', 'k-reject-dup').send({ decision: 'rejected', reason: 'GSTIN belongs to another verified company', riskLevel: 'high' }).expect(200);
        const s2 = await api(app).get('/v1/onboarding/status').set(auth(tok2)).expect(200);
        expect(s2.body.organization.verificationStatus).toBe('rejected');
      });
      it('a reviewer cannot decide on an organization they belong to', async () => {
        await pool.query(`insert into memberships (user_id, organization_id, role) values ($1, $2, 'org_member')`, [refs.users.compliance, refs.orgs.greenbuild]);
        const tokC = (await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.compliance, password: 'Collabiz#2026', mfaCode: require('../src/common/crypto').totp('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), client: 'mobile' })).body.accessToken;
        await api(app).post(`/v1/admin/verification/${refs.orgs.greenbuild}/claim`).set(auth(tokC, refs.orgs.platform)).expect(403);
      });
      it('manual risk flags need a different reviewer to clear', async () => {
        const f = await api(app).post('/v1/admin/risk/flags').set(auth(t.compliance)).send({ organizationId: refs.orgs.sunrise, kind: 'adverse_media', severity: 'medium', note: 'News report on delayed deliveries' }).expect(201);
        await api(app).post(`/v1/admin/risk/flags/${f.body.id}/clear`).set(auth(t.compliance)).send({ note: 'self clear' }).expect(403);
        await api(app).post(`/v1/admin/risk/flags/${f.body.id}/clear`).set(auth(t.superadmin)).send({ note: 'Reviewed; delivery issue resolved' }).expect(200);
      });
    });
  });

  describe('documents are private and tenant-scoped', () => {
    it('owner gets a signed expiring URL; access is audited; other tenants get 404', async () => {
      const docs = await api(app).get('/v1/onboarding/kyb/documents').set(auth(t.asha)).expect(200);
      const u = await api(app).get(`/v1/onboarding/kyb/documents/${docs.body[0].id}/url`).set(auth(t.asha)).expect(200);
      const file = await api(app).get(u.body.url).expect(200);
      expect(file.body.toString().startsWith('%PDF') || file.text?.startsWith('%PDF')).toBe(true);
      await api(app).get(`/v1/onboarding/kyb/documents/${docs.body[0].id}/url`).set(auth(t.ravi)).expect(404);
      const tampered = u.body.url.replace(/sig=[^&]+/, 'sig=AAAA');
      await api(app).get(tampered).expect(400);
      const a = await api(app).get(`/v1/admin/audit?action=kyb.document_accessed&objectId=${docs.body[0].id}`).set(auth(t.compliance)).expect(200);
      expect(a.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('143 profile and 149 privacy', () => {
    it('143 returns own profile with masked identifiers only', async () => {
      const r = await api(app).get('/v1/profile').set(auth(t.asha)).expect(200);
      expect(r.body.organization.displayName).toBe('Volt EPC');
      expect(r.body.profile.panEnc).toBeUndefined();
      expect(r.body.bankTax.accountMasked).toMatch(/^••••/);
    });
    it('149 records consent changes and data requests with due dates', async () => {
      await api(app).post('/v1/privacy/consents').set(auth(t.ravi)).send({ purpose: 'marketing', granted: true }).expect(201);
      const c = await api(app).get('/v1/privacy/consents').set(auth(t.ravi)).expect(200);
      expect(c.body.current.find((x: any) => x.purpose === 'marketing').granted).toBe(true);
      const r = await api(app).post('/v1/privacy/requests').set(auth(t.ravi)).send({ kind: 'export', details: 'All my data' }).expect(201);
      expect(new Date(r.body.dueAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
      await api(app).post('/v1/privacy/requests').set(auth(t.ravi)).send({ kind: 'export' }).expect(400);
      const ex = await api(app).get('/v1/privacy/export').set(auth(t.ravi)).expect(200);
      expect(ex.body.user.email).toBe(ACCOUNTS.ravi);
      await api(app).post(`/v1/admin/risk/data-requests/${r.body.id}/resolve`).set(auth(t.compliance)).send({ status: 'completed', resolution: 'Export delivered via secure link' }).expect(200);
    });
    it('withdrawing matching consent updates the partner profile', async () => {
      await api(app).post('/v1/privacy/consents').set(auth(t.meera)).send({ purpose: 'matching', granted: false }).expect(201);
      const p = await api(app).get('/v1/profile').set(auth(t.meera)).expect(200);
      expect(p.body.profile.consentToMatch).toBe(false);
    });
  });
});
