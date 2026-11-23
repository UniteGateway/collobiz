/**
 * UNITE INDUSTRY CLUB — legal drafts and virtual agreements.
 *
 * These are DRAFTS prepared for review by Unite Group's legal counsel. Until counsel's approval is recorded for a
 * template version, every document generated from it carries a "pilot draft" notice. Nothing here is legal advice.
 * Templates use {{placeholders}}; `renderTemplate` refuses to render when a placeholder has no value, so no agreement
 * is ever issued with blanks.
 */
import { z } from 'zod';

/** ISO 3166-1 alpha-2 codes — the club works with businesses anywhere in the world. Names come from Intl.DisplayNames. */
export const ISO_COUNTRIES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const ISO_SET = new Set(ISO_COUNTRIES);
/** "WW" = worldwide. */
export const MarketSchema = z.string().trim().toUpperCase().refine((c) => c === 'WW' || ISO_SET.has(c), { message: 'Use a two-letter country code (for example IN, AE, US) or WW for worldwide' });
export function countryName(code: string) {
  if (code === 'WW') return 'Worldwide';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
export const marketsLabel = (codes: string[]) => (codes.length ? codes.map(countryName).join(', ') : 'Worldwide');

/** Governing law and dispute resolution, chosen per agreement. Standard forms; counsel confirms before go-live. */
export const DISPUTE_OPTIONS = [
  { code: 'india', label: 'India — arbitration in Hyderabad', text: 'This Agreement is governed by the laws of India. Any dispute shall be finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator, seated in Hyderabad, Telangana, in English. Subject to this, the courts at Hyderabad have exclusive jurisdiction.' },
  { code: 'singapore', label: 'Singapore — SIAC arbitration', text: 'This Agreement is governed by the laws of Singapore. Any dispute shall be finally resolved by arbitration administered by the Singapore International Arbitration Centre (SIAC) under its rules in force, by a sole arbitrator, seated in Singapore, in English.' },
  { code: 'uae', label: 'UAE — Dubai arbitration', text: 'This Agreement is governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai. Any dispute shall be finally resolved by arbitration under the rules of the Dubai International Arbitration Centre, by a sole arbitrator, seated in Dubai, in English.' },
  { code: 'england', label: 'England & Wales — LCIA arbitration', text: 'This Agreement is governed by the laws of England and Wales. Any dispute shall be finally resolved by arbitration under the LCIA Rules, by a sole arbitrator, seated in London, in English.' },
  { code: 'new_york', label: 'New York, USA — ICDR arbitration', text: 'This Agreement is governed by the laws of the State of New York. Any dispute shall be finally resolved by arbitration administered by the International Centre for Dispute Resolution under its International Arbitration Rules, by a sole arbitrator, seated in New York, in English.' },
] as const;
export type DisputeOption = (typeof DISPUTE_OPTIONS)[number]['code'];
export const disputeText = (c: string) => DISPUTE_OPTIONS.find((d) => d.code === c)?.text ?? DISPUTE_OPTIONS[0].text;

export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;

/** Fills {{a.b}} placeholders; throws if any placeholder has no value, so no document is issued with blanks. */
export function renderTemplate(body: string, vars: Record<string, unknown>): string {
  const missing: string[] = [];
  const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), vars);
  const out = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p: string) => {
    const v = get(p);
    if (v === undefined || v === null || v === '') { missing.push(p); return ''; }
    return String(v);
  });
  if (missing.length) throw new Error(`Template values missing: ${[...new Set(missing)].join(', ')}`);
  return out;
}

export const DRAFT_NOTICE = 'PILOT DRAFT — This document was generated from a template that Unite Group’s legal counsel has not yet approved. Read it carefully and take your own legal advice before signing.';

const SIGN = `
EXECUTION
This Agreement is concluded electronically on COLLABIZ. Each party signs by typing the name of its authorised signatory against the exact text of this version, identified by its SHA-256 fingerprint; COLLABIZ records the signatory, time, IP address and fingerprint. The parties agree that this is a valid way to form and sign this Agreement (for India, see section 10A of the Information Technology Act, 2000), and that a party may instead sign a printed copy and upload it. The Agreement takes effect when both parties have signed.`;

