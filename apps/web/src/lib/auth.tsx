import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { Role } from '@brightloop/shared';
import { api, ApiError, post } from './api';

export interface Me { id: string; role: Role; name: string; email: string; customerId: string | null }

interface AuthCtx { me: Me | null; loading: boolean; refresh: () => Promise<unknown>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ me: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me').catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const logout = async () => {
    await post('/auth/logout').catch(() => {});
    // Drop cached portal data so the next person on this device sees nothing.
    if ('caches' in window) await caches.delete('bl-api-v1').catch(() => {});
    qc.clear();
    qc.setQueryData(['me'], null);
  };
  return <Ctx.Provider value={{ me: q.data ?? null, loading: q.isLoading, refresh: () => q.refetch(), logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const isStaff = (me: Me | null) => me?.role === 'ADMIN' || me?.role === 'STAFF';
export const isAdmin = (me: Me | null) => me?.role === 'ADMIN';
