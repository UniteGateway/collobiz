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
    await registerVerified(page, WEB, `nova.${label}.${Date.now()}@example.com`, name);
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
    const name = `Hybrid Inverter ${label} ${Date.now()}`;
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
    await page.locator('[data-opp="OPP-2026-00003"]').click();
    await page.getByRole('link', { name: /Check eligibility/ }).click();
    await page.locator('[data-check="certifications"]').getByText('Missing: ISO45001').waitFor();
    await shot('041-eligibility');
    await webLogin(page, WEB, 'ravi@sunrise.example');
    await page.goto(WEB + '/marketplace/unite');
    const card = page.locator('[data-opp="OPP-2026-00004"]');
    await card.click();
    await page.getByRole('heading', { name: 'Key facts' }).waitFor();
    const already = await page.getByText('Your organization applied').count();
    if (!already) {
      await page.getByRole('link', { name: /Check eligibility/ }).click();
      await page.getByRole('link', { name: 'Continue to application' }).click();
      await page.getByLabel(/Why your organization/).fill('Sunrise has cleared HT cable imports through Mundra for three utilities.');
      await page.getByRole('button', { name: 'Submit application' }).click();
      await page.getByText('Your organization applied').waitFor();
    }
    await page.goto(WEB + '/my/opportunities');
    await page.getByRole('table', { name: 'Applications' }).getByText('Import sourcing of HT cables').waitFor();
    await shot('024-mine');
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
    const title = `Solar O&M contractor ${label} ${Date.now()}`;
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
    const uniq = `${label}${Date.now()}`;
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
