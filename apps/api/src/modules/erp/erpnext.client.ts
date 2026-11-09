/**
 * Minimal ERPNext / Frappe REST client (token auth). Used only by the ERP data source; never exposes the secret.
 * Frappe REST: GET/POST /api/resource/:doctype, GET/PUT /api/resource/:doctype/:name, POST /api/method/:path; responses are { data } or { message }.
 */
export class ErpnextError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export type Filter = [string, string, unknown];

export class ErpnextClient {
  constructor(private base: string, private key: string, private secret: string, private timeoutMs = 10_000, private fetchImpl: typeof fetch = fetch) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const r = await this.fetchImpl(`${this.base.replace(/\/$/, '')}${path}`, {
        method, signal: ctl.signal,
        headers: { Authorization: `token ${this.key}:${this.secret}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      const json = text ? JSON.parse(text) : {};
      if (!r.ok) {
        const msg = (() => { try { return JSON.parse(JSON.parse(json._server_messages ?? '[]')[0] ?? '{}').message; } catch { return undefined; } })() ?? json.exception ?? json.exc_type ?? `ERPNext returned ${r.status}`;
        throw new ErpnextError(String(msg).replace(/<[^>]+>/g, '').slice(0, 300), r.status);
      }
      return (json.data ?? json.message) as T;
    } catch (e) {
      if (e instanceof ErpnextError) throw e;
      throw new ErpnextError((e as Error).name === 'AbortError' ? 'ERPNext did not answer in time' : 'ERPNext is unreachable', 503);
    } finally { clearTimeout(timer); }
  }

  list<T>(doctype: string, o: { fields: string[]; filters?: Filter[]; orderBy?: string; limit?: number }) {
    const q = new URLSearchParams({ fields: JSON.stringify(o.fields), filters: JSON.stringify(o.filters ?? []), limit_page_length: String(o.limit ?? 500), ...(o.orderBy ? { order_by: o.orderBy } : {}) });
    return this.req<T[]>('GET', `/api/resource/${encodeURIComponent(doctype)}?${q}`);
  }
  get<T>(doctype: string, name: string) { return this.req<T>('GET', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`); }
  insert<T>(doctype: string, doc: Record<string, unknown>) { return this.req<T>('POST', `/api/resource/${encodeURIComponent(doctype)}`, doc); }
  update<T>(doctype: string, name: string, patch: Record<string, unknown>) { return this.req<T>('PUT', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, patch); }
  submit<T>(doc: Record<string, unknown>) { return this.req<T>('POST', '/api/method/frappe.client.submit', { doc }); }
}
