import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AuthUser, LoginPayload, UserRole } from '../types/auth';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { disableWebPush, syncWebPushSubscription } from '../services/webPushService';
import { clearAllAppCaches } from '../utils/cacheBus';

/** Back-off between /auth/me retries while the server wakes up (about 67 s plus request time). */
/** Longest the startup spinner may show while the server is slow. */
export const BOOTSTRAP_MAX_WAIT_MS = 35_000;
export const BOOTSTRAP_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
        const channel = new BroadcastChannel('reamarc_company_switch');
        channel.postMessage({ type: 'company_switched', companyId });
        channel.close();
      } catch {}

      // Re-apply accent color if present
      try {
        const accent =
          res.user?.company?.accent_color ||
          res.user?.companies?.find((c) => c.id === companyId)?.accent_color;
        if (accent) {
          document.documentElement.style.setProperty('--accent', accent);
        }
      } catch {}

      try {
        const fresh = await authService.getMe();
        setUser(fresh);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for company switch in other tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('reamarc_company_switch');
      channel.onmessage = (event) => {
        if (event.data?.type === 'company_switched') {
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
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

