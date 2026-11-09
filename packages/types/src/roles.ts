/**
 * Roles & capabilities — Master Book §4.1 (user roles) and §7.4 (governance matrix).
 * Roles are held per organization membership; capabilities are what the API checks.
 */
export const ORG_TYPES = ['platform', 'group_company', 'partner_company', 'partner_individual'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const MEMBERSHIP_ROLES = [
  // partner organizations
  'org_owner',
  'org_admin',
  'org_member',
  // Unite Group / platform operations
  'super_admin',
  'unite_admin',
  'compliance',
  'finance',
  'routing_owner',
  'moderator',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Partner business sub-types (an organization may hold several). §4.1 */
export const PARTNER_TYPES = [
  'consultant',
  'contractor',
  'trader',
  'manufacturer',
  'distributor',
  'developer',
  'technology',
  'finance_associate',
  'investor',
] as const;
/** Business types in words, for every client. */
export const PARTNER_TYPE_LABELS: Record<string, string> = { consultant: 'Consultant', contractor: 'Contractor / EPC', trader: 'Trader', manufacturer: 'Manufacturer', distributor: 'Distributor', developer: 'Project developer', technology: 'Technology firm', finance_associate: 'Finance associate', investor: 'Investor' };
export type PartnerType = (typeof PARTNER_TYPES)[number];

/** Partner membership levels — §2.4 */
export const MEMBERSHIP_LEVELS = ['registered', 'verified', 'certified', 'strategic', 'country_partner'] as const;
export type MembershipLevel = (typeof MEMBERSHIP_LEVELS)[number];

export const CAPABILITIES = [
  'org.read',
  'org.manage',
  'org.team.manage',
  'profile.manage',
  'kyb.submit',
  'kyb.review',
  'opportunity.read',
  'opportunity.publish',
  'opportunity.apply',
  'opportunity.moderate',
  'lead.register',
  'lead.read.own',
  'routing.decide',
  'routing.configure',
  'lead.dispute.rule',
  'crm.manage',
  'team.manage',
  'tender.issue',
  'tender.bid',
  'tender.evaluate',
  'contract.manage',
  'contract.approve',
  'project.manage',
  'procurement.manage',
  'commission.read.own',
  'commission.approve',
  'commission.configure',
  'payout.request',
  'payout.approve',
  'finance.reconcile',
  'catalog.manage',
  'group.manage',
  'users.manage',
  'audit.read',
  'analytics.read',
  'ai.configure',
  'cms.manage',
  'review.moderate',
  'support.manage',
  'chat.use',
  'learning.manage',
  'international.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const PARTNER_BASE: Capability[] = [
  'org.read',
  'profile.manage',
  'kyb.submit',
  'opportunity.read',
  'opportunity.apply',
  'lead.register',
  'lead.read.own',
  'crm.manage',
  'team.manage',
  'tender.bid',
  'tender.issue',
  'tender.evaluate',
  'contract.manage',
  'project.manage',
  'procurement.manage',
  'commission.read.own',
  'payout.request',
  'chat.use',
];

export const ROLE_CAPABILITIES: Record<MembershipRole, Capability[]> = {
  org_owner: [...PARTNER_BASE, 'org.manage', 'org.team.manage'],
  org_admin: [...PARTNER_BASE, 'org.team.manage'],
  org_member: ['org.read', 'opportunity.read', 'lead.register', 'lead.read.own', 'crm.manage', 'chat.use', 'project.manage', 'tender.bid'],
  super_admin: [...CAPABILITIES].filter(
    // Super admin configures but still cannot approve finance alone (two-person rule, §7.1)
    (c) => c !== 'commission.approve' && c !== 'payout.approve',
  ) as Capability[],
  unite_admin: [
    'org.read', 'opportunity.read', 'opportunity.publish', 'opportunity.moderate', 'routing.decide', 'catalog.manage',
    'tender.issue', 'tender.evaluate', 'contract.manage', 'contract.approve', 'project.manage', 'procurement.manage',
    'analytics.read', 'chat.use', 'crm.manage', 'team.manage',
  ],
  compliance: ['org.read', 'kyb.review', 'lead.dispute.rule', 'audit.read', 'review.moderate', 'opportunity.read', 'analytics.read', 'chat.use'],
  finance: ['org.read', 'commission.approve', 'payout.approve', 'finance.reconcile', 'audit.read', 'analytics.read', 'chat.use'],
  routing_owner: ['org.read', 'opportunity.read', 'routing.decide', 'opportunity.moderate', 'chat.use'],
  moderator: ['org.read', 'opportunity.read', 'opportunity.moderate', 'review.moderate', 'support.manage', 'chat.use'],
};

export const PLATFORM_ROLES: MembershipRole[] = ['super_admin', 'unite_admin', 'compliance', 'finance', 'routing_owner', 'moderator'];
/** Roles that must enrol MFA before using privileged capabilities (§4.4, §7.1). */
export const MFA_REQUIRED_ROLES: MembershipRole[] = ['super_admin', 'unite_admin', 'compliance', 'finance', 'routing_owner'];

export function capabilitiesFor(roles: MembershipRole[]): Set<Capability> {
  const set = new Set<Capability>();
  for (const r of roles) for (const c of ROLE_CAPABILITIES[r] ?? []) set.add(c);
  return set;
}
