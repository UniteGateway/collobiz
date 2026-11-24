# Power + benefit model

## Power comparison (`compare`)
For each arrangement the member chose: open-access structures use the Power Lab `deliveredCost` with the state's charge
records (losses, transmission, wheeling, CSS, additional surcharge, duty, SLDC, banking, green premium) — each line keeps its
provenance (illustrative / user / verified). Eligibility uses `SEED_OFFTAKE_RULES` (100 kW open-access threshold; captive
ownership 26% collective, secondary sources flagged "confirm"). Captive and group captive are **ineligible until an equity
share is entered**, and always carry the annual consumption test and legal-review warning. Rooftop rows use the entered rate
(EPC = levelised cost, capital needed). Savings = (present tariff − landed) × units covered (capped at consumption).
Ranking is among eligible rows only, by: lowest tariff, most savings, lowest capital, lowest complexity, or savings + verified
benefits — so the lowest tariff is not always first.

## Commercial benefit calculator (`commercialBenefit`)
Integer paise. Savings (verified or estimated) · turnover · gross profit (margin %, never turnover) · gross earned benefits ·
net benefit (− costs − taxes) · available for power support = min(approved, collected, net) · residual economic power expense
· cash timing gap. Worked example (tested): bill ₹10 L, new expense ₹7.5 L, ₹5 L verified, collected and approved →
residual ₹2.5 L. Zero residual is shown only when covered, with the note "not because power is free".
