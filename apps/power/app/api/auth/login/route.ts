import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, login, SESSION_COOKIE, signSession } from '@/lib/auth';
import { handle } from '@/lib/http';

export const POST = handle(async (req: Request) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(await req.json());
  const s = await login(b.email, b.password);
  if (!s) return NextResponse.json({ message: 'Email or password is incorrect' }, { status: 401 });
  const res = NextResponse.json({ name: s.name, role: s.role });
  res.cookies.set(SESSION_COOKIE, await signSession(s), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
  await audit(s, 'auth.login', 'user', s.userId);
  return res;
});
