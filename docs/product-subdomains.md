# Unite product subdomains

Every Unite product page also has its own subdomain: `<name>.<PRODUCTS_DOMAIN>`. For example, `sunx.<domain>` shows the SunX page and `goeb5.<domain>` opens the GO EB5 online application.

## How it works
- **Routing:** `apps/web/proxy.ts` rewrites only the home page of a product subdomain to `/businesses/<slug>`. Everything else (assets, `/api/v1`, forms) is served normally, so the enquiry, solar-quote and partner-link features work the same on every subdomain.
- **Subdomain names:** each subdomain is the business slug, or a shorter brand-like label (`packages/types/src/product-domains.ts`).
  - Reserved for the platform: www, app, admin, api, power, mail, static, cdn, status, docs, auth, login.
- **Page titles and link previews:** each page has its own title, description and preview image, rendered on the server (`app/(public)/businesses/[slug]/layout.tsx`). The canonical URL is the subdomain.
- **Sitemap:** `/sitemap.xml` lists every published product, using subdomain URLs when configured.
- **Partner links:** they point to the subdomain (`https://sunx.<domain>/?ref=CODE`). The admin console's Unite businesses list shows each subdomain and whether it is published.

## Configuration (deployment needs approval)
| Setting | Purpose |
|---|---|
| `PRODUCTS_DOMAIN` (runtime) | Used for routing, the sitemap and canonical links, e.g. `unitegroup.example`. |
| `NEXT_PUBLIC_PRODUCTS_DOMAIN` (build time) | Makes links shown in the browser (partner links, admin list) use subdomains. |
| DNS | A wildcard record `*.<domain>` pointing at the web app. |
| TLS | A wildcard certificate for `*.<domain>`. |

Nothing is registered or deployed by the code. Choosing the domain, the DNS records and the certificate are Unite Group decisions. Locally, `PRODUCTS_DOMAIN=localhost:3000` makes `http://sunx.localhost:3000` work in any browser.

## The 48 Unite businesses (plus GO EB5)
| # | Business | Subdomain | Stage | Status |
|---|---|---|---|---|
| 1 | ROOFZ | `roofz.<domain>` | Pilot | Published |
| 2 | UGROW | `ugrow.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 3 | ZUPPO | `zuppo.<domain>` | Pilot | Published |
| 4 | SOCPOST | `socpost.<domain>` | In development | Published |
| 5 | SUNITE | `sunite.<domain>` | In development | Published |
| 6 | WAKIN | `wakin.<domain>` | Pilot | Published |
| 7 | PRIZO | `prizo.<domain>` | Pilot | Published |
| 8 | Nano Bazar | `nanobazar.<domain>` | Pilot | Published |
| 9 | Goodtime.live | `goodtime.<domain>` | Pilot | Published |
| 10 | LeadDNA | `leaddna.<domain>` | In development | Published |
| 11 | AI Teacher | `aiteacher.<domain>` | Pilot | Published |
| 12 | SUNGATE | `sungate.<domain>` | Pilot | Published |
| 13 | Digital Seed | `digitalseed.<domain>` | In development | Published |
| 14 | GREEN WALLET | `greenwallet.<domain>` | Pilot | Ready — published after regulatory clearance |
| 15 | VIDPLAY | `vidplay.<domain>` | Pilot | Published |
| 16 | XPERT | `xpert.<domain>` | Pilot | Published |
| 17 | 99OFFERS / BOGO | `99offers.<domain>` | Pilot | Published |
| 18 | SunX | `sunx.<domain>` | Coming soon | Published |
| 19 | iBrain | `ibrain.<domain>` | In development | Published |
| 20 | WITHME | `withme.<domain>` | Pilot | Published |
| 21 | EV Saathi | `evsaathi.<domain>` | Pilot | Published |
| 22 | U meet | `umeet.<domain>` | Coming soon | Published |
| 23 | Real Bricks | `realbricks.<domain>` | Pilot | Published |
| 24 | HNW Club | `hnwclub.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 25 | FreeTicket.app | `freeticket.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 26 | Payslip.app | `payslip.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 27 | Sunglow | `sunglow.<domain>` | Coming soon | Published |
| 28 | 99Films | `99films.<domain>` | Coming soon | Published |
| 29 | WEEKEND | `weekend.<domain>` | Pilot | Published |
| 30 | SOLCART | `solcart.<domain>` | Pilot | Published |
| 31 | Solar Village Mission | `solarvillage.<domain>` | Pilot | Published |
| 32 | ELWIN | `elwin.<domain>` | Pilot | Published |
| 33 | UNITIF | `unitif.<domain>` | Coming soon | Published |
| 34 | ProDeal | `prodeal.<domain>` | Pilot | Published |
| 35 | Unite Powertek | `powertek.<domain>` | Available | Published |
| 36 | Power Partner | `powerpartner.<domain>` | Pilot | Ready — published after regulatory clearance |
| 37 | PowerBank | `powerbank.<domain>` | Pilot | Ready — published after regulatory clearance |
| 38 | Unite Digital Bank | `digitalbank.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 39 | Bestpe | `bestpe.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 40 | Universal Trade Coin | `utc.<domain>` | Coming soon | Ready — published after regulatory clearance |
| 41 | MoveOn.video | `moveon.<domain>` | Pilot | Published |
| 42 | Unite Learning | `learning.<domain>` | Pilot | Published |
| 43 | Partimer | `partimer.<domain>` | Pilot | Published |
| 44 | StartSmart | `startsmart.<domain>` | Coming soon | Published |
| 45 | Help Today | `helptoday.<domain>` | Pilot | Published |
| 46 | Unite Biofix | `biofix.<domain>` | Coming soon | Published |
| 47 | Unite Aqua | `aqua.<domain>` | Pilot | Published |
| 48 | BIZO | `bizo.<domain>` | Pilot | Published |
| — | GO EB5 | `goeb5.<domain>` | — | Published (online application) |

**Count:** 38 business pages and GO EB5 are published, which makes 39 sites. The 10 regulated businesses are built and get a page automatically once a super admin records regulatory clearance; until then their subdomain shows "Product not found".

**Tests:**
- `packages/types/src/product-domains.test.ts`: subdomain mapping.
- Browser suite "Product subdomains · …": SunX page and solar quote through `sunx.`, `powertek.`, `goeb5.`, and the hidden page for a regulated business.
