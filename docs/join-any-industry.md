# Join as any industry — collaborate with Unite Group

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
