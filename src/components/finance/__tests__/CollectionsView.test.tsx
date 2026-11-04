import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockGetCollectionsReport = vi.fn();

vi.mock('../../../services/financeService', () => ({
  financeService: {
    getCollectionsReport: (...args: unknown[]) => mockGetCollectionsReport(...args),
    getCachedCollections: () => undefined,
    downloadReport: vi.fn(),
    confirmReceipt: vi.fn(),
  },
}));

vi.mock('../../../services/workspaceService', () => ({
  workspaceService: { getWorkspaces: () => Promise.resolve([]) },
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

import { CollectionsView } from '../CollectionsView';

describe('CollectionsView KPI cards', () => {
  beforeEach(() => {
    mockGetCollectionsReport.mockReset();
    mockGetCollectionsReport.mockResolvedValue({
      date_from: '2026-01-01',
      date_to: '2026-11-04',
      receipts: [],
      summary: {
        cash_pkr: 15000000,
        abl_pkr: 0,
        meezan_pkr: 0,
        total_wht_pkr: 600000,
        total_collected_pkr: 15000000,
        pending_pkr: 0,
      },
    });
  });

  it('shows Total Collection without WHT and Total Received with WHT', async () => {
    render(<CollectionsView />);

    await waitFor(() => {
      expect(screen.getByText('Total Collection')).toBeTruthy();
    });

    expect(screen.getByText('Total Received')).toBeTruthy();
    expect(screen.getByText('Pending from clients')).toBeTruthy();
    expect(screen.getByText('PKR 150,000')).toBeTruthy();
    expect(screen.getByText('PKR 156,000')).toBeTruthy();
  });
});
