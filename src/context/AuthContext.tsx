import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser, LoginPayload, RegisterPayload, UserRole } from '../types/auth';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const fetchCurrentUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await authService.getMe();
      setUser(currentUser);
      const wsList = currentUser.workspace_ids || currentUser.workspaceIds || [];
      if (wsList.length > 0 && (!activeWorkspaceId || !wsList.includes(activeWorkspaceId))) {
        if (currentUser.role !== 'admin') {
          setActiveWorkspaceId(wsList[0]);
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, setActiveWorkspaceId]);

  useEffect(() => {
    apiClient.setOnUnauthorized(() => {
      apiClient.setToken(null);
      setUser(null);
    });

    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (payload: LoginPayload) => {
    const res = await authService.login(payload);
    if (res.access_token) {
      apiClient.setToken(res.access_token);
    }
    setUser(res.user);
    const wsList = res.user.workspace_ids || res.user.workspaceIds || [];
    if (wsList.length > 0) {
      setActiveWorkspaceId(wsList[0]);
    }
    closeAuthModal();
  };

  const register = async (payload: RegisterPayload) => {
    const res = await authService.register(payload);
    if (res.access_token) {
      apiClient.setToken(res.access_token);
    }
    setUser(res.user);
    closeAuthModal();
  };

  const logout = async () => {
    await authService.logout();
    apiClient.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        role: user?.role || 'editor',
        activeWorkspaceId,
        setActiveWorkspaceId,
        login,
        register,
        logout,
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
