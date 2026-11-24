# Database (migration 0070, non-destructive)

| Table | Purpose | Key references |
|---|---|---|
| `pt_profiles` | One per organization: industry, state, DISCOM, GSTIN, interests, sharing consent, `sample` | `organizations` (unique) |
| `pt_energy_needs` | Versioned electricity profile (append a row per save; latest is current) | `organizations` |
| `pt_contributions` | Products, capacity, services, EPC, distribution, rooftop, land, logistics, capital, export | `organizations` |
| `pt_scenarios` | Saved comparisons: inputs, results with charge provenance, `illustrative` | `organizations` |
| `pt_collaborations` | Six models; separate legs (supply value, benefit, PPA tariff/units); `documents` checklist; `tax_review`; attributable `history`; `contract_ids` | `organizations` ×2, `users` |
| `pt_benefits` | Benefit ledger: gross, costs, taxes, status anticipated→earned→verified→collected, collected amount and references; `source_ref` unique per org (no double counting of ledger entries) | `organizations`, `pt_collaborations`, finance ledger by reference |
| `pt_allocations` | Requested/approved/rejected allocation of *collected* benefit to a month's power expense | `pt_benefits` |
| `pt_energy_savings` | Monthly baseline vs actual bill with evidence; verified by finance | `organizations` |

Money is integer paise (bigint); units are kWh. UUID keys, foreign keys, audit events for every financial action.
Reused, not duplicated: organizations, memberships, users, contracts, commission_entries, purchase_orders, trade_requirements,
energy_listings, xchange_listings, notifications, action_items.
