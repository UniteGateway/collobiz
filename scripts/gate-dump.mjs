// Dev helper: prints the visible main text of given screens (as the sweep's entitled account) to choose journey assertions.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webLogin, adminLogin } from './e2e-suites.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sweep = JSON.parse(readFileSync(process.argv[2], 'utf8')).filter((r) => r.vw === 'desktop' && process.env.ONLY.split(',').includes(r.id));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let who = '';
for (const r of sweep) {
  if (r.account !== who) { await page.context().clearCookies(); const [k, e] = r.account.split(':'); if (k === 'web') await webLogin(page, 'http://localhost:3000', e); if (k === 'admin') await adminLogin(page, 'http://localhost:3001', e); who = r.account; }
  await page.goto((r.account.startsWith('admin') ? 'http://localhost:3001' : 'http://localhost:3000') + r.route); await page.waitForLoadState('networkidle').catch(() => {});
  console.log(`\n### ${r.id} ${r.route}\n` + (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
}
await b.close();