export const CLUB_TEMPLATES = {
  club_terms: {
    title: 'Unite Industry Club — Membership Terms and Conditions',
    kind: 'click_accept' as const,
    body: `UNITE INDUSTRY CLUB — MEMBERSHIP TERMS AND CONDITIONS

These terms apply between the business accepting them ("Member") and {{operator.name}}, {{operator.address}} ("Unite"), which operates the Unite Industry Club ("Club") on COLLABIZ. The person accepting confirms that they are authorised to bind the Member.

1. MEMBERSHIP
1.1 Membership is free. No fee is charged for joining, for the Member's board or for a Member page.
1.2 Any lawful business in any industry and in any country may apply. Unite may ask for business verification (KYB) and may refuse or end membership where verification fails or these terms are breached.
1.3 Membership does not create a partnership, joint venture, agency or employment relationship, and does not guarantee any sale, order, income or saving.

2. THE MEMBER'S INFORMATION
2.1 The Member keeps its information accurate and current and is responsible for everything published from its account.
2.2 The Member's public page is shown only if the Member switches it on, and only with products Unite has approved.

3. UNITE BRANDS
3.1 No Unite name, logo or brand (including "Unite Powertek" and "Powered by Unite") may be used without a signed Brand Licence and OEM Supply Agreement for the specific product.
3.2 Submitting a product does not oblige Unite to approve it. Unite decides after its quality, certification and verification checks.

4. FREE-POWER OFFERS
4.1 A Member offering free power with a product is responsible for that offer to its customers. Solar systems are supplied under separate terms by Unite Solar or an approved installer.
4.2 No Member may promise customers a specific saving, payback or income unless it is calculated for that customer and labelled as an estimate.

5. BUYING POWER
5.1 COLLABIZ is not a power supplier, trader or distribution licensee. Power requests are passed to Unite's energy desk, which introduces the Member to plant owners, licensees or installers. Supply is only under agreements with those parties and the approvals required by law.

6. MATCHING AND INFORMATION
6.1 Matches, counts and suggestions on the board are generated by rules from the Member's choices. They are information, not advice, offers or guarantees.

7. PROHIBITED PRODUCTS AND CONDUCT
7.1 Members may not list or trade weapons, narcotics, counterfeit or infringing goods, hazardous goods without the required licences, goods subject to sanctions or export controls without authorisation, or anything unlawful in the place of sale.
7.2 Members comply with anti-bribery, anti-money-laundering, sanctions, export-control, consumer-protection and product-safety laws that apply to them.

8. AGREEMENTS BETWEEN MEMBERS
8.1 Members may create agreements with each other (non-disclosure, distribution, collaboration memoranda) from Club templates. Unite provides the templates and the signing record but is not a party to those agreements and does not guarantee their performance.

9. DATA PROTECTION
9.1 Unite processes personal data in line with the Digital Personal Data Protection Act, 2023 (India) and other laws that apply, only for running the Club and the services the Member uses. The Member may ask for its data to be exported or deleted, subject to records the law requires Unite to keep.

10. CONFIDENTIALITY
10.1 Information that another Member or Unite marks as confidential, or that is plainly confidential, is used only for the purpose it was shared for.

11. LIABILITY
11.1 The Club is provided on an "as available" basis. To the extent the law allows, Unite is not liable for indirect or consequential loss, and its total liability under these terms is limited to INR 10,000 or its equivalent.
11.2 The Member indemnifies Unite against third-party claims arising from the Member's products, offers or breach of these terms.

12. SUSPENSION AND ENDING MEMBERSHIP
12.1 The Member may leave at any time. Unite may suspend or end membership for breach, risk to customers or legal requirement, with reasons where the law allows.
12.2 Signed agreements continue under their own terms.

13. CHANGES
13.1 Unite may publish a new version of these terms. Each version is numbered; continued use of Club features that need these terms requires accepting the new version.

14. LAW AND DISPUTES
14.1 These terms are governed by the laws of India, and the courts at Hyderabad, Telangana have jurisdiction, without removing any protection the Member has under the mandatory laws of its own country.

15. CONTACT
{{operator.name}}, {{operator.address}}. Telephone {{operator.phone}}.`,
  },

  club_brand_licence: {
    title: 'Brand Licence and OEM Supply Agreement',
    kind: 'contract' as const,
    body: `BRAND LICENCE AND OEM SUPPLY AGREEMENT
Agreement reference: {{ref}}

BETWEEN
(1) {{licensor.name}}, {{licensor.address}} ("Licensor"); and
(2) {{licensee.name}}, {{licensee.address}}, {{licensee.country}} ("Licensee", the manufacturer).

BACKGROUND
The Licensee makes the product described in Schedule A. The Licensor's group operates the Unite Industry Club and the Unite Powertek sales network. The parties want the product to be sold under the brand stated below through that network.

1. DEFINITIONS
"Brand" means {{brand.name}}. "Product" means the product in Schedule A as approved, and no other. "Territory" means {{territory}}. "Network" means the COLLABIZ partners, franchises and stores selling Unite Powertek products.

2. LICENCE
2.1 The Licensor grants the Licensee a non-exclusive, non-transferable licence to apply the Brand to the Product, and to its packaging and documentation, only for supply under this Agreement in the Territory.
2.2 No other use of any Unite name, logo or brand is licensed. The Licensee may not sub-license.
2.3 All artwork, labels and packaging using the Brand need the Licensor's written approval before first use.

3. QUALITY
3.1 The Product must meet the specification in Schedule A, the certifications listed there ({{product.certifications}}), and all product-safety and labelling laws of each country where it is sold.
3.2 The Licensor may inspect production, take samples and audit quality records on reasonable notice.
3.3 The Licensee must notify the Licensor within 48 hours of any safety issue, and must carry out any recall the Licensor or a regulator requires, at the Licensee's cost where the cause is the Product.

4. SUPPLY AND SALES
4.1 The Product is listed in the Unite Powertek catalogue and may be sold through the Network. Orders are placed by written purchase order; a purchase order binds only when the Licensee confirms it.
4.2 Prices, discounts, payment terms and any royalty or margin are as set out in Schedule C. Nothing is payable through COLLABIZ unless Schedule C says so.
4.3 Network commissions are paid under the Licensor's published commission rules and are not deducted from the Licensee's price unless Schedule C says so.
4.4 The catalogue shows the Brand. The Licensor will not disclose the Licensee's identity to customers without the Licensee's consent, except where the law requires the manufacturer to be named.

5. FREE-POWER BUNDLE
{{powerBundle}}

6. WARRANTY AND LIABILITY
6.1 The Licensee warrants the Product to end customers for at least {{warrantyMonths}} months from delivery, or longer where the law requires, and handles warranty claims.
6.2 The Licensee keeps product-liability insurance appropriate to the Product and the Territory and shows evidence on request.
6.3 The Licensee indemnifies the Licensor against claims caused by defects in the Product or by the Licensee's breach.
6.4 Except for indemnities, breach of confidentiality and misuse of the Brand, neither party is liable for indirect or consequential loss.

7. INTELLECTUAL PROPERTY
7.1 The Brand and all goodwill in it belong to the Licensor. The Licensee's product designs and know-how remain the Licensee's.
7.2 The Licensee will not register or challenge any mark confusingly similar to the Brand.

8. CONFIDENTIALITY
Each party keeps the other's confidential information secret during this Agreement and for three years after it ends.

9. COMPLIANCE
Each party complies with anti-bribery, anti-money-laundering, sanctions, export-control and data-protection laws, and will not supply the Product into any country or to any person where that would breach them.

10. TERM AND TERMINATION
10.1 This Agreement runs for {{termMonths}} months from the date both parties sign, and renews for further 12-month periods unless either party gives 60 days' written notice.
10.2 Either party may terminate on 30 days' notice for a material breach not remedied in that time, or at once if the other becomes insolvent.
10.3 The Licensor may suspend the licence at once if the Product creates a safety risk or damages the Brand.
10.4 After termination the Licensee may sell existing branded stock for 90 days, then stops all use of the Brand. Clauses 6, 7, 8 and 11 survive.

11. LAW AND DISPUTES
{{dispute}}

12. GENERAL
This Agreement, with its Schedules, is the whole agreement on its subject. Changes must be agreed in writing, including as a new signed version on COLLABIZ. Neither party may assign it without the other's consent.
${SIGN}

SCHEDULE A — PRODUCT
Club product code: {{product.code}}
Name: {{product.name}}
Category: {{product.category}}
Description: {{product.description}}
Certifications: {{product.certifications}}
Monthly capacity declared by the Licensee: {{product.capacity}}
Maximum retail price: {{product.mrp}}
Markets: {{territory}}

SCHEDULE B — FREE-POWER BUNDLE
{{product.powerOffer}}

SCHEDULE C — COMMERCIAL TERMS
{{commercial}}`,
  },

  club_nda: {
    title: 'Mutual Non-Disclosure Agreement',
    kind: 'contract' as const,
    body: `MUTUAL NON-DISCLOSURE AGREEMENT
Agreement reference: {{ref}}

BETWEEN
(1) {{partyA.name}}, {{partyA.address}}, {{partyA.country}}; and
(2) {{partyB.name}}, {{partyB.address}}, {{partyB.country}}
(each a "Party"), both members of the Unite Industry Club.

1. PURPOSE
The Parties will share information to evaluate and carry out: {{purpose}} (the "Purpose").

2. CONFIDENTIAL INFORMATION
"Confidential Information" is any information disclosed by one Party to the other for the Purpose, in any form, that is marked confidential or would reasonably be understood to be confidential. It does not include information that is public without breach, already lawfully known to the recipient, independently developed, or lawfully received from a third party without restriction.

3. OBLIGATIONS
The recipient will (a) use Confidential Information only for the Purpose; (b) disclose it only to its employees, advisers and group companies who need it and are bound by similar duties; (c) protect it with at least reasonable care; and (d) on request, return or destroy it, except copies the law requires it to keep.

4. REQUIRED DISCLOSURE
A Party may disclose Confidential Information where the law or a regulator requires, after notifying the other Party where lawful.

5. NO OTHER RIGHTS
No licence, partnership or obligation to do business is created. Information is provided "as is".

6. TERM
This Agreement lasts {{termMonths}} months from the date both Parties sign. The duties in clause 3 continue for three years after it ends (indefinitely for trade secrets).

7. REMEDIES
Damages may not be an adequate remedy; a Party may seek injunctive relief in addition to other remedies.

8. LAW AND DISPUTES
{{dispute}}

9. ROLE OF UNITE
Unite Group provides this template and the electronic signing record on COLLABIZ and is not a party to this Agreement.
${SIGN}`,
  },

  club_distribution: {
    title: 'International Distribution Agreement',
    kind: 'contract' as const,
    body: `INTERNATIONAL DISTRIBUTION AGREEMENT
Agreement reference: {{ref}}

BETWEEN
(1) {{principal.name}}, {{principal.address}}, {{principal.country}} ("Principal"); and
(2) {{distributor.name}}, {{distributor.address}}, {{distributor.country}} ("Distributor"),
both members of the Unite Industry Club.

1. APPOINTMENT
The Principal appoints the Distributor as its {{exclusivity}} distributor of the products listed in clause 2 (the "Products") in {{territory}} (the "Territory"). The Distributor buys and resells in its own name and is not the Principal's agent.

2. PRODUCTS
{{products}}

3. ORDERS, PRICES AND DELIVERY
3.1 The Distributor orders by written purchase order. An order binds when the Principal confirms it.
3.2 Prices are the Principal's price list in force when the order is confirmed, in {{currency}}, unless agreed otherwise in writing.
3.3 Delivery is {{incoterm}} (Incoterms® 2020) at the place stated in the order.
3.4 Payment terms: {{paymentTerms}}.

4. DISTRIBUTOR'S DUTIES
The Distributor will (a) promote the Products actively in the Territory; (b) obtain and keep every import licence, registration and local certification needed to sell them; (c) comply with labelling, consumer-protection, product-safety, customs, sanctions and export-control laws; (d) not sell outside the Territory where that would breach law or this Agreement; and (e) pass on warranty claims promptly.
{{minimumTargets}}

5. PRINCIPAL'S DUTIES
The Principal will supply Products that meet their specifications and the certifications it has declared, provide product information and marketing material, and handle warranty under its standard terms.

6. TRADEMARKS
The Distributor may use the Principal's trademarks only to sell the Products in the Territory, and must stop at the end of this Agreement. Use of any Unite brand needs a separate Unite licence.

7. CONFIDENTIALITY
Each party keeps the other's confidential information secret during this Agreement and for three years after it ends.

8. TERM AND TERMINATION
8.1 This Agreement runs for {{termMonths}} months from the date both parties sign.
8.2 Either party may terminate on 30 days' notice for a material breach not remedied in that time, or at once on the other's insolvency.
8.3 No compensation for goodwill is payable on expiry or termination unless the law of the Territory requires it.

9. LIABILITY
Neither party is liable for indirect or consequential loss. Each party's total liability is limited to the value of Products ordered in the 12 months before the claim, except for breach of confidentiality, trademark misuse or amounts that cannot be limited by law.

10. LAW AND DISPUTES
{{dispute}}

11. ROLE OF UNITE
Unite Group provides this template and the electronic signing record on COLLABIZ and is not a party to this Agreement.
${SIGN}`,
  },

  club_mou: {
    title: 'Collaboration Memorandum of Understanding',
    kind: 'contract' as const,
    body: `COLLABORATION MEMORANDUM OF UNDERSTANDING
Reference: {{ref}}

BETWEEN
(1) {{partyA.name}}, {{partyA.address}}, {{partyA.country}}; and
(2) {{partyB.name}}, {{partyB.address}}, {{partyB.country}},
both members of the Unite Industry Club.

1. PURPOSE
The parties intend to collaborate on: {{purpose}}.

2. WHAT EACH PARTY BRINGS
{{partyA.name}}: {{contributionA}}
{{partyB.name}}: {{contributionB}}

3. NEXT STEPS
The parties will work in good faith towards definitive agreements covering scope, prices, responsibilities and any revenue sharing. Target date for those agreements: {{targetDate}}.

4. NOT BINDING, EXCEPT
This Memorandum records intentions and is not legally binding, except clauses 5, 6, 7 and 8, which bind both parties.

5. CONFIDENTIALITY
Information shared under this Memorandum is confidential and used only for the purpose above, for three years.

6. COSTS
Each party bears its own costs.

7. DURATION
This Memorandum ends on the earlier of definitive agreements being signed or {{termMonths}} months after both parties sign.

8. LAW AND DISPUTES
{{dispute}}

9. ROLE OF UNITE
Unite Group provides this template and the electronic signing record on COLLABIZ and is not a party to this Memorandum.
${SIGN}`,
  },
} as const;
export type ClubTemplateCode = keyof typeof CLUB_TEMPLATES;
export const CLUB_TEMPLATE_CODES = Object.keys(CLUB_TEMPLATES) as ClubTemplateCode[];

