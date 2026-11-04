import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockGetInvoices = vi.fn();

vi.mock('../../../services/financeService', () => ({
  financeService: {
    getInvoices: (...args: unknown[]) => mockGetInvoices(...args),
    getCachedInvoices: () => undefined,
    downloadReport: vi.fn(),
  },
}));

vi.mock('../../../services/workspaceService', () => ({
  workspaceService: {
    getWorkspaces: () => Promise.resolve([
      { id: 'ws-1', name: 'Pakistan Global Institute(PGI)' },
      { id: 'ws-2', name: 'SP Builders' },
    ]),
  },
}));

vi.mock('../../../context/ModuleLoadGate', () => ({
  useModuleLoadGate: vi.fn(),
}));

vi.mock('../../../utils/cacheBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/cacheBus')>();
  return {
    ...actual,
    useCacheInvalidation: vi.fn(),
  };
});

import { SummaryAccountsView } from '../SummaryAccountsView';

const sampleInvoices = [
  {
    id: 'inv-1',
    number: 'INV-001',
    issue_date: '2026-11-02',
    client_name: 'Pakistan Global Institute(PGI)',
    status: 'issued',
    currency: 'PKR',
    total: 7000000, // PKR 70,000 (minor units)
    amount_paid: 0,
    wht_settled: 0,
    balance_due: 7000000,
  },
  {
    id: 'inv-2',
    number: 'INV-002',
    issue_date: '2026-11-03',
    client_name: 'Gemcon Engineering',
    status: 'paid',
    currency: 'PKR',
    total: 5000000, // PKR 50,000
    amount_paid: 4000000,
    wht_settled: 1000000,
    balance_due: 0,
  },
];

describe('SummaryAccountsView', () => {
  beforeEach(() => {
    mockGetInvoices.mockReset();
    mockGetInvoices.mockResolvedValue({ items: sampleInvoices, total: 2 });
  });

  it('renders KPI cards for Invoice Amount, Amount Recieved, and Balance Due', async () => {
    render(<SummaryAccountsView />);

    await waitFor(() => {
      expect(screen.getByText('Pakistan Global Institute(PGI)')).toBeTruthy();
    });

    // Check KPI card labels
    expect(screen.getAllByText('Invoice Amount').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Amount Recieved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('WHT')).toBeTruthy();
    expect(screen.getAllByText('Balance Due').length).toBeGreaterThanOrEqual(1);

    // Check KPI card calculated amounts
    // Total invoice: 70,000 + 50,000 = PKR 120,000
    // Total received: 0 + (40,000 + 10,000 WHT) = PKR 50,000
    // Total WHT: 0 + 10,000 = PKR 10,000
    // Total due: 70,000 + 0 = PKR 70,000
    expect(screen.getAllByText('PKR 120,000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PKR 50,000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PKR 10,000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PKR 70,000').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table header with "Amount Recieved" and NOT "Amount Receive"', async () => {
    render(<SummaryAccountsView />);

    await waitFor(() => {
      expect(screen.getByText('Gemcon Engineering')).toBeTruthy();
    });

    // Verify "Amount Recieved" is in table header
    const tableHeader = screen.getByRole('columnheader', { name: /Amount Recieved/i });
    expect(tableHeader).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Amount Receive' })).toBeNull();
  });
});
