'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '@collabiz/types';
import { api, getActiveOrg, setActiveOrg } from './api';

export interface Membership { organizationId: string; role: string; orgType: string; orgName: string }
export interface Me {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  mfaRequired: boolean;
  activeOrg: { id: string; type: string; name: string; verificationStatus: string; membershipLevel: string } | null;
  orgRoles: string[];
  platformRoles: string[];
  capabilities: string[];
  memberships: Membership[];
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (id: string) => Promise<void>;
  can: (cap: string) => boolean;
}
const Ctx = createContext<SessionValue>({ me: null, loading: true, refresh: async () => {}, logout: async () => {}, switchOrg: async () => {}, can: () => false });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>('/auth/me');
      setMe(m);
      if (m.activeOrg && getActiveOrg() !== m.activeOrg.id) setActiveOrg(m.activeOrg.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && getActiveOrg()) {
        setActiveOrg(null); // stale org selection — retry with server default
        return refresh();
      }
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setActiveOrg(null);
    setMe(null);
    window.location.href = '/login';
  }, []);
  const switchOrg = useCallback(async (id: string) => {
    setActiveOrg(id);
    await refresh();
  }, [refresh]);
  const can = useCallback((cap: string) => !!me?.capabilities.includes(cap), [me]);
  return <Ctx.Provider value={{ me, loading, refresh, logout, switchOrg, can }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
