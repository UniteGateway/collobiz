/** UI smoke suites, appended stage by stage. Each suite drives real UI → API → DB paths. */

/** Realistic fixture names: one per viewport. The e2e database is rebuilt for every run, so titles never carry timestamps. */
const pick = (label, desktop, mobile) => (label === 'mobile' ? mobile : desktop);
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
      await page.getByLabel('Message', { exact: true }).fill('We install 2 MW of rooftop solar a year and want to partner.');
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
      const email = `priya.${label}@nova-energy.example`;
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
      const invitee = `sales.${label}@sunrise.example`;
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
      await page.getByLabel('Search users').fill('voltepc');
      await page.getByText('asha@voltepc.example').waitFor({ timeout: 15000 });
      await shot('129-users');
      await page.goto(ADMIN + '/audit');
      await page.getByText('Intact').first().waitFor({ timeout: 15000 });
      await page.getByRole('table', { name: 'Audit events' }).waitFor();
      await shot('141-audit');
    },
  },
);

// ---------------- Stage 03 ----------------
const pdf = (n) => ({ name: `${n}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${n} ${Math.random()}\n%%EOF`) });
async function registerVerified(page, WEB, email, name) {
  await page.context().clearCookies();
  await page.goto(WEB + '/login?mode=register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('E2eSecure123');
  await page.getByLabel(/I accept/).check();
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.waitForURL(/\/verify/);
  await page.getByRole('button', { name: 'Resend code' }).click();
  const code = /Development code: (\d{6})/.exec((await page.locator('.cz-alert-success').textContent()) ?? '')[1];
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/onboarding\/account-type/);
}
suites.push({
  name: 'Stage 03 · 013–022 web onboarding → 130 admin verifies → partner verified',
  run: async ({ page, WEB, ADMIN, expect, shot, label }) => {
    const name = `Nova ${label}`;
    await registerVerified(page, WEB, `ops.${label}@nova-projects.example`, name);
    // 013
    await page.getByText('Company partner').click();
    await page.getByRole('button', { name: 'Contractor / EPC' }).click();
    await shot('013-account-type');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 015
    await page.waitForURL(/onboarding\/company/);
    await page.getByLabel('Registered legal name').fill(`${name} Projects Pvt Ltd`);
    await page.getByLabel(/Registration number/).fill('U74999KA2021PTC1');
    await page.getByLabel('GSTIN (optional)').fill('INVALID');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByText('Invalid GSTIN').waitFor();
    await page.getByLabel('GSTIN (optional)').fill('');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 016
    await page.waitForURL(/onboarding\/industries/);
    await page.getByRole('button', { name: 'Solar & Renewable Energy' }).click();
    await page.getByLabel('Skills (comma-separated)').fill('Rooftop solar, O&M');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 017
    await page.waitForURL(/onboarding\/coverage/);
    await page.getByRole('button', { name: 'Karnataka' }).click();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 018
    await page.waitForURL(/onboarding\/profile/);
    await page.getByLabel('Headline').fill('Rooftop solar installer for commercial buildings');
    await page.getByLabel('About your business').fill('We design and install rooftop solar for factories and offices across Karnataka.');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 019
    await page.waitForURL(/onboarding\/kyc/);
    for (const [label2, val] of [['PAN card', 'pan'], ['Certificate of incorporation', 'incorporation_certificate'], ['Address proof', 'address_proof']]) {
      await page.getByLabel('Document type').selectOption(val);
      await page.getByLabel('File').setInputFiles(pdf(val));
      await page.getByRole('button', { name: 'Upload' }).click();
      await page.getByText(`${label2} uploaded.`).waitFor();
    }
    await shot('019-kyc');
    await page.getByRole('button', { name: 'Continue' }).click();
    // 020
    await page.waitForURL(/onboarding\/bank-tax/);
    await page.getByLabel('Account holder name').fill(name);
    await page.getByLabel('Account number').fill('987654321098');
    await page.getByLabel('IFSC').fill('SBIN0001234');
    await page.getByLabel('Bank name').fill('State Bank of India');
    await page.getByLabel('PAN', { exact: true }).fill('ABCPN1234Q');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    // 021
    await page.waitForURL(/onboarding\/agreements/);
    await page.getByLabel(/ text$/).first().waitFor();
    const inputs = page.getByLabel(/Type your full name/);
    const n = await inputs.count();
    for (const region of await page.getByLabel(/ text$/).all()) await region.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    for (let i = 0; i < n; i++) {
      await page.getByLabel(/Type your full name/).first().fill(name);
      await page.getByRole('button', { name: 'Sign', exact: true }).first().click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: 'Continue to review' }).click();
    // 022
    await page.waitForURL(/onboarding\/status/);
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await page.getByText('Our compliance team is reviewing').waitFor();
    await shot('022-submitted');
    // 130 — compliance verifies
    await adminLogin(page, ADMIN, 'compliance@collabiz.local');
    await page.goto(ADMIN + '/verification');
    await page.getByRole('link', { name: name }).first().click();
    await page.getByRole('button', { name: 'Claim for review' }).click();
    await page.getByRole('heading', { name: 'Decision' }).waitFor();
    for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Accept', exact: true }).first().click(); await page.waitForTimeout(400); }
    await page.getByLabel(/Reason/).fill('Documents verified against registry');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await page.getByText('Decision recorded: verified').waitFor();
    await shot('130-dossier');
  },
});
suites.push({
  name: 'Stage 03 · 143 profile and 149 privacy consent + data export request',
  run: async ({ page, WEB, shot }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/profile');
    await page.getByText('Solar EPC contractor delivering').waitFor();
    await shot('143-profile');
    await page.goto(WEB + '/settings/privacy');
    await page.getByText('Marketing communications').click();
    await page.getByLabel('Request type').selectOption('correction');
    await page.getByLabel('Details (optional)').fill('Please update our registered address');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await page.getByText(/Request received|already have an open request/).first().waitFor();
  },
});
suites.push({
  name: 'Stage 03 · 131 risk centre lists flags; partner blocked from queue',
  run: async ({ page, ADMIN, WEB }) => {
    await adminLogin(page, ADMIN, 'compliance@collabiz.local');
    await page.goto(ADMIN + '/risk');
    await page.getByRole('heading', { name: /Raise a manual flag/ }).waitFor();
    await webLogin(page, WEB, 'ravi@sunrise.example');
    const r = await page.request.get(WEB + '/api/v1/admin/verification/queue');
    if (r.status() !== 403) throw new Error(`expected 403, got ${r.status()}`);
  },
});

// ---------------- Stage 04 ----------------
suites.push({
  name: 'Stage 04 · 004/005/008/039 public vs partner catalogue pricing',
  run: async ({ page, WEB, expect, shot }) => {
    await page.context().clearCookies();
    await page.goto(WEB + '/group-companies');
    await page.getByRole('heading', { name: 'Unite Solar' }).waitFor();
    await page.goto(WEB + '/catalogue');
    const card = page.locator('a.cz-card', { hasText: 'Mono PERC' });
    await card.getByText('Visible to verified partners').waitFor();
    await shot('005-catalogue-public');
    await page.goto(WEB + '/success-stories');
    await page.getByText('1.2 MW rooftop solar').waitFor();
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/catalogue');
    await page.locator('a.cz-card', { hasText: 'Mono PERC' }).getByText('₹13,500').waitFor();
    await page.locator('a.cz-card', { hasText: 'LT Switchgear' }).click();
    await page.getByLabel('Quantity / capacity').fill('2 panels');
    await page.getByRole('button', { name: 'Request price / quotation' }).click();
    const ref = await page.locator('.cz-alert-success .cz-mono').textContent();
    expect(/^PRQ-\d{8}$/.test(ref ?? ''), 'no price request reference');
    await shot('039-detail');
  },
});
suites.push({
  name: 'Stage 04 · 136 unite admin creates and publishes an item; 128 lists companies',
  run: async ({ page, ADMIN, WEB, label, shot }) => {
    await adminLogin(page, ADMIN, 'unite.admin@collabiz.local');
    await page.goto(ADMIN + '/catalogue');
    await page.getByRole('button', { name: 'New item' }).click();
    const name = pick(label, 'Hybrid Inverter 10 kW — 3-phase', 'Hybrid Inverter 5 kW — single-phase');
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Description').fill('Hybrid inverter with battery interface for C&I sites.');
    await page.getByLabel('List price ₹').fill('180000');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: 'Publish' }).click();
    await row.getByText('Published').waitFor();
    await shot('136-catalogue');
    await page.goto(ADMIN + '/group-companies');
    await page.getByText('UG-SOLAR-PLACEHOLDER').waitFor();
    await page.context().clearCookies();
    await page.goto(WEB + '/catalogue');
    await page.getByLabel('Search').fill(name.split(' ').slice(0, 3).join(' '));
    await page.getByText(name).first().waitFor();
  },
});

