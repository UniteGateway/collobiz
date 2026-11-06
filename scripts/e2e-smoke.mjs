#!/usr/bin/env node
/**
 * Browser smoke tests against running web (3000) + admin (3001) + API (4000).
 * Usage: node scripts/e2e-smoke.mjs [--shots dir]
 * Exercises real UI → API → database paths at desktop (1440) and mobile (390) widths.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001';
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.info(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.error(`✗ ${name}: ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const suites = (await import('./e2e-suites.mjs')).default;
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG) page.on('framenavigated', (f) => f === page.mainFrame() && console.info('  nav', f.url()));
  for (const s of suites) {
    if (s.only && s.only !== label) continue;
    if (process.env.SUITE && !process.env.SUITE.split('|').some((x) => s.name.includes(x))) continue;
    await step(`[${label}] ${s.name}`, async () => {
      try {
        await s.run({ page, ctx, WEB, ADMIN, expect, label, shot: async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${label}-${n}.png`, fullPage: false }) });
      } catch (e) {
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/FAIL-${label}-${s.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`, fullPage: true }).catch(() => {});
        throw new Error(`${e.message.split('\n')[0]} (at ${page.url()})`);
      }
    });
  }
  await step(`[${label}] no uncaught page errors`, async () => expect(errors.length === 0, errors.join(' | ')));
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.info(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
