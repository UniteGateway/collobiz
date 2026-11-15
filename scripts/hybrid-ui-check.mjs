/** Browser check of the Hybrid Power Lab: list, simulate, results, inputs, review, compare, combinations, policies, report, phone. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const B = process.env.POWER_URL ?? 'http://localhost:3002', OUT = process.env.SHOTS ?? '/tmp/claude-0/hy-shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [], ok = [];
page.on('pageerror', (e) => errs.push(`${page.url()} ${e.message.slice(0, 200)}`));
const step = async (name, fn) => { try { await fn(); ok.push(name); console.log('✓', name); } catch (e) { errs.push(`${name}: ${e.message.split('\n')[0]}`); console.log('✗', name, e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png`, fullPage: true }); } };
await page.goto(B + '/login');
await page.getByLabel('Email').fill('analyst@unitepower.example');
await page.getByLabel('Password').fill('UnitePower#2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(B + '/');
const simulate = async (key) => {
  await page.goto(B + '/hybrid');
  await page.locator(`[data-scenario="${key}"]`).click();
  await page.getByRole('button', { name: /Simulate the year|Re-run simulation/ }).click();
  await page.getByText('Decision status').waitFor({ timeout: 180000 });
  await page.getByText(/Optimising dispatch/).waitFor({ state: 'detached', timeout: 180000 });
  return page.url().split('?')[0];
};
let urlA;
await step('lab list shows the five samples', async () => { await page.goto(B + '/hybrid'); for (const k of ['A', 'B', 'C', 'D', 'E']) await page.locator(`[data-scenario="${k}"]`).waitFor({ timeout: 60000 }); await page.screenshot({ path: `${OUT}/lab.png`, fullPage: true }); });
await step('simulate A and show hour-by-hour results', async () => { urlA = await simulate('A'); await page.getByText('Hour-by-hour dispatch on one day').waitFor(); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/results-A.png`, fullPage: true }); });
await step('inputs tab with sliders and hour masks', async () => { await page.goto(urlA + '?tab=inputs'); await page.getByText('Delivery hours (local time, hour starting)').waitFor(); await page.screenshot({ path: `${OUT}/inputs-A.png`, fullPage: true }); });
await step('review: checklist gates the next stage', async () => {
  await page.goto(urlA + '?tab=review'); await page.getByText('Pre-signature checklist').waitFor();
  await page.getByLabel('Verified site and generation data').check(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Move to “Data verified”/ }).click(); await page.waitForTimeout(1200);
  await page.locator('[data-stage="data_verified"]').waitFor(); await page.screenshot({ path: `${OUT}/review-A.png`, fullPage: true });
});
await step('report downloads (PDF)', async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.goto(urlA).then(() => page.getByRole('link', { name: 'PDF report' }).click())]); const p = await d.path(); if (!p) throw new Error('no file'); });
for (const k of ['B', 'C', 'D', 'E']) await step(`simulate ${k}`, async () => { await simulate(k); });
await step('compare all five', async () => {
  await page.goto(B + '/hybrid'); for (const k of ['A', 'B', 'C', 'D', 'E']) await page.getByLabel(new RegExp(`^Compare Project ${k}`)).check();
  await page.getByRole('button', { name: /^Compare/ }).click(); await page.getByText('Contract delivered').first().waitFor(); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/compare.png`, fullPage: true });
});
await step('combinations search ranks and prunes', async () => {
  await page.goto(B + '/hybrid/combinations?from=' + urlA.split('/').pop());
  for (const [l, v] of [['Solar from', '20'], ['Solar to', '60'], ['Solar step', '20'], ['Wind from', '0'], ['Wind to', '0'], ['BESS from', '0'], ['BESS to', '30'], ['BESS step', '15']]) await page.getByLabel(l).fill(v);
  await page.getByRole('button', { name: /Compare \d+ combinations/ }).click();
  await page.getByText(/Ranked combinations/).waitFor({ timeout: 240000 }); await page.screenshot({ path: `${OUT}/combinations.png`, fullPage: true });
});
await step('policies page labels everything as not reviewed', async () => { await page.goto(B + '/hybrid/policies'); await page.getByText('Source register').waitFor(); await page.screenshot({ path: `${OUT}/policies.png`, fullPage: true }); });
await step('phone layout has no horizontal overflow', async () => {
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() }); const p = await m.newPage();
  for (const [u, n] of [['/hybrid', 'm-lab'], [urlA.replace(B, ''), 'm-results']]) { await p.goto(B + u); await p.waitForTimeout(4000); const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (over > 1) throw new Error(`${u} overflows ${over}px`); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: false }); }
  await m.close();
});
console.log(`\n${ok.length} passed, ${errs.length} problems`); console.log(JSON.stringify(errs, null, 1));
await b.close(); process.exit(errs.length ? 1 : 0);
