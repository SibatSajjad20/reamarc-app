import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';

const authState = vi.hoisted(() => ({
  isLoading: true,
  user: null as null | { id: string },
  pendingBrand: null as null | { display_name: string },
}));

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: authState.user,
    logout: vi.fn(),
    setActiveWorkspaceId: vi.fn(),
    isLoading: authState.isLoading,
    pendingBrand: authState.pendingBrand,
  }),
}));

vi.mock('./context/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('./context/BrandingProvider', () => ({
  BrandingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./context/ModuleLoadGate', () => ({
  ModuleLoadGateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useModuleLoadBlocked: () => false,
}));

vi.mock('./components/layout/BreadcrumbContext', () => ({
  BreadcrumbProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ workspaces: [], loading: false }) }));
vi.mock('./hooks/useAdAccounts', () => ({ useAdAccounts: () => ({ accounts: [] }) }));
vi.mock('./hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => false,
    canAccessAttendance: false,
    canAccessDailyLog: false,
    canSeeWonDealApprovals: false,
    isViewOnly: false,
  }),
}));
vi.mock('./utils/bootSplash', () => ({ removeBootSplash: vi.fn() }));
vi.mock('./components/auth/AuthScreen', () => ({ AuthScreen: () => <div data-testid="auth-screen" /> }));
vi.mock('./components/ui/LoadingScreen', () => ({
  LoadingScreen: (props: { message?: string }) => (
    <div data-testid="fullscreen-loader">{props.message || ''}</div>
  ),
}));

import App from './App';

describe('App first-boot loader', () => {
  beforeEach(() => {
    authState.isLoading = true;
    authState.user = null;
    authState.pendingBrand = null;
  });

  it('does not mount React fullscreen loader during auth bootstrap (HTML splash only)', () => {
    render(<App />);
    expect(screen.queryByTestId('fullscreen-loader')).toBeNull();
    expect(screen.queryByTestId('auth-screen')).toBeNull();
  });

  it('shows React loader when switching companies', () => {
    authState.pendingBrand = { display_name: 'DataViz' };
    render(<App />);
    expect(screen.getByTestId('fullscreen-loader')).toBeTruthy();
    expect(screen.getByTestId('fullscreen-loader').textContent).toMatch(/DataViz/);
  });
});
