# www.collabiz.co vs this repository (branch `claude/collabiz-platform-build`) — 18 Nov 2026

Method: signed in on www.collabiz.co with the demo account **Asha Patil (Volt EPC)**, opened every link in her menu
(77 links, 73 pages captured — see `collabiz-co-live-screens.pdf` delivered with this report) and compared the routes and
page content with this repository.

## Finding
The live site is built from a **newer version of this same codebase**: it already contains everything in this branch
(ACTION OS notice board, Collab, Business Offers, Powertek, Unite Solar, Invest together, Community, etc. with the same
demo data) **plus the modules below that this branch does not have**. This branch's `main` holds only an initial
commit, so the live site's source is elsewhere (another repository or branch).

## In the live site, missing here
| Live module | Route(s) | What it does on the live site |
|---|---|---|
| **Unite Green Park — energy marketplace** | `/energy`, `/energy/register` | Solar, wind, hybrid and storage capacity vs industrial demand; 15 listing categories (solar power available/required, operational plants for sale, under-development projects, solar parks, group captive, open-access PPA, wind, hybrid, BESS, RE EPC, investment/JV, land & transmission, consultants, licensed traders); plant and buyer registration checked before publishing; state map; delivered-cost calculator; licensed-trader directory; live counters (7 plants, 202 MW available, 4 buyers, 45 MW demanded); introduction-and-brokerage disclaimer |
| **Launch** | `/launch`, `/launch/plans` | "Have something? Start something." — pick what you have (store, office, team, factory, machinery, warehouse, land, vehicles, skills, capital, network, products, services, contracts), state, budget band, time commitment, skills, languages → business models → real offers/programmes; saved launch plans |
| **Capacity calendar** | `/capacity`, `/capacity/calendar`, `/capacity/mine` | Publish and book spare capacity for exact dates — workers, seats, vehicles, machines, production lines, sq ft, pallet positions, shifts; price per unit per day/month; booking requests |
| **Micro-contracts** | `/micro`, `/micro/new` | Small fixed-price work packages (calling, site survey, quotation, demo, design, data, field visit, content); accepted and paid ones become Proof records |
| **Demand pools** | `/pools`, `/pools/new` | Buyers combine requirements for bulk pricing; suppliers see the combined quantity, not the buyers; each buyer contracts separately |
| **Commit** | `/commit` | Conditional multi-party agreements that bind only when every party pledges and every condition (orders, capacity, permits, financing) is verified before a deadline |
| **Proof — performance passport** | `/proof` | Track record only from both-side-confirmed records: milestones, paid invoices, signed contracts, deliveries, micro-contracts, capacity bookings, disputes; levels New → Emerging → Established → Proven |
| **Business QR** | `/business-qr` | One QR for counter, truck or card, linked to the Proof passport |
| **Invoices & P&L** | `/finance/pnl`, `/finance/credit-notes` | Profit report separating pipeline, contract value, invoiced revenue, royalty, collected cash, direct costs, gross/net profit, commission liability; expenses; credit notes issued/received |
| **Collab sub-pages** | `/collab/matches`, `/collab/requests`, `/collab/programs` | Ranked matches across offers, Unite programmes and businesses; requests & deals; Unite Group programmes with "notify me when it opens" |
| **Home additions** | `/dashboard` | "What do you want to do today?" intent box routing to Launch, Collab, Offers, Pools, Capacity or search; "Get set up" checklist (verify, have/need, first offer, invite team, Business QR) |
| **Public landing** | `/` | "What can we build together?" hero with I-have/you-could-be-matched examples, 8-step journey, "Three ways in" (Collab, Business Offers, Unite Green Park), live counters incl. MW listed |

## In this branch, not seen on the live site
Real photography (heroes, programme tiles, landing industries, sign-in), the Home **Energy desk** charts, the live
**business-news** panel, the Unite **app pages with logos** (incl. BIZO), the Unite Power Lab pages added on 16 Nov
(voltage, open access, interstate, finance, reports, automation, settings), collab follow-ups (Unite first look,
invitations, expiry reminders) — to be confirmed against the live source.

## Recommended next step
Merge rather than rebuild: attach the repository/branch that the live site is deployed from, then bring this branch's
additions into it (or the reverse). Rebuilding the 14 live modules here would duplicate work that already exists.
