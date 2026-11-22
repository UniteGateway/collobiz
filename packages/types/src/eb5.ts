/**
 * GO EB5 — EB-5 consultancy, partner referral and client management (COLLABIZ business module).
 * Public brand: GO EB5. Contracting consultancy entity: CITRUS360 LLC (USA). The platform coordinates and tracks; it does
 * not give legal advice, does not hold EB-5 investment capital, and never pays automatic EB-5 referral compensation.
 */
import { z } from 'zod';

// ============================================================================ roles and permissions
export const EB5_ROLES = [
  'citrus_admin', 'business_manager', 'immigration_consultant', 'attorney', 'regional_center', 'finance', 'compliance',
] as const;
export type Eb5StaffRole = (typeof EB5_ROLES)[number];
/** Everyone who can touch the module. Super admin and partner/client are derived, not assigned here. */
export type Eb5Role = Eb5StaffRole | 'super_admin' | 'bd_partner' | 'referral_consultant' | 'client';
export const EB5_ROLE_LABELS: Record<Eb5Role, string> = {
  super_admin: 'COLLABIZ Super Admin', citrus_admin: 'CITRUS360 Company Admin', business_manager: 'GO EB5 Business Manager',
  bd_partner: 'Business Development Partner', referral_consultant: 'Referral Consultant', immigration_consultant: 'Immigration Consultant',
  attorney: 'U.S. Immigration Attorney', regional_center: 'Regional Center Representative', finance: 'Finance Executive',
  compliance: 'Compliance Officer', client: 'Client / Investor',
};

/** What each role may do. Enforced in the API; the UI only hides what the API would refuse anyway. */
export const EB5_PERMISSIONS = {
  'module.configure': ['super_admin', 'citrus_admin'],
  'roles.assign': ['super_admin', 'citrus_admin'],
  'legal.approve': ['super_admin', 'compliance'],
  'lead.view_all': ['super_admin', 'citrus_admin', 'business_manager', 'immigration_consultant', 'compliance'],
  'lead.manage': ['super_admin', 'citrus_admin', 'business_manager', 'immigration_consultant'],
  'lead.introduce': ['bd_partner', 'referral_consultant', 'business_manager', 'citrus_admin'],
  'partner.review': ['super_admin', 'compliance', 'citrus_admin'],
  'application.review': ['super_admin', 'citrus_admin', 'business_manager', 'immigration_consultant'],
  'consultation.manage': ['super_admin', 'citrus_admin', 'business_manager', 'immigration_consultant', 'attorney'],
  'agreement.draft': ['super_admin', 'citrus_admin', 'business_manager'],
  'agreement.countersign': ['citrus_admin'],
  'invoice.issue': ['citrus_admin', 'finance'],
  'payment.verify': ['finance'],
  'document.request': ['super_admin', 'citrus_admin', 'business_manager', 'immigration_consultant', 'attorney'],
  'document.view_private': ['citrus_admin', 'business_manager', 'immigration_consultant', 'attorney', 'compliance'],
  'case.record': ['citrus_admin', 'business_manager', 'immigration_consultant', 'attorney'],
  'case.attorney_verify': ['attorney'],
  'project.manage': ['super_admin', 'citrus_admin', 'business_manager', 'regional_center'],
  'reports.view': ['super_admin', 'citrus_admin', 'business_manager', 'finance', 'compliance'],
  'audit.view': ['super_admin', 'compliance'],
  'compensation.record': ['compliance'],
} as const satisfies Record<string, readonly Eb5Role[]>;
export type Eb5Permission = keyof typeof EB5_PERMISSIONS;
export const eb5Can = (roles: readonly string[], p: Eb5Permission) => (EB5_PERMISSIONS[p] as readonly string[]).some((r) => roles.includes(r));

