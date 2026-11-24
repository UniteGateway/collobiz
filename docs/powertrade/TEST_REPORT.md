# Test report (2026-11-24)

| Suite | Result |
|---|---|
| `packages/types/src/powertrade.test.ts` — calculator worked example, zero-residual rule, collected-only, turnover ≠ profit, estimated savings label, benefit validation, workflow finality, Product-for-Power documents, reverse parsing | 8/8 pass |
| `apps/api/test/powertrade.e2e.ts` — steel manufacturer joins (owner/admin-only edits); power comparison (eligibility, illustrative provenance, captive unresolved without equity, small consumer below threshold, ranking); live energy + business matches with reasons and no percentage scores; reverse matching; transformer Product-for-Power (separate legs, benefit ≤ supply, allowed moves only, non-party 404, reviewer-only approval, documents with references, tax review by finance, completion blocked until all documents accepted, attributed history); retail store benefits (anticipated not verifiable, verify→collect→allocate, partial collection, over-collection and over-allocation refused, finance-only approvals, verified savings, net economic expense); admin counts exclude samples; ACTION OS connector | 6/6 pass |
| `club.e2e.ts`, `action-os.e2e.ts` (regression after connector and member-page changes) | pass (19 API tests in the three suites) |
| Unit tests, all packages | 184/184 pass |
| Browser suite "POWERTRADE" (desktop + mobile): join wizard, power comparison, reverse matching from a sample example, Product-for-Power proposal and submit, calculator residual ₹2.50 L | pass, no page errors |
