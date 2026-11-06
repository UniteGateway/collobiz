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
for (const u of ['/', '/about', '/membership', '/login', '/support/contact', '/registry']) await scan(WEB + u);
await p.goto(WEB + '/login'); await p.getByLabel('Email').fill('asha@voltepc.example'); await p.getByLabel('Password').fill('Collabiz#2026');
await p.getByRole('button', { name: 'Sign in' }).last().click(); await p.waitForURL(/dashboard/);
for (const u of ['/dashboard', '/company/team', '/onboarding/kyc', '/settings/privacy', '/profile']) await scan(WEB + u);
await scan(ADMIN + '/login');
await b.close();
process.exit(total ? 1 : 0);
