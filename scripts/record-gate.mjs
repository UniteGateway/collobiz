/**
 * Records the quality gate per screen in docs/audit/quality-gate.json from evidence that already exists:
 *   · gate sweep (scripts/gate-sweep.mjs): the screen opened at 1440 px and 390 px with an entitled account and
 *     showed no page error, API error, missing heading, phone overflow, raw codes or developer labels;
 *   · screenshot review: the sweep's screenshots were looked at by a person/agent (REVIEWED=1 confirms this run);
 *   · route inventory (scripts/audit-routes.mjs): API e2e tests and a browser journey that opens the screen;
 *   · native screens: an automated native test.
 * A screen passes only when every item holds. Otherwise the entry lists what is outstanding; earlier passes are kept.
 * Usage: REVIEWED=1 node scripts/record-gate.mjs <sweepDir> [date]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'docs/audit/screenshots/gate';
const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const sweep = JSON.parse(readFileSync(`${dir}/sweep.json`, 'utf8'));
const inv = JSON.parse(readFileSync('docs/audit/route-inventory.json', 'utf8'));
const path = 'docs/audit/quality-gate.json';
const gate = JSON.parse(readFileSync(path, 'utf8'));
const reviewed = process.env.REVIEWED === '1';
const evidenceDir = dir.replace(/^docs\/audit\//, '');

let passed = 0;
for (const r of inv) {
  const runs = sweep.filter((x) => x.id === r.id);
  const outstanding = [];
  if (!r.file) outstanding.push('route not built');
  if (runs.length < 2 || runs.some((x) => x.skipped)) outstanding.push('not opened at both widths in the sweep');
  for (const x of runs) if (x.issues?.length) outstanding.push(`${x.vw}: ${x.issues.join('; ')}`);
  if (!reviewed) outstanding.push('screenshots not reviewed');
  if (!r.apiTests?.length) outstanding.push('no API e2e test');
  if (!r.smokeHit) outstanding.push('no browser journey opens this screen');
  if (r.mobile === 'native' && !r.native) outstanding.push('native screen not built');
  if (r.mobile === 'native' && r.native && !r.nativeTest) outstanding.push('no native test');
  const prev = gate[r.id];
  if (prev?.passed && prev.evidence?.some((e) => e.startsWith('screenshots/after/'))) {
    // Phase C entries carry their own evidence; keep them and add the sweep as further evidence.
    if (!outstanding.length) prev.sweep = { date, evidence: [`${evidenceDir}/${r.id}-desktop.jpg`, `${evidenceDir}/${r.id}-mobile.jpg`] };
    passed += prev.passed ? 1 : 0;
    continue;
  }
  gate[r.id] = outstanding.length
    ? { passed: false, date, outstanding }
    : { passed: true, date, evidence: [`${evidenceDir}/${r.id}-desktop.jpg`, `${evidenceDir}/${r.id}-mobile.jpg`], tests: r.apiTests.concat('browser journey (scripts/e2e-suites.mjs)', r.nativeTest ? 'native test (apps/mobile/test)' : []).flat(), account: runs[0]?.account ?? 'anon' };
  if (!outstanding.length) passed += 1;
}
writeFileSync(path, JSON.stringify(Object.fromEntries(Object.entries(gate).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
const open = Object.entries(gate).filter(([, g]) => !g.passed);
console.log(`passed: ${passed} of ${inv.length}`);
for (const [id, g] of open) console.log(`${id}: ${g.outstanding.join(' | ')}`);