// ============================================================================ configuration and legal gates
export const EB5_DEFAULT_SETTINGS = {
  brand: 'GO EB5', consultancyEntity: 'CITRUS360 LLC', entityJurisdiction: 'USA',
  /** Blanks in the legal draft — completed only after counsel confirms them. */
  consultantAddress: '', consultantEmail: '', governingLaw: '', disputeForum: '', summaryBusinessDays: 0,
  indicativeInvestmentUsd: 800_000, consultancyFeeUsd: 200_000, commencementPct: 10,
  legal: {
    feesApproved: false, agreementTemplateApproved: false, invoicingApproved: false, compensationApproved: false,
    approvals: [] as { gate: string; by: string; ref: string; at: string }[],
  },
};
export type Eb5Settings = typeof EB5_DEFAULT_SETTINGS;
export const EB5_GATES = [
  { key: 'feesApproved', label: 'Consultancy fees and refund terms approved by U.S. counsel' },
  { key: 'agreementTemplateApproved', label: 'CITRUS360 consultancy agreement template approved by U.S. counsel' },
  { key: 'invoicingApproved', label: 'CITRUS360 billing channel and invoicing approved' },
  { key: 'compensationApproved', label: 'Partner compensation arrangement approved (I-956K / securities review)' },
] as const;
export type Eb5Gate = (typeof EB5_GATES)[number]['key'];

/** Commencement and balance from the configured fee. Money in US cents. */
export function feeSchedule(consultancyFeeUsd: number, commencementPct: number) {
  const total = Math.round(consultancyFeeUsd * 100);
  const commencement = Math.round(total * commencementPct / 100);
  return { total, commencement, balance: total - commencement };
}
export const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const Eb5SettingsSchema = z.object({
  consultancyEntity: z.string().trim().min(3).max(120), entityJurisdiction: z.string().trim().min(2).max(60),
  consultantAddress: z.string().trim().max(300), consultantEmail: z.union([z.literal(''), z.string().trim().email()]),
  governingLaw: z.string().trim().max(120), disputeForum: z.string().trim().max(160), summaryBusinessDays: z.number().int().min(0).max(120),
  indicativeInvestmentUsd: z.number().int().positive().max(10_000_000),
  consultancyFeeUsd: z.number().int().positive().max(5_000_000),
  commencementPct: z.number().min(0).max(100),
});

/** Separate ledgers — never summed together. Investment capital is tracked only; COLLABIZ never receives it. */
export const EB5_LEDGERS = [
  { code: 'consultancy', label: 'Consultancy fees (CITRUS360 LLC)', collectable: true },
  { code: 'legal', label: 'Third-party legal fees', collectable: false },
  { code: 'government', label: 'Government fees', collectable: false },
  { code: 'project_admin', label: 'Project administration fees', collectable: false },
  { code: 'compensation', label: 'Referral compensation (only if legally authorised)', collectable: false },
  { code: 'investment', label: 'EB-5 investment capital — tracking only', collectable: false },
] as const;
export type Eb5Ledger = (typeof EB5_LEDGERS)[number]['code'];

// ============================================================================ leads
export const EB5_LEAD_STAGES = [
  'New Lead', 'Contact Attempted', 'Connected', 'Consultation Scheduled', 'Consultation Completed', 'Preliminary Eligibility Review',
  'Consultancy Proposal Issued', 'Agreement Sent', 'Agreement Signed', 'Payment Pending', 'Commencement Payment Verified', 'Consultancy Active',
  'Attorney Review', 'Project Review', 'Client Onboarding', 'Closed',
] as const;
/** Stages a manager may not set by hand — they follow real records (signature, verified payment). */
export const EB5_SYSTEM_STAGES = new Set([8, 10, 11]);
export const EB5_READINESS = ['Exploring', 'Funds identified', 'Funds ready', 'Not sure'] as const;
export const EB5_TIMELINES = ['Within 3 months', '3–6 months', '6–12 months', 'Over 12 months'] as const;
export const EB5_CONTACT = ['Email', 'Phone', 'WhatsApp', 'Video call'] as const;
export const Eb5LeadSchema = z.object({
  fullName: z.string().trim().min(3).max(120), country: z.string().trim().min(2).max(60), city: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(7).max(20).optional(), email: z.string().trim().toLowerCase().email().optional(),
  familyMembers: z.string().trim().max(200).optional(), readiness: z.enum(EB5_READINESS), timeline: z.enum(EB5_TIMELINES),
  contactPreference: z.enum(EB5_CONTACT), notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { message: 'The prospect must have agreed to be contacted by GO EB5' }),
}).refine((x) => x.email || x.phone, { message: 'Give an email or a phone number', path: ['email'] });
/** Normalised identifiers for duplicate checks (hashed before storage). */
export const normEmail = (e?: string | null) => (e ? e.trim().toLowerCase() : null);
export const normPhone = (p?: string | null) => (p ? p.replace(/\D/g, '').slice(-10) : null);