/** Agreements one member can start with another member (identified by its club member code). */
export const MEMBER_AGREEMENT_TYPES = [
  { code: 'nda', template: 'club_nda', label: 'Mutual non-disclosure agreement (NDA)', text: 'Share drawings, prices or plans safely before working together.' },
  { code: 'distribution', template: 'club_distribution', label: 'International distribution agreement', text: 'Appoint a member as your distributor for one or more countries.' },
  { code: 'mou', template: 'club_mou', label: 'Collaboration memorandum (MoU)', text: 'Record what you plan to do together before the final contract.' },
] as const;

const country = MarketSchema.refine((c) => c !== 'WW', { message: 'Choose a country' });
const base = { counterpartyCode: z.string().trim().toUpperCase().regex(/^UIC-\d{6}$/, 'Enter the other member’s club code (UIC-123456)'), dispute: z.enum(['india', 'singapore', 'uae', 'england', 'new_york']), termMonths: z.number().int().min(1).max(120) };
export const MemberAgreementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('nda'), ...base, purpose: z.string().trim().min(10).max(500) }),
  z.object({ type: z.literal('mou'), ...base, purpose: z.string().trim().min(10).max(500), contributionA: z.string().trim().min(5).max(500), contributionB: z.string().trim().min(5).max(500), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date') }),
  z.object({
    type: z.literal('distribution'), ...base, products: z.string().trim().min(5).max(1000), territory: z.array(country).min(1).max(50), exclusive: z.boolean().default(false),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code'), incoterm: z.enum(INCOTERMS), paymentTerms: z.string().trim().min(3).max(200), minimumTargets: z.string().trim().max(500).optional(),
  }),
]);
export type MemberAgreementInput = z.infer<typeof MemberAgreementSchema>;
export const CounselApprovalSchema = z.object({ counsel: z.string().trim().min(3).max(160), note: z.string().trim().max(1000).optional() });
export const TermsAcceptSchema = z.object({ typedName: z.string().trim().min(3).max(120), version: z.number().int().positive() });
