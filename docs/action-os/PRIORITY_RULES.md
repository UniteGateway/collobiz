# Priority rules (`scoreAction`)

Score 0–100 = Σ weight × factor. Default weights: deadline 25, financial exposure 20, contractual/compliance risk 20,
strategic importance 15, blocker 10, commitment 10 (per-organisation weights are a next step).

- Deadline urgency: overdue 1 · ≤24 h 0.9 · ≤3 days 0.7 · ≤7 days 0.45 · ≤30 days 0.15 · later 0.05 · **unknown 0**.
- Financial exposure (log scale): ₹10 k 0.2 · ₹1 lakh 0.4 · ₹10 lakh 0.6 · ₹1 crore 0.8 · ₹10 crore+ 1 · unknown 0.
- Risk: none 0 · low 0.3 · contractual 0.8 · compliance 1.

Bands: **P0 Critical** ≥70 · **P1 High** ≥45 · **P2 Normal** ≥20 · **P3 Low**.

Deterministic hard rules (organisational policy, never AI judgement):
1. Mandatory item overdue ⇒ P0.
2. Overdue contractual, compliance or collection item ⇒ at least P1.
3. Due within 24 h with contractual or compliance risk ⇒ at least P1.

Each item carries its score parts with plain reasons (e.g. "overdue by 26 days · ₹2,00,00,000 involved · contractual
commitment at risk"), the rule applied, and whether its due date is known. Revenue and deadlines are never invented.
