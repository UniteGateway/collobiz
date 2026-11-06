/**
 * Request validation schemas shared by API (server-side enforcement) and clients (inline form errors).
 * Money is always integer minor units (paise/cents).
 */
import { z } from 'zod';
import { PARTNER_TYPES, MEMBERSHIP_ROLES } from './roles';
import { SECTOR_CODES, CURRENCIES } from './taxonomy';

const id = z.string().uuid();
const money = z.number().int().nonnegative();
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

// ---------- Identity (Stage 02 — screens 011, 012, 129, 144, 145) ----------
export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Enter a valid phone number').optional(),
  fullName: z.string().trim().min(2).max(120),
  password,
  acceptTerms: z.literal(true, { message: 'You must accept the partner terms and privacy notice' }),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});
export const VerifyOtpSchema = z.object({ channel: z.enum(['email', 'phone']), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const RefreshSchema = z.object({ refreshToken: z.string().min(20).optional() });
export const MfaEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const InviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['org_admin', 'org_member']),
});
export const UpdateMemberRoleSchema = z.object({ role: z.enum(MEMBERSHIP_ROLES) });
export const AdminAssignRoleSchema = z.object({ userId: id, organizationId: id, role: z.enum(MEMBERSHIP_ROLES) });

// ---------- Onboarding & KYB (Stage 03 — screens 013-022, 130, 131, 143, 149) ----------
export const AccountTypeSchema = z.object({
  kind: z.enum(['individual', 'company']),
  partnerTypes: z.array(z.enum(PARTNER_TYPES)).min(1, 'Choose at least one business type'),
});
export const IndividualProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  profession: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  country: z.string().length(2).toUpperCase(),
  yearsExperience: z.number().int().min(0).max(70),
  pan: z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN format: ABCDE1234F').optional(),
});
export const CompanyProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().min(4).max(40),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN').optional(),
  country: z.string().length(2).toUpperCase(),
  city: z.string().trim().min(2).max(80),
  website: z.string().url().optional(),
  employees: z.number().int().min(1).max(1_000_000).optional(),
  annualTurnover: money.optional(),
});
export const IndustriesSchema = z.object({
  sectors: z.array(z.enum(SECTOR_CODES)).min(1).max(12),
  skills: z.array(z.string().trim().min(2).max(60)).max(40).default([]),
  certifications: z.array(z.string().trim().min(2).max(80)).max(40).default([]),
  capacityMax: money.optional(),
});
export const CoverageSchema = z.object({
  regions: z.array(z.string().trim().min(2).max(40)).min(1).max(100),
  willingToTravel: z.boolean().default(false),
});
export const BusinessProfileSchema = z.object({
  headline: z.string().trim().min(10).max(160),
  about: z.string().trim().min(30).max(4000),
  services: z.array(z.string().trim().min(2).max(80)).max(30).default([]),
  pastProjects: z.array(z.object({ name: z.string().min(2).max(120), year: z.number().int().min(1950).max(2100), value: money.optional(), client: z.string().max(120).optional() })).max(30).default([]),
  consentToMatch: z.boolean().default(true),
});
export const KYB_DOC_TYPES = ['pan', 'gst_certificate', 'incorporation_certificate', 'address_proof', 'identity_proof', 'bank_proof', 'msme_certificate', 'other'] as const;
export const KybDocMetaSchema = z.object({ docType: z.enum(KYB_DOC_TYPES) });
export const BankTaxSchema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().regex(/^[0-9]{6,20}$/, 'Account number must be 6-20 digits'),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC'),
  bankName: z.string().trim().min(2).max(120),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN format: ABCDE1234F'),
  gstRegistered: z.boolean(),
  gstin: z.string().trim().toUpperCase().optional(),
  tdsSection: z.string().max(20).optional(),
}).refine((v) => !v.gstRegistered || !!v.gstin, { message: 'GSTIN required when GST registered', path: ['gstin'] });
export const AgreementAcceptSchema = z.object({ templateCode: z.string().min(2).max(60), version: z.number().int().positive(), typedName: z.string().trim().min(2).max(120) });
export const KybDecisionSchema = z.object({
  decision: z.enum(['verified', 'rejected', 'reupload_requested']),
  reason: z.string().trim().min(5, 'A reason is required for the audit trail').max(2000),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});
export const ConsentSchema = z.object({ purpose: z.enum(['marketing', 'matching', 'analytics', 'data_sharing']), granted: z.boolean() });
export const DataRequestSchema = z.object({ kind: z.enum(['export', 'deletion', 'correction']), details: z.string().max(2000).optional() });

