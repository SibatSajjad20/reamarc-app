import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CompanyDetailSheet } from './CompanyDetailSheet';
import { COMPANY_MODULE_KEYS } from '@/utils/companyModules';

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const confirmMock = vi.fn();
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => confirmMock,
}));

const getCompany = vi.fn();
const getCompanyModules = vi.fn();
const setCompanyModules = vi.fn();

vi.mock('@/services/ownerService', () => ({
  ownerService: {
    getCompany: (...a: unknown[]) => getCompany(...a),
    getCompanyModules: (...a: unknown[]) => getCompanyModules(...a),
    setCompanyModules: (...a: unknown[]) => setCompanyModules(...a),
    getMembers: async () => [],
  },
}));

describe('CompanyDetailSheet Modules card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompany.mockResolvedValue({
      id: 'cm_test_dataviz',
      name: 'DataViz Test',
      slug: 'cm-test-dataviz',
      status: 'active',
      timezone: 'Asia/Karachi',
    });
    getCompanyModules.mockResolvedValue({
      company_id: 'cm_test_dataviz',
      enabled_modules: ['sales', 'active_clients'],
      all_modules: ['dashboard', 'sales', 'active_clients', 'tasks'],
      is_default: false,
    });
    setCompanyModules.mockResolvedValue({
      company_id: 'cm_test_dataviz',
      enabled_modules: [...COMPANY_MODULE_KEYS],
      is_default: true,
    });
  });

  it('shows Modules switches and the 90-second callout', async () => {
    render(
      <CompanyDetailSheet
        companyId="cm_test_dataviz"
        isOpen
        onClose={vi.fn()}
        onOpenBranding={vi.fn()}
        onSignEveryoneOut={vi.fn()}
        onTogglePause={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Modules')).toBeTruthy());
    expect(screen.getByText('Sales pipeline')).toBeTruthy();
    expect(screen.getByText('Active clients')).toBeTruthy();
    expect(screen.getByText(/Changes apply within about 90 seconds/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeTruthy();
  });

  it('Reset to default: cancels without calling setCompanyModules', async () => {
    confirmMock.mockResolvedValue(false);
    render(
      <CompanyDetailSheet
        companyId="cm_test_dataviz"
        isOpen
        onClose={vi.fn()}
        onOpenBranding={vi.fn()}
        onSignEveryoneOut={vi.fn()}
        onTogglePause={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset to default' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Turn on all modules?',
        description: expect.stringContaining('Reset to default turns ON every module'),
        confirmLabel: 'Turn on all modules',
        tone: 'danger',
      }),
    );
    expect(setCompanyModules).not.toHaveBeenCalled();
  });

  it('Reset to default: confirms and calls setCompanyModules with all keys', async () => {
    confirmMock.mockResolvedValue(true);
    render(
      <CompanyDetailSheet
        companyId="cm_test_dataviz"
        isOpen
        onClose={vi.fn()}
        onOpenBranding={vi.fn()}
        onSignEveryoneOut={vi.fn()}
        onTogglePause={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset to default' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(setCompanyModules).toHaveBeenCalledTimes(1);
    });
    expect(setCompanyModules).toHaveBeenCalledWith('cm_test_dataviz', [...COMPANY_MODULE_KEYS]);
  });

  it('Save button saves draft without confirm prompt', async () => {
    render(
      <CompanyDetailSheet
        companyId="cm_test_dataviz"
        isOpen
        onClose={vi.fn()}
        onOpenBranding={vi.fn()}
        onSignEveryoneOut={vi.fn()}
        onTogglePause={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledTimes(1);
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(setCompanyModules).toHaveBeenCalledWith('cm_test_dataviz', ['sales', 'active_clients']);
  });
});
