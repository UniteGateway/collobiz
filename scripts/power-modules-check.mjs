// Browser check for Power Lab modules 6–8, 10, 12, 13 and settings (run with the power app on :3002). Proposes and rejects a tariff change, so tariff data is unchanged.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const B = 'http://localhost:3002';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`${page.url()} ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`${page.url()} console: ${m.text().slice(0, 200)}`); });
await page.goto(B + '/login');
await page.getByLabel('Email').fill('admin@unitepower.example');
await page.getByLabel('Password').fill('UnitePower#2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(B + '/');
const check = async (p, text, fn) => {
  const t0 = Date.now();
  await page.goto(B + p);
  try { await page.getByText(text).first().waitFor({ timeout: 120000 }); if (fn) await fn(); } catch (e) { errs.push(`${p}: ${e.message.split('\n')[0]}`); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/claude-0/upd-shots/${p.slice(1)}.png`, fullPage: true });
  console.log(p, Date.now() - t0, 'ms');
};
await check('/voltage', 'Lowest 25-year cost', async () => {
  await page.getByLabel('Export voltage', { exact: true }).selectOption('220');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await page.getByText('Losses at 220 kV').waitFor();
});
await check('/open-access', 'Landed cost at the consumer', async () => {
  await page.getByRole('table', { name: 'Open-access charges' }).getByText('Cross-subsidy surcharge').waitFor();
  await page.getByLabel('Structure').selectOption('captive');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await page.getByText(/Captive \/ group captive/).waitFor();
  // Propose a change to an AP record and approve it as admin.
  await page.getByRole('button', { name: 'Propose a change to AP.sldc' }).click();
  await page.getByLabel('New value').fill('2500');
  await page.getByLabel('Source', { exact: true }).selectOption('user');
  await page.getByLabel('Order or source title').fill('Internal estimate for test');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByText('Awaiting review').waitFor();
  await page.locator('li', { hasText: 'AP.sldc' }).getByRole('button', { name: 'Reject' }).click();
  await page.getByText('Rejected.').waitFor();
});
await check('/interstate', 'Landed cost by consumer state', async () => {
  await page.getByText('Not all conditions confirmed — no waiver').waitFor();
  for (const l of ['connected to the ISTS (not only', 'technology (solar', 'Commissioning date', 'buyer category']) await page.getByLabel(new RegExp(l.replace(/[()]/g, '.'))).check();
  await page.getByLabel('Plant is connected to the ISTS', { exact: true }).check();
  await page.getByRole('button', { name: 'Calculate' }).click();
  await page.getByText('All conditions confirmed — waiver applies').waitFor();
  await page.getByText(/waived \(ISTS.waiver, conditions confirmed\)/).waitFor();
});
await check('/finance', 'Project IRR', async () => {
  await page.getByRole('table', { name: 'Sensitivity analysis' }).getByText('Capex +10%').waitFor();
  await page.getByLabel('Debt share').fill('60');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await page.waitForTimeout(1500);
});
await check('/reports', 'Management report (PDF)', async () => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: 'Download PDF' }).click()]);
  const path = await d.path(); const fs = await import('node:fs'); const head = fs.readFileSync(path).subarray(0, 5).toString();
  console.log('report', d.suggestedFilename(), fs.statSync(path).size, head);
  if (head !== '%PDF-') errs.push('report is not a PDF');
});
await check('/automation', 'Tariff record check', async () => {
  await page.getByRole('button', { name: 'Run Tariff record check now' }).click();
  await page.getByText(/tariff records are still illustrative placeholders/).first().waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Run Weather data refresh (PVGIS / NASA POWER) now' }).click();
  await page.getByText(/not reachable from this environment; climate inputs stay illustrative/).first().waitFor();
  await page.getByRole('button', { name: 'Run Profitability check now' }).click();
  await page.waitForTimeout(4000);
});
await check('/settings', 'People and roles', async () => {
  await page.getByText('tariff.change_rejected').first().waitFor();
});
console.log('ERRORS', JSON.stringify(errs, null, 1));
await b.close();
