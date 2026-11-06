import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiClient } from '@collabiz/types';

/** Base URL: EXPO_PUBLIC_API_URL (use your machine's LAN IP on a physical device; 10.0.2.2 on Android emulator). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

const K = { access: 'cz.access', refresh: 'cz.refresh', org: 'cz.org' };
const mem: Record<string, string | null> = {};

/** SecureStore on device (Keychain / Keystore); in-memory fallback on web preview. */
async function read(k: string) {
  if (Platform.OS === 'web') return mem[k] ?? null;
  return SecureStore.getItemAsync(k);
}
async function write(k: string, v: string | null) {
  if (Platform.OS === 'web') {
    mem[k] = v;
    return;
  }
  if (v == null) await SecureStore.deleteItemAsync(k);
  else await SecureStore.setItemAsync(k, v);
}

export const tokens = {
  get: () => read(K.access),
  set: async (access: string | null, refresh: string | null) => {
    await write(K.access, access);
    await write(K.refresh, refresh);
  },
  refresh: () => read(K.refresh),
  org: () => read(K.org),
  setOrg: (id: string | null) => write(K.org, id),
};

export const api = new ApiClient({
  baseUrl: `${API_URL}/v1`,
  credentials: 'omit',
  headers: async () => {
    const [t, org] = await Promise.all([tokens.get(), tokens.org()]);
    return { Authorization: t ? `Bearer ${t}` : undefined, 'X-Org-Id': org ?? undefined };
  },
  onUnauthorized: async () => {
    const rt = await tokens.refresh();
    if (!rt) return false;
    try {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (!res.ok) return false;
      const j = await res.json();
      await tokens.set(j.accessToken, j.refreshToken);
      return true;
    } catch {
      return false;
    }
  },
});
