/**
 * Environment-agnostic COLLABIZ API client (web, admin, mobile).
 * Web/admin: same-origin cookies + CSRF header. Mobile: Bearer tokens from SecureStore.
 */
export interface ApiIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, message: string, public issues: ApiIssue[] = [], public body?: unknown) {
    super(message);
  }
  /** Field → message map for inline form errors. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.path, i.message]));
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Extra headers per request (Authorization, X-Org-Id, X-CZ-CSRF …). */
  headers?: () => Record<string, string | undefined> | Promise<Record<string, string | undefined>>;
  credentials?: 'include' | 'same-origin' | 'omit';
  /** Called once on 401; return true if the session was refreshed and the request should be retried. */
  onUnauthorized?: () => Promise<boolean>;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export function toQuery(q?: Query): string {
  if (!q) return '';
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
}

export function newIdempotencyKey(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  async request<T = unknown>(method: string, path: string, body?: unknown, extra: { query?: Query; idempotent?: boolean; idempotencyKey?: string; form?: FormData; retry?: boolean } = {}): Promise<T> {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries((await this.opts.headers?.()) ?? {})) if (v) h[k] = v;
    if (body !== undefined && !extra.form) h['Content-Type'] = 'application/json';
    if (extra.idempotencyKey) h['Idempotency-Key'] = extra.idempotencyKey;
    else if (extra.idempotent) h['Idempotency-Key'] = newIdempotencyKey();
    const res = await fetch(this.opts.baseUrl + path + toQuery(extra.query), {
      method,
      headers: h,
      credentials: this.opts.credentials ?? 'include',
      body: extra.form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (res.status === 401 && extra.retry !== false && this.opts.onUnauthorized && !path.startsWith('/auth/')) {
      if (await this.opts.onUnauthorized()) return this.request<T>(method, path, body, { ...extra, retry: false });
    }
    const text = await res.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const d = (data ?? {}) as { message?: string | string[]; issues?: ApiIssue[] };
      const msg = Array.isArray(d.message) ? d.message.join(', ') : d.message ?? `Request failed (${res.status})`;
      throw new ApiError(res.status, msg, d.issues ?? [], data);
    }
    return data as T;
  }
  get<T = unknown>(path: string, query?: Query) {
    return this.request<T>('GET', path, undefined, { query });
  }
  post<T = unknown>(path: string, body?: unknown, idempotent = false) {
    return this.request<T>('POST', path, body ?? {}, { idempotent });
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body ?? {});
  }
  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body ?? {});
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }
  upload<T = unknown>(path: string, form: FormData) {
    return this.request<T>('POST', path, undefined, { form });
  }
}
