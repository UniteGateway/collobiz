'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type Query } from '@collabiz/types';
import { api } from './api';

export interface QueryState<T> { data: T | undefined; error: unknown; loading: boolean; reload: () => void; setData: (d: T) => void }

/** Minimal data hook: loading / error / data with reload. Pass null path to skip. */
export function useQuery<T = any>(path: string | null, query?: Query): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(!!path);
  const [n, setN] = useState(0);
  const key = path ? path + JSON.stringify(query ?? {}) : null;
  // The key whose request last settled: a path that just became non-null reports loading on its very first render.
  const [settled, setSettled] = useState<string | null>(null);
  const qRef = useRef(query);
  qRef.current = query;
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(undefined);
    api.get<T>(path, qRef.current)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e))
      .finally(() => {
        if (!live) return;
        setLoading(false);
        setSettled(key);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  return { data, error, loading: loading || (!!key && settled !== key), reload: useCallback(() => setN((x) => x + 1), []), setData };
}

/** Mutation helper with field-level validation errors from the shared Zod schemas. */
export function useMutation<TArgs extends unknown[], TRes>(fn: (...a: TArgs) => Promise<TRes>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [data, setData] = useState<TRes>();
  const run = useCallback(async (...a: TArgs): Promise<TRes | undefined> => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await fn(...a);
      setData(r);
      return r;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors());
      } else setError(e instanceof Error ? e.message : 'Unexpected error');
      return undefined;
    } finally {
      setPending(false);
    }
  }, [fn]);
  return { run, pending, error, fieldErrors, setError, data };
}

export const isForbidden = (e: unknown) => e instanceof ApiError && e.status === 403;
export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;
