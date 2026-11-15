/**
 * Captures every page of the partner web app, the admin console and Unite Power at desktop width (plus a phone pass for
 * the main journeys). Dynamic routes ([id] etc.) are resolved by following the first matching link on their parent page,
 * so screens show real records; routes with no example data are listed in the manifest instead of being faked.
 *
 * Usage: node scripts/capture-all.mjs OUT_DIR [web,admin,power]
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { adminLogin, webLogin } from './e2e-suites.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.argv[2] ?? '/tmp/claude-0/all-shots';
const ONLY = (process.argv[3] ?? 'web,admin,power').split(',');
const ROOT = new URL('..', import.meta.url).pathname;
const WEB = process.env.WEB_URL ?? 'http://localhost:3000', ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001', POWER = process.env.POWER_URL ?? 'http://localhost:3002';

function routes(appDir) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'page.tsx') out.push(p); } };
  walk(appDir);
  return out.map((p) => {
    const rel = '/' + relative(appDir, p).replace(/page\.tsx$/, '').replace(/\/$/, '');
    const group = (rel.match(/^\/\(([^)]+)\)/) ?? [])[1] ?? null;
    const path = rel.replace(/\/\([^)]+\)/g, '') || '/';
    return { path: path === '' ? '/' : path, group };
  }).sort((a, b) => a.path.localeCompare(b.path));
}
const slug = (p) => (p === '/' ? 'home' : p.slice(1).replace(/[^\w-]+/g, '_')).slice(0, 90);

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
}
/** Resolve "/projects/[id]/milestones" → "/projects/<real id>/milestones" via links on "/projects". */
/** Where the links to a detail page actually live, when it is not the parent path. */
const HINTS = {
  '/leads': ['/my/leads', '/lead-protection'], '/opportunities': ['/marketplace', '/my/opportunities', '/feed'], '/chat': ['/inbox'], '/chat/groups': ['/inbox'],
  '/collab/room': ['/collab/workspace'], '/commissions/agreements': ['/earnings', '/commissions'], '/contracts': ['/vault'], '/dna': ['/partners', '/partners/find', '/profile'],
  '/ai/team-plans': ['/ai/team-plans', '/ai/team-builder'], '/challenges': ['/one', '/challenges'], '/rescue': ['/one', '/projects'], '/tenders/analyzer': ['/tenders/analyzer', '/tenders'],
  '/trading/orders': ['/trading/orders', '/trading'], '/refer': ['/solar/referrals', '/solar'],
};
let STATIC = new Set();
async function resolve(page, base, pattern, cache) {
  const parts = pattern.split('/');
  let built = '';
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg.startsWith('[')) { built += '/' + seg; continue; }
    const prefix = built, key = `${prefix}/${seg}`;
    if (!cache.has(key)) {
      let found = null;
      // Look on the parent list page, then (if the parent is itself a detail page) on the grandparent.
      for (const listPath of [prefix || '/', ...(HINTS[prefix] ?? []), prefix.split('/').slice(0, -1).join('/') || '/']) {
        try { await page.goto(base + listPath); await settle(page); } catch { continue; }
        const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
        const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/?#]+)`);
        for (const h of hrefs) { const m = h && h.replace(/^https?:\/\/[^/]+/, '').match(re); if (m && !STATIC.has(`${prefix}/${m[1]}`) && !['new', 'mine', 'public', 'map', 'saved', 'categories', 'search'].includes(m[1])) { found = m[1]; break; } }
        if (found) break;
      }
      cache.set(key, found);
    }
    const v = cache.get(key);
    if (!v) return null;
    built += '/' + v;
  }
  return built;
}

