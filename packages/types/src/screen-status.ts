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
  // ---- Stage 06 ----
  '026': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Web + native'),
  '043': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Consent & evidence first; web wizard + native form'),
  '044': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Tax ID strengthens fair duplicate detection'),
  '045': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Sector routes to the matching Unite company'),
  '046': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Idempotent submit; sealed SHA-256 evidence snapshot'),
  '047': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Private, hashed, audited'),
  '048': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Other party never disclosed; web + native'),
  '049': v([E2E, 'apps/api/test/stage06.e2e.ts']),
  '050': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Business-hours SLA timer, pauses, escalation; web + native'),
  '051': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Web + native'),
  '132': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Accept/release/reject/pause/escalate; no self-routing; consent-gated listing'),
  '133': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Calendars, holidays, auto-release policy, due-time preview'),
  '134': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Independent panel; evidence side-by-side; appeal to a different panelist'),
  '151': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Web + native'),
  '152': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'QR + public verification without customer data'),
  '153': v([E2E, 'apps/api/test/stage06.e2e.ts'], 'Evidence trail, 14-day appeal'),
  // ---- Stage 07 ----
  '028': v([E2E, 'apps/api/test/stage07.e2e.ts'], 'Week calendar, overdue list, assign within org'),
  '030': v([E2E, 'apps/api/test/stage07.e2e.ts'], 'Quick actions + merged CRM/audit/alerts; web + native'),
  '052': v([E2E, 'apps/api/test/stage07.e2e.ts'], 'Consent-scoped record, deals, leads, follow-ups, history'),
  '053': v([E2E, 'apps/api/test/stage07.e2e.ts'], 'Versioned stage moves with activity + audit; accessible move control; web + native'),
  '054': v([E2E, 'apps/api/test/stage07.e2e.ts'], 'Merges lifecycle, routing, documents, disputes and CRM'),
  // ---- Stage 08 ----
  '055': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Capability/geography/skill filters over verified partners'),
  '056': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Public fields only; profile view'),
  '057': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Explainable, consent-gated; human accepts before inviting'),
  '058': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Verified orgs only; lead owner/admin only'),
  '059': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Teaser only until NDA; web + native'),
  '060': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Pick team, add partners with roles, invite'),
  '061': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Lead-only edits, audited'),
  '062': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Typed-name signature bound to NDA hash; unlocks workspace'),
  '063': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Versioned; shares total 100%; every member approves'),
  '064': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Requires NDAs + approved proposal'),
  '124': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Named-party consortium (not a legal entity)'),
  '154': v([E2E, 'apps/api/test/stage08.e2e.ts']),
  '155': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'Roles, shares, NDA status, revoke'),
  '156': v([E2E, 'apps/api/test/stage08.e2e.ts'], 'NDA-signed members only; revocation removes access'),
  // ---- Stage 09 ----
  '065': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Open/issued/bid/evaluating views'),
  '066': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Draft → publish gate (docs + both evaluator kinds + ≥1h)'),
  '067': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Docs, addenda, eligibility checklist, evaluator committee'),
  '068': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'AES-GCM sealed envelopes + SHA-256 seal; withdraw/resubmit'),
  '069': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Weighted ranking; prices hidden from technical-only evaluators'),
  '070': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Technical envelopes only; one final score per evaluator'),
  '071': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Qualified bids only; commercial sealed until technical complete'),
  '073': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Bidder-only price revisions, versioned'),
  '137': v([E2E, 'apps/api/test/stage09.e2e.ts'], 'Metadata, seals and audit trail only — never content'),
  // ---- Stage 10 ----
  '074': v([E2E, 'apps/api/test/stage10.e2e.ts'], 'Draft from award → second-person approval → hash-bound signatures; amend/terminate'),
  '148': v([E2E, 'apps/api/test/stage10.e2e.ts'], 'Contracts, agreements, KYB docs, NDAs, certificates with hashes'),
  // ---- Stage 11a ----
  '075': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Role-shaped portfolio; web + native'),
  '076': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Progress, certified %, financials (owner/lead only), change log'),
  '077': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Baseline approval; reasoned, logged re-planning'),
  '078': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Verified subcontractors; allocation ≤ value; logged'),
  '079': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Photo evidence per milestone; web + native camera/gallery'),
  '080': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Materials with delivery tracking; logged'),
  '081': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Versioned documents (supersede, never overwrite)'),
  '082': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Quality/safety checklists; NCRs block certification'),
  '083': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Owner-only certification on sealed evidence; invoice; payment'),
  '084': v([E2E, 'apps/api/test/stage11.e2e.ts'], 'Hashed completion certificate; close after payment'),
};