// ---------- Catalogue (Stage 04 — 004, 005, 039, 086, 128, 136) ----------
export const GroupCompanySchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  legalEntityCode: z.string().trim().min(2).max(30).regex(/^[A-Z0-9-]+$/),
  brandName: z.string().trim().min(2).max(120),
  sectors: z.array(z.enum(SECTOR_CODES)).min(1),
  country: z.string().length(2).toUpperCase(),
  billingIdentity: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
});
export const CatalogItemSchema = z.object({
  kind: z.enum(['product', 'service']),
  name: z.string().trim().min(2).max(200),
  sector: z.enum(SECTOR_CODES),
  description: z.string().trim().min(10).max(8000),
  sku: z.string().max(60).optional(),
  unit: z.string().max(30).optional(),
  listPrice: money.optional(),
  currency: z.enum(CURRENCIES).default('INR'),
  priceVisibility: z.enum(['public', 'verified_partners', 'certified_partners', 'on_request']),
  visibility: z.enum(['public', 'partners', 'private']),
  specs: z.record(z.string(), z.string()).default({}),
});

// ---------- Opportunities (Stage 05 — 031-042) ----------
export const OpportunityCreateSchema = z.object({
  title: z.string().trim().min(5).max(200),
  summary: z.string().trim().min(20).max(8000),
  sector: z.enum(SECTOR_CODES),
  kind: z.enum(['project', 'product_supply', 'service', 'job', 'distributorship', 'rfq', 'tender']),
  route: z.enum(['unite_owned', 'partner_originated', 'partner_exchange', 'joint_execution']),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(40).optional(),
  country: z.string().length(2).toUpperCase().default('IN'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  estimatedValue: money.optional(),
  currency: z.enum(CURRENCIES).default('INR'),
  deadline: z.string().datetime().optional(),
  visibility: z.enum(['public', 'verified_partners', 'invited', 'private']),
  minLevel: z.enum(['registered', 'verified', 'certified', 'strategic', 'country_partner']).default('verified'),
  requiredCertifications: z.array(z.string()).default([]),
  groupCompanyId: id.optional(),
});
export const RfqCreateSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(8000),
  sector: z.enum(SECTOR_CODES),
  quantity: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  budget: money.optional(),
  neededBy: z.string().datetime().optional(),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(20).optional(),
  consentToShare: z.literal(true, { message: 'Consent is required so Unite Group can review your requirement' }),
});
export const ApplySchema = z.object({
  message: z.string().trim().min(20).max(4000),
  proposedValue: money.optional(),
  teamId: id.optional(),
});
export const SavedSearchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  query: z.object({ q: z.string().optional(), sector: z.string().optional(), city: z.string().optional(), route: z.string().optional(), minValue: z.number().optional(), maxValue: z.number().optional() }),
  alert: z.boolean().default(true),
});

// ---------- Leads (Stage 06 — 043-051, 151-153) ----------
export const LeadCreateSchema = z.object({
  customer: z.object({
    legalName: z.string().trim().min(2).max(200),
    taxId: z.string().trim().max(30).optional(),
    contactName: z.string().trim().min(2).max(120),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(20).optional(),
    city: z.string().trim().min(2).max(80),
    country: z.string().length(2).toUpperCase().default('IN'),
  }),
  sector: z.enum(SECTOR_CODES),
  productOrProject: z.string().trim().min(3).max(200),
  quantityOrCapacity: z.string().max(120).optional(),
  estimatedValue: money,
  currency: z.enum(CURRENCIES).default('INR'),
  requirements: z.string().trim().min(20).max(8000),
  expectedCloseDate: z.string().datetime().optional(),
  consent: z.object({
    method: z.enum(['written_email', 'signed_letter', 'recorded_call', 'meeting_minutes', 'platform_rfq']),
    obtainedAt: z.string().datetime(),
    disclosureScope: z.enum(['unite_only', 'unite_and_approved_partners', 'restricted']),
    notes: z.string().max(2000).optional(),
  }),
  evidenceSummary: z.string().trim().min(10).max(4000),
  urgent: z.boolean().default(false),
});
export type LeadCreateInput = z.infer<typeof LeadCreateSchema>;
export const RoutingDecisionSchema = z.object({
  decision: z.enum(['accept', 'release', 'reject', 'pause', 'resume', 'escalate']),
  reason: z.string().trim().min(5).max(2000),
});
export const DuplicateRulingSchema = z.object({ ruling: z.enum(['not_duplicate', 'duplicate_upheld_earlier', 'duplicate_upheld_this']), reason: z.string().trim().min(5).max(2000) });
export const DisputeCreateSchema = z.object({ subjectId: id, statement: z.string().trim().min(20).max(8000) });
export const DisputeRulingSchema = z.object({ outcome: z.enum(['upheld', 'rejected', 'split']), reason: z.string().trim().min(10).max(4000) });

// ---------- CRM (Stage 07 — 028, 052-054) ----------
export const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
export const CrmMoveSchema = z.object({ stage: z.enum(PIPELINE_STAGES), note: z.string().max(2000).optional() });
export const CrmActivitySchema = z.object({ kind: z.enum(['note', 'call', 'email', 'meeting']), body: z.string().trim().min(2).max(4000) });
export const TaskSchema = z.object({ title: z.string().trim().min(2).max(200), dueAt: z.string().datetime(), leadId: id.optional(), customerId: id.optional() });