const APPS = {
  web: { base: WEB, dir: 'apps/web/app', skip: (r) => ['/login', '/registry', '/logout', '/mfa'].includes(r.path) || r.group === 'auth',
    loginFor: (r) => (r.group === 'app' ? (process.env.LOGIN_AS ? process.env.LOGIN_AS : r.path.startsWith('/collab') || r.path.startsWith('/business-offers') ? 'ravi@sunrise.example' : 'asha@voltepc.example') : null) },
  admin: { base: ADMIN, dir: 'apps/admin/app', skip: (r) => r.group !== 'console', loginFor: () => 'admin' },
  power: { base: POWER, dir: 'apps/power/app', skip: (r) => r.group !== 'app', loginFor: () => 'power' },
};
const MOBILE = { web: ['/', '/dashboard', '/collab', '/collab/workspace', '/business-offers', '/business-offers/new', '/marketplace', '/projects', '/earnings', '/inbox', '/profile'], admin: ['/', '/business-offers'], power: ['/', '/hybrid', '/offtake'] };

const b = await chromium.launch();
/** Concrete paths for detail pages whose list pages navigate with buttons, not links (ids looked up by the caller). */
const FIXED = JSON.parse(process.env.FIXED ?? '{}');
const RETRY = process.env.RETRY ? JSON.parse((await import('node:fs')).readFileSync(process.env.RETRY, 'utf8')) : null;
const manifest = RETRY ? RETRY.filter((m) => m.file) : [];
const retryRoutes = RETRY ? new Set(RETRY.filter((m) => !m.file).map((m) => `${m.app}|${m.vw}|${m.route}`)) : null;
for (const name of ONLY) {
  const app = APPS[name];
  const list = routes(join(ROOT, app.dir)).filter((r) => !app.skip(r));
  STATIC = new Set(list.filter((r) => !r.path.includes('[')).map((r) => r.path));
  mkdirSync(join(OUT, name), { recursive: true });
  for (const [vw, w, h, filter] of [['desktop', 1440, 900, () => true], ['mobile', 390, 844, (r) => MOBILE[name].includes(r.path)]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    let who = undefined; const cache = new Map(); let n = 0;
    for (const r of list.filter(filter).filter((r) => !retryRoutes || retryRoutes.has(`${name}|${vw}|${r.path}`))) {
      const user = app.loginFor(r);
      if (user !== who) {
        await ctx.clearCookies();
        if (user === 'admin') await adminLogin(page, app.base, 'superadmin@collabiz.local');
        else if (user === 'power') { await page.goto(app.base + '/login'); await page.getByLabel('Email').fill('analyst@unitepower.example'); await page.getByLabel('Password').fill('UnitePower#2026'); await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL(app.base + '/'); }
        else if (user) await webLogin(page, app.base, user);
        who = user; cache.clear();
      }
      const t0 = Date.now(); errors.length = 0;
      let path = r.path, status = 'ok';
      try {
        if (FIXED[r.path]) path = FIXED[r.path];
        else if (path.includes('[')) path = await resolve(page, app.base, r.path, cache);
        if (!path) { manifest.push({ app: name, vw, route: r.path, status: 'no example data' }); console.log(`- ${name} ${vw} ${r.path}: no example data`); continue; }
        await page.goto(app.base + path, { timeout: 60000 });
        await settle(page);
        if (name === 'power') await page.waitForTimeout(1500); // charts and simulation results
        const title = (await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => '')) ?? '';
        if (await page.locator('[data-testid="permission-denied"]').first().isVisible().catch(() => false) || await page.getByText(/^Needs the \w+ role$/).first().isVisible().catch(() => false)) status = 'access-limited view';
        const file = join(OUT, name, `${RETRY ? 'r' : ''}${String(++n).padStart(3, '0')}-${vw}-${slug(r.path)}.png`);
        await page.screenshot({ path: file, fullPage: true });
        manifest.push({ app: name, vw, route: r.path, url: path, title: title.trim(), file, status, errors: [...errors], ms: Date.now() - t0 });
        console.log(`✓ ${name} ${vw} ${path} (${Date.now() - t0} ms)${status !== 'ok' ? ` [${status}]` : ''}`);
      } catch (e) {
        manifest.push({ app: name, vw, route: r.path, url: path, status: 'error', error: e.message.split('\n')[0] });
        console.log(`✗ ${name} ${vw} ${r.path}: ${e.message.split('\n')[0]}`);
      }
    }
    await ctx.close();
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
}
await b.close();
console.log(`\n${manifest.filter((m) => m.file).length} screenshots, ${manifest.filter((m) => !m.file).length} without (see manifest.json)`);