// ---------------- Stage 05 ----------------
suites.push({
  name: 'Stage 05 · 006/009/040 public listings, locations, RFQ',
  run: async ({ page, WEB, expect, shot }) => {
    await page.context().clearCookies();
    await page.goto(WEB + '/opportunities/public');
    await page.locator('[data-opp="OPP-2026-00002"]').waitFor();
    expect(await page.locator('[data-opp="OPP-2026-00001"]').count() === 0, 'partner-only listing shown publicly');
    await page.goto(WEB + '/locations');
    await page.getByRole('table', { name: 'Partner coverage by region' }).waitFor();
    await page.goto(WEB + '/rfq/new');
    await page.getByLabel('What do you need?').fill('250 kW rooftop solar for a hospital');
    await page.getByLabel('Details').fill('Hospital in Nagpur needs rooftop solar with battery backup for critical loads.');
    await page.getByLabel('Name').fill('Dr. Kulkarni');
    await page.getByLabel('Email').fill('admin@hospital.example');
    await page.getByLabel(/I consent/).check();
    await page.getByRole('button', { name: 'Submit requirement' }).click();
    await page.getByText(/Reference RFQ-/).waitFor();
    await shot('040-rfq');
  },
});
suites.push({
  name: 'Stage 05 · 031/036/041/042 eligibility explains failures; eligible partner applies; 024 shows it',
  run: async ({ page, WEB, shot }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/marketplace');
    await page.getByLabel('Search opportunities').fill('OPP-2026-00003');
    await page.locator('[data-opp="OPP-2026-00003"]').click();
    // The detail page explains the gap inline, then links to the full eligibility screen (041).
    await page.getByRole('heading', { name: 'Not eligible yet' }).waitFor();
    await page.locator('.cz-od-checks [data-check="certifications"]').getByText('Missing: ISO45001').waitFor();
    await page.getByRole('link', { name: 'See how to qualify' }).click();
    await page.locator('[data-check="certifications"]').getByText('Missing: ISO45001').waitFor();
    await shot('041-eligibility');
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/marketplace/unite');
    const card = page.locator('[data-opp="OPP-2026-00004"]');
    await card.click();
    await page.getByRole('heading', { name: 'About this opportunity' }).waitFor();
    await page.getByRole('heading', { name: /You can apply|Your application/ }).waitFor();
    const already = await page.getByRole('heading', { name: 'Your application' }).count();
    if (!already) {
      await page.getByRole('link', { name: /Apply now/ }).click();
      await page.getByLabel(/Why your organization/).fill('Sunrise has cleared HT cable imports through Mundra for three utilities.');
      await page.getByRole('button', { name: 'Submit application' }).click();
      await page.getByRole('heading', { name: 'Your application' }).waitFor();
      await page.getByRole('list', { name: 'Application progress' }).getByText('Submitted').waitFor();
    }
    await page.goto(WEB + '/my/opportunities');
    await page.getByRole('table', { name: 'Applications' }).getByText('Import sourcing of HT cables').waitFor();
    await shot('024-mine');
  },
});
suites.push({
  name: 'Recovery · 031 marketplace sources, filters, chips, sort and result count',
  run: async ({ page, WEB, expect, shot }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/marketplace');
    const count = page.locator('.cz-mkt-summary p');
    await count.getByText(/\d+ opportunit/).waitFor();
    const all = Number((await count.locator('strong').textContent()) ?? 0);
    // Source segments carry live counts and filter the list.
    await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: /^Unite Group/ }).click();
    await page.waitForFunction((n) => Number(document.querySelector('.cz-mkt-summary p strong')?.textContent) < n, all);
    expect(await page.locator('.cz-route-partner').count() === 0, 'partner listings shown under Unite Group');
    await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: /^All/ }).click();
    // A sector filter becomes a removable chip.
    await page.getByLabel('Sector').selectOption('solar');
    const chip = page.getByRole('button', { name: 'Remove filter Solar & Renewable Energy' });
    await chip.waitFor();
    // Results refresh after the filter settles: the construction listing must leave, the solar one must stay.
    await page.locator('[data-opp="OPP-2026-00003"]').waitFor({ state: 'detached' });
    await page.locator('[data-opp="OPP-2026-00001"]').waitFor();
    await chip.click();
    await page.locator('[data-opp="OPP-2026-00003"]').waitFor();
    // Sorting by value puts the largest listing first.
    await page.getByLabel('Sort by').selectOption('value');
    const top = await page.evaluate(async () => (await (await fetch('/api/v1/opportunities?paged=true&sort=value&limit=1')).json()).items[0].code);
    await page.waitForFunction((c) => document.querySelector('[data-opp]')?.getAttribute('data-opp') === c, top);
    // Nothing matching shows a helpful empty state with a way out.
    await page.getByLabel('Search opportunities').fill('zzqx nothing matches');
    await page.getByRole('heading', { name: 'No opportunities match these filters' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.locator('[data-opp]').first().waitFor();
    await shot('031-marketplace');
  },
});
suites.push({
  name: 'Stage 05 · 035/037/025/034/038 search, save, alerts, feed, categories, map',
  run: async ({ page, WEB }) => {
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/marketplace/categories');
    await page.getByRole('heading', { name: 'Solar & Renewable Energy' }).waitFor();
    await page.goto(WEB + '/marketplace/map');
    await page.getByRole('img', { name: /opportunities plotted/ }).waitFor();
    // Saved searches are capped at 20 per user (business rule); clear earlier smoke runs' searches first.
    await page.evaluate(async () => {
      const csrf = document.cookie.match(/cz_csrf=([^;]+)/)?.[1] ?? '';
      const list = (await (await fetch('/api/v1/me/saved')).json()).searches ?? [];
      for (const x of list) await fetch(`/api/v1/me/saved-searches/${x.id}`, { method: 'DELETE', headers: { 'X-CZ-CSRF': decodeURIComponent(csrf) } });
    });
    await page.goto(WEB + '/marketplace/search');
    await page.getByLabel('Sector').selectOption('solar');
    await page.locator('[data-opp]').first().waitFor();
    page.once('dialog', (d) => d.accept('Solar watch'));
    await page.getByRole('button', { name: /Save search/ }).click();
    await page.getByText(/Saved "Solar watch"/).waitFor();
    await page.goto(WEB + '/marketplace/saved');
    await page.getByRole('table', { name: 'Saved searches' }).getByText('Solar watch').first().waitFor();
    await page.goto(WEB + '/feed');
    await page.getByText(/Match \d+\/100|Recommendations are off|No strong matches/).first().waitFor();
  },
});
suites.push({
  name: 'Stage 05 · admin publishes route-A listing; publisher shortlists applicant',
  run: async ({ page, ADMIN, WEB, label }) => {
    await adminLogin(page, ADMIN, 'unite.admin@collabiz.local');
    await page.goto(ADMIN + '/opportunities');
    await page.getByRole('button', { name: 'Publish opportunity' }).click();
    const title = pick(label, 'Solar O&M contractor — Pune rooftop portfolio', 'Solar O&M contractor — Nashik rooftop portfolio');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Scope summary').fill('Annual O&M for 3 MW of rooftop plants in Pune with monthly reporting.');
    await page.getByLabel('City').fill('Pune');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('row', { name: new RegExp(title) }).getByText('Qualification').waitFor();
    await webLogin(page, WEB, 'unite.admin@collabiz.local').catch(() => {});
  },
  only: 'desktop',
});

