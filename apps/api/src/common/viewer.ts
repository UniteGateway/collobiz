import { MEMBERSHIP_LEVELS } from '@collabiz/types';
import { isPlatform, type RequestContext } from './context';

/** What the caller is entitled to see — derived only from the verified request context. */
export interface Viewer {
  authenticated: boolean;
  orgId: string | null;
  partner: boolean;
  verified: boolean;
  levelRank: number; // -1 anonymous, 0 registered … 4 country_partner
  platform: boolean;
  memberOf: Set<string>;
}

export const levelRank = (l: string | null | undefined) => (l ? MEMBERSHIP_LEVELS.indexOf(l as (typeof MEMBERSHIP_LEVELS)[number]) : -1);

export function viewerOf(ctx: RequestContext | null | undefined): Viewer {
  const partner = !!ctx?.orgId && (ctx.orgType === 'partner_company' || ctx.orgType === 'partner_individual');
  return {
    authenticated: !!ctx,
    orgId: ctx?.orgId ?? null,
    partner,
    verified: partner && ctx!.orgVerificationStatus === 'verified',
    levelRank: partner ? levelRank(ctx!.orgMembershipLevel) : -1,
    platform: isPlatform(ctx),
    memberOf: new Set(ctx?.memberships.map((m) => m.organizationId) ?? []),
  };
}

/** Price disclosure rule for catalogue items (Stage 04 "price visibility scopes"). */
export function canSeePrice(v: Viewer, priceVisibility: string, ownerOrgId: string) {
  if (v.platform || v.memberOf.has(ownerOrgId)) return true;
  switch (priceVisibility) {
    case 'public': return true;
    case 'verified_partners': return v.verified;
    case 'certified_partners': return v.verified && v.levelRank >= levelRank('certified');
    default: return false; // on_request
  }
}
