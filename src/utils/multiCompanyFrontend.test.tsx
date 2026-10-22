import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { EditMemberModal } from '../components/admin/EditMemberModal';
import { UserManagementSection } from '../components/admin/sections/UserManagementSection';
import { Sidebar } from '../components/Sidebar';
import { DashboardView } from '../components/views/DashboardView';
import type { AdminMember, UpdateMemberPayload } from '../types/admin';
import type { AuthUser } from '../types/auth';

// Polyfill ResizeObserver and PointerEvent for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
}

if (typeof window !== 'undefined') {
  if (!window.PointerEvent) {
    (window as any).PointerEvent = class extends MouseEvent {};
  }
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

// Mock contexts and hooks
const mockUser: AuthUser = {
  id: 'usr_admin',
  email: 'admin@acme.com',
  name: 'Admin User',
  role: 'admin',
  company_id: 'comp_acme',
  company: {
    id: 'comp_acme',
    name: 'Acme Media',
    slug: 'acme',
  },
};

let currentUserState: AuthUser = { ...mockUser };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: currentUserState,
    role: currentUserState.role,
    isAuthenticated: true,
    isLoading: false,
    switchCompany: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    canAccessCrm: true,
    canAccessContentCalendar: true,
    canAccessWebsitePipeline: true,
    canAccessAds: true,
    canSeeWonDealApprovals: false,
    isAttendanceTracked: true,
    isDailyLogTracked: true,
  }),
}));

vi.mock('../services/attendanceService', () => ({
  attendanceService: {
    getTodayStatus: vi.fn().mockResolvedValue({}),
    getMyTimesheet: vi.fn().mockResolvedValue({ records: [] }),
    getCalendarMonth: vi.fn().mockResolvedValue({ events: [], holidays: [] }),
    getMyWorkingOverrides: vi.fn().mockResolvedValue([]),
    exportAttendanceExcel: vi.fn(),
  },
}));

