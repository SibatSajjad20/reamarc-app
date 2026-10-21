import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { CompanyBrandingForm } from './CompanyBrandingForm';
import type { CompanyBranding, CompanyBrandingAdapter } from '@/services/companyBrandingService';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_owner',
      email: 'owner@acme.com',
      name: 'Owner',
      role: 'owner',
      company_id: 'comp_acme',
      company: { id: 'comp_acme', name: 'Acme Media', display_name: 'Acme' },
    },
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

const sampleBranding: CompanyBranding = {
  company_id: 'comp_acme',
  name: 'Acme Media',
  display_name: 'Acme',
  brand_name: 'Acme',
  logo_url: null,
  has_logo: false,
  accent_color: '#6847E0',
  uploads_enabled: true,
};

function mockAdapter(): CompanyBrandingAdapter {
  return {
    getBranding: vi.fn().mockResolvedValue(sampleBranding),
    updateBranding: vi.fn().mockResolvedValue(sampleBranding),
    uploadLogo: vi.fn().mockResolvedValue(sampleBranding),
    removeLogo: vi.fn().mockResolvedValue(sampleBranding),
  };
}

describe('CompanyBrandingForm layout variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drawer variant stacks rows and keeps logo mark on the same row as Upload logo', async () => {
    const adapter = mockAdapter();
    const { container } = render(<CompanyBrandingForm variant="drawer" adapter={adapter} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload logo' })).toBeTruthy();
    });

    expect(container.querySelector('.md\\:grid-cols-\\[232px_1fr\\]')).toBeNull();
    expect(container.querySelector('.sm\\:flex-row')).toBeNull();
    expect(container.querySelector('.sm\\:grid-cols-\\[180px_1fr\\]')).toBeNull();

    const row = screen.getByTestId('branding-logo-row');
    expect(row.className).toContain('flex');
    expect(row.className).toContain('items-center');
    expect(within(row).getByRole('button', { name: 'Upload logo' })).toBeTruthy();
    expect(row.querySelector('[class*="rounded"]')).toBeTruthy();
  });

  it('page variant keeps the Settings two-column rows', async () => {
    const adapter = mockAdapter();
    const { container } = render(<CompanyBrandingForm adapter={adapter} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload logo' })).toBeTruthy();
    });

    const twoColRows = container.querySelectorAll('.md\\:grid-cols-\\[232px_1fr\\]');
    expect(twoColRows.length).toBeGreaterThan(0);
  });
});
