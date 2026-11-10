import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const B = 'http://localhost:3002';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`${page.url()} ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`${page.url()} console: ${m.text().slice(0, 200)}`); });
await page.goto(B + '/login');
await page.getByLabel('Email').fill('analyst@unitepower.example');
await page.getByLabel('Password').fill('UnitePower#2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(B + '/');
const pages = [['/', 'Developer revenue'], ['/config', 'Five different capacities'], ['/solar', 'CUF — DC basis'], ['/battery', 'Equivalent full cycles'], ['/dispatch', 'Maximum developer profit'], ['/graph', 'Energy flow'], ['/cuf', 'Utilisation measures'], ['/savings', 'Annual saving']];
for (const [p, text] of pages) {
  const t0 = Date.now();
  await page.goto(B + p);
  try { await page.getByText(text).first().waitFor({ timeout: 90000 }); } catch { errs.push(`${p}: "${text}" not shown`); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/claude-0/upd-shots/${p === '/' ? 'dashboard' : p.slice(1)}.png`, fullPage: true });
  console.log(p, Date.now() - t0, 'ms');
}
console.log('ERRORS', JSON.stringify(errs, null, 1));
await b.close();