vi.mock('../services/dailyLogService', () => ({
  dailyLogService: {
    getEntries: vi.fn().mockResolvedValue([]),
    getDayTarget: vi.fn().mockResolvedValue(null),
    getAllEntries: vi.fn().mockResolvedValue([]),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('Multi-Company Phase 2 Frontend Verification', () => {
  beforeEach(() => {
    currentUserState = { ...mockUser };
    vi.clearAllMocks();
  });

  describe('R2: EditMemberModal & Team Directory for login_managed_elsewhere', () => {
    const managedMember: AdminMember = {
      id: 'usr_managed',
      email: 'managed@other.test',
      full_name: 'Managed User',
      phone: '+923001234567',
      role: 'team_member',
      department: 'Website',
      departments: ['Website'],
      is_active: true,
      login_managed_elsewhere: true,
    };

    const homeMember: AdminMember = {
      id: 'usr_home',
      email: 'home@acme.com',
      full_name: 'Home User',
      phone: '+923007654321',
      role: 'team_member',
      department: 'Website',
      departments: ['Website'],
      is_active: true,
      login_managed_elsewhere: false,
    };

    it('managed member: hides Account status switch, displays read-only name/phone, removes reset button, and excludes is_active in payload', async () => {
      let submittedPayload: UpdateMemberPayload | null = null;
      const onSubmit = vi.fn().mockImplementation(async (_id, payload) => {
        submittedPayload = payload;
      });

      renderWithProviders(
        <EditMemberModal
          isOpen={true}
          member={managedMember}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      // 1. Account status switch must be hidden
      expect(screen.queryByText('Account status')).toBeNull();

      // 2. Name and phone are read-only (not inputs)
      expect(screen.queryByRole('textbox', { name: /Full name/i })).toBeNull();
      expect(screen.getByText('Managed User')).toBeDefined();
      expect(screen.queryByRole('textbox', { name: /Phone/i })).toBeNull();

      // 3. Reset password button is removed, and explanatory text is present
      expect(screen.queryByRole('button', { name: /Send reset link/i })).toBeNull();
      expect(screen.getByText("This person manages their own login.")).toBeDefined();

      // 4. Submit form
      const saveBtn = screen.getByRole('button', { name: /Save changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });

      // 5. Payload MUST NOT include is_active
      expect(submittedPayload).toBeDefined();
      expect((submittedPayload as any).is_active).toBeUndefined();
    });

    it('home member: shows Account status switch, editable inputs, and includes is_active in payload', async () => {
      let submittedPayload: UpdateMemberPayload | null = null;
      const onSubmit = vi.fn().mockImplementation(async (_id, payload) => {
        submittedPayload = payload;
      });

      renderWithProviders(
        <EditMemberModal
          isOpen={true}
          member={homeMember}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      // Account status switch is present
      expect(screen.getByText('Account status')).toBeDefined();

      // Name is editable input
      const nameInput = screen.getByDisplayValue('Home User');
      expect(nameInput).toBeDefined();

      // Submit form
      const saveBtn = screen.getByRole('button', { name: /Save changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });

      expect(submittedPayload).toBeDefined();
      expect((submittedPayload as any).is_active).toBe(true);
    });

    it('UserManagementSection row menu shows "Remove from company" for managed member and "Deactivate member" for home member', async () => {
      const { rerender } = renderWithProviders(
        <UserManagementSection
          members={[managedMember]}
          isLoading={false}
          onAddMember={vi.fn()}
          onEditMember={vi.fn()}
          onDeleteMember={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );

      // Managed member menu trigger
      const managedBtn = screen.getByLabelText(/Actions for Managed User/i);
      fireEvent.pointerDown(managedBtn, { button: 0 });
      fireEvent.click(managedBtn);

      await waitFor(() => {
        expect(screen.getByText('Remove from company')).toBeDefined();
      });
      expect(screen.queryByText('Deactivate member')).toBeNull();

      // Home member menu trigger
      rerender(
        <TooltipProvider>
          <UserManagementSection
            members={[homeMember]}
            isLoading={false}
            onAddMember={vi.fn()}
            onEditMember={vi.fn()}
            onDeleteMember={vi.fn()}
            onToggleStatus={vi.fn()}
          />
        </TooltipProvider>
      );
      const homeBtn = screen.getByLabelText(/Actions for Home User/i);
      fireEvent.pointerDown(homeBtn, { button: 0 });
      fireEvent.click(homeBtn);

      await waitFor(() => {
        expect(screen.getByText('Deactivate member')).toBeDefined();
      });
      expect(screen.queryByText('Remove from company')).toBeNull();
    });
  });

  describe('R10: needs_setup=true behavior', () => {
    it('shows only Dashboard and hides Active clients in Sidebar, renders setup card, and avoids timesheet/dailyLog calls', async () => {
      currentUserState = {
        ...mockUser,
        role: 'team_member',
        needs_setup: true,
        effective_access: {
          attendance: false,
          daily_log: false,
          sales: false,
          content_calendar: false,
          website: false,
          ads: false,
        },
      };

      const { attendanceService } = await import('../services/attendanceService');
      const { dailyLogService } = await import('../services/dailyLogService');

      // 1. Sidebar check
      renderWithProviders(
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      );

      expect(screen.getByText('Dashboard')).toBeDefined();
      expect(screen.queryByText('Active clients')).toBeNull();
      expect(screen.queryByText('Daily log')).toBeNull();
      expect(screen.queryByText('Attendance')).toBeNull();

      // 2. DashboardView check
      renderWithProviders(
        <DashboardView
          onNavigateView={vi.fn()}
        />
      );

      // Shows card "Your admin is setting up your access in Acme Media."
      expect(screen.getByText(/Your admin is setting up your access in Acme Media\./i)).toBeDefined();

      // Does not call timesheet or dailyLog entries
      expect(attendanceService.getMyTimesheet).not.toHaveBeenCalled();
      expect(dailyLogService.getEntries).not.toHaveBeenCalled();
    });
  });

  describe('L1: Non-Reamarc company branding isolation', () => {
    it('directory and sidebar contain active company name and zero occurrences of "Reamarc"', () => {
      currentUserState = {
        ...mockUser,
        company: {
          id: 'comp_acme',
          name: 'Acme Media',
          slug: 'acme',
        },
      };

      // 1. Check UserManagementSection
      const { container: dirContainer } = renderWithProviders(
        <UserManagementSection
          members={[]}
          isLoading={false}
          onAddMember={vi.fn()}
          onEditMember={vi.fn()}
          onDeleteMember={vi.fn()}
        />
      );

      expect(dirContainer.textContent).toContain('Acme Media');
      expect(dirContainer.textContent).not.toContain('Reamarc');

      // 2. Check Sidebar
      const { container: sidebarContainer } = renderWithProviders(
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      );

      expect(sidebarContainer.textContent).toContain('Acme Media');
      expect(sidebarContainer.textContent).not.toContain('Reamarc');
    });
  });

  describe('admin attendance and daily log visibility', () => {
    it('shows Attendance and Daily log when effective_access has both false', () => {
      currentUserState = {
        ...mockUser,
        role: 'admin',
        effective_access: {
          attendance: false,
          daily_log: false,
        },
      };

      renderWithProviders(
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      );

      expect(screen.getByText('Attendance')).toBeDefined();
      expect(screen.getByText('Daily log')).toBeDefined();
    });
  });

  describe('company switcher for 2+ memberships', () => {
    it('renders the switcher listing both companies', async () => {
      currentUserState = {
        ...mockUser,
        role: 'admin',
        company_id: 'comp_reamarc',
        company: {
          id: 'comp_reamarc',
          name: 'Reamarc',
          slug: 'reamarc',
          accent_color: '#6847E0',
        },
        companies: [
          { id: 'comp_reamarc', name: 'Reamarc', role: 'admin', accent_color: '#6847E0' },
          { id: 'comp_dataviz', name: 'DataViz', role: 'admin', accent_color: '#00AA66' },
        ],
      };

      renderWithProviders(
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      );

      const trigger = screen.getByRole('button', { name: /Reamarc/i });
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('DataViz')).toBeDefined();
      });
      expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    });
  });
});