// ============================================================================ preliminary application
export const SOURCE_OF_FUNDS = ['Business income', 'Personal savings', 'Property sale', 'Investment proceeds', 'Gift / inheritance', 'Borrowed funds', 'Other'] as const;
/** Section D of the GO EB5 Preliminary Consultancy Application. */
export const EB5_OBJECTIVES = ['U.S. permanent residency through EB-5', "Children's education in the USA", 'Family relocation', 'Business establishment in USA', 'U.S. investment opportunities', 'Renewable energy investment', 'Federal programs / business incentives', 'Other'] as const;
export const EB5_BUDGET_BANDS = ['Below $800,000', '$800,000 - $1,049,999', '$1,050,000 and above', 'Require financial planning'] as const;
export const EB5_APP_TIMELINES = ['Immediate', 'Within 3 months', 'Within 6 months', 'Within 12 months', 'Exploring opportunities'] as const;
export const EB5_MEETING_MODES = ['In person', 'Video call', 'Telephone'] as const;
export const EB5_HISTORY_QUESTIONS = [
  { key: 'visitedUsa', label: 'Previously visited the USA?' }, { key: 'holdsUsVisa', label: 'Currently hold a U.S. visa?' },
  { key: 'appliedPermanentResidency', label: 'Previously applied for U.S. permanent residency?' }, { key: 'visaRefusal', label: 'Previous U.S. visa refusal?' },
  { key: 'workingWithOther', label: 'Currently working with another consultant or attorney?' },
] as const;
export const EB5_APPLICATION_TERMS = [
  'This application is a preliminary enquiry, not a binding engagement, investment subscription or immigration petition.',
  'Eligibility, project selection and immigration filings require independent professional assessment. No visa approval, timeline, investment return or capital repayment is guaranteed. EB-5 capital is at risk.',
  'Information will be handled confidentially under applicable privacy requirements. Do not attach passport copies or financial records at this stage. Additional services and third-party costs require prior approval.',
  'I confirm that my information is accurate to the best of my knowledge and understand the above conditions.',
] as const;
export const EB5_SCOPE_TEXT = 'GO EB5 may facilitate preliminary assessment, introductions to qualified U.S. immigration attorneys, project and regional-center coordination, due diligence, source-of-funds guidance through qualified professionals, tax and financial advisor referrals, site visits and administrative support. Legal advice and petition preparation are reserved for appropriately authorized professionals.';
const yn = z.boolean({ message: 'Answer yes or no' });
const opt = (n: number) => z.string().trim().max(n).optional();
/** GO EB5 Preliminary Consultancy Application — sections A to J of the paper form (K is office use). */
export const Eb5ApplicationSchema = z.object({
  fullName: z.string().trim().min(3, 'Full name as per passport').max(120),
  personal: z.object({ dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth'), nationality: z.string().trim().min(2).max(60), countryOfResidence: z.string().trim().min(2).max(60), cityState: z.string().trim().min(2).max(120),
    residentialAddress: z.string().trim().min(5).max(400), mobile: z.string().trim().min(7, 'Mobile with country code').max(20), email: z.string().trim().email() }),
  professional: z.object({ occupation: z.string().trim().min(2).max(100), designation: opt(100), companyName: opt(140), natureOfBusiness: opt(140), annualIncomeRange: opt(60), netWorth: opt(60) }),
  family: z.object({ maritalStatus: z.enum(['Single', 'Married', 'Other']), spouseName: opt(120), numberOfChildren: z.number().int().min(0).max(15), childrenAges: opt(80), familyMembersProposed: opt(200) }),
  purpose: z.object({ objectives: z.array(z.enum(EB5_OBJECTIVES)).min(1, 'Choose at least one objective'), otherObjectives: opt(1000) }),
  readiness: z.object({ budgetBand: z.enum(EB5_BUDGET_BANDS), timeline: z.enum(EB5_APP_TIMELINES), sourceOfFunds: z.array(z.enum(SOURCE_OF_FUNDS)).min(1, 'Choose at least one source of funds'), otherSourceComments: opt(1000) }),
  history: z.object({ visitedUsa: yn, holdsUsVisa: yn, appliedPermanentResidency: yn, visaRefusal: yn, workingWithOther: yn, currentVisaCategory: opt(60), existingConsultant: opt(120) }),
  preferences: z.object({ meetingMode: z.enum(EB5_MEETING_MODES), preferredDateTime: opt(80), referralSource: opt(120) }),
  consents: z.object({ preliminaryAssessment: z.literal(true, { message: 'Required' }), authorizeContact: z.literal(true, { message: 'Required' }), finalizeFeesBeforePaidServices: z.literal(true, { message: 'Required' }) }),
  signature: z.string().trim().min(3, 'Type your full name as your signature').max(120),
  datePlace: z.string().trim().min(3, 'Date and place').max(120),
});
export type Eb5Application = z.infer<typeof Eb5ApplicationSchema>;
/** A draft may be partial; only submission validates the whole form. */
export const Eb5ApplicationDraftSchema = z.record(z.string(), z.unknown());
/** Public online application (no account): the full form plus a consent to create the lead. */
export const Eb5PublicApplicationSchema = Eb5ApplicationSchema.extend({ website: z.string().max(0).optional() });
/** Public consultation booking / early-access interest from the GO EB5 micro site. `website` is a honeypot and must stay empty. */
export const Eb5PublicEnquirySchema = z.object({
  kind: z.enum(['consultation', 'portal_interest']), fullName: z.string().trim().min(3).max(120), email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20).optional(), country: z.string().trim().min(2).max(60), interest: opt(80), readiness: opt(60), timeline: opt(60), family: opt(80),
  currentlyInUs: opt(60), language: opt(30), preferredDate: opt(40), message: opt(1000), consent: z.literal(true, { message: 'Consent to be contacted is required' }), website: z.string().max(0).optional(),
});

