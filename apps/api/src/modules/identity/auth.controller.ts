import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ChangePasswordSchema, LoginSchema, MfaEnableSchema, RegisterSchema, VerifyOtpSchema } from '@collabiz/types';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../../common/auth.guard';
import { randomToken } from '../../common/crypto';
import { config } from '../../config';
import { AuthService, type IssuedTokens } from './auth.service';

const REFRESH_COOKIE = 'cz_rt';
const Client = z.object({ client: z.enum(['web', 'mobile']).default('web') });
const LoginBody = LoginSchema.and(Client);
const RegisterBody = RegisterSchema.and(Client);
const InviteAccept = z.object({ token: z.string().min(20), password: RegisterSchema.shape.password, fullName: z.string().trim().min(2).max(120).optional() }).and(Client);

/**
 * Web: tokens only in httpOnly cookies (+ readable CSRF cookie for double-submit).
 * Mobile: tokens returned in the body for SecureStore; never set as cookies.
 */
function deliver(res: Response, tokens: IssuedTokens, client: 'web' | 'mobile') {
  if (client === 'mobile') return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.accessExpiresIn };
  const secure = config().NODE_ENV === 'production';
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessExpiresIn * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: config().REFRESH_TOKEN_TTL_DAYS * 86400_000 });
  res.cookie(CSRF_COOKIE, randomToken(18), { httpOnly: false, sameSite: 'lax', secure, path: '/' });
  return { ok: true, expiresIn: tokens.accessExpiresIn };
}
function clear(res: Response) {
  for (const c of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) res.clearCookie(c, { path: '/' });
}
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('identity')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** Screen 011 — create account. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(@Body(body(RegisterBody)) b: z.infer<typeof RegisterBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(b, meta(req));
    return { userId: r.user.id, ...deliver(res, r.tokens, b.client), ...(r.devOtp ? { devOtp: r.devOtp } : {}) };
  }

  /** Screen 011 — sign in (MFA code when enrolled). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(body(LoginBody)) b: z.infer<typeof LoginBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(b.email, b.password, b.mfaCode, meta(req));
    return { userId: r.user.id, ...deliver(res, r.tokens, b.client) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() b: { refreshToken?: string }, @Req() req: Request & { cookies?: Record<string, string> }, @Res({ passthrough: true }) res: Response) {
    const fromBody = typeof b?.refreshToken === 'string' ? b.refreshToken : undefined;
    const raw = fromBody ?? req.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      clear(res);
      res.status(401);
      return { statusCode: 401, message: 'Session expired' };
    }
    try {
      const t = await this.auth.refresh(raw, req.headers['user-agent']);
      return deliver(res, t, fromBody ? 'mobile' : 'web');
    } catch (e) {
      if (!fromBody) clear(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() b: { refreshToken?: string }, @Req() req: Request & { cookies?: Record<string, string> }, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(typeof b?.refreshToken === 'string' ? b.refreshToken : req.cookies?.[REFRESH_COOKIE]);
    clear(res);
    return { ok: true };
  }

  @Get('me')
  me(@Ctx() ctx: RequestContext) {
    return this.auth.me(ctx);
  }

  /** Screen 012 — OTP & email verification. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/send')
  @HttpCode(200)
  async sendOtp(@Ctx() ctx: RequestContext, @Body(body(VerifyOtpSchema.pick({ channel: true }))) b: { channel: 'email' | 'phone' }) {
    const devOtp = await this.auth.sendOtp(ctx.userId, b.channel);
    return { sent: true, channel: b.channel, ...(devOtp ? { devOtp } : {}) };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Ctx() ctx: RequestContext, @Body(body(VerifyOtpSchema)) b: z.infer<typeof VerifyOtpSchema>) {
    return this.auth.verifyOtp(ctx.userId, b.channel, b.code);
  }

  /** Screen 145 — account security & MFA. */
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@Ctx() ctx: RequestContext) {
    return this.auth.mfaSetup(ctx);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  async mfaEnable(@Ctx() ctx: RequestContext, @Body(body(MfaEnableSchema.and(Client))) b: { code: string; client: 'web' | 'mobile' }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.mfaEnable(ctx, b.code, req.headers['user-agent']);
    return { enabled: true, ...deliver(res, t, b.client) };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  mfaDisable(@Ctx() ctx: RequestContext, @Body(body(MfaEnableSchema)) b: { code: string }) {
    return this.auth.mfaDisable(ctx, b.code);
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(@Ctx() ctx: RequestContext, @Body(body(ChangePasswordSchema)) b: z.infer<typeof ChangePasswordSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.changePassword(ctx, b.currentPassword, b.newPassword);
    clear(res);
    return r;
  }

  @Get('sessions')
  sessions(@Ctx() ctx: RequestContext) {
    return this.auth.sessions(ctx.userId);
  }

  @Delete('sessions/:id')
  revoke(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.auth.revokeSession(ctx.userId, id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvite(@Body(body(InviteAccept)) b: z.infer<typeof InviteAccept>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.acceptInvitation(b.token, b.password, b.fullName);
    return { userId: r.user.id, ...deliver(res, r.tokens, b.client) };
  }
}
