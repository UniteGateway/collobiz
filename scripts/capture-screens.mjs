/** Captures evidence screenshots for the audit (desktop 1440 and mobile 390) using authorized demo accounts. */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { webLogin, webLoginMfa, adminLogin } from './e2e-suites.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WEB = process.env.WEB_URL ?? 'http://localhost:3000', ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001';
const out = process.argv[2] ?? 'docs/audit/screenshots/before';
const only = process.env.ONLY?.split(',');
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
async function api(page, path) { return page.evaluate(async (p) => (await fetch(`/api/v1${p}`)).json(), path); }
const plan = [
  { name: '001-home', login: null, path: '/' },
  { name: '023-dashboard', login: ['web', 'asha@voltepc.example'], path: '/dashboard' },
  { name: '031-marketplace', login: ['web', 'asha@voltepc.example'], path: '/marketplace' },
  { name: '036-opportunity', login: ['web', 'asha@voltepc.example'], path: async (p) => `/opportunities/${(await api(p, '/opportunities?q=OPP-2026-00001'))[0].id}` },
  { name: '036-opportunity-not-eligible', login: ['web', 'asha@voltepc.example'], path: async (p) => `/opportunities/${(await api(p, '/opportunities?q=OPP-2026-00003'))[0].id}` },
  { name: '036-opportunity-owner', login: ['admin-web', 'unite.admin@collabiz.local'], path: async (p) => `/opportunities/${(await api(p, '/opportunities?q=OPP-2026-00001'))[0].id}` },
  { name: '137-tender-admin', login: ['admin', 'superadmin@collabiz.local'], path: '/tenders', base: 'admin' },
  { name: '137-tender-admin-inspector', login: ['admin', 'superadmin@collabiz.local'], path: '/tenders', base: 'admin', after: async (p) => { await p.locator('.cz-ta-tender button').first().click(); await p.getByRole('heading', { name: 'Audit trail' }).waitFor(); } },
  { name: '070-technical-eval', login: ['mfa', 'evaluator@collabiz.local'], path: async (p) => { const d = await api(p, '/tenders'); const t = d.evaluating.find((x) => ['technical_evaluation', 'commercial_evaluation', 'negotiation', 'awarded'].includes(x.status)); return t ? `/tenders/${t.id}/technical` : '/tenders'; } },
  { name: '073-negotiation', login: ['mfa', 'unite.admin@collabiz.local'], path: async (p) => { const d = await api(p, '/tenders'); const t = d.issued.find((x) => ['negotiation', 'awarded'].includes(x.status)); return t ? `/tenders/${t.id}/negotiation` : '/tenders'; } },
  { name: '065-tender-dashboard', login: ['web', 'ravi@sunrise.example'], path: '/tenders' },
];
for (const [vw, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let who = null;
  for (const s of plan) {
    if (only && !only.some((o) => s.name.startsWith(o))) continue;
    const key = s.login ? s.login.join(':') : 'anon';
    if (who !== key) {
      await ctx.clearCookies();
      if (s.login?.[0] === 'web') await webLogin(page, WEB, s.login[1]);
      if (s.login?.[0] === 'mfa' || s.login?.[0] === 'admin-web') await webLoginMfa(page, WEB, s.login[1]);
      if (s.login?.[0] === 'admin') await adminLogin(page, ADMIN, s.login[1]);
      who = key;
    }
    const base = s.base === 'admin' ? ADMIN : WEB;
    if (typeof s.path === 'function') await page.goto(base + '/dashboard'.replace('/dashboard', s.base === 'admin' ? '/' : '/dashboard'));
    const path = typeof s.path === 'function' ? await s.path(page) : s.path;
    await page.goto(base + path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    if (s.after) await s.after(page);
    await page.screenshot({ path: `${out}/${s.name}-${vw}.png`, fullPage: true });
    console.log(`${s.name}-${vw}: ${path}`);
  }
  await ctx.close();
}
await b.close();
