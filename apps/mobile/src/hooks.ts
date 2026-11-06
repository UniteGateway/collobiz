import { useCallback, useEffect, useState } from 'react';
import { ApiError, type Query } from '@collabiz/types';
import { api } from './api';

export function useApi<T = any>(path: string | null, query?: Query) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(!!path);
  const key = path ? path + JSON.stringify(query ?? {}) : null;
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(undefined);
    try { setData(await api.get<T>(path, query)); } catch (e) { setError(e); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

/** Wraps a mutation with busy/error/field-error state for native forms. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = async (...a: A) => {
    setBusy(true); setError(null); setFieldErrors({});
    try { return await fn(...a); } catch (e) {
      if (e instanceof ApiError) { setError(e.message); setFieldErrors(e.fieldErrors()); } else setError(e instanceof Error ? e.message : 'Network error');
      return undefined;
    } finally { setBusy(false); }
  };
  return { run, busy, error, fieldErrors };
}

export const ONBOARDING_STEPS = [
  { step: 'account_type', route: '/onboarding/account-type', label: 'Account type' },
  { step: 'details', route: '/onboarding/details', label: 'Details' },
  { step: 'industries', route: '/onboarding/industries', label: 'Industries & skills' },
  { step: 'coverage', route: '/onboarding/coverage', label: 'Coverage' },
  { step: 'profile', route: '/onboarding/profile', label: 'Business profile' },
  { step: 'documents', route: '/onboarding/kyc', label: 'KYC / KYB documents' },
  { step: 'bank_tax', route: '/onboarding/bank-tax', label: 'Bank & tax' },
  { step: 'agreements', route: '/onboarding/agreements', label: 'Agreements' },
] as const;
export const nextRoute = (step: string) => {
  const i = ONBOARDING_STEPS.findIndex((s) => s.step === step);
  return (ONBOARDING_STEPS[i + 1]?.route ?? '/onboarding/status') as any;
};
export const toMinor = (r: string) => (r.trim() === '' ? undefined : Math.round(Number(r.replace(/,/g, '')) * 100));
