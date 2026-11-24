# Architecture

POWERTRADE is a layer on existing COLLABIZ services — no new app, identity, ledger or invoice service.

```
packages/types/powertrade.ts      rules: models, workflow, documents, schemas, commercialBenefit(), parseReverse()
packages/power-engine (linked)    deliveredCost(), illustrativeTariffs(), SEED_OFFTAKE_RULES, ruleFor()  — Power Lab engine
apps/api/modules/powertrade       controller (permissions, workflow, money controls) + service (comparison, matching)
apps/api/modules/action-os        'powertrade' connector → weekly plans and notices
apps/api/modules/join (club)      public member page returns the POWERTRADE section the business chose to share
apps/web/(app)/powertrade/*       overview, join, power, matches, collaborations, finance
apps/admin/(console)/powertrade   reviewer and finance queues
```

Feature flag: `FEATURE_POWERTRADE` (default on; `/meta/features` → `powertrade`). With it off every endpoint returns 404.
Organization-level permissions: members read; owners and admins write; reviewers (super_admin, unite_admin) approve;
finance (finance, super_admin) verifies, collects and approves allocations; compliance or finance records tax review.
