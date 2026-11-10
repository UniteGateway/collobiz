import { NextResponse, type NextRequest } from 'next/server';

/** Sends signed-out visitors to the sign-in page. API routes check the session and role themselves. */
export function proxy(req: NextRequest) {
  if (!req.cookies.get('upd_session')?.value) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!login|api|_next|favicon.ico|icon.png).*)'] };
