import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, login, loginAll, resetDatabase, seed, ACCOUNTS, DEMO_PASSWORD } from './helpers';
import type { SeedRefs } from '../src/db/seed';

const cookieMap = (setCookie: string[] | string | undefined) =>
  Object.fromEntries((Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map((c) => c.split(';')[0].split('=')).map(([k, ...v]) => [k, v.join('=')]));

describe('Stage 02 — identity, tenant permissions and security', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => {
    await resetDatabase();
    refs = await seed();
    app = await bootApp();
    t = await loginAll(app);
  });
  afterAll(() => app.close());

  describe('registration & OTP (screens 011, 012)', () => {
    let token: string;
    let devOtp: string;
    it('registers a new account and returns tokens for mobile', async () => {
      const r = await api(app).post('/v1/auth/register').send({ email: 'NEW.partner@Example.com', fullName: 'New Partner', password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
      token = r.body.accessToken;
      devOtp = r.body.devOtp;
      expect(devOtp).toMatch(/^\d{6}$/);
      const me = await api(app).get('/v1/auth/me').set(auth(token)).expect(200);
      expect(me.body).toMatchObject({ email: 'new.partner@example.com', emailVerified: false, activeOrg: null });
    });
    it('rejects duplicate email (case-insensitive) and weak passwords', async () => {
      await api(app).post('/v1/auth/register').send({ email: 'new.partner@example.com', fullName: 'X Y', password: 'Secure123pass', acceptTerms: true }).expect(409);
      const r = await api(app).post('/v1/auth/register').send({ email: 'z@example.com', fullName: 'X Y', password: 'short', acceptTerms: false }).expect(400);
      expect(r.body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['password', 'acceptTerms']));
    });
    it('verifies email with OTP; wrong code is rejected', async () => {
      await api(app).post('/v1/auth/otp/verify').set(auth(token)).send({ channel: 'email', code: devOtp === '000000' ? '111111' : '000000' }).expect(400);
      await api(app).post('/v1/auth/otp/verify').set(auth(token)).send({ channel: 'email', code: devOtp }).expect(200);
      const me = await api(app).get('/v1/auth/me').set(auth(token)).expect(200);
      expect(me.body.emailVerified).toBe(true);
    });
    it('anonymous callers get 401 on protected routes; forged tokens rejected', async () => {
      await api(app).get('/v1/auth/me').expect(401);
      await api(app).get('/v1/auth/me').set('Authorization', 'Bearer a.b.c').expect(401);
    });
  });

  describe('login, lockout, cookies, CSRF and refresh rotation', () => {
    it('uses a generic error for wrong password and locks after 5 failures', async () => {
      const r = await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.vikram, password: 'Wrongpass123' }).expect(401);
      expect(r.body.message).toBe('Incorrect email or password');
      await api(app).post('/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrongpass123' }).expect(401);
      for (let i = 0; i < 4; i++) await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.vikram, password: 'Wrongpass123' });
      await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.vikram, password: DEMO_PASSWORD }).expect(403);
    });
    it('web login sets httpOnly cookies and enforces CSRF on cookie-authenticated mutations', async () => {
      const r = await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.meera, password: DEMO_PASSWORD }).expect(200);
      expect(r.body.accessToken).toBeUndefined();
      const raw = r.headers['set-cookie'] as unknown as string[];
      expect(raw.find((c) => c.startsWith('cz_at='))).toMatch(/HttpOnly/);
      const c = cookieMap(raw);
      const cookie = `cz_at=${c.cz_at}; cz_rt=${c.cz_rt}; cz_csrf=${c.cz_csrf}`;
      await api(app).get('/v1/auth/me').set('Cookie', cookie).expect(200);
      await api(app).post('/v1/auth/otp/send').set('Cookie', cookie).send({ channel: 'email' }).expect(403);
      await api(app).post('/v1/auth/otp/send').set('Cookie', cookie).set('X-CZ-CSRF', c.cz_csrf).send({ channel: 'email' }).expect(200);
    });
    it('rate-limits login attempts (§7.1)', async () => {
      let last = 0;
      for (let i = 0; i < 22; i++) last = (await api(app).post('/v1/auth/login').set('X-Enforce-Throttle', '1').send({ email: 'rl@example.com', password: 'Wrongpass123' })).status;
      expect(last).toBe(429);
    });
    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const r1 = await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.ravi, password: DEMO_PASSWORD, client: 'mobile' }).expect(200);
      const r2 = await api(app).post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(200);
      expect(r2.body.refreshToken).not.toBe(r1.body.refreshToken);
      await api(app).post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401); // reuse
      await api(app).post('/v1/auth/refresh').send({ refreshToken: r2.body.refreshToken }).expect(401); // family revoked
    });
  });

  describe('MFA for administrators (screen 145, §7.1)', () => {
    it('admin login without TOTP is challenged', async () => {
      const r = await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.superadmin, password: DEMO_PASSWORD }).expect(401);
      expect(r.body.mfaRequired).toBe(true);
      await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.superadmin, password: DEMO_PASSWORD, mfaCode: '123456' }).expect(401);
    });
    it('MFA-verified super admin holds admin capabilities but not payout approval', async () => {
      const me = await api(app).get('/v1/auth/me').set(auth(t.superadmin)).expect(200);
      expect(me.body.platformRoles).toContain('super_admin');
      expect(me.body.capabilities).toContain('users.manage');
      expect(me.body.capabilities).not.toContain('payout.approve');
    });
    it('a platform role without MFA enrolment cannot use admin capabilities', async () => {
      const reg = await api(app).post('/v1/auth/register').send({ email: 'ops.new@collabiz.local', fullName: 'Ops New', password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
      await api(app).post('/v1/admin/role-assignments').set(auth(t.superadmin)).send({ userId: reg.body.userId, organizationId: refs.orgs.platform, role: 'compliance', reason: 'Pilot compliance reviewer' }).expect(201);
      const tok = await login(app, 'ops.new@collabiz.local', { password: 'Secure123pass' });
      const r = await api(app).get('/v1/admin/audit').set(auth(tok)).expect(403);
      expect(r.body.message).toMatch(/Multi-factor/);
      const me = await api(app).get('/v1/auth/me').set(auth(tok)).expect(200);
      expect(me.body.mfaRequired).toBe(true);
      await api(app).post('/v1/auth/mfa/disable').set(auth(tok)).send({ code: '123456' }).expect(403);
    });
    it('enrols MFA end-to-end for a partner user', async () => {
      const tok = await login(app, ACCOUNTS.rohit);
      const setup = await api(app).post('/v1/auth/mfa/setup').set(auth(tok)).expect(200);
      expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/COLLABIZ/);
      const { totp } = await import('../src/common/crypto');
      await api(app).post('/v1/auth/mfa/enable').set(auth(tok)).send({ code: '000000' === totp(setup.body.secret) ? '111111' : '000000' }).expect(400);
      await api(app).post('/v1/auth/mfa/enable').set(auth(tok)).send({ code: totp(setup.body.secret), client: 'mobile' }).expect(200);
      await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.rohit, password: DEMO_PASSWORD }).expect(401);
      await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.rohit, password: DEMO_PASSWORD, mfaCode: totp(setup.body.secret) }).expect(200);
    });
  });

  describe('tenant isolation — acceptance gate: tenant A cannot enumerate tenant B', () => {
    it('cannot select another tenant via X-Org-Id', async () => {
      const r = await api(app).get('/v1/orgs/current/members').set(auth(t.asha, refs.orgs.sunrise)).expect(403);
      expect(r.body.message).toMatch(/not a member/);
    });
    it('member lists are scoped to the caller tenant', async () => {
      const a = await api(app).get('/v1/orgs/current/members').set(auth(t.asha)).expect(200);
      const emails = a.body.map((m: any) => m.email);
      expect(emails).toEqual(expect.arrayContaining([ACCOUNTS.asha, ACCOUNTS.rohit]));
      expect(emails).not.toContain(ACCOUNTS.ravi);
    });
    it('cannot mutate another tenant membership by id (404, no enumeration)', async () => {
      const b = await api(app).get('/v1/orgs/current/members').set(auth(t.ravi)).expect(200);
      const raviMembership = b.body[0].membershipId;
      await api(app).patch(`/v1/orgs/current/members/${raviMembership}`).set(auth(t.asha)).send({ role: 'org_member' }).expect(404);
      await api(app).delete(`/v1/orgs/current/members/${raviMembership}`).set(auth(t.asha)).expect(404);
    });
    it('cannot read another tenant activity feed', async () => {
      const r = await api(app).get('/v1/orgs/current/activity').set(auth(t.asha)).expect(200);
      expect(r.body.every((e: any) => e.objectType !== 'never')).toBe(true);
      await api(app).get('/v1/orgs/current/activity').set(auth(t.asha, refs.orgs.meera)).expect(403);
    });
    it('partners cannot reach admin endpoints', async () => {
      await api(app).get('/v1/admin/users').set(auth(t.asha)).expect(403);
      await api(app).get('/v1/admin/audit').set(auth(t.ravi)).expect(403);
    });
  });

  describe('team & sub-accounts (screen 144)', () => {
    let membershipId: string;
    it('owner invites a member who accepts and lands in the right tenant', async () => {
      const r = await api(app).post('/v1/orgs/current/members').set(auth(t.asha)).send({ email: 'site.engineer@voltepc.example', fullName: 'Site Engineer', role: 'org_member' }).expect(201);
      membershipId = r.body.membershipId;
      expect(r.body.status).toBe('invited');
      const acc = await api(app).post('/v1/auth/invitations/accept').send({ token: r.body.devInviteToken, password: 'Engineer123pass', client: 'mobile' }).expect(200);
      const me = await api(app).get('/v1/auth/me').set(auth(acc.body.accessToken)).expect(200);
      expect(me.body.activeOrg.id).toBe(refs.orgs.volt);
      expect(me.body.capabilities).not.toContain('org.team.manage');
      await api(app).post('/v1/auth/invitations/accept').send({ token: r.body.devInviteToken, password: 'Engineer123pass' }).expect(400);
    });
    it('a plain member cannot invite or change roles', async () => {
      const tok = await login(app, 'site.engineer@voltepc.example', { password: 'Engineer123pass' });
      await api(app).post('/v1/orgs/current/members').set(auth(tok)).send({ email: 'x@voltepc.example', fullName: 'X Y', role: 'org_member' }).expect(403);
      await api(app).patch(`/v1/orgs/current/members/${membershipId}`).set(auth(tok)).send({ role: 'org_admin' }).expect(403);
    });
    it('owner can promote, cannot self-demote, and the last owner cannot be removed', async () => {
      await api(app).patch(`/v1/orgs/current/members/${membershipId}`).set(auth(t.asha)).send({ role: 'org_admin' }).expect(200);
      const list = await api(app).get('/v1/orgs/current/members').set(auth(t.asha)).expect(200);
      const own = list.body.find((m: any) => m.email === ACCOUNTS.asha);
      await api(app).patch(`/v1/orgs/current/members/${own.membershipId}`).set(auth(t.asha)).send({ role: 'org_member' }).expect(403);
      await api(app).delete(`/v1/orgs/current/members/${own.membershipId}`).set(auth(t.asha)).expect(400);
    });
  });

  describe('admin users & audit (screens 129, 141)', () => {
    it('super admin lists users with memberships and cannot change own privileges', async () => {
      const r = await api(app).get('/v1/admin/users?q=voltepc').set(auth(t.superadmin)).expect(200);
      expect(r.body.length).toBeGreaterThanOrEqual(2);
      const me = await api(app).get('/v1/auth/me').set(auth(t.superadmin));
      await api(app).post('/v1/admin/role-assignments').set(auth(t.superadmin)).send({ userId: me.body.id, organizationId: refs.orgs.platform, role: 'finance', reason: 'self grant attempt' }).expect(403);
    });
    it('platform roles cannot be granted inside partner organizations', async () => {
      await api(app).post('/v1/admin/role-assignments').set(auth(t.superadmin)).send({ userId: refs.users.ravi, organizationId: refs.orgs.volt, role: 'compliance', reason: 'invalid grant' }).expect(400);
    });
    it('suspension blocks access immediately and is audited with reason', async () => {
      const tok = await login(app, ACCOUNTS.meera);
      await api(app).post(`/v1/admin/users/${refs.users.meera}/status`).set(auth(t.superadmin)).send({ status: 'suspended', reason: 'Fraud investigation' }).expect(200);
      await api(app).get('/v1/auth/me').set(auth(tok)).expect(401);
      await api(app).post(`/v1/admin/users/${refs.users.meera}/status`).set(auth(t.superadmin)).send({ status: 'active', reason: 'Cleared' }).expect(200);
      const a = await api(app).get(`/v1/admin/audit?objectId=${refs.users.meera}&action=admin.user`).set(auth(t.compliance)).expect(200);
      expect(a.body.map((e: any) => e.reason)).toEqual(expect.arrayContaining(['Fraud investigation', 'Cleared']));
    });
    it('audit chain is intact and secrets are redacted', async () => {
      const v = await api(app).get('/v1/admin/audit/verify').set(auth(t.compliance)).expect(200);
      expect(v.body.intact).toBe(true);
      expect(v.body.checked).toBeGreaterThan(10);
      const log = await api(app).get('/v1/admin/audit?limit=500').set(auth(t.compliance)).expect(200);
      expect(JSON.stringify(log.body)).not.toMatch(/Secure123pass|Engineer123pass/);
    });
    it('security summary reports lockouts and failed logins', async () => {
      const r = await api(app).get('/v1/admin/security/summary').set(auth(t.superadmin)).expect(200);
      expect(r.body.failed24h).toBeGreaterThanOrEqual(5);
      expect(r.body.locked).toBeGreaterThanOrEqual(1);
    });
  });

  describe('password change & sessions (screen 145)', () => {
    it('changing password revokes other sessions', async () => {
      const r = await api(app).post('/v1/auth/login').send({ email: ACCOUNTS.ravi, password: DEMO_PASSWORD, client: 'mobile' }).expect(200);
      const s = await api(app).get('/v1/auth/sessions').set(auth(r.body.accessToken)).expect(200);
      expect(s.body.length).toBeGreaterThanOrEqual(1);
      await api(app).post('/v1/auth/password').set(auth(r.body.accessToken)).send({ currentPassword: 'wrong', newPassword: 'Another123pass' }).expect(400);
      await api(app).post('/v1/auth/password').set(auth(r.body.accessToken)).send({ currentPassword: DEMO_PASSWORD, newPassword: 'Another123pass' }).expect(200);
      await api(app).post('/v1/auth/refresh').send({ refreshToken: r.body.refreshToken }).expect(401);
    });
  });
});
