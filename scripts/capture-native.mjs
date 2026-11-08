/**
 * Renders the native app's layouts through react-native-web at 390×844 and captures the core partner screens.
 * Visual evidence only — this is not proof of on-device behaviour (native binaries are blocked, B-06).
 * Usage: node scripts/capture-native.mjs [outDir]   (servers must be up on the demo database; exports the web bundle first)
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'docs/audit/screenshots/after/mobile-native';
const dist = process.env.NATIVE_WEB_DIST ?? '/tmp/collabiz-native-web';
mkdirSync(out, { recursive: true });
if (!process.env.SKIP_EXPORT) execSync(`npx expo export --platform web --output-dir ${dist}`, { cwd: 'apps/mobile', stdio: 'ignore' });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  const file = existsSync(p) && statSync(p).isFile() ? p : join(dist, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(8081); // an origin the API already allows (CORS_ORIGINS)

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
try {
  // Tokens live in memory on web, so sign in once and move by tapping (no full reloads).
  await page.goto('http://localhost:8081/login');
  await page.getByLabel('Email').fill('asha@voltepc.example');
  await page.getByLabel('Password').fill('Collabiz#2026');
  await page.getByTestId('login-submit').click();
  await page.getByText(/Good (morning|afternoon|evening), Asha/).waitFor({ timeout: 20000 });
  await page.getByText('Needs your attention').waitFor();
  await shot('023-home');
  await page.getByRole('tab', { name: 'Opportunities' }).click();
  await page.getByTestId('result-count').getByText(/opportunit/).waitFor();
  await shot('031-opportunities');
  await page.getByTestId('opp-OPP-2026-00003').click();
  await page.getByText(/Not eligible yet|You can apply|Your application/).waitFor();
  await shot('036-opportunity-detail');
  await page.goBack();
  await page.getByRole('tab', { name: 'Leads' }).click();
  await page.waitForTimeout(800);
  await shot('026-leads');
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByText('Sign out').waitFor();
  await shot('account');
} finally {
  await b.close();
  server.close();
}
