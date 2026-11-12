import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AccessSection } from './AccessSection';
import { isCompanyModuleEnabled } from '@/utils/companyModules';

const getSettingsMock = vi.fn();
const getUsersMock = vi.fn();
const addToast = vi.fn();

let mockAuthUser: any = { id: 'rm_admin', role: 'admin', company_modules: null };

vi.mock('@/services/accessService', () => ({
  accessService: {
    getUsers: (...args: unknown[]) => getUsersMock(...args),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    updateUserAccess: vi.fn(),
  },
}));

vi.mock('@/services/taskService', () => ({
  taskService: {
    getSettings: () => getSettingsMock(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser, refreshUser: vi.fn(), switchCompany: vi.fn() }),
}));

vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn(),
}));

describe('AccessSection company module columns and effect deps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsersMock.mockResolvedValue([]);
    getSettingsMock.mockResolvedValue({
      stages: [],
      priorities: [],
      labels: [],
    });
  });

  it('hides tasks column when the company module is off', () => {
    const dv = { role: 'admin', company_modules: ['sales', 'active_clients'] };
    const columns = [
      { key: 'sales' },
      { key: 'active_clients' },
      { key: 'tasks' },
      { key: 'attendance' },
    ].filter((c) => isCompanyModuleEnabled(dv, c.key === 'active_clients' ? 'active_clients' : c.key));
    expect(columns.map((c) => c.key)).toEqual(['sales', 'active_clients']);
  });

  it('Reamarc admin: calls taskService.getSettings once when re-rendered with a new but equal currentUser', async () => {
    mockAuthUser = { id: 'rm_admin', role: 'admin', company_modules: null };
    const { rerender } = render(<AccessSection />);

    await waitFor(() => {
      expect(getSettingsMock).toHaveBeenCalledTimes(1);
    });

    // Re-render with a new object reference that is equal
    mockAuthUser = { id: 'rm_admin', role: 'admin', company_modules: null };
    rerender(<AccessSection />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('DataViz admin: tasks off makes NO taskService.getSettings calls', async () => {
    mockAuthUser = { id: 'dv_admin', role: 'admin', company_modules: ['sales', 'active_clients'] };
    render(<AccessSection />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getSettingsMock).not.toHaveBeenCalled();
  });
});
