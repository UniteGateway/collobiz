/**
 * Screen implementation status. Updated at the close of each stage — only set `verified` when an automated
 * test referenced in `tests` exercises the screen's API/UI path and passed.
 * planned → scaffolded (route renders with shell) → implemented (wired to real API) → verified (tests pass)
 */
export type ScreenStatus = 'planned' | 'scaffolded' | 'implemented' | 'verified';
export interface ScreenProgress { status: ScreenStatus; tests?: string[]; notes?: string }

const E2E = 'scripts/e2e-suites.mjs';
const v = (tests: string[], notes?: string): ScreenProgress => ({ status: 'verified', tests, notes });

export const SCREEN_STATUS: Record<string, ScreenProgress> = {
  // ---- Stage 01 ----
  '001': v([E2E], 'Static content; CMS-managed in Stage 15 (screen 142)'),
  '002': v([E2E]),
  '003': v([E2E]),
  '007': v([E2E]),
  '010': v([E2E, 'apps/api/test/stage01.e2e.ts'], 'Public enquiry API with rate limit and outbox acknowledgement'),
  // ---- Stage 02 ----
  '011': v([E2E, 'apps/api/test/stage02.e2e.ts', 'apps/mobile/test/login.test.tsx'], 'Web + native; lockout, rate limit, MFA challenge'),
  '012': v([E2E, 'apps/api/test/stage02.e2e.ts'], 'Email/SMS OTP via outbox adapter (B-04); web + native'),
  '129': v([E2E, 'apps/api/test/stage02.e2e.ts'], 'Grant/revoke platform roles with reason; suspend/reactivate; no self-privilege changes'),
  '141': v([E2E, 'apps/api/test/stage02.e2e.ts'], 'Hash-chained audit with chain verification, filters, security summary'),
  '144': v([E2E, 'apps/api/test/stage02.e2e.ts'], 'Invite, accept, role change, last-owner protection, tenant-scoped'),
  '145': v([E2E, 'apps/api/test/stage02.e2e.ts'], 'TOTP enrol/disable, password change revokes sessions, session list; web + native'),
  // '023' superseded below
  '_023': { status: 'scaffolded', tests: [E2E], notes: 'Stage 02 baseline (identity, verification, activity); business KPIs in Stage 05' },
  // ---- Stage 03 ----
  '013': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Creates partner org + owner membership; requires verified email; web + native'),
  '014': v(['apps/api/test/stage03.e2e.ts'], 'Individual details; PAN encrypted; web + native (shared details screen)'),
  '015': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Company identifiers validated (GSTIN/CIN); web + native'),
  '016': v([E2E, 'apps/api/test/stage03.e2e.ts']),
  '017': v([E2E, 'apps/api/test/stage03.e2e.ts']),
  '018': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Includes AI-matching consent'),
  '019': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Magic-byte validation, scan hook, private storage, signed URLs, audited access; native picker'),
  '020': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'AES-256-GCM encrypted account/PAN; masked everywhere'),
  '021': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Click-to-accept evidence (typed name, IP, UA, SHA-256); templates pending legal review (B-08)'),
  '022': v([E2E, 'apps/api/test/stage03.e2e.ts', 'apps/mobile/test/kyb-status.test.tsx'], 'Verified / rejected / re-upload states; idempotent submission'),
  '130': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Queue, claim, per-document review, decision with reason; no self-review'),
  '131': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Automatic duplicate-GSTIN + screened-country flags; four-eyes clearing; data-rights queue'),
  '143': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Web + native'),
  '149': v([E2E, 'apps/api/test/stage03.e2e.ts'], 'Consent ledger, export download, 30-day data requests'),
  // ---- Stage 04 ----
  '004': v([E2E, 'apps/api/test/stage04.e2e.ts'], 'Brand vs legal entity shown separately'),
  '005': v([E2E, 'apps/api/test/stage04.e2e.ts'], 'Visibility + price-disclosure by verification/membership level'),
  '008': v([E2E, 'apps/api/test/stage04.e2e.ts'], 'Published only with partner consent'),
  '039': v([E2E, 'apps/api/test/stage04.e2e.ts'], '404 for non-visible items; price request'),
  '128': v([E2E, 'apps/api/test/stage04.e2e.ts'], 'Group companies, legal entity codes, business units'),
  '136': v([E2E, 'apps/api/test/stage04.e2e.ts'], 'Own-company scoping, draft/publish/archive, audited'),
  // ---- Stage 05 ----
  '006': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Public listings only'),
  '009': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Aggregated verified-partner coverage; no identities'),
  '023': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Real KPIs, recommendations, activity; web + native'),
  '024': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Applications + originated opportunities, withdraw'),
  '025': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Explainable, consent-gated rules engine'),
  '031': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Web + native'),
  '032': v([E2E, 'apps/api/test/stage05.e2e.ts']),
  '033': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Verified partners only; originator withheld'),
  '034': v([E2E, 'apps/api/test/stage05.e2e.ts']),
  '035': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Saved search + alerts'),
  '036': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Publisher applicant review; immutable history; web + native'),
  '037': v([E2E, 'apps/api/test/stage05.e2e.ts']),
  '038': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Dependency-free plot + accessible list'),
  '040': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Anonymous buyers; enters Unite review, never public'),
  '041': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Same checks enforced server-side on apply'),
  '042': v([E2E, 'apps/api/test/stage05.e2e.ts'], 'Idempotent; eligibility snapshot; web + native'),
};
