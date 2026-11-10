'use client';
import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error { constructor(public status: number, message: string, public issues: { path: string; message: string }[] = []) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new ApiError(r.status, (body as { message?: string })?.message ?? 'Request failed', (body as { issues?: [] })?.issues ?? []);
  return body as T;
}
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T>(); const [error, setError] = useState<string>(); const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return; setLoading(true); setError(undefined);
    try { setData(await api<T>(path)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}
