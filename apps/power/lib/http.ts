import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './auth';

/** Wraps a route handler: maps auth, validation and unexpected errors to JSON responses without leaking internals. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  return async (...a: A) => {
    try { const r = await fn(...a); return r instanceof Response ? r : NextResponse.json(r ?? { ok: true }); } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ message: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ message: 'Check the highlighted fields', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
      console.error(e);
      return NextResponse.json({ message: 'Something went wrong' }, { status: 500 });
    }
  };
}
