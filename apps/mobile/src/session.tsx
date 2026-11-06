import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokens } from './api';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  activeOrg: { id: string; type: string; name: string; verificationStatus: string; membershipLevel: string } | null;
  orgRoles: string[];
  platformRoles: string[];
  capabilities: string[];
  memberships: { organizationId: string; role: string; orgName: string; orgType: string }[];
}

interface Session {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string, mfaCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<Session>({ me: null, loading: true, signIn: async () => {}, signOut: async () => {}, refresh: async () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      if (!(await tokens.get())) return setMe(null);
      const m = await api.get<Me>('/auth/me');
      setMe(m);
      if (m.activeOrg) await tokens.setOrg(m.activeOrg.id);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const signIn = useCallback(async (email: string, password: string, mfaCode?: string) => {
    const r = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', { email, password, mfaCode, client: 'mobile' });
    await tokens.set(r.accessToken, r.refreshToken);
    await refresh();
  }, [refresh]);
  const signOut = useCallback(async () => {
    const rt = await tokens.refresh();
    await api.post('/auth/logout', { refreshToken: rt ?? undefined }).catch(() => undefined);
    await tokens.set(null, null);
    await tokens.setOrg(null);
    setMe(null);
  }, []);
  return <Ctx.Provider value={{ me, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
export const useSession = () => useContext(Ctx);
