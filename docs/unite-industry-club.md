# Unite Industry Club

**Make it. We brand it, power it and sell it.** Any industry joins Unite Group's club. Members:
1. **Sell under the Unite Powertek brand (OEM).** They submit a product, Unite approves it, and it is listed in the Unite Powertek catalogue as "Unite Powertek <name>" or "Powered by Unite". Every COLLABIZ partner, franchise and store can then sell it through the existing Powertek sales flow, with commissions tracked.
2. **Offer free power with the product.** A solar system is bundled with it (for example, 5 kW rooftop solar with every cold room), and the offer is shown on the catalogue item.
3. **Buy green power** for their own premises: open access, group captive, rooftop on PPA, or a green tariff. Requests go to the Unite energy desk. Members can also use the Green Park energy market.
4. **Get a public business page** at `/club/m/<slug>`. It is off unless the member switches it on, and it shows approved products only.
5. **Use their club board** (`/board`): live cards for each choice, plus matched Unite businesses and offers, each with the reason it was shown.
6. **Use the rest of the network:** barter (XCHANGE), trading, exports and imports, EPC work, property, jobs, learning, and launching a new business.

## OEM rules (`apps/api/src/modules/join/club.controller.ts`)

| Rule | Detail |
|---|---|
| Who prepares and submits | The business owner or an admin drafts products. Only a KYB-verified business can submit one for the brand. |
| Who approves | Only Unite admins. Approval needs all four checks: quality, certifications, the maker's KYB, and a signed brand licence. Declining needs a reason. |
| What approval does | It creates one item in the Unite Powertek catalogue (product line "Unite Industry Club"). The catalogue shows the brand, not the maker. |
| Withdrawing | Withdrawing an approved product archives the catalogue item, so past enquiries keep their history. |
| Fees and royalties | None are charged through COLLABIZ. The licence terms are agreed with Unite outside the app. |
| Power | COLLABIZ does not sell power or quote tariffs. Plant owners and DISCOMs supply it under their own agreements. |
| Audit | Every step is audited and the member is notified. |

## Pages
- **Public:** `/club` (benefits, how OEM works, approved products); `/join` (the wizard); `/club/m/<slug>` (member page).
- **Member:** `/board`; `/club/products`; `/club/power`. In the menu: "Industry Club".
- **Admin:** `/club` in the admin console (product reviews and power requests).

## API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET/POST /v1/club/products` | member; owner or admin to create | List or add products. |
| `PATCH /v1/club/products/:id` | owner or admin | Edit a draft or a declined product. |
| `POST /v1/club/products/:id/submit` | owner or admin, verified business | Send for Unite review. |
| `POST /v1/club/products/:id/withdraw` | owner or admin | Withdraw a product. |
| `GET /v1/admin/club/products`, `POST /v1/admin/club/products/:id/review` | Unite admins | Review queue and decision. |
| `GET/POST /v1/club/power-requests` | member | Buy-power requests. |
| `GET /v1/admin/club/power-requests`, `POST /v1/admin/club/power-requests/:id/status` | Unite admins | Energy desk queue. |
| `GET /v1/public/club/products`, `GET /v1/public/club/members/:slug` | public | Approved products; member pages. |

Tests: `apps/api/test/club.e2e.ts` and the browser suite "Unite Industry Club".

---

## The join wizard and board (first version of the module)

**Why:** people asked "what do I do in COLLABIZ — is it business or energy?". The answer is that COLLABIZ is one business network. Energy is one part of it, and every industry can join. This module makes that concrete: a business picks its industry and how it wants to collaborate, and gets its own board.

## Journey
1. **`/join` (public)**, linked from the home page hero, the closing banner and the header.
   - **Step 1:** choose an industry (the 18 COLLABIZ sectors).
   - **Step 2:** choose ways to collaborate. Suggestions are pre-selected from the industry, and the member can change them.
   - **Step 3:** join.
     - A signed-out visitor goes to sign up or sign in, and the choices are kept on the device.
     - A signed-in user without a business account goes to create one.
     - A member saves the choices and opens the board.
2. **`/board` (signed in, menu: "My board")** shows:
   - one card per chosen collaboration, with live counts and buttons into the module behind it;
   - the Unite businesses that fit the member, each with the reason it was matched;
   - open business offers from other members in the same or related industries;
   - how many other businesses from the same industry have joined.
   - **"Change what I want"** reopens the wizard with the saved choices.

## Ways to collaborate (`packages/types/src/join.ts`)

| Choice | Opens | Live count on the card |
|---|---|---|
| Free or lower-cost power | Solar quote, Energy desk | — (action card) |
| Sell my products with solar integration | Powertek, publish a joint offer | — |
| EPC / installation partner | Energy desk, tenders, Unite Solar partner | Open energy/EPC tenders; open SOLBID projects (or "not connected") |
| Barter club | XCHANGE | Active listings by other members |
| Trading | Trading desk, demand pools | Open buying requirements in the member's industry |
| Exports and imports | Import & export, country desks | Cross-border enquiries routed to the member |
| Promote Unite businesses | Unite businesses | Businesses open to partners |
| Property | Property sales | Projects open to partners |
| Work, teams and contracts | Micro-contracts, teams, capacity | Open micro-contracts |
| Learn and certify | Learning | Published courses |
| Start a new business | Launch, Collab | — |

## Rules
- **Who changes the profile:** the join profile (`collab_join_profiles`, one row per organisation) can be changed only by the business's owner or an admin. Every change is audited (`join.profile_created` / `join.profile_updated`).
- **What the counts include:** only records the member could already open in the module behind the card. That means other members' open listings; never drafts or private data.
- **Regulated businesses:** they appear only after clearance. Business offers that are still inside a Unite first-look window stay hidden, as on the Business Offers page.
- **How matching works:** matching uses rules (the member's industry and chosen collaborations), and every match shows why it was shown. It is not labelled AI. When the AI provider is switched on, it can re-rank these results; the reasons stay.
- **No invented numbers:** if SOLBID is not configured or not responding, the card says so instead of showing a number.

## API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /v1/public/join/options` | public | The ways to collaborate. |
| `GET /v1/join/profile` | member | The saved profile, plus suggestions based on the onboarding industry. |
| `PUT /v1/join/profile` | owner or admin | `{ sector, intents[], city?, about? }` |
| `GET /v1/join/board` | member | The board. Returns 404 until the profile is saved. |

## Tests
- API: `apps/api/test/join.e2e.ts`
- Browser: the suite "Join as any industry" in `scripts/e2e-suites.mjs`
