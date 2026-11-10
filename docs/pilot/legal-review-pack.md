# COLLABIZ — Legal Review Pack

_Agreement texts and legal wording used by the COLLABIZ partner platform, compiled for review before the pilot_

- **Prepared:** 9 November 2026
- **Prepared for:** Unite Group legal counsel
- **Status:** DRAFT — none of these texts has been legally reviewed
- **Jurisdiction assumed:** India (Indian Contract Act 1872, IT Act 2000, DPDP Act 2023, Income-tax Act 1961, CGST Act 2017) — please correct

> The Word version (`legal-review-pack.docx`) is the one to send to counsel for tracked-changes markup. Both are generated from the same source.

## How to use this pack

1. Please mark up directly in this document with Track Changes switched on (Review → Track Changes), and use comments for questions.
2. Text in the shaded boxes is the exact wording the app shows or generates today. Words in «angle quotes» are filled in automatically by the app (names, amounts, dates).
3. Questions for counsel are marked Q1, Q2 … and repeated in the checklist at the end. A short answer next to each is enough.
4. After review, the approved texts are loaded into the app as new versions (go-live checklist step 5.2a). Partners who accepted a draft are asked to accept the approved version.

### How partners accept these documents

COLLABIZ does not yet use a licensed e-signature provider (open item B-08). Every acceptance and signature is recorded as click-to-accept evidence: the person types their full name exactly as registered, and the platform stores the typed name, the user account, the organisation, the timestamp, the IP address, the browser, and a SHA-256 fingerprint of the exact text accepted. The fingerprint is checked again before every acceptance, so the stored text cannot be silently changed. Every action is written to a tamper-evident (hash-chained) audit log.

**Q1.** Is this click-to-accept evidence sufficient for the pilot agreements (partner terms, lead registration, NDA, offer agreements, commission agreements), or must any of them use an Aadhaar e-sign / DSC provider under the IT Act Second Schedule before the pilot?

### Documents in this pack

| # | Document | When it is used | Who accepts |
|---|---|---|---|
| 1 | Partner Terms | Partner sign-up (onboarding step "Agreements") | Partner organisation owner |
| 2 | Lead Registration Agreement | Partner sign-up | Partner organisation owner |
| 3 | Privacy Notice & Data Processing | Account registration and partner sign-up | Every user |
| 4 | Mutual Non-Disclosure Undertaking | Joining a collaboration team | Each team member organisation |
| 5 | Offer Agreement / Work Order | Generated when Unite selects a partner for a direct offer | Unite company and partner (both sign) |
| 6 | Commission Agreement terms | Generated with 5 when the partner earns commission or revenue share | Recorded; partner sees it |
| 7 | Contract / Letter of Intent from a tender award | Generated when a tender is awarded | Issuer and awarded partner |
| 8 | Buyer-consent declaration for sales and leads | Every lead or sale a partner registers | Partner user |
| 9 | Regulated businesses | Which Unite businesses are locked | Super admin records clearance |
| 10 | Growth Desk outreach | AI-drafted, staff-approved e-mails to the lead database | Recipient can unsubscribe |

## Key commercial and legal parameters

These values are configured in the app today as placeholders. Please confirm or replace each one; the business team will confirm rates.

| Parameter | Value today | Where it applies |
|---|---|---|
| Lead protection period | 90 days from verification | Lead certificates (Document 2) |
| Appeal window for lead decisions | 14 days | Lead disputes (Document 2) |
| Unite-first review window | 4 business hours (urgent: up to 60 business minutes) | Document 2, clause 3 |
| Commission rate (demo) | 2% of the paid sale value | Commission policy — to be replaced by the approved rate matrix |
| TDS on commission | 5% under section 194H | Commission Agreement (Document 6) |
| GST on commission | 18% added where the partner is GST-registered | Commission Agreement (Document 6) |
| Clawback period | 90 days after payment | Commission reversed if the customer payment is reversed or refunded |
| Two-person approval for payouts | ₹5,00,000 and above | Finance approvals |
| NDA survival | 3 years after last disclosure | Document 4 |
| Return/destroy confidential information | Within 30 days of leaving the team | Document 4 |
| Cure period for material breach | 15 days after written notice | Document 7 |
| Letter of intent lapses | 30 days without a definitive agreement | Document 7 |
| Chat message retention | Direct chats 2 years; project records 7 years | Privacy Notice (Document 3) |
| Account closure | Reversible for 30 days, then processed subject to legal retention | Privacy Notice (Document 3) |

