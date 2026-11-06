import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { capabilitiesFor, MFA_REQUIRED_ROLES, PLATFORM_ROLES, type Capability, type MembershipRole, type OrgType } from '@collabiz/types';
import { InjectDb, type Db } from '../db/client';
import { memberships, organizations, users } from '../db/schema';
import { verifyJwt } from './crypto';
import { config } from '../config';
import { IS_PUBLIC, REQUIRED_CAPS, REQUIRE_ORG, type RequestContext } from './context';

export const ACCESS_COOKIE = 'cz_at';
export const CSRF_COOKIE = 'cz_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: authenticates (Bearer for mobile, httpOnly cookie + double-submit CSRF for web),
 * resolves tenant context from DB memberships (never trusting client-supplied org alone),
 * enforces admin MFA and capability requirements.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, @InjectDb() private db: Db) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const req = ec.switchToHttp().getRequest<Request & { ctx?: RequestContext; cookies?: Record<string, string> }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ec.getHandler(), ec.getClass()]);
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const cookieToken = req.cookies?.[ACCESS_COOKIE] ?? null;
    const token = bearer ?? cookieToken;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentication required');
    }
    if (!bearer && cookieToken && !SAFE.has(req.method)) {
      const csrfHeader = req.headers['x-cz-csrf'];
      if (!csrfHeader || csrfHeader !== req.cookies?.[CSRF_COOKIE]) throw new ForbiddenException('CSRF token missing or invalid');
    }
    const payload = verifyJwt<{ sub: string; mfa?: boolean; typ?: string }>(token, config().JWT_ACCESS_SECRET);
    if (!payload || payload.typ !== 'access') {
      if (isPublic) return true;
      throw new UnauthorizedException('Session expired or invalid');
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account is not active');

    const rows = await this.db
      .select({ organizationId: memberships.organizationId, role: memberships.role, orgType: organizations.type, orgName: organizations.displayName, verificationStatus: organizations.verificationStatus, membershipLevel: organizations.membershipLevel })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')));

    const requestedOrg = (req.headers['x-org-id'] as string | undefined) || null;
    let activeOrgId: string | null = null;
    if (requestedOrg) {
      if (!rows.some((r) => r.organizationId === requestedOrg)) throw new ForbiddenException('You are not a member of the requested organization');
      activeOrgId = requestedOrg;
    } else {
      // Default: first partner org, else first membership.
      activeOrgId = (rows.find((r) => r.orgType === 'partner_company' || r.orgType === 'partner_individual') ?? rows[0])?.organizationId ?? null;
    }
    const active = rows.filter((r) => r.organizationId === activeOrgId);
    const orgRoles = active.map((r) => r.role as MembershipRole).filter((r) => !PLATFORM_ROLES.includes(r));
    const platformRoles = [...new Set(rows.filter((r) => (r.orgType === 'platform' || r.orgType === 'group_company') && PLATFORM_ROLES.includes(r.role as MembershipRole)).map((r) => r.role as MembershipRole))];
    const needsMfa = platformRoles.some((r) => MFA_REQUIRED_ROLES.includes(r));
    const mfaVerified = !!payload.mfa && !!user.mfaEnabledAt;
    const mfaMissing = needsMfa && !mfaVerified;

    const caps = capabilitiesFor(orgRoles);
    if (!mfaMissing) for (const c of capabilitiesFor(platformRoles)) caps.add(c);

    req.ctx = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      orgId: activeOrgId,
      orgType: (active[0]?.orgType as OrgType) ?? null,
      orgRoles,
      platformRoles,
      caps,
      memberships: rows.map((r) => ({ organizationId: r.organizationId, role: r.role as MembershipRole, orgType: r.orgType as OrgType, orgName: r.orgName })),
      mfaVerified,
      mfaRequiredButMissing: mfaMissing,
      orgVerificationStatus: active[0]?.verificationStatus ?? null,
      orgMembershipLevel: active[0]?.membershipLevel ?? null,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined,
    };

    if (this.reflector.getAllAndOverride<boolean>(REQUIRE_ORG, [ec.getHandler(), ec.getClass()]) && !req.ctx.orgId) {
      throw new ForbiddenException('An organization context is required. Complete onboarding first.');
    }
    const required = this.reflector.getAllAndOverride<Capability[]>(REQUIRED_CAPS, [ec.getHandler(), ec.getClass()]) ?? [];
    const missing = required.filter((c) => !caps.has(c));
    if (missing.length) {
      if (mfaMissing && missing.every((c) => capabilitiesFor(platformRoles).has(c))) {
        throw new ForbiddenException('Multi-factor authentication is required for administrative actions');
      }
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