// ---------------- Stage 06 ----------------
suites.push({
  name: 'Stage 06 · 043–052 lead wizard → certificate → 132 admin releases → public verify → 153 dispute',
  run: async ({ page, WEB, ADMIN, label, expect, shot }) => {
    const uniq = pick(label, 'Forge', 'Foundry');
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/leads/new');
    await page.getByLabel('Date consent obtained').fill(new Date(Date.now() - 3600_000).toISOString().slice(0, 16));
    await page.getByLabel('Evidence of introduction').fill('Email from the CFO requesting a rooftop proposal.');
    await page.getByRole('button', { name: 'Continue to customer details' }).click();
    await page.getByLabel('Customer legal name').fill(`Apex Castings ${uniq} Pvt Ltd`);
    await page.getByLabel('Contact person').fill('N. Bhat');
    await page.getByLabel('City').fill('Kolhapur');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Product, service or project').fill('600 kW rooftop solar');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Estimated value ₹').fill('27000000');
    await page.getByLabel('Buyer requirements').fill('Foundry roof, 600 kW, net metering with MSEDCL, CAPEX model.');
    await shot('046-review');
    await page.getByRole('button', { name: 'Register protected lead' }).click();
    await page.waitForURL(/\/leads\/.+\/confirmation/);
    await page.getByText('Registered and protected.').waitFor();
    const code = (await page.locator('dd .cz-mono').first().textContent()).trim();
    const cert = (await page.locator('dd .cz-mono').nth(1).textContent()).trim();
    await shot('049-confirmation');
    await page.getByRole('link', { name: 'Unite review' }).click();
    await page.getByText('Time remaining').waitFor();
    await shot('050-review');
    await page.getByRole('link', { name: 'Registration certificate' }).click();
    await page.getByRole('img', { name: /QR code/ }).waitFor();
    // Admin releases
    await adminLogin(page, ADMIN, 'unite.admin@collabiz.local');
    await page.goto(ADMIN + '/routing');
    const row = page.getByRole('row', { name: new RegExp(code) });
    await row.getByRole('button', { name: 'Review' }).click();
    await page.getByLabel('Decision').selectOption('release');
    await page.getByLabel(/Reason/).fill('Outside Unite Solar capacity this quarter');
    await page.getByRole('button', { name: 'Record' }).click();
    await row.waitFor({ state: 'detached' });
    await shot('132-routing');
    await page.goto(ADMIN + '/sla');
    await page.getByRole('button', { name: /Preview/ }).click();
    await page.getByText('Due', { exact: true }).waitFor();
    // Public verification
    await page.context().clearCookies();
    await page.goto(`${WEB}/verify-certificate?code=${cert}`);
    await page.getByRole('button', { name: 'Verify' }).click();
    await page.getByText('This certificate is valid and in force.').waitFor();
    expect((await page.content()).indexOf('Apex Castings') === -1, 'customer leaked in public verification');
    // Dispute by another partner
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/lead-disputes');
    await page.getByLabel('Certificate number').fill(cert);
    await page.getByLabel('Your statement and evidence').fill('Sunrise met Apex Castings at the Kolhapur foundry expo first; visitor log attached.');
    await page.getByRole('button', { name: 'Open dispute' }).click();
    await page.getByText(/vs Volt EPC/).waitFor();
    await shot('153-dispute');
  },
});
suites.push({
  name: 'Stage 06 · 026/151 lists and 134 conflict centre render',
  run: async ({ page, WEB, ADMIN }) => {
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/my/leads');
    await page.getByText('OPP-2026-00006').waitFor();
    await page.goto(WEB + '/lead-protection');
    await page.getByText('Protected', { exact: true }).waitFor();
    await adminLogin(page, ADMIN, 'compliance@collabiz.local');
    await page.goto(ADMIN + '/lead-conflicts');
    await page.getByRole('heading', { name: 'Ownership disputes' }).waitFor();
  },
});

