# Matching engine

Deterministic rules (`apps/api/src/modules/powertrade/powertrade.service.ts`), no language model, no percentage scores.

**Energy** (when the member wants power or group captive): live, non-confidential Green Park plants (`energy_listings`),
same-state first; reasons (available MW, models, same state vs inter-state, indicative tariff vs present tariff); sample
listings are labelled. Always adds Unite Solar rooftop (EPC/RESCO). Introductions go through the developer or a licensed
trader — COLLABIZ does not sell power.

**Business**: open buyer requirements on Trading and XCHANGE needs whose title, description or items contain the member's
contribution keywords (or title words when no keywords). Generic words (solar, power, energy…) are ignored.

**Partners**: other POWERTRADE members who share products and contribute EPC, export or distribution when the member
wants those.

Each match returns partner, arrangement, reasons, required agreements, regulatory conditions, risks, missing information
and a next action link.

**Reverse matching** (`parseReverse`): reads monthly units (lakh / crore / million / thousand), product words, industry and
wants from plain text; suggests models; runs the same matcher with those hints. The page tells the user to check the
numbers.