**Q2.** Is 194H (commission or brokerage) the correct TDS section for all partner rewards — including fixed fees for services (194J?), reseller margins on goods (no TDS / 194Q?) and profit share? Should the app apply a different section per reward type?

**Q3.** Is a 90-day clawback after customer payment enforceable as drafted, and should it be stated in the Partner Terms as well as each commission agreement?

## 1. Partner Terms

Shown during partner sign-up. The organisation owner accepts it by typing their full name. Current text:

```text
COLLABIZ Partner Terms
DRAFT — subject to legal review (Master Book §7.2).
1. Eligible partner actions: register leads with buyer consent, apply to opportunities, collaborate in approved teams.
2. Prohibited: undisclosed side deals, misrepresenting capability, sharing confidential buyer data, recruiting-based fees.
3. Responsibilities: accurate KYC/KYB information, timely updates, compliance with applicable law.
4. Termination: either party with notice; immediate suspension for fraud or confidentiality breach.
5. No earnings are guaranteed. Commissions are payable only on defined contractual triggers.
```

> **Note:** Functions added since this text was written, which the terms do not yet cover: direct offers from Unite Group companies (partners accept Unite's price or propose their own; rewards may be commission, revenue share, fixed fee, reseller margin, profit share or equity); partners promoting any of the 47 Unite Group businesses after approval; registering customer sales under an offer; weekly pilot feedback.

**Q4.** Please expand the Partner Terms into a full agreement. Suggested headings: parties and the contracting Unite entity (open item B-01); definitions; the partner's status as an independent contractor (not agent, employee or franchisee); permitted activities including direct offers and promoting Unite businesses; use of Unite brands; KYC/KYB obligations; conduct and anti-bribery; confidentiality; data protection; fees and commission (by reference to each signed agreement); tax; liability cap; indemnity; suspension and termination; dispute resolution (arbitration seat and governing law); amendments and notice by e-mail/in-app.

**Q5.** Clause 2 prohibits "recruiting-based fees" to keep the platform clear of multi-level marketing. Several Unite businesses ask partners to bring members, merchants or candidates (e.g. WAKIN, Nano Bazar, Partimer). Please confirm wording that allows a fixed fee per verified merchant or member while staying outside the Prize Chits and Money Circulation Schemes (Banning) Act 1978 and the Direct Selling Guidelines 2021.

**Q6.** Can the terms be accepted by the organisation owner on behalf of the company by typing their name, or must a board resolution or authorisation letter be uploaded for companies?

## 2. Lead Registration Agreement

Shown during partner sign-up. It governs how a partner registers a customer introduction and receives a protection certificate (numbered CZL-YYYY-NNNNNNNN, publicly verifiable on the website). Current text:

```text
Lead Registration Agreement
DRAFT — subject to legal review.
1. Evidence: each registration records date, source and permitted proof of introduction.
2. Protection: a verified lead receives a conditional protection window stated on its certificate.
3. Unite-first review: the matching Unite Group company has a timed first-review opportunity (default 4 business hours).
4. Conflicts are resolved on evidence, timestamps and relationship history by an independent panel, with appeal.
5. Fee triggers, rates and deductions are set in the opportunity-specific commission addendum.
```

**Q7.** What does "protection" legally give the partner — an exclusive right to commission on any sale to that customer within 90 days, or only a right of first claim? Please state what happens if the customer buys directly from Unite or through another partner during the window.

**Q8.** Is a decision by an internal panel (with appeal) acceptable as the first tier of dispute resolution, followed by arbitration? Who should sit on the panel to be "independent"?

**Q9.** The certificate is publicly verifiable by its number (it shows status and validity, not the customer's personal data). Any objection?

## 3. Privacy Notice & Data Processing

Accepted at registration. Current text:

```text
Privacy Notice & Data Processing
DRAFT — subject to DPDP and jurisdictional review.
Purposes: identity verification, opportunity matching (with consent), contract and settlement administration, security and fraud prevention. Rights: access/export, correction, deletion subject to legal retention, consent withdrawal. Contact: privacy team via Help & Support.
```

Personal data the platform processes, for the notice:

- Account: name, e-mail, mobile number, password hash, two-factor secret (administrators), sign-in history, IP address and device.
- Partner verification (KYC/KYB): PAN, GSTIN, company registration number, address proof, identity proof and certificates (uploaded documents).
- Bank details for payouts: account number and PAN are stored encrypted (AES-256-GCM); only the last 4 characters are shown.
- Business data: sectors, regions, capacity (offices, people available), offers, responses, sales, buyer contact details entered by partners, contracts, commission and payout records.
- Communications: messages (encrypted at rest), meeting minutes, support tickets, pilot feedback answers.
- Optional AI matching: profile and opportunity data are compared by rules on Unite's own servers; no data is sent to an external AI provider in the pilot configuration.
- Retention: direct messages 2 years; project records 7 years; financial and tax records as required by law; account closure after a 30-day reversal window.
- Hosting: the pilot is planned in an Indian data-centre region.

**Q10.** Please draft a DPDP-compliant notice: name of the Data Fiduciary (which Unite entity), purposes, the itemised data above, consent and withdrawal, rights, the Grievance Officer's name and contact, the Data Protection Board complaint route, and retention. Is a separate consent needed for (a) matching partners to opportunities and (b) showing a partner's profile to Unite group companies?

**Q11.** Partners enter buyer contact details (name, phone, e-mail) when they register a lead or sale. Who is the Data Fiduciary for buyer data, and what must the partner confirm about the buyer's consent? (See Document 8.)

## 4. Mutual Non-Disclosure Undertaking (collaboration teams)

Partners can form a team with other verified partners to bid for an opportunity together. An invited partner sees only a teaser until it signs this undertaking, which the app generates for each team:

```text
MUTUAL NON-DISCLOSURE UNDERTAKING — DRAFT PENDING LEGAL REVIEW (Master Book §7.2)
Team: «team name»
Lead organization: «lead partner»
Purpose: «purpose stated by the lead partner»
1. Recipient scope: confidential information is shared only with the named team members and only for the purpose above.
2. Use restriction: no use for any other opportunity, and no approach to the buyer outside the team without written consent.
3. Retention: return or destroy confidential information within 30 days of leaving the team or the team dissolving.
4. Survival: obligations survive for 3 years after the last disclosure.
5. Client ownership and lead protection remain as registered on COLLABIZ.
```

**Q12.** Is a multi-party undertaking accepted separately by each member enforceable between members who never sign with each other directly? Should Unite Group be a party (or third-party beneficiary)? Please add a definition of confidential information, exclusions, compelled disclosure and remedies.

**Q13.** Clause 2 is effectively a non-solicitation of the buyer. Is it enforceable under section 27 of the Contract Act as limited to the purpose and the team's duration?

## 5. Offer Agreement / Work Order (direct offers)

A Unite Group company sends a direct offer to selected partners (or to all, or to approved promoters of a Unite business). Partners accept Unite's price and reward or propose their own. When Unite selects a partner, the app generates the following draft. A Unite approver must approve it, and both sides then sign it in the app. It is a work order for service and staffing offers and an agreement for sales, marketing and representation offers.

```text
«WORK ORDER / AGREEMENT» — «offer title»
Between «Unite Group company» ("Unite Group company") and «partner» ("Partner"), arising from direct offer «DO-YYYY-NNNNNN».
1. Scope. «type of offer»: «description of what Unite needs and what the partner gets».
2. Price. «₹ amount and unit, e.g. per kW or per month» (or: as agreed per order).
3. Partner reward. «e.g. 3% commission on paid sales».
   For commission or revenue share: Earned only on sales registered under this offer and only when the customer has paid; calculated and paid through the COLLABIZ commission ledger after finance approval, net of TDS.
   For profit share or equity: The basis of calculation, accounting period, audit rights and any transfer of shares must be set out in an annex before signature; nothing is owed until this agreement is executed.
4. Partner commitment. «N people»; office at «location»; start from «date».
5. Territory. «regions» — «exclusive for the term of this agreement / non-exclusive».
6. Terms record. Selected on «date»; terms fingerprint «hash».
```

Shown to partners on every offer that includes profit share or equity:

```text
Profit share and equity are indicative. They become binding only through an agreement drafted and signed in Contracts.
```

**Q14.** Please provide standard clauses to append automatically to every offer agreement: term and renewal, payment terms for the price, invoicing and GST, partner warranties, use of brand and pricing discipline, non-circumvention, liability cap, termination, and dispute resolution. Which of these differ between a work order (services) and a sales/representation agreement?

**Q15.** Exclusive territories: is there any competition-law concern with exclusive territories plus Unite-set resale prices for SOLCART products? Should the app prevent Unite from fixing the partner's resale price?

**Q16.** Equity offers: what must be in place (valuation, shareholder approval, FEMA for foreign partners) before an equity reward can be offered at all? Should the app block equity rewards until a super admin records that approval, as it does for regulated businesses?

## 6. Commission Agreement and the commission ledger

With every offer agreement that carries a commission or revenue share, the app records a commission agreement (numbered CA-YYYY-NNNNNN). The terms are stored with a fingerprint and cannot be edited afterwards:

| Term | Value recorded |
|---|---|
| Payer | The Unite Group company that issued the offer |
| Beneficiary | The selected partner |
| Basis | Percentage of the sale value («rate» %) or fixed amount |
| Trigger | Customer payment for a sale registered under the offer |
| Tax | TDS deducted at the policy rate (5%, section 194H); GST added at 18% if the partner is GST-registered |
| Clawback | Reversed if the customer payment is reversed within 90 days |
| Approval | Finance approval; two different approvers at or above ₹5,00,000 |
| Disputes | Partner can raise a dispute on any commission line; finance rules on it with written reasons |

Worked example used in the app's tests: 3% of a ₹2 crore paid sale is a gross commission of ₹6,00,000, plus GST of ₹1,08,000, minus TDS of ₹30,000 — ₹6,78,000 payable.

Partner statuses shown: Projected → Eligible → Earned (customer paid) → Approved → Requested → Paid to you; or On hold / Disputed / Reversed.

**Q17.** Should the partner be paid commission before Unite receives the full customer payment (e.g. on each instalment), or only after full payment? The app currently follows each recorded payment.

**Q18.** The partner raises the invoice ("Request payout") for earned commission. Please confirm the invoice requirements (GST invoice from registered partners; a self-declaration from unregistered individuals) and whether reverse charge applies to any partner category.

## 7. Contract and Letter of Intent from a tender award

When a Unite company awards a tender to a partner, the app drafts one of these. The issuer can edit the draft (each edit is a new version), and both sides then approve and sign it.

```text
«WORK ORDER / CONTRACT / LETTER OF INTENT» — «CTR-YYYY-NNNNNN»
DRAFT TEMPLATE — SUBJECT TO LEGAL REVIEW BEFORE USE
Issued by: «Unite Group company»   Issued to: «partner»
Reference: tender «code» — «title» («sector»)
Scope: «tender scope»
Consideration: Total value: «₹» (exclusive of applicable taxes). Payment terms: «terms»
Timeline: Delivery within «N» weeks of the effective date, unless varied in writing.
Conditions (work order / contract):
1. Work is performed to the scope, specifications and quality standards in the tender documents and any agreed addenda.
2. Changes to scope, price or timeline require a written change order approved by both parties.
3. Invoices are payable against certified milestones; the issuer may withhold payment for non-conforming work.
4. Confidential information is protected for three years after completion.
5. Either party may terminate for material breach not cured within 15 days of written notice.
6. Commission or fee arrangements with introducers on COLLABIZ are governed by their separate addenda and do not change this agreement.
Nature of this letter (letter of intent only):
1. This letter records the intention of «issuer» to award the above work to «partner», subject to a definitive work order or contract.
2. It does not by itself create an obligation to pay, other than for work expressly authorised in writing.
3. This letter lapses if a definitive agreement is not signed within 30 days.
```

**Q19.** Tenders are out of scope for the pilot. Please review only if time allows; otherwise mark "not for pilot".

## 8. Buyer-consent declaration (leads and sales)

Before a partner can register a sale under an offer, they must tick this box and choose how the buyer agreed:

```text
☐ The buyer agreed to be introduced to Unite Group for this
How the buyer agreed to be introduced: Meeting minutes / Written email / Signed letter / Recorded call
```

**Q20.** Is this declaration enough to show lawful processing of the buyer's contact details under the DPDP Act, and to support the partner's claim to commission? Should the partner be required to upload the evidence (e.g. the e-mail) in every case?

## 9. Regulated Unite businesses (locked)

Ten Unite Group businesses are hidden from partners and the public. They cannot be offered or opened until a super admin records a regulatory clearance note: UGROW, Green Wallet, HNW Club, Freeticket, Payslip App, Power Partner, Powerbank, Unite Digital Bank, BestPe and Universal Trade Coin. The reasons involve lending and funding, deposits, payments, investment participation, prize schemes and a digital currency.

**Q21.** Please confirm that this list is complete, and name for each business the licence or opinion required before partners may promote it (e.g. RBI PA/PPI authorisation, SEBI, NBFC partnership, state lottery/prize laws, crypto-asset position).

## 10. Growth Desk outreach (AI campaign agents)

Unite staff keep a lead database of companies, associations, institutions and investors. AI campaign agents (one per product or service) score contacts and draft e-mails; a person approves every message; sending is switched off until a separate marketing e-mail service is set up. Every contact records its source and a lawful basis chosen from: consent given; business contact — legitimate interest; existing business relationship; no basis (never contacted). Scraping websites or social networks is not a permitted source. Every message ends with:

```text
Why you received this: «source» («source detail»).
To stop receiving messages from Unite Group, open «link»
```

Unsubscribing works without signing in, applies to every Unite business and campaign, and the address is never contacted again. Investor outreach goes only to investors who opted in, and only after a super admin records a legal clearance note.

**Q22.** The DPDP Act 2023 has no general "legitimate interest" ground (unlike the GDPR); it relies on consent and the "legitimate uses" in section 7. Can Unite e-mail a named individual at a company, whose details come from a public registry or a licensed directory, without prior consent? If not, should the app allow only consent and existing-relationship contacts for Indian individuals, and keep "legitimate interest" only for generic company addresses (e.g. info@) and for contacts in GDPR countries?

**Q23.** For overseas recipients (UAE, Kenya, Nigeria, UK, US and others), which anti-spam and data-protection rules apply (e.g. GDPR/PECR, CAN-SPAM), and is the footer and unsubscribe mechanism above sufficient? Must the sender's postal address be added?

**Q24.** May licensed directory and trade-data contacts be used for automated e-mail outreach under typical licence terms, or only for manual contact? Please list what to check in each data licence.

## Franchise and property channel partners

Unite companies can be opened for franchising. Verified partner companies apply for a format and city; Unite approves with a fee, a royalty percentage of reported monthly sales and an optional target, and a unit goes live only after a seven-item set-up checklist. Separately, partners can hold a unit in a Unite property project for a named buyer for 48 hours, after recording how the buyer agreed to be introduced, and earn the project's commission rate on sale. Residential, commercial and plotted projects need a RERA number before partners can sell, and partners must give their RERA agent number to hold units in them.

**Q25.** Franchising: please provide or review a franchise agreement, and advise on disclosure to applicants, trademark licensing, GST on the fee and royalty, and any state-specific rules.

**Q26.** Property channel partners: must every partner be a registered agent in the project's state; are the 48-hour hold and our consent record acceptable; please provide a channel-partner agreement. Industrial-park plots are treated as not needing project RERA registration — please confirm per state.

## Unite Solar quotes, referrals and buy-one-get-one offers

Partners quote solar from a customer's electricity bill. The bill (name, address, consumer number, usage) is stored privately, read for its numbers and deleted after 90 days. Quotes show estimated savings and payback and the PM Surya Ghar subsidy for homes, labelled as estimates and "subject to eligibility and DISCOM approval". Anyone with a referral link can introduce a friend; the referrer earns a fixed reward when the friend's system is installed. Separately, Unite can run "buy X, get Y free" offers online and in stores, with dates, terms and a budget, approved by finance.

**Q27.** Buy-one-get-one: are the offer texts and the "free" wording compliant with the Consumer Protection Act 2019 and the CCPA guidelines on misleading advertisements; what must the terms include; and please confirm with a CA how GST applies to the free item (we assume the price paid covers both items and no separate tax is charged on the free one).

**Q28.** Solar quotes and referrals: are the savings, payback and subsidy statements on the quote adequately qualified; is a 90-day retention of uploaded bills appropriate under the DPDP Act; do referral rewards paid to individuals need TDS (e.g. section 194R) or other reporting; and may a customer's referral link be shared on WhatsApp by the customer without further consent steps?

## COLLABIZ XCHANGE — business barter

Verified businesses list goods, services, machinery, surplus stock and idle capacity at a declared open-market value and exchange them directly, with part-cash, or in chains of three or four businesses. Every party approves the same terms; each supply is shown as a separate taxable supply with invoice data for the parties' accountants. COLLABIZ issues no credits, points or platform currency and holds no money or goods.

**Q29.** Barter: please confirm that facilitating direct and multi-party barter (without any platform currency or holding of funds or goods) needs no registration or licence, and advise on GST for each leg (valuation under rule 27, time of supply, part-cash), on e-invoicing thresholds, and on how disputed or undelivered legs should be documented.

## Checklist for counsel

Please answer or mark "not for pilot". Items 1, 4, 5, 10, 11 and 14 must be resolved before partners are invited; items 22–24 before any Growth Desk message is sent; items 25–26 before franchises or property are offered to partners; items 27–28 before offers or solar referrals go live; item 29 before XCHANGE exchanges go live.

| Q | Question | Answer |
|---|---|---|
| Q1 | Is this click-to-accept evidence sufficient for the pilot agreements (partner terms, lead registration, NDA, offer agreements, commission agreements), … | |
| Q2 | Is 194H (commission or brokerage) the correct TDS section for all partner rewards — including fixed fees for services (194J?), reseller margins on … | |
| Q3 | Is a 90-day clawback after customer payment enforceable as drafted, and should it be stated in the Partner Terms as well as each commission agreement? | |
| Q4 | Please expand the Partner Terms into a full agreement. Suggested headings: parties and the contracting Unite entity (open item B-01); definitions; the … | |
| Q5 | Clause 2 prohibits "recruiting-based fees" to keep the platform clear of multi-level marketing. Several Unite businesses ask partners to bring … | |
| Q6 | Can the terms be accepted by the organisation owner on behalf of the company by typing their name, or must a board resolution or authorisation letter … | |
| Q7 | What does "protection" legally give the partner — an exclusive right to commission on any sale to that customer within 90 days, or only a right of … | |
| Q8 | Is a decision by an internal panel (with appeal) acceptable as the first tier of dispute resolution, followed by arbitration? Who should sit on the … | |
| Q9 | The certificate is publicly verifiable by its number (it shows status and validity, not the customer's personal data). Any objection? | |
| Q10 | Please draft a DPDP-compliant notice: name of the Data Fiduciary (which Unite entity), purposes, the itemised data above, consent and withdrawal, … | |
| Q11 | Partners enter buyer contact details (name, phone, e-mail) when they register a lead or sale. Who is the Data Fiduciary for buyer data, and what must … | |
| Q12 | Is a multi-party undertaking accepted separately by each member enforceable between members who never sign with each other directly? Should Unite … | |
| Q13 | Clause 2 is effectively a non-solicitation of the buyer. Is it enforceable under section 27 of the Contract Act as limited to the purpose and the … | |
| Q14 | Please provide standard clauses to append automatically to every offer agreement: term and renewal, payment terms for the price, invoicing and GST, … | |
| Q15 | Exclusive territories: is there any competition-law concern with exclusive territories plus Unite-set resale prices for SOLCART products? Should the … | |
| Q16 | Equity offers: what must be in place (valuation, shareholder approval, FEMA for foreign partners) before an equity reward can be offered at all? … | |
| Q17 | Should the partner be paid commission before Unite receives the full customer payment (e.g. on each instalment), or only after full payment? The app … | |
| Q18 | The partner raises the invoice ("Request payout") for earned commission. Please confirm the invoice requirements (GST invoice from registered … | |
| Q19 | Tenders are out of scope for the pilot. Please review only if time allows; otherwise mark "not for pilot". | |
| Q20 | Is this declaration enough to show lawful processing of the buyer's contact details under the DPDP Act, and to support the partner's claim to … | |
| Q21 | Please confirm that this list is complete, and name for each business the licence or opinion required before partners may promote it (e.g. RBI PA/PPI … | |
| Q22 | The DPDP Act 2023 has no general "legitimate interest" ground (unlike the GDPR); it relies on consent and the "legitimate uses" in section 7. Can … | |
| Q23 | For overseas recipients (UAE, Kenya, Nigeria, UK, US and others), which anti-spam and data-protection rules apply (e.g. GDPR/PECR, CAN-SPAM), and is … | |
| Q24 | May licensed directory and trade-data contacts be used for automated e-mail outreach under typical licence terms, or only for manual contact? Please … | |
| Q25 | Franchising: please provide or review a franchise agreement, and advise on disclosure to applicants, trademark licensing, GST on the fee and royalty, … | |
| Q26 | Property channel partners: must every partner be a registered agent in the project's state; are the 48-hour hold and our consent record acceptable; … | |
| Q27 | Buy-one-get-one: are the offer texts and the "free" wording compliant with the Consumer Protection Act 2019 and the CCPA guidelines on misleading … | |
| Q28 | Solar quotes and referrals: are the savings, payback and subsidy statements on the quote adequately qualified; is a 90-day retention of uploaded bills … | |
| Q29 | Barter: please confirm that facilitating direct and multi-party barter (without any platform currency or holding of funds or goods) needs no … | |

Return the marked-up document to the pilot owner. Approved texts are loaded with the bootstrap command (go-live checklist 5.2a) and the "DRAFT" wording is removed only from approved documents.
