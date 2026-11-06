import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { MFA_REQUIRED_ROLES, PLATFORM_ROLES, type MembershipRole, type RegisterInput } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { memberships, organizations, otpCodes, refreshTokens, users } from '../../db/schema';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { decryptField, encryptField, hashPassword, newTotpSecret, randomDigits, randomToken, sha256, signJwt, verifyPassword, verifyTotp } from '../../common/crypto';
import { config } from '../../config';
import type { RequestContext } from '../../common/context';

export interface IssuedTokens { accessToken: string; refreshToken: string; accessExpiresIn: number }
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private mail: MailService) {}

  async register(input: RegisterInput, meta: { ip?: string; userAgent?: string }) {
    const existing = await this.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
    if (existing.length) throw new ConflictException('An account with this email already exists. Sign in instead.');
    const [user] = await this.db.insert(users).values({
      email: input.email, phone: input.phone, fullName: input.fullName, passwordHash: await hashPassword(input.password),
    }).returning();
    await this.db.update(users).set({ authSubject: `local:${user.id}` }).where(eq(users.id, user.id));
    await this.audit.record({ userId: user.id, orgId: null, ip: meta.ip }, { action: 'user.registered', objectType: 'user', objectId: user.id, after: { email: user.email, termsAccepted: true } });
    const otp = await this.sendOtp(user.id, 'email');
    const tokens = await this.issue(user.id, false, meta.userAgent);
    return { user, tokens, devOtp: otp };
  }

  async login(email: string, password: string, mfaCode: string | undefined, meta: { ip?: string; userAgent?: string }) {
    const [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    const generic = new UnauthorizedException('Incorrect email or password');
    if (!user || !user.passwordHash) throw generic;
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException(`Account temporarily locked after repeated failures. Try again after ${user.lockedUntil.toISOString()}.`);
    if (user.status !== 'active') throw new ForbiddenException('This account is not active');
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      await this.db.update(users).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(eq(users.id, user.id));
      await this.audit.record({ userId: user.id, orgId: null, ip: meta.ip }, { action: 'auth.login_failed', objectType: 'user', objectId: user.id, after: { failed } });
      throw generic;
    }
    let mfa = false;
    if (user.mfaEnabledAt && user.mfaSecretEnc) {
      if (!mfaCode) throw new UnauthorizedException({ statusCode: 401, error: 'MfaRequired', message: 'Enter the 6-digit code from your authenticator app', mfaRequired: true });
      if (!verifyTotp(decryptField(user.mfaSecretEnc), mfaCode)) {
        await this.audit.record({ userId: user.id, orgId: null, ip: meta.ip }, { action: 'auth.mfa_failed', objectType: 'user', objectId: user.id });
        throw new UnauthorizedException({ statusCode: 401, error: 'MfaInvalid', message: 'Invalid authentication code', mfaRequired: true });
      }
      mfa = true;
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await this.audit.record({ userId: user.id, orgId: null, ip: meta.ip }, { action: 'auth.login', objectType: 'user', objectId: user.id, after: { mfa } });
    return { user, tokens: await this.issue(user.id, mfa, meta.userAgent) };
  }

  /** Access token (15 min) + rotating refresh token; refresh reuse revokes the whole family. */
  async issue(userId: string, mfa: boolean, userAgent?: string, familyId: string = randomUUID()): Promise<IssuedTokens> {
    const c = config();
    const accessToken = signJwt({ sub: userId, typ: 'access', mfa }, c.JWT_ACCESS_SECRET, c.ACCESS_TOKEN_TTL_SEC);
    const raw = `${randomToken(32)}.${mfa ? 'm' : 'p'}`;
    await this.db.insert(refreshTokens).values({ userId, tokenHash: sha256(raw), familyId, expiresAt: new Date(Date.now() + c.REFRESH_TOKEN_TTL_DAYS * 86400_000), userAgent: userAgent?.slice(0, 200) });
    return { accessToken, refreshToken: raw, accessExpiresIn: c.ACCESS_TOKEN_TTL_SEC };
  }

  async refresh(raw: string, userAgent?: string): Promise<IssuedTokens> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw))).limit(1);
    if (!row) throw new UnauthorizedException('Session expired');
    if (row.revokedAt) {
      // Reuse of a rotated token → likely theft: revoke the entire family.
      await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      await this.audit.record({ userId: row.userId, orgId: null }, { action: 'auth.refresh_reuse_detected', objectType: 'user', objectId: row.userId });
      throw new UnauthorizedException('Session expired');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Session expired');
    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account is not active');
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    return this.issue(row.userId, raw.endsWith('.m') && !!user.mfaEnabledAt, userAgent, row.familyId);
  }

  async logout(raw: string | undefined) {
    if (!raw) return;
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw))).limit(1);
    if (row) await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.familyId, row.familyId));
  }

  async sessions(userId: string) {
    const rows = await this.db.select().from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
      .orderBy(desc(refreshTokens.createdAt));
    return rows.map((r) => ({ id: r.familyId, userAgent: r.userAgent, createdAt: r.createdAt, expiresAt: r.expiresAt }));
  }

  async revokeSession(userId: string, familyId: string) {
    const r = await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt))).returning();
    if (!r.length) throw new BadRequestException('Session not found');
    return { revoked: r.length };
  }

  // ---------------- OTP (screen 012) ----------------
  async sendOtp(userId: string, channel: 'email' | 'phone'): Promise<string | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new UnauthorizedException();
    if (channel === 'phone' && !user.phone) throw new BadRequestException('Add a phone number to your profile first');
    const recent = await this.db.select({ n: sql<number>`count(*)::int` }).from(otpCodes)
      .where(and(eq(otpCodes.userId, userId), gt(otpCodes.createdAt, new Date(Date.now() - 10 * 60_000))));
    if ((recent[0]?.n ?? 0) >= 5) throw new BadRequestException('Too many codes requested. Wait 10 minutes and try again.');
    const code = randomDigits(6);
    await this.db.insert(otpCodes).values({ userId, channel, codeHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
    await this.mail.send(channel === 'email' ? 'email' : 'sms', channel === 'email' ? user.email : user.phone!, 'Your COLLABIZ verification code', `Your verification code is ${code}. It expires in 10 minutes.`);
    return config().DEV_EXPOSE_OTP || config().NODE_ENV === 'test' ? code : undefined;
  }

  async verifyOtp(userId: string, channel: 'email' | 'phone', code: string) {
    const [otp] = await this.db.select().from(otpCodes)
      .where(and(eq(otpCodes.userId, userId), eq(otpCodes.channel, channel), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp) throw new BadRequestException('Code expired. Request a new one.');
    if (otp.attempts >= 5) throw new BadRequestException('Too many attempts. Request a new code.');
    if (otp.codeHash !== sha256(`${userId}:${code}`)) {
      await this.db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
      throw new BadRequestException({ statusCode: 400, message: 'Incorrect code', issues: [{ path: 'code', message: 'Incorrect code' }] });
    }
    await this.db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
    await this.db.update(users).set(channel === 'email' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() }).where(eq(users.id, userId));
    await this.audit.record({ userId, orgId: null }, { action: `user.${channel}_verified`, objectType: 'user', objectId: userId });
    return { verified: true, channel };
  }

  // ---------------- MFA (screen 145) ----------------
  async mfaSetup(ctx: RequestContext) {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (user.mfaEnabledAt) throw new ConflictException('MFA is already enabled');
    const secret = newTotpSecret();
    await this.db.update(users).set({ mfaSecretEnc: encryptField(secret) }).where(eq(users.id, ctx.userId));
    return { secret, otpauthUrl: `otpauth://totp/COLLABIZ:${encodeURIComponent(user.email)}?secret=${secret}&issuer=COLLABIZ&algorithm=SHA1&digits=6&period=30` };
  }

  async mfaEnable(ctx: RequestContext, code: string, userAgent?: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user.mfaSecretEnc) throw new BadRequestException('Start MFA setup first');
    if (!verifyTotp(decryptField(user.mfaSecretEnc), code)) throw new BadRequestException({ statusCode: 400, message: 'Invalid code', issues: [{ path: 'code', message: 'Invalid code — check your device clock' }] });
    await this.db.update(users).set({ mfaEnabledAt: new Date() }).where(eq(users.id, ctx.userId));
    await this.audit.record(ctx, { action: 'user.mfa_enabled', objectType: 'user', objectId: ctx.userId });
    // New MFA-verified session so admin capabilities unlock immediately.
    return this.issue(ctx.userId, true, userAgent);
  }

  async mfaDisable(ctx: RequestContext, code: string) {
    if (ctx.platformRoles.some((r) => MFA_REQUIRED_ROLES.includes(r))) throw new ForbiddenException('MFA is mandatory for administrative roles');
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) throw new BadRequestException('MFA is not enabled');
    if (!verifyTotp(decryptField(user.mfaSecretEnc), code)) throw new BadRequestException('Invalid code');
    await this.db.update(users).set({ mfaEnabledAt: null, mfaSecretEnc: null }).where(eq(users.id, ctx.userId));
    await this.audit.record(ctx, { action: 'user.mfa_disabled', objectType: 'user', objectId: ctx.userId });
    return { disabled: true };
  }

  async changePassword(ctx: RequestContext, current: string, next: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new BadRequestException({ statusCode: 400, message: 'Current password is incorrect', issues: [{ path: 'currentPassword', message: 'Incorrect password' }] });
    await this.db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, ctx.userId));
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, ctx.userId), isNull(refreshTokens.revokedAt)));
    await this.audit.record(ctx, { action: 'user.password_changed', objectType: 'user', objectId: ctx.userId });
    return { changed: true, sessionsRevoked: true };
  }

  async me(ctx: RequestContext) {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    const [org] = ctx.orgId ? await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1) : [];
    return {
      id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, locale: user.locale, currency: user.currency, timezone: user.timezone,
      emailVerified: !!user.emailVerifiedAt, phoneVerified: !!user.phoneVerifiedAt,
      mfaEnabled: !!user.mfaEnabledAt, mfaVerified: ctx.mfaVerified, mfaRequired: ctx.platformRoles.some((r) => MFA_REQUIRED_ROLES.includes(r)),
      activeOrg: org ? { id: org.id, type: org.type, name: org.displayName, verificationStatus: org.verificationStatus, membershipLevel: org.membershipLevel, partnerTypes: org.partnerTypes } : null,
      orgRoles: ctx.orgRoles, platformRoles: ctx.platformRoles, capabilities: [...ctx.caps].sort(), memberships: ctx.memberships,
    };
  }

  /** Accept a team invitation (screen 144): sets password, activates memberships. */
  async acceptInvitation(token: string, password: string, fullName?: string) {
    const [otp] = await this.db.select().from(otpCodes)
      .where(and(eq(otpCodes.codeHash, sha256(`invite:${token}`)), eq(otpCodes.purpose, 'invite'), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date()))).limit(1);
    if (!otp) throw new BadRequestException('Invitation is invalid or has expired');
    await this.db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
    await this.db.update(users).set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), ...(fullName ? { fullName } : {}) }).where(eq(users.id, otp.userId));
    await this.db.update(memberships).set({ status: 'active' }).where(and(eq(memberships.userId, otp.userId), eq(memberships.status, 'invited')));
    await this.audit.record({ userId: otp.userId, orgId: null }, { action: 'membership.invitation_accepted', objectType: 'user', objectId: otp.userId });
    const [user] = await this.db.select().from(users).where(eq(users.id, otp.userId)).limit(1);
    return { user, tokens: await this.issue(otp.userId, false) };
  }

  isPlatformRole(role: MembershipRole) {
    return PLATFORM_ROLES.includes(role);
  }
}
