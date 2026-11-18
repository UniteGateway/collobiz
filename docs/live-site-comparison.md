# www.collabiz.co vs this repository (branch `claude/collabiz-platform-build`) — 18 Nov 2026

Method: signed in on www.collabiz.co with the demo account **Asha Patil (Volt EPC)**, opened every link in her menu
(77 links, 73 pages captured — see `collabiz-co-live-screens.pdf` delivered with this report) and compared the routes and
page content with this repository.

## Finding
The live site is built from a **newer version of this same codebase**: it already contains everything in this branch
(ACTION OS notice board, Collab, Business Offers, Powertek, Unite Solar, Invest together, Community, etc. with the same
demo data) **plus the modules below that this branch does not have**. This branch's `main` holds only an initial
commit, so the live site's source is elsewhere (another repository or branch).

## Rebuilt in this branch (the live source is not on GitHub)
| Module | Routes here | Verified by |
|---|---|---|
| **Unite Green Park — energy marketplace** | `/energy`, `/energy/map`, `/energy/register`, `/energy/calculator`, `/energy/traders`, `/energy/mine`, `/energy/listings/:id`; admin `/energy` | `energy.e2e.ts`, types `energy.test.ts`, browser suite "Unite Green Park" |
| **Launch** | `/launch`, `/launch/plans`, `/launch/plans/:id` | `collab-ops.e2e.ts`, types `collab-ops.test.ts`, browser suite "Launch, Capacity, …" |
| **Capacity calendar** | `/capacity`, `/capacity/calendar`, `/capacity/mine` | same; never double-books (free units checked per day on accept) |
| **Micro-contracts** | `/micro`, `/micro/new`, `/micro/mine`, `/micro/:id` | same; open → assigned → submitted → accepted → paid → receipt confirmed |
| **Demand pools** | `/pools`, `/pools/new`, `/pools/mine`, `/pools/:id` | same; suppliers see totals only, learn a buyer's name only when it accepts their quote |
| **Commit** | `/commit`, `/commit/new`, `/commit/:id` | same; binding only when all pledges and independently verified conditions are in before the deadline |

| **Proof — performance passport** | `/proof` | `trust-finance.e2e.ts`, types `trust-finance.test.ts`; counts only both-side-confirmed records |
| **Business QR** | `/business-qr`, public `/b/:token` | same; opt-in public link shows level and counts only, stops working when sharing is turned off |
| **Invoices & P&L** | `/finance/pnl`, `/finance/credit-notes` | same; credit notes capped at what is left on the invoice, refunds count only when paid, expenses recorded |
| **Collab sub-pages** | `/collab/matches`, `/collab/requests`, `/collab/programs` | browser suite "Proof, Business QR, …"; programmes open only after a staff-recorded approval, watchers are notified |
| **Home additions** | `/dashboard` | intent box (rules tested in `collab-ops.test.ts`) and "Get set up" checklist read from real records |
| **Landing "Three ways in"** | `/` | Collab, Business Offers, Unite Green Park |
Launch, Capacity, Micro-contracts, Commit and Green Park feed ACTION OS (booking requests, work to review/pay/deliver, pledges and conditions to verify, energy introductions).
Demo rows are flagged and labelled as sample data.

## In the live site, still missing here
None of the 14 modules found on 18 Nov 2026. Still to check against the live site: the public landing's
"What can we build together?" hero examples, its 8-step journey and live counters including MW listed.

## In this branch, not seen on the live site
Real photography (heroes, programme tiles, landing industries, sign-in), the Home **Energy desk** charts, the live
**business-news** panel, the Unite **app pages with logos** (incl. BIZO), the Unite Power Lab pages added on 16 Nov
(voltage, open access, interstate, finance, reports, automation, settings), collab follow-ups (Unite first look,
invitations, expiry reminders) — to be confirmed against the live source.

## Next step
Compare again with the live site once it is updated, and fill any newly found gaps here.
