import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

let mockAuthUser: any = { role: 'admin', company_modules: ['sales', 'active_clients'] };

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}));

const baseDataViz = {
  open: true,
  onOpenChange: vi.fn(),
  currentView: 'crm' as const,
  onSelectView: vi.fn(),
  themePreference: 'system' as const,
  onSelectThemePreference: vi.fn(),
  isSidebarCollapsed: false,
  onToggleSidebar: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onSignOut: vi.fn(),
  canSeeDashboard: false,
  canSeeActiveClients: true,
  canSeeCrm: true,
  canSeeWonDealApprovals: true,
  canSeeTasks: false,
  canSeeMarketing: false,
  canSeeContentCalendar: false,
  canSeeWebsitePipeline: false,
  canSeeAttendance: false,
  canSeeDailyLog: false,
  canSeeExceptions: false,
  canSeeAdmin: true,
  adminLabel: 'Admin panel',
  isManagementRole: true,
  isClient: false,
  isAdmin: true,
};

const baseReamarc = {
  open: true,
  onOpenChange: vi.fn(),
  currentView: 'dashboard' as const,
  onSelectView: vi.fn(),
  themePreference: 'system' as const,
  onSelectThemePreference: vi.fn(),
  isSidebarCollapsed: false,
  onToggleSidebar: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onSignOut: vi.fn(),
  canSeeDashboard: true,
  canSeeActiveClients: true,
  canSeeCrm: true,
  canSeeWonDealApprovals: true,
  canSeeTasks: true,
  canSeeMarketing: true,
  canSeeFinance: true,
  canSeeContentCalendar: true,
  canSeeWebsitePipeline: true,
  canSeeAttendance: true,
  canSeeDailyLog: true,
  canSeeExceptions: true,
  canSeeAdmin: true,
  adminLabel: 'Admin panel',
  isManagementRole: true,
  isClient: false,
  isAdmin: true,
};

describe('CommandPalette company modules', () => {
  it('hides Dashboard and Tasks when flags are off', () => {
    mockAuthUser = { role: 'admin', company_modules: ['sales', 'active_clients'] };
    render(<CommandPalette {...baseDataViz} />);
    const input = screen.getByPlaceholderText(/Search pages and actions/i);
    fireEvent.change(input, { target: { value: 'Dashboard' } });
    expect(screen.queryByRole('option', { name: /Dashboard/i })).toBeNull();
    fireEvent.change(input, { target: { value: 'Tasks' } });
    expect(screen.queryByRole('option', { name: /^Tasks$/i })).toBeNull();
  });

  it('DataViz admin palette does NOT list Log variance', () => {
    mockAuthUser = { role: 'admin', company_modules: ['sales', 'active_clients'] };
    render(<CommandPalette {...baseDataViz} />);
    const items = screen.getAllByRole('option').map((el) => el.textContent?.trim());
    expect(items.some((text) => text?.includes('Log variance'))).toBe(false);
  });

  it('Reamarc admin palette lists Log variance and matches base items', () => {
    mockAuthUser = { role: 'admin' };
    render(<CommandPalette {...baseReamarc} />);
    const items = screen.getAllByRole('option').map((el) => el.textContent?.trim());
    expect(items.some((text) => text?.includes('Log variance'))).toBe(true);
    expect(items).toContain('Admin: Log variance');
    expect(items).toContain('Admin: Team directory');
    expect(items).toContain('Admin: Client workspaces');
  });
});
