# COLLABIZ module registry

One line per module: where it lives and where it is documented. Earlier modules are described in
[v2/EXISTING_APP_AUDIT.md](v2/EXISTING_APP_AUDIT.md) and [/stage-status.md](../stage-status.md).

| Module | Web | API | Docs |
|---|---|---|---|
| Core journey (Have → Need → Match → Apply → Proposal → Agreement → Execution → Earnings) | `/collab`, `/business-offers` | `modules/collab` | stage-status.md |
| Collab follow-ups (Unite first look, invitations, expiry reminders) | `/business-offers/[id]`, `/collab` | `modules/collab` | [community-and-invest.md](community-and-invest.md) |
| Community, Invest together, live updates | `/community`, `/invest` | `modules/community` | [community-and-invest.md](community-and-invest.md) |
| Unite Solar franchise & store network | `/unite-solar` | `modules/unite-network` | [unite-solar/](unite-solar/) |
| Powertek products (anyone can sell) | `/powertek` | `modules/product-sales` | [powertek/](powertek/) |
| Catalogues & documents library | `/library` | `modules/module-documents` | — |
| Unite apps (48 businesses incl. **BIZO**, logos, app dashboards) | `/ventures`, `/ventures/[slug]` | `modules/ventures` | `packages/types/src/app-brands.ts` |
| **ACTION OS** (notice board, action plans, channels, integrations) | `/action-os` | `modules/action-os` | [action-os/](action-os/README.md) |
| Unite Green Park (energy marketplace) | `/energy` | `modules/energy` | [live-site-comparison.md](live-site-comparison.md) |
| Launch (have → business model → plan) | `/launch` | `modules/collab-ops/launch.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Capacity calendar | `/capacity` | `modules/collab-ops/capacity.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Micro-contracts | `/micro` | `modules/collab-ops/micro.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Demand pools | `/pools` | `modules/collab-ops/pools.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Commit (conditional multi-party agreements) | `/commit` | `modules/collab-ops/commit.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Proof passport + Business QR | `/proof`, `/business-qr`, `/b/:token` | `modules/trust-finance/proof.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Invoices & P&L, credit notes, expenses | `/finance/pnl`, `/finance/credit-notes` | `modules/trust-finance/books.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| Unite programmes + setup checklist | `/collab/programs`, Home | `modules/trust-finance/programmes.controller.ts` | [live-site-comparison.md](live-site-comparison.md) |
| **GO EB5** (EB-5 consultancy, CITRUS360 LLC; flag `go_eb5`) | `/eb5`, public `/go-eb5/[token]` | `modules/eb5` | [go-eb5/](go-eb5/README.md) |
| Unite Power Lab (separate app, port 3002) | `apps/power` | Next API routes | [power/PROGRESS.md](power/PROGRESS.md) |

BIZO (www.bizo.one) is listed as Unite business #48 with its brochure features, indicative plans and a link-out. Single
sign-on and data sync need BIZO's API details and credentials.
