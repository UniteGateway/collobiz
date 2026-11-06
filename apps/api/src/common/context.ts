import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Capability, MembershipRole, OrgType } from '@collabiz/types';

/** Request-scoped identity & tenant context. Built ONLY from verified token + DB memberships (§6.4). */
export interface RequestContext {
  userId: string;
  email: string;
  fullName: string;
  orgId: string | null;
  orgType: OrgType | null;
  orgRoles: MembershipRole[];
  platformRoles: MembershipRole[];
  caps: Set<Capability>;
  memberships: { organizationId: string; role: MembershipRole; orgType: OrgType; orgName: string }[];
  mfaVerified: boolean;
  mfaRequiredButMissing: boolean;
  orgVerificationStatus: string | null;
  orgMembershipLevel: string | null;
  ip?: string;
  requestId?: string;
}

export const IS_PUBLIC = 'cz:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const REQUIRED_CAPS = 'cz:caps';
/** Require ALL listed capabilities in the active context. */
export const RequireCaps = (...caps: Capability[]) => SetMetadata(REQUIRED_CAPS, caps);
export const REQUIRE_ORG = 'cz:require-org';
/** Require an active organization context (X-Org-Id or default membership). */
export const RequireOrg = () => SetMetadata(REQUIRE_ORG, true);

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestContext => ec.switchToHttp().getRequest().ctx);
/** Optional context for public endpoints that personalise when signed in. */
export const OptionalCtx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestContext | null => ec.switchToHttp().getRequest().ctx ?? null);

export const isPlatform = (ctx: RequestContext | null | undefined) => !!ctx && ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
export const has = (ctx: RequestContext | null | undefined, cap: Capability) => !!ctx && ctx.caps.has(cap);
