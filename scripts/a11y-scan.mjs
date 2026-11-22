#!/usr/bin/env node
/** WCAG 2.0-2.2 A/AA scan (axe-core) of key web and admin pages. Servers must be running. Exits 1 on any violation. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001';
let total = 0;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
async function scan(url) {
  await p.goto(url); await p.waitForLoadState('load'); await p.waitForTimeout(1200); await p.addScriptTag({ content: axeSrc });
  const r = await p.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  total += r.violations.length;
  console.log(`\n${url}: ${r.violations.length} violation types`);
  for (const v of r.violations) console.log(`  [${v.impact}] ${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes[0].target.join(' ')}`);
}
for (const u of ['/', '/about', '/membership', '/login', '/signup', '/support/contact', '/registry']) await scan(WEB + u);
await p.goto(WEB + '/login'); await p.getByLabel('Email').fill('asha@voltepc.example'); await p.getByLabel('Password').fill('Collabiz#2026');
await p.getByRole('button', { name: 'Sign in' }).last().click(); await p.waitForURL(/dashboard/);
for (const u of ['/dashboard', '/company/team', '/onboarding/kyc', '/settings/privacy', '/profile', '/tenders', '/tenders/new', '/vault']) await scan(WEB + u);
for (const u of ['/launch', '/launch/plans', '/capacity', '/capacity/calendar', '/capacity/mine?publish=1', '/micro', '/micro/new', '/micro/mine', '/pools', '/pools/new', '/pools/mine', '/commit', '/commit/new']) await scan(WEB + u);
for (const u of ['/proof', '/business-qr', '/finance/pnl', '/finance/credit-notes', '/collab/matches', '/collab/requests', '/collab/programs']) await scan(WEB + u);
const tid = await p.evaluate(async () => (await (await fetch('/api/v1/tenders')).json()).open?.[0]?.id);
if (tid) for (const u of ['documents', 'bid']) await scan(`${WEB}/tenders/${tid}/${u}`);
await scan(WEB + '/projects');
const pid = await p.evaluate(async () => (await (await fetch('/api/v1/projects')).json())[0]?.id);
if (pid) for (const u of ['', '/milestones', '/progress', '/materials', '/documents', '/inspections', '/certification', '/closure', '/allocation']) await scan(`${WEB}/projects/${pid}${u}`);
for (const u of ['/trading', '/trading/suppliers', '/trading/requirements/new', '/trading/enquiry', '/trading/quotations', '/trading/po/new', '/trading/orders', '/trading/territories', '/trading/claims']) await scan(WEB + u);
const oid = await p.evaluate(async () => (await (await fetch('/api/v1/trading/purchase-orders')).json())[0]?.id);
if (oid) await scan(`${WEB}/trading/orders/${oid}/shipping`);
await p.goto(WEB + '/login'); await p.context().clearCookies(); await p.goto(WEB + '/login');
await p.getByLabel('Email').fill('meera@consult.example'); await p.getByLabel('Password').fill('Collabiz#2026'); await p.getByRole('button', { name: 'Sign in' }).last().click(); await p.waitForURL(/dashboard/);
for (const u of ['/earnings', '/earnings/summary', '/earnings/live', '/commissions/calculator', '/payouts/request', '/payments/history', '/tax-records', '/finance/opportunities', '/finance/enquiry', '/finance/disputes', '/commissions/disputes']) await scan(WEB + u);
const agid = await p.evaluate(async () => (await (await fetch('/api/v1/commissions/agreements')).json())[0]?.id);
if (agid) { await scan(`${WEB}/commissions/agreements/${agid}`); await scan(`${WEB}/commissions/agreements/${agid}/milestones`); }
// GO EB5 — partner, client and staff views
for (const u of ['/eb5/partner', '/eb5/leads', '/eb5/leads/new']) await scan(WEB + u);
{ const { webLogin, webLoginMfa } = await import('./e2e-suites.mjs');
await scan(WEB + '/go-eb5/apply'); await scan(WEB + '/businesses'); await scan(WEB + '/businesses/sunite'); await scan(WEB + '/businesses/zuppo');
  await webLogin(p, WEB, 'client@goeb5.example'); for (const u of ['/eb5/portal', '/eb5/apply']) await scan(WEB + u);
  await webLoginMfa(p, WEB, 'manager@goeb5.example');
  for (const u of ['/eb5', '/eb5/leads', '/eb5/applications', '/eb5/consultations', '/eb5/agreements', '/eb5/documents', '/eb5/cases', '/eb5/projects', '/eb5/tasks', '/eb5/reports']) await scan(WEB + u);
  const lid = await p.evaluate(async () => (await (await fetch('/api/v1/eb5/leads')).json())[0]?.id); if (lid) await scan(`${WEB}/eb5/leads/${lid}`);
  await webLoginMfa(p, WEB, 'compliance@collabiz.local'); for (const u of ['/eb5/settings', '/eb5/compliance', '/eb5/partners', '/eb5/disputes', '/eb5/audit']) await scan(WEB + u); }
await scan(ADMIN + '/login');
await b.close();
process.exit(total ? 1 : 0);
