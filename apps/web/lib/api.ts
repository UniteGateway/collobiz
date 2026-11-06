'use client';
import { ApiClient } from '@collabiz/types';

const ORG_KEY = 'cz.activeOrg';

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1];
}
export const getActiveOrg = () => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage.getItem(ORG_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
export const setActiveOrg = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(ORG_KEY, id);
    else window.localStorage.removeItem(ORG_KEY);
  } catch {
    /* storage unavailable (private mode) — fall back to server default org */
  }
};

let refreshing: Promise<boolean> | null = null;

/** Same-origin client: cookies are httpOnly; CSRF double-submit header is attached to every call. */
export const api = new ApiClient({
  baseUrl: '/api/v1',
  credentials: 'same-origin',
  headers: () => ({ 'X-CZ-CSRF': readCookie('cz_csrf'), 'X-Org-Id': getActiveOrg() }),
  onUnauthorized: async () => {
    refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CZ-CSRF': readCookie('cz_csrf') ?? '' }, body: '{}' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
    return refreshing;
  },
});
