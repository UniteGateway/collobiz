/** UI smoke suites, appended stage by stage. Each suite drives real UI → API → DB paths. */
const suites = [
  {
    name: 'Stage 01 · 001 homepage renders brand and CTAs',
    run: async ({ page, WEB, expect, shot }) => {
      await page.goto(WEB + '/');
      await page.getByRole('heading', { level: 1 }).waitFor();
      expect(await page.locator('[data-screen="001"]').count() === 1, 'screen 001 marker missing');
      expect(await page.getByRole('link', { name: 'Join as a partner' }).count() > 0, 'join CTA missing');
      await shot('001-home');
    },
  },
  {
    name: 'Stage 01 · 002/003/007 content pages',
    run: async ({ page, WEB, expect }) => {
      for (const [path, id] of [['/about', '002'], ['/how-it-works', '003'], ['/membership', '007']]) {
        await page.goto(WEB + path);
        expect(await page.locator(`[data-screen="${id}"]`).count() === 1, `${path} missing screen ${id}`);
      }
    },
  },
  {
    name: 'Stage 01 · 010 contact form validates then submits',
    run: async ({ page, WEB, expect, shot }) => {
      await page.goto(WEB + '/support/contact');
      await page.getByRole('button', { name: 'Send enquiry' }).click();
      await page.getByText('Please enter your name').waitFor();
      await page.getByLabel('Your name').fill('Meera Shah');
      await page.getByLabel('Work email').fill('meera@sunrise-epc.example');
      await page.getByLabel('Message').fill('We install 2 MW of rooftop solar a year and want to partner.');
      await page.getByLabel(/I agree/).check();
      await page.getByRole('button', { name: 'Send enquiry' }).click();
      const ref = await page.locator('.cz-alert-success .cz-mono').textContent({ timeout: 10000 });
      expect(/^ENQ-\d{4}-\d{6}$/.test(ref ?? ''), `bad reference ${ref}`);
      await shot('010-contact');
    },
  },
  {
    name: 'Stage 01 · registry lists 165 screens',
    run: async ({ page, WEB, expect }) => {
      await page.goto(WEB + '/registry');
      await page.locator('table tbody tr').first().waitFor();
      const n = await page.locator('table tbody tr').count();
      expect(n === 165, `expected 165 rows, got ${n}`);
    },
  },
  {
    name: 'Stage 01 · admin status page reports API health',
    run: async ({ page, ADMIN, expect }) => {
      await page.goto(ADMIN + '/status');
      await page.getByText('database').waitFor({ timeout: 10000 });
      expect((await page.locator('[data-status="ok"]').count()) >= 1, 'database not ok');
    },
  },
];
export default suites;

// ---------------- Stage 02 ----------------
import { createHmac } from 'node:crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0; const out = [];
  for (const ch of secret) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(out)).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
export const DEMO = { password: 'Collabiz#2026', totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
export async function webLogin(page, WEB, email, password = DEMO.password) {
  await page.context().clearCookies();
  await page.goto(WEB + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}
export async function adminLogin(page, ADMIN, email) {
  await page.context().clearCookies();
  await page.goto(ADMIN + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Authentication code').fill(totp(DEMO.totpSecret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

suites.push(
  {
    name: 'Stage 02 · 011/012 register, verify email by OTP, reach dashboard',
    run: async ({ page, WEB, expect, shot, label }) => {
      await page.context().clearCookies();
      const email = `e2e.${label}.${Date.now()}@example.com`;
      await page.goto(WEB + '/login?mode=register');
      await page.getByLabel('Full name').fill('E2E Partner');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('E2eSecure123');
      await page.getByLabel(/I accept/).check();
      await shot('011-register');
      await page.getByRole('button', { name: 'Create account' }).last().click();
      await page.waitForURL(/\/verify/);
      await page.getByRole('button', { name: 'Resend code' }).click();
      const txt = await page.locator('.cz-alert-success').textContent({ timeout: 10000 });
      const code = /Development code: (\d{6})/.exec(txt ?? '')?.[1];
      expect(code, 'dev OTP not shown');
      await page.getByLabel('Verification code').fill('000000' === code ? '111111' : '000000');
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await page.getByText('Incorrect code').first().waitFor();
      await page.getByLabel('Verification code').fill(code);
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await page.getByText('Your email is verified').waitFor();
      await shot('012-verified');
    },
  },
  {
    name: 'Stage 02 · login rejects bad password; 144 owner invites a colleague',
    run: async ({ page, WEB, expect, shot, label }) => {
      await page.context().clearCookies();
      await page.goto(WEB + '/login');
      await page.getByLabel('Email').fill('ravi@sunrise.example');
      await page.getByLabel('Password').fill('WrongPassword1');
      await page.getByRole('button', { name: 'Sign in' }).last().click();
      await page.getByText('Incorrect email or password').waitFor();
      await webLogin(page, WEB, 'ravi@sunrise.example');
      await page.goto(WEB + '/company/team');
      await page.getByText('ravi@sunrise.example').waitFor();
      const invitee = `sales.${label}.${Date.now()}@sunrise.example`;
      await page.getByLabel('Full name').fill('Sales Lead');
      await page.getByLabel('Work email').fill(invitee);
      await page.getByRole('button', { name: 'Send invitation' }).click();
      await page.getByText(`Invitation sent to ${invitee}`).waitFor();
      expect(await page.getByText(invitee).count() >= 1, 'invitee not listed');
      await shot('144-team');
    },
  },
  {
    name: 'Stage 02 · 145 security page lists sessions and MFA state',
    run: async ({ page, WEB }) => {
      await webLogin(page, WEB, 'meera@consult.example');
      await page.goto(WEB + '/settings/security');
      await page.getByRole('button', { name: 'Set up authenticator app' }).click();
      await page.getByTestId('mfa-secret').waitFor();
      await page.getByRole('table', { name: 'Active sessions' }).waitFor();
    },
  },
  {
    name: 'Stage 02 · partner is denied the admin portal',
    run: async ({ page, ADMIN }) => {
      await page.context().clearCookies();
      await page.goto(ADMIN + '/login');
      await page.getByLabel('Email').fill('ravi@sunrise.example');
      await page.getByLabel('Password').fill(DEMO.password);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByText('restricted to Unite Group administrators').waitFor({ timeout: 15000 });
    },
  },
  {
    name: 'Stage 02 · admin TOTP login → 129 users & 141 audit (chain intact)',
    run: async ({ page, ADMIN, shot }) => {
      await adminLogin(page, ADMIN, 'superadmin@collabiz.local');
      await page.goto(ADMIN + '/users');
      await page.getByText('asha@voltepc.example').waitFor({ timeout: 15000 });
      await shot('129-users');
      await page.goto(ADMIN + '/audit');
      await page.getByText('Intact').first().waitFor({ timeout: 15000 });
      await page.getByRole('table', { name: 'Audit events' }).waitFor();
      await shot('141-audit');
    },
  },
);
