import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AuthUser, LoginPayload, UserRole } from '../types/auth';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { disableWebPush, syncWebPushSubscription } from '../services/webPushService';
import { clearAllAppCaches } from '../utils/cacheBus';
import { companySlugFromHost } from '../utils/worklaneHost';

/** Back-off between /auth/me retries while the server wakes up (about 67 s plus request time). */
/** Longest the startup spinner may show while the server is slow. */
export const BOOTSTRAP_MAX_WAIT_MS = 35_000;
export const BOOTSTRAP_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

/** Branding shown while a company switch is in flight (taken from user.companies, so it is instant). */
export interface PendingBrand {
  id: string;
  name?: string | null;
  display_name?: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  accent_color?: string | null;
}

/** One id per tab: BroadcastChannel also delivers to other channel objects in the SAME tab. */
export const TAB_ID = `tab_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
export const COMPANY_SWITCH_CHANNEL = 'reamarc_company_switch';

/** True only for a switch announced by a different tab. */
export function isForeignSwitchMessage(data: any, tabId: string = TAB_ID): boolean {
  return data?.type === 'company_switched' && data?.from !== tabId;
}

function preloadImage(url: string | null | undefined, timeoutMs = 1500): Promise<void> {
  if (!url || typeof Image === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    const t = setTimeout(done, timeoutMs);
    img.onload = img.onerror = () => {
      clearTimeout(t);
      done();
    };
    img.src = url;
  });
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pendingBrand: PendingBrand | null;
  role: UserRole;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  updateUser: (updated: Partial<AuthUser> | AuthUser) => void;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Keep login/upload avatar_url when getMe omits the field; honor an explicit null. */
export function keepAvatarUrl<T extends { avatar_url?: string | null }>(
  previous: T | null | undefined,
  next: T,
): T {
  if (next.avatar_url === undefined && previous && previous.avatar_url !== undefined) {
    return { ...next, avatar_url: previous.avatar_url };
  }
  return next;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pendingBrand, setPendingBrand] = useState<PendingBrand | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(() => {
    return localStorage.getItem('reamarc_active_workspace_id') || 'ws-main';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveWorkspaceIdState(id);
    if (id) {
      localStorage.setItem('reamarc_active_workspace_id', id);
      apiClient.setWorkspaceId(id);
    } else {
      localStorage.removeItem('reamarc_active_workspace_id');
      apiClient.setWorkspaceId(null);
    }
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      apiClient.setWorkspaceId(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const clearStaleAuthStorage = useCallback(() => {
    apiClient.setWorkspaceId(null);
    try {
      localStorage.removeItem('reamarc_active_workspace_id');
      sessionStorage.removeItem('reamarc_active_workspace_id');
      localStorage.removeItem('reamarc_selected_workspace_id');
      sessionStorage.removeItem('reamarc_selected_workspace_id');
      localStorage.removeItem('reamarc_impersonation_token');
      sessionStorage.removeItem('reamarc_impersonation_token');
      localStorage.removeItem('reamarc_token');
      sessionStorage.removeItem('reamarc_token');
    } catch {
      // storage blocked: ignore
    }
  }, []);

  const bootstrapRetryingRef = useRef(false);

  const fetchCurrentUser = useCallback(async () => {
    setIsLoading(true);
    // Only a real 401/403 signs the user out. A slow or sleeping server
    // (timeout, network error, 5xx) is retried while the spinner stays up.
    const delays = BOOTSTRAP_RETRY_DELAYS_MS;
    bootstrapRetryingRef.current = true;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const currentUser = await authService.getMe();
          const normalized = currentUser?.impersonating
            ? { ...currentUser, impersonating: false, read_only: false }
            : currentUser;
          setUser((prev) => keepAvatarUrl(prev, normalized));
          return;
        } catch (err) {
          const status = (err as { status?: number } | null)?.status;
          if (status === 401 || status === 403 || attempt >= delays.length) {
            setUser(null);
            if (status === 401 || status === 403) clearStaleAuthStorage();
            return;
          }
          await new Promise((r) => window.setTimeout(r, delays[attempt]));
        }
      }
    } finally {
      bootstrapRetryingRef.current = false;
      setIsLoading(false);
    }
  }, [clearStaleAuthStorage]);

  useEffect(() => {
    apiClient.setOnUnauthorized(() => {
      apiClient.setToken(null);
      setUser(null);
    });

    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    const safety = window.setTimeout(() => {
      if (bootstrapRetryingRef.current) return;
      setIsLoading((still) => (still ? false : still));
    }, 12_000);
    // Hard cap: never spin longer than this. Cookies are kept and retries continue,
    // so the app comes back by itself if the server answers later.
    const cap = window.setTimeout(() => {
      setIsLoading((still) => (still ? false : still));
    }, BOOTSTRAP_MAX_WAIT_MS);
    return () => {
      window.clearTimeout(safety);
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    if (!user?.id || user.role === 'client') return;
    void syncWebPushSubscription();
  }, [user?.id, user?.role]);

  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = user?.id || null;
    if (lastUserIdRef.current && lastUserIdRef.current !== currentId) {
      clearAllAppCaches();
    }
    lastUserIdRef.current = currentId;
  }, [user?.id]);

  const login = async (payload: LoginPayload) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reamarc_impersonation_token');
      sessionStorage.removeItem('reamarc_impersonation_token');
    }
    const res = await authService.login(payload);
    // Session is established via HttpOnly cookies; do not store JWTs in localStorage.
    apiClient.setToken(null);
    const role = res.user?.role;
    const initialView = role === 'client' ? 'marketing' : 'dashboard';
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reamarc_impersonation_token');
      sessionStorage.removeItem('reamarc_impersonation_token');
      localStorage.setItem('reamarc_active_view', initialView);
      window.history.replaceState(null, '', `/${initialView}`);
    }
    // Cookie domain moved to vercel.app with the same-origin rewrite — one fresh
    // login is required. Keep the login payload even if a parallel 401 refresh
    // races, so the screen does not bounce back to the form.
    setUser(res.user);
    try {
      const currentUser = await authService.getMe();
      setUser((prev) => keepAvatarUrl(prev, currentUser));
    } catch {
      setUser(res.user);
    }
    setIsLoading(false);
    closeAuthModal();
  };

  const logout = async () => {
    if (user && user.role !== 'client') {
      await disableWebPush();
    }
    try {
      await authService.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      clearAllAppCaches();
      apiClient.setToken(null);
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('reamarc_token');
        localStorage.removeItem('reamarc_impersonation_token');
      sessionStorage.removeItem('reamarc_impersonation_token');
        localStorage.removeItem('reamarc_active_view');
        localStorage.removeItem('reamarc_last_brand');
        window.history.replaceState(null, '', '/');
      }
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authService.getMe();
      setUser((prev) => keepAvatarUrl(prev, currentUser));
    } catch {
      // Keep existing session if a background refresh fails
    }
  }, []);

  const updateUser = useCallback((updated: Partial<AuthUser> | AuthUser) => {
    setUser((prev) => (prev ? { ...prev, ...updated } : (updated as AuthUser)));
  }, []);

  const switchCompany = useCallback(async (companyId: string) => {
    const target = userRef.current?.companies?.find((c) => c.id === companyId);
    setPendingBrand(target ? { ...target, id: companyId } : { id: companyId });
    setIsLoading(true);
    try {
      const res = await authService.switchCompany(companyId);
      clearAllAppCaches();

      if (typeof window !== 'undefined') {
        try {
          const toRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
              key &&
              (key.startsWith('cache_') ||
                key.startsWith('cc_') ||
                key.startsWith('dash_') ||
                key.startsWith('reamarc_cache_'))
            ) {
              toRemove.push(key);
            }
          }
          toRemove.forEach((k) => localStorage.removeItem(k));
          localStorage.setItem('reamarc_active_view', 'dashboard');
          window.history.replaceState(null, '', '/dashboard');
        } catch {}
      }

      setUser(res.user);

      // Notify other tabs to reload
      try {
        const channel = new BroadcastChannel(COMPANY_SWITCH_CHANNEL);
        channel.postMessage({ type: 'company_switched', companyId, from: TAB_ID });
        channel.close();
      } catch {}

      let finalUser: AuthUser | null = res.user;
      try {
        const fresh = await authService.getMe();
        setUser(fresh);
        finalUser = fresh;
      } catch {}
      // Hold the overlay until the new logo is in the browser cache, so the sidebar never flashes a fallback.
      await preloadImage(finalUser?.company?.logo_url);
    } finally {
      setIsLoading(false);
      setPendingBrand(null);
    }
  }, []);

  // Listen for company switch in other tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(COMPANY_SWITCH_CHANNEL);
      channel.onmessage = (event) => {
        // Ignore our own announcement; reloading here caused the default-logo flash after a switch.
        if (isForeignSwitchMessage(event.data)) {
          clearAllAppCaches();
          window.location.reload();
        }
      };
    } catch {}
    return () => {
      try {
        channel?.close();
      } catch {}
    };
  }, []);

  // Auto-switch on URL ?switch=<companyId>
  useEffect(() => {
    if (!user) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetCompany = params.get('switch');
      if (targetCompany && targetCompany !== user.company_id) {
        params.delete('switch');
        const newSearch = params.toString();
        const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
        window.history.replaceState(null, '', newUrl);
        void switchCompany(targetCompany);
      }
    } catch {}
  }, [user?.company_id, switchCompany]);

  // Auto-switch when the host is <slug>.oneworklane.com and the user is a member.
  // Non-members keep their current company (company picker still works). Never trust the
  // subdomain alone — membership comes from the server-provided companies list.
  useEffect(() => {
    if (!user) return;
    try {
      const slug = companySlugFromHost(window.location.hostname);
      if (!slug) return;
      const list = user.companies || [];
      const match = list.find((c) => (c.slug || '').toLowerCase() === slug);
      if (!match?.id) return;
      if (match.id === user.company_id) return;
      void switchCompany(match.id);
    } catch {}
  }, [user?.company_id, user?.companies, switchCompany]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        pendingBrand,
        role: user?.role || 'team_member',
        activeWorkspaceId,
        setActiveWorkspaceId,
        login,
        logout,
        refreshUser,
        switchCompany,
        updateUser,
        openAuthModal,
        closeAuthModal,
        isAuthModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

