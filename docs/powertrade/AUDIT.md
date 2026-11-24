# Stage 00 — repository audit (2026-11-24)

POWERTRADE reuses these existing COLLABIZ parts. Nothing below is replaced.

| Need | Existing module | Where | Reuse |
|---|---|---|---|
| Company identity, members, verification | Identity, onboarding/KYB | `organizations`, `memberships`, `/onboarding` | POWERTRADE profile is 1:1 with an organization; no new identity |
| Industry registration ("any industry") | Industry Club join profile | `collab_join_profiles` (sector, intents incl. `buy_power`, microsite slug) | Profile links to it; the club microsite `/club/m/<slug>` gets a POWERTRADE section |
| Buy-power request | Industry Club | `club_power_requests` (load, units, bill, state) | Prefilled from it; a new energy need can create/refresh one |
| Delivered (landed) open-access cost with provenance | Power engine (Hybrid Power Lab, M6–M8) | `packages/power-engine` → `deliveredCost`, `illustrativeTariffs`, `offtakeCheck`, `SEED_OFFTAKE_RULES` | Linked into the API as a workspace dependency; every charge keeps its provenance (illustrative / user / verified) |
| Renewable plants offering power | Unite Green Park | `energy_listings`, `energy_introductions`, licensed `energy_traders` | Energy matches; introductions go through licensed traders/developers, never COLLABIZ itself |
| Rooftop EPC / RESCO quotes | Unite Solar desk | `solar_quotes`, `solar_bills`, `solar_configs` | "Rooftop" scenarios link to a Unite Solar quote |
| Buyers' requirements, supplier catalogue, RFQ → PO | Trading | `trade_requirements`, `supplier_products`, `quotations`, `purchase_orders`, `shipments` | Business matches for contributions; orders are tracked there, not duplicated |
| Business offers and needs | COLLAB | `business_offers`, `collab_needs`, `collab_assets`, `collab_proposals` | Business matches; collaborations can start from them |
| Barter, part-cash, multi-party | XCHANGE | `xchange_listings`, `xchange_deals`, `xchange_legs` | Barter tab links to XCHANGE with the member's offers |
| Commissions, payouts, settlements | Finance ledger | `commission_entries`, `commission_journal`, `payout_requests`, `settlements` | Verified commissions can be recorded as POWERTRADE benefits by reference (no second ledger) |
| Contracts, e-sign, vault | Contracts engine | `contracts`, SHA-256 typed signatures, `/vault` | Agreements are drafted from templates and signed there |
| Distribution / franchise | Franchise OS, Unite Solar network, brand channels | `franchise_*`, `network_commissions`, `channel_applications` | Distribution earnings feed benefits by reference |
| Weekly plans, reminders | ACTION OS | `action_items`, connectors in `action-os/connectors.ts` | New `powertrade` connector |
| Feature flags | System | `config.ts` → `/meta/features` | `FEATURE_POWERTRADE` |

## Gaps POWERTRADE fills
1. Two-sided profile: energy need + business contributions + interests, with sharing consent.
2. Power scenario comparison across rooftop EPC/RESCO, third-party open access, group captive and captive, using the
   power engine with provenance and eligibility findings.
3. Energy + business matching across Green Park, Trading, COLLAB and Unite procurement, with reasons and missing info.
4. A benefit ledger kept separate from savings and sales, with verification, collection and approved allocation.
5. Collaboration records for the six models, with documents, tax review and an attributable status history.
6. An Energy + Business dashboard and ACTION OS priorities.

## Not available in this environment (documented, not faked)
- Verified tariff orders for each state: the power engine ships *illustrative* charges; results say so until verified
  records are entered in the Power Lab.
- DISCOM bill parsing and meter data: users enter units and tariffs; bills are stored as documents only.
- Legal and tax review: templates are drafts; settlements stay blocked until an authorised reviewer records approval.