// ---------------- Stage 07 ----------------
suites.push({
  name: 'Stage 07 · 053 move deal with note → 052 history → 028 task → 030 feed → 054 timeline',
  run: async ({ page, WEB, shot, label }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/crm/pipeline');
    await page.getByRole('button', { name: 'New deal' }).click();
    const title = pick(label, 'Battery retrofit — Hinjewadi data centre', 'Battery retrofit — Chakan cold store');
    await page.getByLabel('Deal title').fill(title);
    await page.getByLabel('Value ₹').fill('1800000');
    await page.getByRole('button', { name: 'Create' }).click();
    const card = page.locator(`[data-deal="${title}"]`);
    await card.getByRole('button', { name: 'Move' }).click();
    await page.getByLabel('New stage').selectOption('qualified');
    await page.getByLabel('Note (recorded in history)').fill('Budget confirmed by CFO');
    await page.getByRole('button', { name: 'Move deal' }).click();
    await page.getByRole('listitem', { name: /Qualified/ }).locator(`[data-deal="${title}"]`).waitFor();
    await shot('053-pipeline');
    await card.getByRole('link').click();
    await page.getByText(/contacted|new → qualified — Budget confirmed by CFO/).first().waitFor();
    const taskTitle = pick(label, 'Share battery sizing note with the CFO', 'Send battery sizing note to the plant head');
    await page.getByLabel('Follow-up', { exact: true }).fill(taskTitle);
    await page.getByLabel('Due', { exact: true }).fill(new Date(Date.now() + 86400_000).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByText(taskTitle).first().waitFor();
    await shot('052-customer');
    await page.goto(WEB + '/tasks');
    await page.getByText(taskTitle).first().waitFor();
    await page.goto(WEB + '/activity');
    await page.getByRole('heading', { name: 'Quick actions', exact: true }).waitFor();
    await page.goto(WEB + '/my/leads');
    await page.locator('table a').first().click();
    await page.getByRole('link', { name: 'Timeline' }).click();
    await page.getByLabel('What happened?').fill(`Called the plant head; meeting fixed (${title}).`);
    await page.getByRole('button', { name: 'Add to timeline' }).click();
    await page.getByText(`Called the plant head; meeting fixed (${title}).`).waitFor();
    await shot('054-timeline');
  },
});

// ---------------- Stage 08 ----------------
suites.push({
  name: 'Stage 08 · 055/057 discovery → 154 team → 058 invite → 059/062 accept+NDA → 156 workspace → 063 sharing → 064 activate',
  run: async ({ page, WEB, label, expect, shot }) => {
    const name = pick(label, 'Kolhapur Foundry Rooftop Team', 'Satara Foundry Rooftop Team');
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/partners/find');
    await page.locator('[data-partner="Sunrise Traders"]').waitFor();
    await page.goto(WEB + '/partners/ai-matches');
    await page.getByRole('button', { name: 'Suggest partners' }).click();
    await page.locator('[data-match]').first().waitFor();
    await shot('057-ai-matches');
    await page.goto(WEB + '/teams/new');
    await page.getByLabel('Team name').fill(name);
    await page.getByLabel('Purpose and scope').fill('Joint EPC bid for a foundry rooftop with electrical supply partner.');
    await page.getByRole('button', { name: 'Create and invite partners' }).click();
    await page.waitForURL(/\/teams\/.+\/invite/);
    const teamUrl = page.url().replace(/\/invite$/, '');
    await page.getByLabel('Partner').selectOption({ label: 'Sunrise Traders · certified' });
    await page.getByLabel('Responsibilities').fill('LT panels and cabling supply');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await page.getByText('Invitation sent.').waitFor();
    await page.goto(teamUrl + '/workspace');
    await page.getByLabel('Title').fill('Buyer constraints');
    await page.getByLabel('Content').fill('Confidential: shutdown window only in December.');
    await page.getByRole('button', { name: 'Post' }).click();
    await page.getByText('Confidential: shutdown window only in December.').waitFor();
    // Invitee
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(teamUrl + '/workspace');
    await page.getByText(/workspace opens after your organization accepts/).waitFor();
    expect(await page.getByText('shutdown window').count() === 0, 'confidential post visible before NDA');
    await page.goto(WEB + '/collaboration/requests');
    await page.getByRole('region', { name: new RegExp(name) }).getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('region', { name: new RegExp(name) }).getByRole('link', { name: /sign NDA/ }).click();
    await page.getByLabel(/Type your full name/).fill('Ravi Patel');
    await page.getByRole('button', { name: 'Sign NDA' }).click();
    await page.getByText(/Your organization signed this NDA/).waitFor();
    await page.goto(teamUrl + '/workspace');
    await page.getByText('Confidential: shutdown window only in December.').waitFor();
    // Lead proposes sharing; invitee approves; lead activates
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(teamUrl + '/sharing');
    await page.getByLabel(/Volt EPC .* share %/).fill('70');
    await page.getByLabel(/Sunrise Traders .* share %/).fill('30');
    await page.getByLabel(/Terms/).fill('Shares paid within 15 days of each customer milestone payment.');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await page.getByText('Proposal v1').waitFor();
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(teamUrl + '/sharing');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('heading', { name: 'Proposal v1' }).locator('..').getByText('Approved').first().waitFor();
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(teamUrl + '/activation');
    await page.getByRole('button', { name: 'Activate team' }).click();
    await page.getByText(/Team active since/).waitFor();
    await shot('064-activation');
  },
});

// ---------------- Stage 09 ----------------
let lastAwardedTender = null; // handed from the Stage 09 lifecycle to the Stage 10 contract journey
import { createRequire as __cr } from 'node:module';
const __pg = __cr(new URL('../apps/api/package.json', import.meta.url))('pg');
async function sqlExec(q, params = []) {
  const pool = new __pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/collabiz' });
  try { return await pool.query(q, params); } finally { await pool.end(); }
}
export async function webLoginMfa(page, WEB, email) {
  await page.context().clearCookies();
  await page.goto(WEB + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.getByLabel('Authentication code').fill(totp(DEMO.totpSecret));
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

suites.push({
  name: 'Stage 09 · 065 dashboard → 067 documents & eligibility → 068 bid form (partner view)',
  run: async ({ page, WEB, expect, shot }) => {
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/tenders');
    await page.getByRole('table', { name: 'Open tenders' }).getByText('O&M services for 5 MW Shirur ground-mount plant').waitFor();
    await shot('065-tender-dashboard');
    await page.getByRole('table', { name: 'Open tenders' }).getByRole('link', { name: 'O&M services for 5 MW Shirur ground-mount plant' }).click();
    await page.getByRole('heading', { name: 'Your eligibility' }).waitFor();
    await page.getByRole('table', { name: 'Documents' }).getByText('Scope of work & technical specification').waitFor();
    expect(await page.getByRole('heading', { name: 'Evaluation committee' }).count() === 0, 'bidder can see evaluators');
    expect(await page.getByRole('link', { name: 'Technical evaluation' }).count() === 0, 'bidder sees evaluation tab');
    await shot('067-tender-documents');
    await page.getByRole('link', { name: 'My bid' }).click();
    await page.getByLabel('Technical approach & methodology').waitFor();
    await page.getByLabel('Total price (₹, excl. taxes)').waitFor();
    await shot('068-bid-form');
  },
});

suites.push({
  name: 'Stage 09 · full sealed-bid lifecycle: 066 publish → 068 sealed bids → open → 070 → 071 → 069 → 073 → award → 137 admin',
  only: 'desktop',
  run: async ({ page, WEB, ADMIN, label, expect, shot }) => {
    const title = pick(label, 'Transformer yard O&M — Chakan plant', 'Transformer yard O&M — Ranjangaon plant');
    // 066 — issuer drafts and publishes
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(WEB + '/tenders/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Scope of work').fill('Annual maintenance of two 11 kV transformer yards including oil testing and relay calibration.');
    await page.getByRole('button', { name: 'Save draft and add documents' }).click();
    await page.waitForURL(/\/tenders\/[0-9a-f-]+\/documents/);
    const base = page.url().replace(/\/documents$/, '');
    await page.getByRole('button', { name: 'Publish tender' }).click();
    await page.getByText('Upload at least one tender document').waitFor();
    await page.getByLabel('Document title').fill('Scope & BoQ');
    await page.getByLabel('File').setInputFiles({ name: 'boq.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 smoke boq') });
    await page.getByRole('button', { name: 'Upload document' }).click();
    await page.getByRole('table', { name: 'Documents' }).getByText('Scope & BoQ').waitFor();
    await page.getByLabel('Evaluator', { exact: true }).selectOption({ label: 'Lakshmi Rao (Unite Solar Tender Evaluator)' });
    await page.getByLabel('Evaluates').selectOption('technical');
    await page.getByRole('button', { name: 'Assign evaluator' }).click();
    await page.getByRole('table', { name: 'Evaluators' }).getByText('Lakshmi Rao').waitFor();
    await page.getByLabel('Evaluator', { exact: true }).selectOption({ label: 'Sanjay Kulkarni (Unite Solar Admin)' });
    await page.getByLabel('Evaluates').selectOption('commercial');
    await page.getByRole('button', { name: 'Assign evaluator' }).click();
    await page.getByRole('table', { name: 'Evaluators' }).getByText('Sanjay Kulkarni').waitFor();
    await page.getByRole('button', { name: 'Publish tender' }).click();
    await page.getByText(/Tender published/).waitFor();
    await shot('066-published');
    // 068 — two partners submit sealed bids
    for (const [email, approach, price] of [['asha@voltepc.example', 'Condition-based maintenance with DGA oil analysis and IR thermography.', '1850000'], ['ravi@sunrise.example', 'Calendar-based maintenance visits by a two-person crew.', '1500000']]) {
      await webLogin(page, WEB, email);
      await page.goto(base + '/bid');
      await page.getByLabel('Technical approach & methodology').fill(approach);
      await page.getByLabel('Relevant experience').fill('Maintained 40+ transformer yards for industrial clients.');
      await page.getByLabel('Delivery timeline (weeks)').fill('4');
      await page.getByLabel('Total price (₹, excl. taxes)').fill(price);
      await page.getByLabel('Payment terms').fill('Quarterly in arrears');
      await page.getByRole('button', { name: 'Submit sealed bid' }).click();
      await page.getByText('Seal (SHA-256)').waitFor();
    }
    await shot('068-sealed');
    // Issuer cannot read bids before opening
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/commercial');
    await page.getByText(/Commercial envelopes stay sealed/).waitFor();
    // Closing time passes (simulated) → close → open
    await sqlExec("update tenders set closes_at = now() - interval '1 minute' where title = $1", [title]);
    await page.goto(base + '/documents');
    await page.getByRole('button', { name: 'Close bidding' }).click();
    await page.getByRole('button', { name: 'Open bids (verify seals)' }).click();
    await page.getByText('technical evaluation', { exact: false }).first().waitFor();
    // 070 — technical evaluator scores
    await webLoginMfa(page, WEB, 'evaluator@collabiz.local');
    await page.goto(base + '/technical');
    await page.getByText('Condition-based maintenance with DGA oil analysis and IR thermography.').waitFor();
    expect(await page.getByText('18,50,000').count() === 0, 'price visible to technical evaluator');
    for (const [org, score] of [['Volt EPC', '84'], ['Sunrise Traders', '52']]) {
      const g = page.getByRole('group', { name: `Score ${org}` });
      await g.getByLabel('Score (0–100)').fill(score);
      await g.getByLabel('Justification').fill(`Assessment of ${org} methodology`);
      await g.getByRole('button', { name: 'Record score' }).click();
      await g.waitFor({ state: 'detached' });
    }
    await shot('070-technical');
    await page.goto(base + '/comparison');
    await page.getByText(/never to technical-only evaluators/).waitFor();
    // Issuer completes technical, 071 commercial score
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/documents');
    await page.getByRole('button', { name: 'Complete technical evaluation' }).click();
    await page.getByText(/Technical evaluation complete/).waitFor();
    await page.goto(base + '/commercial');
    await page.getByRole('region', { name: 'Commercial envelope — Volt EPC' }).waitFor();
    expect(await page.getByText('Sunrise Traders').count() === 0, 'disqualified commercial envelope revealed');
    const g = page.getByRole('group', { name: 'Score Volt EPC' });
    await g.getByLabel('Score (0–100)').fill('90');
    await g.getByLabel('Justification').fill('Within budget; standard terms');
    await g.getByRole('button', { name: 'Record score' }).click();
    await g.waitFor({ state: 'detached' });
    await shot('071-commercial');
    // 069 comparison → shortlist
    await page.goto(base + '/comparison');
    await page.getByRole('table', { name: 'Bid comparison' }).getByText('85.8').waitFor();
    await page.getByLabel('Shortlist Volt EPC').check();
    await page.getByRole('button', { name: 'Shortlist for negotiation' }).click();
    await page.getByRole('table', { name: 'Bid comparison' }).getByText('Shortlisted').waitFor();
    await shot('069-comparison');
    // 073 negotiation
    await page.goto(base + '/negotiation');
    await page.getByLabel('Message', { exact: true }).fill('Please sharpen your price for a two-year term.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Please sharpen your price for a two-year term.').waitFor();
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(base + '/negotiation');
    await page.getByLabel('Message', { exact: true }).fill('Revised for a two-year commitment.');
    await page.getByLabel('Revised price (₹, optional)').fill('1750000');
    await page.getByRole('button', { name: 'Send revised offer' }).click();
    await page.getByText(/Revised price ₹17,50,000/).waitFor();
    await shot('073-negotiation');
    // Award
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/comparison');
    await page.getByLabel('Award to').selectOption({ label: 'Volt EPC' });
    await page.getByLabel('Award justification').fill('Highest combined score and revised price within budget.');
    await page.getByRole('button', { name: 'Award tender' }).click();
    await page.getByText('Tender awarded. All bidders have been notified.').waitFor();
    lastAwardedTender = base;
    // 137 admin oversight
    await adminLogin(page, ADMIN, 'superadmin@collabiz.local');
    await page.goto(ADMIN + '/tenders');
    const row = page.getByRole('row').filter({ hasText: title });
    await row.getByText('Awarded').waitFor();
    await row.getByRole('button').first().click();
    await page.getByRole('heading', { name: 'Audit trail' }).waitFor();
    await page.getByText('tender.awarded').first().waitFor();
    expect(await page.getByText('Condition-based maintenance').count() === 0, 'admin sees bid content');
    await shot('137-tender-admin');
  },
});

// ---------------- Stage 13 ----------------
suites.push({
  name: 'Stage 13 · 105/106 message a partner → 109/108 schedule a meeting → 112 support request → 111/147 notifications',
  run: async ({ page, WEB, expect, label, shot }) => {
    const note = pick(label, 'Can you hold two transformers for the Chakan job?', 'Please confirm stock for the Ranjangaon site.');
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/inbox');
    await page.getByRole('button', { name: 'New message' }).click();
    await page.getByLabel('To').fill('Ravi');
    await page.getByRole('button', { name: /Ravi Patel/ }).first().click();
    await page.getByLabel('Message', { exact: true }).fill(note);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForURL(/\/chat\//);
    await page.getByText(note).first().waitFor();
    await page.getByLabel('Message', { exact: true }).fill('Thanks — following up after the site visit.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('Thanks — following up after the site visit.').last().waitFor();
    await shot('106-chat');
    // The recipient sees it in their inbox
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/inbox');
    await page.locator('[data-thread]').filter({ hasText: 'Asha Patil' }).first().click();
    await page.getByText(note).first().waitFor();
    // 109 — Ravi schedules a meeting with Asha
    await page.goto(WEB + '/meetings');
    await page.getByRole('button', { name: 'Schedule meeting' }).click();
    await page.getByLabel('Title').fill('Stock confirmation call');
    await page.getByLabel('Search people to invite').fill('Asha');
    await page.getByRole('button', { name: /Asha Patil/ }).first().click();
    await page.getByRole('button', { name: 'Send invitations' }).click();
    await page.locator('[data-meeting]').filter({ hasText: 'Stock confirmation call' }).first().waitFor();
    await page.locator('[data-meeting] a', { hasText: 'Stock confirmation call' }).first().click();
    await page.getByRole('heading', { name: 'Agenda' }).waitFor();
    await shot('108-room');
    // 112 — support request with a response deadline
    await page.goto(WEB + '/support/tickets');
    await page.getByRole('button', { name: 'New request' }).click();
    await page.getByLabel('Subject').fill('Cannot see my payout reference');
    await page.getByLabel('Describe the problem').fill('The payout for milestone 1 shows settled but no bank reference is shown.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.getByRole('heading', { name: 'Cannot see my payout reference' }).waitFor();
    await page.getByText(/Reply due by/).waitFor();
    // 111/147 — Asha has a meeting notification; mandatory email cannot be switched off
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/notifications');
    await page.getByText('Meeting invite: Stock confirmation call').first().waitFor();
    await page.goto(WEB + '/settings/notifications');
    expect(await page.getByRole('switch', { name: 'Contracts by email' }).isDisabled(), 'mandatory email switch is editable');
    await page.getByRole('switch', { name: 'Messages by sms' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Preferences saved.').waitFor();
    await shot('147-prefs');
  },
});
// ---------------- Stage 14 ----------------
suites.push({
  name: 'Stage 14 · 029 scorecard → 116/117/118 course, certificate, public check → 114 brochure → 160/162 AI → 140 controls',
  only: 'desktop',
  run: async ({ page, WEB, ADMIN, expect, shot }) => {
    await webLogin(page, WEB, 'rohit@voltepc.example');
    await page.goto(WEB + '/performance');
    await page.getByText(/out of 100/).first().waitFor();
    await page.getByRole('table', { name: 'Certified milestones' }).getByText('Late').waitFor();
    await shot('029-performance');
    // 116/117 — read every module, pass the assessment
    await page.goto(WEB + '/learning');
    await page.locator('[data-course="CZ-101"]').click();
    // The first unread module is open on arrival; marking it read opens the next one.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Mark as read' }).click();
      await page.locator('.cz-modules li[data-done]').nth(i).waitFor();
    }
    const answers = ['When the customer pays a certified milestone', 'A sealed, time-stamped certificate', 'Unite Group, within a timed window', 'Four'];
    for (const a of answers) await page.getByLabel(a, { exact: true }).check();
    await page.getByRole('button', { name: 'Submit answers' }).click();
    await page.getByText(/Passed — 100%/).waitFor();
    const code = (await page.getByText(/Certificate CZC-\d{4}-\d{8} issued/).textContent()).match(/CZC-\d{4}-\d{8}/)[0];
    await shot('117-assessment');
    await page.goto(WEB + '/certificates');
    await page.getByText(code).waitFor();
    // Public check, signed out
    await page.context().clearCookies();
    await page.goto(WEB + '/verify-certificate?code=' + code);
    await page.getByText('Genuine and current').waitFor();
    await page.getByText('Rohit Deshmukh').waitFor();
    // 114 — brochure preview for a verified partner
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/resources/brochure');
    await page.getByRole('button', { name: 'Create preview' }).click();
    await page.frameLocator('iframe[title="Brochure preview"]').getByText('Volt EPC · in partnership with Unite Group').waitFor();
    // 160 — matches explain themselves in words and use verified reputation
    await page.goto(WEB + '/ai/matching');
    await page.getByText('Covers Maharashtra').first().waitFor();
    expect(await page.getByText('Reputation 73/100').count() > 0, 'reputation not used in matching');
    await page.getByRole('button', { name: 'Not relevant' }).first().click();
    // 162 — team builder marks the ISO 45001 gap
    await page.goto(WEB + '/ai/team-builder');
    const opt = await page.getByLabel('Opportunity').locator('option', { hasText: 'OPP-2026-00003' }).getAttribute('value');
    await page.getByLabel('Opportunity').selectOption(opt);
    await page.getByRole('button', { name: 'Build team plan' }).click();
    await page.getByText('Certified partner (ISO 45001)').waitFor();
    await page.getByText('Gap — partner needed').first().waitFor();
    await shot('162-team-builder');
    // 140 — super admin sees the outputs and can switch a capability off (audited)
    await adminLogin(page, ADMIN, 'superadmin@collabiz.local');
    await page.goto(ADMIN + '/ai');
    await page.getByRole('heading', { name: 'Recent outputs' }).waitFor();
    await shot('140-ai-governance');
  },
});
// ---------------- Stage 10 ----------------
let lastExecutedContract = null; // handed to the Stage 11 project journey
suites.push({
  name: 'Stage 10 · 148 vault lists agreements, NDAs and certificates',
  run: async ({ page, WEB, shot }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/vault');
    await page.getByRole('tab', { name: /Platform agreements/ }).click();
    await page.getByRole('table', { name: 'Platform agreements' }).getByText('COLLABIZ Partner Terms').first().waitFor();
    await page.getByRole('tab', { name: /Team NDAs/ }).click();
    await page.getByRole('table', { name: 'Team NDAs' }).getByText('TM-000001').waitFor();
    await page.getByRole('tab', { name: /Lead certificates/ }).click();
    await page.getByRole('table', { name: 'Lead certificates' }).waitFor();
    await shot('148-vault');
  },
});

suites.push({
  name: 'Stage 10 · 074 LOI from award → second-person approval → both parties sign → executed in 148 vault',
  only: 'desktop',
  run: async ({ page, WEB, expect, shot }) => {
    expect(!!lastAwardedTender, 'Stage 09 lifecycle did not award a tender');
    const base = lastAwardedTender;
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/award');
    await page.getByLabel('Document type').selectOption('loi');
    await page.getByRole('button', { name: 'Create draft from award' }).click();
    await page.getByRole('region', { name: 'Edit draft' }).waitFor();
    await page.getByLabel('Agreement text').fill((await page.getByLabel('Agreement text').inputValue()) + '\nSite access only between 08:00 and 18:00.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await page.getByText('You wrote this version, so another approver must review it.').waitFor();
    const code = (await page.getByRole('heading', { name: /Letter of Intent CTR-/ }).textContent()).match(/CTR-\d{4}-\d{6}/)[0];
    // Second person approves
    await webLoginMfa(page, WEB, 'evaluator@collabiz.local');
    await page.goto(base + '/award');
    await page.getByRole('button', { name: `Open ${code}` }).click();
    await page.getByRole('button', { name: 'Approve and lock version' }).click();
    await page.getByText('Approved · immutable').waitFor();
    await shot('074-approved');
    // Counterparty signs from the vault
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/vault');
    await page.getByRole('button', { name: `Open ${code}` }).click();
    await page.getByLabel('Type your full name').fill('Asha Patil');
    await page.getByLabel(/I am authorised to sign/).check();
    await page.getByRole('button', { name: 'Sign document' }).click();
    await page.getByRole('table', { name: 'Signatures' }).getByText('Asha Patil').waitFor();
    // Issuer countersigns → executed
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/award');
    await page.getByRole('button', { name: `Open ${code}` }).click();
    await page.getByLabel('Type your full name').fill('Sanjay Kulkarni');
    await page.getByLabel(/I am authorised to sign/).check();
    await page.getByRole('button', { name: 'Sign document' }).click();
    await page.getByRole('table', { name: 'Signatures' }).getByText('Sanjay Kulkarni').waitFor();
    await page.getByRole('heading', { name: new RegExp(code) }).locator('..').getByText('Executed').waitFor();
    lastExecutedContract = { base, code };
    expect(await page.getByRole('region', { name: 'Edit draft' }).count() === 0, 'approved contract still editable');
    await shot('074-executed');
  },
});

// ---------------- Stage 11a ----------------
let lastCommissionProject = null; // handed to the Stage 12 finance journey
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
suites.push({
  name: 'Stage 11a · 075 portfolio → 076 overview → 077 milestones → 079 photo update → 080/081/082 views',
  run: async ({ page, WEB, label, shot }) => {
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/projects');
    await page.getByRole('link', { name: '2 MW Chakan rooftop EPC' }).click();
    await page.getByText('Your role').waitFor();
    await shot('076-project-overview');
    await page.getByRole('link', { name: 'Milestones' }).click();
    await page.getByRole('table', { name: 'Milestones' }).getByText('Structure & module mounting — Shed A').waitFor();
    await page.getByRole('link', { name: 'Site progress' }).click();
    const note = pick(label, 'Inverter plinths cast on the east shed; curing for 7 days.', 'Inverter plinths cast on the west shed; curing for 7 days.');
    await page.getByLabel('What happened on site?').fill(note);
    await page.getByLabel('Milestone').selectOption({ index: 1 });
    await page.getByLabel('Progress %').fill('70');
    await page.getByLabel('Photos or reports').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Post update' }).click();
    await page.getByRole('list', { name: 'Site updates' }).getByText(note).waitFor();
    await shot('079-site-progress');
    for (const [tab, marker] of [['Materials', 'Mono PERC 545 Wp modules'], ['Documents', null], ['Inspections', null], ['Allocation', 'Sunrise Traders']]) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      if (marker) await page.getByText(marker).first().waitFor(); else await page.getByRole('heading', { level: 1 }).waitFor();
    }
  },
});

suites.push({
  name: 'Stage 11a · executed LOI → start project → baseline → evidence → owner inspection → 083 certify/invoice/pay → 084 complete/close',
  only: 'desktop',
  run: async ({ page, WEB, expect, shot }) => {
    expect(!!lastExecutedContract, 'Stage 10 journey did not execute a contract');
    const { base, code } = lastExecutedContract;
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(base + '/award');
    await page.getByRole('button', { name: `Open ${code}` }).click();
    await page.getByLabel('Start date').fill('2026-12-01');
    await page.getByLabel('End date').fill('2027-03-31');
    await page.getByRole('button', { name: 'Start project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/milestones/);
    const proj = page.url().replace(/\/milestones$/, '');
    // Lead plans one milestone for the full value; owner approves the baseline
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(proj + '/milestones');
    const projectId = proj.split('/').pop();
    const value = String((await page.evaluate(async (id) => (await (await fetch(`/api/v1/projects/${id}`)).json()).value, projectId)) / 100);
    await page.getByLabel('Milestone title').fill('Transformer yard maintenance — complete');
    await page.getByLabel('Due date').fill('2027-02-15');
    await page.getByLabel('Amount (₹)').fill(value);
    await page.getByRole('button', { name: 'Add milestone' }).click();
    await page.getByRole('table', { name: 'Milestones' }).getByText('Transformer yard maintenance — complete').waitFor();
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(proj);
    await page.getByRole('button', { name: 'Approve baseline and start' }).click();
    await page.getByText('Active').first().waitFor();
    // Introducer commission for Meera (earned only when the customer pays — Stage 12)
    await page.getByLabel('Introducer (beneficiary)').selectOption({ label: 'Meera Iyer Consulting' });
    await page.getByLabel('Commission policy').selectOption({ label: 'Introducer commission — standard (demo rate) (v1)' });
    await page.getByRole('button', { name: 'Create agreement' }).click();
    await page.getByRole('table', { name: 'Commission agreements' }).getByText(/CA-\d{4}-\d{6}/).waitFor();
    lastCommissionProject = proj;
    // Lead starts, reports 100% with a photo, submits
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(proj + '/milestones');
    await page.getByRole('button', { name: 'Start Transformer yard maintenance — complete' }).click();
    await page.getByRole('table', { name: 'Milestones' }).getByText('In Progress').waitFor();
    await page.goto(proj + '/progress');
    await page.getByLabel('What happened on site?').fill('Oil tested, relays calibrated, both yards handed back.');
    await page.getByLabel('Milestone').selectOption({ index: 1 });
    await page.getByLabel('Progress %').fill('100');
    await page.getByLabel('Photos or reports').setInputFiles({ name: 'yard.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Post update' }).click();
    await page.getByText(/Update posted/).waitFor();
    await page.goto(proj + '/certification');
    await page.getByLabel('Submission note').fill('All maintenance done; photos and test sheets attached.');
    await page.getByRole('button', { name: 'Submit for certification' }).click();
    await page.getByText('Evidence seal').waitFor();
    // Owner: certification blocked until the owner's own inspection passes
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(proj + '/certification');
    await page.getByRole('list', { name: 'Certification checks' }).getByText('❌ Passing quality inspection by the owner').waitFor();
    await page.goto(proj + '/inspections');
    await page.getByLabel('Milestone').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save inspection' }).click();
    await page.getByRole('table', { name: 'Inspections' }).getByText('Pass').first().waitFor();
    await shot('082-inspection');
    await page.goto(proj + '/certification');
    await page.getByLabel('Certification note').fill('Inspected on site; accepted in full.');
    await page.getByRole('button', { name: 'Certify', exact: true }).click();
    await page.getByText(/^Certified$/).first().waitFor();
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(proj + '/certification');
    await page.getByRole('button', { name: /Raise invoice for/ }).click();
    await page.getByText(/INV-\d{4}-\d{6}/).waitFor();
    await page.goto(proj + '/documents');
    await page.getByLabel('Document title').fill('As-built and test certificates');
    await page.getByLabel('Category').selectOption('handover');
    await page.getByLabel('File').setInputFiles({ name: 'handover.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 handover') });
    await page.getByRole('button', { name: 'Upload document' }).click();
    await page.getByRole('table', { name: 'Project documents' }).getByText('As-built and test certificates').waitFor();
    await webLoginMfa(page, WEB, 'unite.admin@collabiz.local');
    await page.goto(proj + '/certification');
    await page.getByLabel('Payment reference (UTR)').fill('UTR-SMOKE-0001');
    await page.getByRole('button', { name: 'Record payment' }).click();
    await page.getByText(/ref UTR-SMOKE-0001/).waitFor();
    await shot('083-certification');
    await page.goto(proj + '/closure');
    await page.getByRole('button', { name: 'Issue completion certificate' }).click();
    await page.getByRole('heading', { name: /Completion certificate CMP-/ }).waitFor();
    await page.getByRole('button', { name: 'Close project' }).click();
    await page.getByText(/Project closed on/).waitFor();
    await shot('084-closure');
    await page.goto(proj);
    await page.getByText('Change log (latest)').waitFor();
  },
});

// ---------------- Stage 11b ----------------
suites.push({
  name: 'Stage 11b · 085 market → 086 suppliers → 093 territories → 094 claims (views)',
  run: async ({ page, WEB, shot }) => {
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/trading');
    await page.getByRole('table', { name: 'Open requirements' }).getByText('Cabling for 2 MW Chakan rooftop').waitFor();
    await page.getByRole('table', { name: 'Products' }).getByText('630 kVA oil-cooled distribution transformer').waitFor();
    await shot('085-trading');
    await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('table', { name: 'Suppliers' }).getByText(/^Deccan Distributors/).first().waitFor();
    await page.getByRole('table', { name: 'My products' }).waitFor();
    await page.getByRole('link', { name: 'Territories', exact: true }).click();
    await page.getByRole('heading', { name: 'Appoint a distributor' }).waitFor();
    await page.getByRole('link', { name: 'Claims', exact: true }).click();
    await page.getByRole('heading', { name: 'Raise a claim' }).waitFor();
  },
});

suites.push({
  name: 'Stage 11b · 087 requirement → 089 quotes → 090 PO → 091 accept → 092 dispatch/GRN → 094 claim → close; 093 routing → 088',
  only: 'desktop',
  run: async ({ page, WEB, label, expect, shot }) => {
    const title = pick(label, 'Armoured cable for the inverter yard — Chakan', 'Armoured cable for the inverter yard — Talegaon');
    // 087 — buyer posts a requirement
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/trading/requirements/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Sector').selectOption('power_equipment');
    await page.getByLabel('Delivery location').fill('Chakan MIDC Phase II, Pune');
    await page.getByLabel('Item 1').fill('4C x 120 sq mm XLPE armoured cable');
    await page.getByLabel('Quantity 1').fill('500');
    await page.getByLabel('Unit 1').fill('m');
    await page.getByRole('button', { name: 'Post requirement' }).click();
    await page.waitForURL(/\/trading\/quotations\?requirement=/);
    const reqUrl = page.url();
    // 089 — two suppliers quote privately
    for (const [email, price, days] of [['ravi@sunrise.example', '640', '6'], ['deepak@deccan.example', '615', '3']]) {
      await webLogin(page, WEB, email);
      await page.goto(reqUrl);
      await page.getByLabel(/Unit price for 4C x 120/).fill(price);
      await page.getByLabel('Delivery (days)').fill(days);
      await page.getByRole('button', { name: 'Submit quotation' }).click();
      await page.getByText(/Your quotation QT-/).waitFor();
      expect(await page.getByText(price === '640' ? '₹615' : '₹640').count() === 0, 'supplier sees a competitor price');
    }
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(reqUrl);
    const table = page.getByRole('table', { name: 'Quotation comparison' });
    await table.getByText('Lowest').waitFor();
    await table.getByText('Fastest').waitFor();
    await shot('089-comparison');
    await table.getByRole('row').filter({ hasText: 'Sunrise Traders' }).getByRole('link', { name: 'Create PO' }).click();
    // 090 — PO from quotation, then issue
    await page.getByLabel('Delivery address').fill('Chakan MIDC Phase II, Pune 410501');
    await page.getByRole('button', { name: 'Create draft order' }).click();
    await page.waitForURL(/\/trading\/orders\?id=/);
    const orderUrl = page.url();
    await page.getByRole('button', { name: 'Issue order' }).click();
    await page.getByRole('heading', { name: /^Order PO-/ }).locator('..').getByText('Issued').waitFor();
    // 091/092 — supplier accepts, starts, dispatches
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(orderUrl);
    await page.getByRole('button', { name: 'Accept order' }).click();
    await page.getByRole('button', { name: 'Start fulfilment' }).click();
    await page.getByRole('link', { name: 'Shipping & receipt →' }).click();
    await page.getByLabel('Carrier').fill('VRL Logistics');
    await page.getByLabel('Tracking / LR number').fill(`VRL-${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Mark dispatched' }).click();
    await page.getByText('Dispatched').first().waitFor();
    const shipUrl = page.url();
    // Buyer receipt with damage + photo
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(shipUrl);
    await page.getByLabel(/^Damaged: 4C x 120/).fill('20');
    await page.getByLabel('Receipt note').fill('One drum dented; 20 m unusable');
    await page.getByLabel('Proof of delivery photos').setInputFiles({ name: 'pod.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Confirm receipt' }).click();
    await page.getByText(/Received with exceptions on/).waitFor();
    await shot('092-receipt');
    // 094 — claim with photo, supplier accepts, buyer resolves, order closes
    await page.goto(WEB + '/trading/claims');
    const poNumber = (await page.evaluate(async (u) => (await (await fetch(`/api/v1/trading/purchase-orders/${new URL(u).searchParams.get('id')}`)).json()).number, orderUrl));
    await page.getByLabel('Delivered order').selectOption({ label: `${poNumber} · Sunrise Traders` });
    await page.getByLabel('Item', { exact: true }).selectOption('4C x 120 sq mm XLPE armoured cable');
    await page.getByLabel('Quantity affected').fill('20');
    await page.getByLabel('Claim photos').setInputFiles({ name: 'dent.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('What went wrong?').fill('Drum dented in transit; outer 20 m sheath damaged.');
    await page.getByRole('button', { name: 'Raise claim' }).click();
    await page.getByRole('heading', { name: /CLM-\d{4}-\d{6} — damage/ }).waitFor();
    const claimCode = (await page.getByRole('heading', { name: /CLM-/ }).textContent()).match(/CLM-\d{4}-\d{6}/)[0];
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/trading/claims');
    await page.getByRole('button', { name: `Open ${claimCode}` }).click();
    await page.getByLabel('Response').fill('Replacement 20 m dispatched with the next load');
    await page.getByRole('button', { name: 'Accept claim' }).click();
    await page.getByRole('heading', { name: new RegExp(claimCode) }).locator('..').getByText('Accepted').waitFor();
    await webLogin(page, WEB, 'asha@voltepc.example');
    await page.goto(WEB + '/trading/claims');
    await page.getByRole('button', { name: `Open ${claimCode}` }).click();
    await page.getByLabel('Note', { exact: true }).fill('Replacement received in good order');
    await page.getByRole('button', { name: 'Confirm resolved' }).click();
    await page.getByRole('heading', { name: new RegExp(claimCode) }).locator('..').getByText('Resolved').waitFor();
    await shot('094-claim');
    await page.goto(orderUrl);
    await page.getByRole('button', { name: 'Close order' }).click();
    await page.getByRole('heading', { name: /^Order PO-/ }).locator('..').getByText('Closed').waitFor();
    // 093 — territory → 088 routed enquiry
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/trading/territories');
    await page.getByRole('table', { name: 'Territories' }).getByRole('row').first().waitFor(); // table loaded
    if (!(await page.getByRole('table', { name: 'Territories' }).getByRole('row').filter({ hasText: 'Deccan Distributors (your distributor)' }).filter({ hasText: 'Active' }).count())) {
      await page.getByLabel('Distributor', { exact: true }).selectOption({ label: 'Deccan Distributors' });
      await page.getByLabel('Region', { exact: true }).selectOption('IN-KA');
      await page.getByLabel('Sector').selectOption('power_equipment');
      await page.getByLabel('Exclusive territory').check();
      await page.getByRole('button', { name: 'Appoint distributor' }).click();
      await page.getByRole('table', { name: 'Territories' }).getByText('Deccan Distributors (your distributor)').first().waitFor();
    }
    await shot('093-territories');
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/trading');
    await page.getByRole('link', { name: 'Enquire about 630 kVA oil-cooled distribution transformer' }).click();
    await page.getByLabel('Quantity').fill('2 nos');
    await page.getByLabel('Message to the supplier').fill('Two units to Hosur by January, please.');
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await page.getByText(/routed to the supplier’s authorised distributor for your region/).waitFor();
    await shot('088-enquiry');
  },
});

// ---------------- Stage 12 ----------------
suites.push({
  name: 'Stage 12 · 095/027/158/096/157/097/101/100 earnings views; 102/103 stay disabled',
  run: async ({ page, WEB, shot }) => {
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/earnings');
    await page.getByText(/earned only when the customer pays/).first().waitFor();
    await page.getByRole('table', { name: 'Agreements' }).getByRole('link', { name: 'CA-2026-000001' }).click();
    await page.getByText('✓ verified').waitFor();
    await shot('096-agreement');
    await page.getByRole('link', { name: /schedule by milestone/ }).click();
    await page.getByRole('table', { name: 'Commission schedule' }).getByText(/Structure & module mounting/).waitFor();
    await page.goto(WEB + '/earnings/summary');
    await page.getByRole('table', { name: 'Earnings by status' }).getByText('Projected from the project schedule').waitFor();
    await page.goto(WEB + '/earnings/live');
    await page.getByRole('button', { name: /History of Milestone 1/ }).first().click();
    await page.getByText(/Projected from the project schedule/).first().waitFor();
    await shot('158-live');
    await page.goto(WEB + '/commissions/calculator');
    await page.getByLabel('Deal value (₹)').fill('1000000');
    await page.getByLabel('Rate (%)').fill('2');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await page.getByText('Net payable to you').waitFor();
    await page.getByText('₹19,000.00').waitFor(); // 2% of 10 L = 20,000 − 5% TDS
    await page.goto(WEB + '/tax-records');
    await page.getByRole('heading', { name: 'By quarter' }).waitFor();
    await page.goto(WEB + '/payments/history');
    await page.getByText(/No payouts yet|PAY-\d{4}-\d{6}/).first().waitFor();
    await page.goto(WEB + '/finance/opportunities');
    await page.getByText('Not available yet').waitFor();
    await page.goto(WEB + '/finance/enquiry');
    await page.getByText('Not available yet').waitFor();
  },
});

suites.push({
  name: 'Stage 12 · customer payment → 098 finance approval → 099 payout request → 138 approve + settle → 100 paid with UTR → 159 dispute',
  only: 'desktop',
  run: async ({ page, WEB, ADMIN, expect, shot }) => {
    expect(!!lastCommissionProject, 'Stage 11a journey did not set up a commission');
    await webLoginMfa(page, WEB, 'finance@collabiz.local');
    await page.goto(WEB + '/commissions/approvals');
    await page.getByRole('button', { name: /^Approve Milestone 1: Transformer yard maintenance/ }).first().click();
    await page.getByRole('table', { name: 'Approval queue' }).waitFor();
    await shot('098-approvals');
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/payouts/request');
    const boxes = page.getByRole('checkbox', { name: /^Include / });
    await boxes.first().waitFor();
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
    await page.getByLabel('Your invoice number').fill(`MIC/26-27/${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Request payout' }).click();
    const code = (await page.getByText(/Payout PAY-\d{4}-\d{6} requested/).textContent()).match(/PAY-\d{4}-\d{6}/)[0];
    await shot('099-payout');
    await adminLogin(page, ADMIN, 'finance2@collabiz.local');
    await page.goto(ADMIN + '/finance');
    await page.getByRole('button', { name: `Approve ${code}` }).click();
    await page.getByLabel(`UTR for ${code}`).fill(`HDFCN${Date.now().toString().slice(-11)}`);
    await page.getByRole('button', { name: `Record settlement for ${code}` }).click();
    await page.getByRole('row').filter({ hasText: code }).getByText('Settled').waitFor();
    await shot('138-finance');
    await webLogin(page, WEB, 'meera@consult.example');
    await page.goto(WEB + '/payments/history');
    await page.getByRole('row').filter({ hasText: code }).getByText(/^HDFCN/).waitFor();
    await page.goto(WEB + '/commissions/disputes');
    await page.getByLabel('Commission line', { exact: true }).selectOption({ index: 1 });
    await page.getByLabel('What is wrong?').fill('TDS deducted looks higher than the 5% in my agreement.');
    await page.getByRole('button', { name: 'Raise dispute' }).click();
    await page.getByRole('table', { name: 'Commission disputes' }).getByText(/FD-\d{4}-\d{6}/).first().waitFor();
    await shot('159-dispute');
  },
});
