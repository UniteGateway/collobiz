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
| Unite Power Lab (separate app, port 3002) | `apps/power` | Next API routes | [power/PROGRESS.md](power/PROGRESS.md) |

BIZO (www.bizo.one) is listed as Unite business #48 with its brochure features, indicative plans and a link-out. Single
sign-on and data sync need BIZO's API details and credentials.
