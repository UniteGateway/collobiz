/**
 * Quality-gate sweep: opens every registry screen at desktop (1440) and phone (390) width with an account that is
 * allowed to see it, saves a screenshot, and flags objective defects:
 *   page errors · API error state · missing h1 · horizontal overflow on phones · raw codes in visible text
 *   ("snake_case", undefined, null, NaN, [object Object]) · leftover "SCREEN ###" labels.
 * Run against a freshly seeded database (it opens pages, and some pages mark items as read).
 * Usage: DATABASE_URL=… ONLY=105,106 node scripts/gate-sweep.mjs [outDir]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { webLogin, webLoginMfa, adminLogin } from './e2e-suites.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');
const { SCREENS } = require('../packages/types/dist/index.js');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000', ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001';
const out = process.argv[2] ?? 'docs/audit/screenshots/gate';
const only = process.env.ONLY?.split(',');
mkdirSync(out, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const one = async (q) => (await pool.query(q)).rows[0]?.id ?? null;

// Real records for dynamic routes, chosen so the default account (Asha, Volt EPC) is entitled to them.
const ids = {
  opportunity: await one("select id from opportunities where code = 'OPP-2026-00001'"),
  catalogue: await one("select id from catalog_items where status = 'published' order by created_at limit 1"),
  lead: await one('select id from lead_claims order by created_at limit 1'),
  customer: await one("select c.id from customers c join organizations o on o.id = c.organization_id where o.display_name = 'Volt EPC' limit 1"),
  team: await one("select t.id from collaboration_teams t join organizations o on o.id = t.lead_org_id where o.display_name = 'Volt EPC' limit 1"),
  tender: await one('select id from tenders order by created_at limit 1'),
  project: await one("select id from projects where code = 'PRJ-2026-000001'"),
  order: await one("select p.id from purchase_orders p join organizations o on o.id in (p.buyer_org_id, p.supplier_org_id) where o.display_name in ('Volt EPC') limit 1"),
  agreement: await one('select id from commission_agreements order by created_at limit 1'),
  directThread: await one("select t.id from message_threads t where t.kind = 'direct' limit 1"),
  projectThread: await one("select t.id from message_threads t where t.kind = 'project' limit 1"),
  meeting: await one('select id from meetings order by created_at limit 1'),
  course: await one("select id from courses where code = 'CZ-101'"),
  partner: await one("select id from organizations where display_name = 'Deccan Distributors'"),
};
const PARAM = { '/opportunities/': 'opportunity', '/catalogue/': 'catalogue', '/leads/': 'lead', '/crm/customers/': 'customer', '/teams/': 'team', '/tenders/': 'tender', '/projects/': 'project', '/trading/orders/': 'order', '/commissions/agreements/': 'agreement', '/chat/groups/': 'projectThread', '/chat/': 'directThread', '/meetings/': 'meeting', '/learning/assessments/': 'course', '/partners/': 'partner' };
const resolve = (route) => {
  if (!route.includes('[')) return route;
  const key = Object.entries(PARAM).filter(([p]) => route.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  return key && ids[key] ? route.replace(/\[[^\]]+\]/, ids[key]) : null;
};
// Records owned by another company are opened as a member of that company.
const owner = async (q) => (await pool.query(q)).rows[0]?.email ?? null;
const OWNER = {
  lead: await owner('select u.email from lead_claims l join users u on u.id = l.introducer_user_id order by l.created_at limit 1'),
  agreement: await owner('select u.email from commission_agreements a join memberships m on m.organization_id = a.beneficiary_org_id join users u on u.id = m.user_id order by a.created_at limit 1'),
};
const resourceOf = (route) => Object.entries(PARAM).filter(([p]) => route.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
const accountFor = (s) => s.route.includes('[') && OWNER[resourceOf(s.route)] ? ['web', OWNER[resourceOf(s.route)]]
  : s.id === '138' ? ['admin', 'finance@collabiz.local'] // finance approver role
  : s.app === 'admin' && s.id.startsWith('X') ? ['admin', 'unite.admin@collabiz.local']
  : s.app === 'admin' ? ['admin', 'superadmin@collabiz.local']
  : s.access === 'public' ? null
  : s.id === '070' ? ['mfa', 'evaluator@collabiz.local'] // technical evaluator
  : ['tender-evaluator', 'tender-issuer'].includes(s.access) ? ['mfa', 'unite.admin@collabiz.local']
  : s.access === 'finance' ? ['mfa', 'finance@collabiz.local']
  : ['web', 'asha@voltepc.example'];

// Pages added after the 165-screen registry (direct offers). Opened and checked exactly like registry screens.
const offerId = await one("select id from direct_offers where code = 'DO-2026-100002'");
const salesOfferId = await one("select id from direct_offers where code = 'DO-2026-100001'");
const ventureId = await one("select id from unite_ventures where slug = 'solcart'");
const growthAgentId = await one("select id from growth_agents where name like 'SOLCART — factory%'");
const offerAgreementId = await one("select id from commission_agreements where code = 'CA-2026-410001'");
const EXTRA = [
  { id: 'X01', title: 'Offers for you', app: 'web', route: '/offers', access: 'verified-partner' },
  { id: 'X02', title: 'Offer (partner)', app: 'web', route: `/offers/${offerId}`, access: 'verified-partner' },
  { id: 'X03', title: 'Your capacity', app: 'web', route: '/settings/capacity', access: 'partner' },
  { id: 'X04', title: 'Direct offers (admin)', app: 'admin', route: '/offers', access: 'unite-admin' },
  { id: 'X05', title: 'New direct offer', app: 'admin', route: '/offers/new', access: 'unite-admin' },
  { id: 'X06', title: 'Direct offer (admin)', app: 'admin', route: `/offers/${offerId}`, access: 'unite-admin' },
  { id: 'X07', title: 'Offer with sales (partner)', app: 'web', route: `/offers/${salesOfferId}`, access: 'verified-partner' },
  { id: 'X08', title: 'Offer with sales (admin)', app: 'admin', route: `/offers/${salesOfferId}`, access: 'unite-admin' },
  { id: 'X09', title: 'Offer commission schedule', app: 'web', route: `/commissions/agreements/${offerAgreementId}/milestones`, access: 'verified-partner' },
  { id: 'X10', title: 'Unite businesses', app: 'web', route: '/ventures', access: 'partner' },
  { id: 'X11', title: 'Unite business (partner)', app: 'web', route: '/ventures/solcart', access: 'partner' },
  { id: 'X12', title: 'Unite businesses (public)', app: 'web', route: '/businesses', access: 'public' },
  { id: 'X13', title: 'Unite businesses (admin)', app: 'admin', route: '/ventures', access: 'unite-admin' },
  { id: 'X14', title: 'Unite business (admin)', app: 'admin', route: `/ventures/${ventureId}`, access: 'unite-admin' },
  { id: 'X15', title: 'New offer for a business', app: 'admin', route: `/offers/new?venture=${ventureId}`, access: 'unite-admin' },
  { id: 'X16', title: 'Pilot check-in', app: 'web', route: '/help/pilot', access: 'authenticated' },
  { id: 'X17', title: 'Pilot feedback (admin)', app: 'admin', route: '/pilot', access: 'unite-admin' },
  { id: 'X18', title: 'Growth Desk', app: 'admin', route: '/growth', access: 'unite-admin' },
  { id: 'X19', title: 'Growth Desk agent', app: 'admin', route: `/growth/agents/${growthAgentId}`, access: 'unite-admin' },
  { id: 'X20', title: 'New Growth Desk agent', app: 'admin', route: '/growth/agents/new', access: 'unite-admin' },
  { id: 'X21', title: 'Lead database', app: 'admin', route: '/growth/contacts', access: 'unite-admin' },
  { id: 'X22', title: 'Workspace', app: 'admin', route: '/workspace', access: 'unite-admin' },
  { id: 'X23', title: 'Workspace apps', app: 'admin', route: '/workspace/apps', access: 'unite-admin' },
  { id: 'X24', title: 'Group companies (workspace)', app: 'admin', route: '/workspace/companies', access: 'unite-admin' },
  { id: 'X25', title: 'Meet', app: 'admin', route: '/workspace/meet', access: 'unite-admin' },
  { id: 'X26', title: 'Workspace search', app: 'admin', route: '/workspace/search?q=solar', access: 'unite-admin' },
  { id: 'X27', title: 'Human Resources', app: 'admin', route: '/workspace/hr', access: 'unite-admin' },
  { id: 'X28', title: 'Payroll', app: 'admin', route: '/workspace/payroll', access: 'finance' },
  { id: 'X29', title: 'Finance and Accounting', app: 'admin', route: '/workspace/finance', access: 'finance' },
  { id: 'X30', title: 'Inventory and Stores', app: 'admin', route: '/workspace/inventory', access: 'unite-admin' },
  { id: 'X31', title: 'Manufacturing', app: 'admin', route: '/workspace/manufacturing', access: 'unite-admin' },
  { id: 'X32', title: 'Retail POS', app: 'admin', route: '/workspace/pos', access: 'unite-admin' },
  { id: 'X33', title: 'Procurement', app: 'admin', route: '/workspace/procurement', access: 'unite-admin' },
];
const RAW = /\b(?:[a-z]+_[a-z_]+|undefined|NaN|\[object Object\])\b/g;
const results = [];
const b = await chromium.launch();
for (const [vw, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  let who = 'none', errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  for (const s of [...SCREENS, ...(only ? EXTRA.filter((x) => only.includes(x.id)) : EXTRA)]) {
    if (only && !only.includes(s.id)) continue;
    // Project chats are created when a member first opens the inbox, so look this one up when needed.
    if (s.route.startsWith('/chat/groups/') && !ids.projectThread) ids.projectThread = await one("select id from message_threads where kind = 'project' limit 1");
    const path = resolve(s.route);
    if (!path) { results.push({ id: s.id, vw, route: s.route, skipped: 'no record to open' }); continue; }
    const acct = accountFor(s);
    const key = acct ? acct.join(':') : 'anon';
    if (key !== who) {
      await ctx.clearCookies();
      if (acct?.[0] === 'web') await webLogin(page, WEB, acct[1]);
      if (acct?.[0] === 'mfa') await webLoginMfa(page, WEB, acct[1]);
      if (acct?.[0] === 'admin') await adminLogin(page, ADMIN, acct[1]);
      who = key;
    }
    errs = [];
    const base = s.app === 'admin' ? ADMIN : WEB;
    try {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
    } catch (e) { errs.push(`navigation: ${e.message.split('\n')[0]}`); }
    const info = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const clone = main.cloneNode(true);
      clone.querySelectorAll('code, .cz-mono, script, style, [aria-hidden="true"], input, textarea, select').forEach((n) => n.remove());
      return { text: clone.innerText, h1: !!document.querySelector('h1'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        apiError: !!document.querySelector('[role="alert"] h3')?.textContent?.includes('couldn’t load'), denied: /Access restricted/.test(main.innerText.slice(0, 600)), url: location.pathname };
    }).catch(() => ({ text: '', h1: false, overflow: 0, apiError: false, denied: false, url: '' }));
    const raw = [...new Set((info.text.match(RAW) ?? []).filter((x) => !/^(e_?mail|in_app)$/.test(x)))].slice(0, 6);
    const screenIdLeft = /SCREEN \d{3}/.test(info.text);
    const issues = [];
    if (errs.length) issues.push(`page error: ${errs[0]}`);
    if (info.apiError) issues.push('API error state shown');
    if (!info.h1) issues.push('no h1');
    if (vw === 'mobile' && info.overflow > 1) issues.push(`horizontal overflow ${info.overflow}px`);
    if (raw.length) issues.push(`raw text: ${raw.join(', ')}`);
    if (screenIdLeft) issues.push('SCREEN id visible');
    if (info.url.startsWith('/login') && !s.route.startsWith('/login')) issues.push('redirected to login');
    await page.screenshot({ path: `${out}/${s.id}-${vw}.jpg`, type: 'jpeg', quality: 60, fullPage: true }).catch(() => {});
    results.push({ id: s.id, title: s.title, vw, route: path, account: key, denied: info.denied, issues });
    if (issues.length) console.log(`${s.id} ${vw} ${s.route}: ${issues.join(' | ')}`);
  }
  await ctx.close();
}
await b.close(); await pool.end();
writeFileSync(`${out}/sweep.json`, JSON.stringify(results, null, 1));
const flagged = new Set(results.filter((r) => r.issues?.length).map((r) => r.id));
console.log(`\nscreens checked: ${new Set(results.map((r) => r.id)).size} · flagged: ${flagged.size} · skipped: ${results.filter((r) => r.skipped).length / 2}`);