// ============================================================================ agreements, invoices, consultations
export const EB5_AGREEMENT_STATES = ['Draft', 'Internal Review', 'Legal Approved', 'Sent to Client', 'Viewed', 'Signed', 'Counter-Signed', 'Active', 'Terminated'] as const;
export const EB5_DOC_CATEGORIES = ['Consultancy application', 'Signed agreement', 'Payment receipt', 'Identity verification', 'Passport', 'Business records', 'Financial records', 'Source-of-funds documentation', 'Attorney correspondence', 'Project disclosures', 'Approved offering documents', 'USCIS-related records', 'Case progress documentation'] as const;
export const EB5_CASE_STAGES = ['Preliminary enquiry', 'Consultation', 'Attorney eligibility review', 'Source-of-funds preparation', 'Project due diligence', 'Investment documentation', 'Formal investment process', 'I-526E (if applicable)', 'Consular processing or adjustment of status', 'Conditional residence (when granted)', 'I-829 (when applicable)', 'Case closed'] as const;
export const EB5_STATUS_SOURCES = [
  { code: 'client_reported', label: 'Client-reported' }, { code: 'internal', label: 'Internal administrative' },
  { code: 'attorney_verified', label: 'Attorney-verified' }, { code: 'document_supported', label: 'Official document-supported' },
] as const;
export const Eb5ConsultationSchema = z.object({
  leadId: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }), timezone: z.string().trim().min(2).max(60),
  mode: z.enum(['Online', 'In person']), kind: z.enum(['Consultant', 'Attorney']), durationMin: z.number().int().min(15).max(240).default(45),
  location: z.string().trim().max(200).optional(), agenda: z.string().trim().max(1000).optional(),
});
export const Eb5ProjectSchema = z.object({
  name: z.string().trim().min(3).max(140), sponsor: z.string().trim().min(2).max(140), regionalCenter: z.string().trim().max(140).optional(),
  location: z.string().trim().min(2).max(140), sector: z.string().trim().min(2).max(80), description: z.string().trim().min(10).max(3000),
  investmentThresholdUsd: z.number().int().positive().optional(),
});
/** Project fields that may only be set with supporting evidence on file. */
export const EB5_PROJECT_CLAIMS = [
  { key: 'teaDetermination', label: 'TEA determination' }, { key: 'businessPlan', label: 'Business plan' }, { key: 'economicReport', label: 'Economic impact report' },
  { key: 'i956f', label: 'I-956F filing' }, { key: 'offeringDocuments', label: 'Offering documents approved' },
] as const;

/** Wording the module must never publish (promises of visas, approvals or returns). */
export const EB5_FORBIDDEN_CLAIMS = /(guarantee[ds]?|assured|100%)\s+(green card|visa|approval|return|returns)|guaranteed\s+(approval|returns?)|risk[- ]free/i;
