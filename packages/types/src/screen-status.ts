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
};
