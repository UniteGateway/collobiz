/**
 * Session auth: a signed, HTTP-only cookie (HS256 via jose) holding user id and role. Roles:
 *  admin — everything, including approving tariff changes and user management
 *  analyst — edit projects, run simulations, propose tariff changes
 *  viewer — read only
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { db } from './db';

export type Role = 'admin' | 'analyst' | 'viewer';
export interface Session { userId: string; email: string; name: string; role: Role }
export const SESSION_COOKIE = 'upd_session';
const RANK: Record<Role, number> = { viewer: 0, analyst: 1, admin: 2 };

function secret() {
  const s = process.env.POWER_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('POWER_SESSION_SECRET must be set (at least 32 characters)');
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session) {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret());
}
export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secret()); return payload as unknown as Session; } catch { return null; }
}
export async function currentSession() { return readSession((await cookies()).get(SESSION_COOKIE)?.value); }
export const allowed = (s: Session | null, need: Role) => !!s && RANK[s.role] >= RANK[need];

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
/** For route handlers: returns the session or throws 401/403. */
export async function requireRole(need: Role) {
  const s = await currentSession();
  if (!s) throw new HttpError(401, 'Sign in first');
  if (!allowed(s, need)) throw new HttpError(403, `Needs the ${need} role`);
  return s;
}

export async function login(email: string, password: string) {
  const u = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return null;
  return { userId: u.id, email: u.email, name: u.name, role: u.role as Role } satisfies Session;
}
export const hashPassword = (p: string) => bcrypt.hash(p, 12);

export async function audit(s: Session | null, action: string, entity: string, entityId?: string, before?: unknown, after?: unknown) {
  await db.auditLog.create({ data: { userId: s?.userId, action, entity, entityId, before: before as never, after: after as never } });
}
