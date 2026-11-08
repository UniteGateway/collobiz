/** Audit: maps every registry screen to real route files, native screens, API tests and smoke coverage. Evidence only. */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { SCREENS, SCREEN_STATUS } = require('../packages/types/dist/index.js');
const root = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!['node_modules', '.next'].includes(f)) walk(p, out); } else out.push(p); } return out; }
const routeOf = (base, file) => '/' + file.slice(base.length + 1).replace(/\/page\.tsx$/, '').split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
const webBase = join(root, 'apps/web/app'), adminBase = join(root, 'apps/admin/app');
const webRoutes = new Map(walk(webBase).filter((f) => f.endsWith('/page.tsx')).map((f) => [routeOf(webBase, f).replace(/\/$/, '') || '/', f]));
const adminRoutes = new Map(walk(adminBase).filter((f) => f.endsWith('/page.tsx')).map((f) => [routeOf(adminBase, f).replace(/\/$/, '') || '/', f]));
const mobileFiles = walk(join(root, 'apps/mobile/app')).filter((f) => f.endsWith('.tsx'));
const mobileById = new Map();
for (const f of mobileFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/ScreenView id="(\d{3})"/g)) mobileById.set(m[1], f.slice(root.length));
  // Doc comments such as "Screens 014 (individual) / 015 (company)" name every screen a file implements.
  for (const line of src.match(/\/\*\* Screens? [^\n]*/g) ?? []) for (const id of line.split(/[—-]/)[0].match(/\b\d{3}\b/g) ?? []) mobileById.set(id, f.slice(root.length));
}
const smoke = readFileSync(join(root, 'scripts/e2e-suites.mjs'), 'utf8');
const apiTests = walk(join(root, 'apps/api/test')).filter((f) => f.endsWith('.e2e.ts')).map((f) => [f.slice(root.length), readFileSync(f, 'utf8')]);
const mobileTests = walk(join(root, 'apps/mobile/test')).map((f) => readFileSync(f, 'utf8')).join('\n');

const rows = SCREENS.map((s) => {
  const routes = s.app === 'admin' ? adminRoutes : webRoutes;
  const file = routes.get(s.route) ?? routes.get(s.route.replace(/\/$/, ''));
  const src = file ? readFileSync(file, 'utf8') : '';
  const lines = src.split('\n').length;
  const usesApi = /useQuery|api\.(get|post|put|patch|request|upload)|useMutation|fetch\(/.test(src);
  const marker = new RegExp(`id="${s.id}"`).test(src) || new RegExp(`Screen id="${s.id}"`).test(src);
  const placeholder = /PlannedScreen|coming soon|TODO|lorem ipsum|placeholder (text|content|page)/i.test(src.replace(/placeholder=/g, ''));
  const smokeHit = smoke.includes(` ${s.id} `) || smoke.includes(`'${s.id}-`) || smoke.includes(`${s.id}/`) || smoke.includes(` ${s.id}/`) || new RegExp(`\\b${s.id}\\b`).test(smoke);
  const apiTest = apiTests.filter(([, t]) => new RegExp(`\\b${s.id}\\b`).test(t)).map(([f]) => f.replace('apps/api/test/', ''));
  const native = mobileById.get(s.id) ?? null;
  return { id: s.id, title: s.title, stage: s.stage, app: s.app, route: s.route, mobile: s.mobile, registryStatus: SCREEN_STATUS[s.id]?.status ?? 'unknown',
    file: file ? file.slice(root.length) : null, lines, usesApi, marker, placeholder, smokeHit, apiTests: apiTest, native, nativeTest: native ? new RegExp(`Screen ${s.id}\\b|${s.id} \\(mobile\\)|Screens? [\\d/]*${s.id}`).test(mobileTests) : false };
});
writeFileSync(join(root, 'docs/audit/route-inventory.json'), JSON.stringify(rows, null, 2));
const c = (f) => rows.filter(f).length;
console.log(JSON.stringify({ total: rows.length, withRouteFile: c((r) => r.file), missingRoute: c((r) => !r.file), usesApi: c((r) => r.usesApi), placeholder: c((r) => r.placeholder), smokeCovered: c((r) => r.smokeHit), apiTestRef: c((r) => r.apiTests.length),
  nativeRequired: c((r) => r.mobile === 'native'), nativeImplemented: c((r) => r.mobile === 'native' && r.native), nativeTested: c((r) => r.mobile === 'native' && r.nativeTest), registryVerified: c((r) => r.registryStatus === 'verified') }, null, 1));
console.log('MISSING:', rows.filter((r) => !r.file).map((r) => `${r.id} ${r.route} (stage ${r.stage})`).join('; '));
console.log('NATIVE MISSING:', rows.filter((r) => r.mobile === 'native' && !r.native).map((r) => r.id).join(', '));
console.log('VERIFIED BUT NO SMOKE:', rows.filter((r) => r.registryStatus === 'verified' && !r.smokeHit).map((r) => r.id).join(', '));
