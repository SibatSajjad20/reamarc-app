import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { majorToMinor, minorToMajor } from '../../../utils/money';
import type { Invoice } from '../../../types/finance';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
}

const mockGetReceipts = vi.fn();
const mockGetInvoices = vi.fn();

vi.mock('../../../services/financeService', () => ({
  financeService: {
    getReceipts: (...args: unknown[]) => mockGetReceipts(...args),
    getCachedReceipts: () => undefined,
    getInvoices: (...args: unknown[]) => mockGetInvoices(...args),
    confirmReceipt: vi.fn(),
    postReceipt: vi.fn(),
    updateReceipt: vi.fn(),
    uploadProofFile: vi.fn(),
    getProofFileUrl: vi.fn(),
  },
}));

vi.mock('../../../services/workspaceService', () => ({
  workspaceService: {
    getWorkspaces: () => Promise.resolve([{ id: 'ws-1', name: 'Acme' }]),
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

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { distributeReceiptAllocRows, ReceiptsView, type AllocRowState } from '../ReceiptsView';

function invoice(partial: Partial<Invoice> & { id: string; balance_due: number }): Invoice {
  return {
    company_id: 'co-1',
    number: partial.number || partial.id,
    client_name: 'Acme',
    issue_date: '2026-01-01',
    due_date: '2026-01-15',
    terms: '',
    currency: 'PKR',
    line_items: [],
    subtotal: partial.balance_due,
    discount_type: 'amount',
    discount_value: 0,
    discount_amount: 0,
    total: partial.balance_due,
    amount_paid: 0,
    wht_settled: 0,
    status: 'issued',
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

function row(inv: Invoice, extra: Partial<AllocRowState> = {}): AllocRowState {
  return {
    invoice: inv,
    selected: true,
    amountMajor: 0,
    whtMajor: 0,
    ...extra,
  };
}

describe('ReceiptsView allocation auto-fill', () => {
  it('splits 7,000 cash and 3,000 WHT against a 10,000 invoice', () => {
    const inv = invoice({ id: 'inv-1', number: 'INV-001', balance_due: majorToMinor(10000) });
    const next = distributeReceiptAllocRows([row(inv)], majorToMinor(7000), majorToMinor(3000));
    expect(next[0].amountMajor).toBe(7000);
    expect(next[0].whtMajor).toBe(3000);
    const remaining = Math.max(
      0,
      inv.balance_due - majorToMinor(next[0].amountMajor) - majorToMinor(next[0].whtMajor),
    );
    expect(minorToMajor(remaining)).toBe(0);
  });

  it('distributes across selected invoices in order', () => {
    const first = invoice({ id: 'inv-1', number: 'INV-001', balance_due: majorToMinor(6000) });
    const second = invoice({ id: 'inv-2', number: 'INV-002', balance_due: majorToMinor(10000) });
    const next = distributeReceiptAllocRows(
      [row(first), row(second)],
      majorToMinor(7000),
      majorToMinor(3000),
    );
    expect(next[0].amountMajor).toBe(6000);
    expect(next[0].whtMajor).toBe(0);
    expect(next[1].amountMajor).toBe(1000);
    expect(next[1].whtMajor).toBe(3000);
  });

  it('keeps a manually edited row and auto-fills the rest', () => {
    const first = invoice({ id: 'inv-1', number: 'INV-001', balance_due: majorToMinor(6000) });
    const second = invoice({ id: 'inv-2', number: 'INV-002', balance_due: majorToMinor(10000) });
    const next = distributeReceiptAllocRows(
      [
        row(first, { amountMajor: 1000, whtMajor: 0, manual: true }),
        row(second),
      ],
      majorToMinor(7000),
      majorToMinor(3000),
    );
    expect(next[0].amountMajor).toBe(1000);
    expect(next[0].whtMajor).toBe(0);
    expect(next[1].amountMajor).toBe(6000);
    expect(next[1].whtMajor).toBe(3000);
  });
});

const sampleInvoice: Invoice = {
  id: 'inv-1',
  company_id: 'co-1',
  number: 'INV-001',
  client_name: 'Acme',
  workspace_id: 'ws-1',
  issue_date: '2026-01-01',
  due_date: '2026-01-15',
  terms: '',
  currency: 'PKR',
  line_items: [],
  subtotal: majorToMinor(150000),
  discount_type: 'amount',
  discount_value: 0,
  discount_amount: 0,
  total: majorToMinor(150000),
  amount_paid: 0,
  wht_settled: 0,
  balance_due: majorToMinor(150000),
  status: 'issued',
  created_at: '',
  updated_at: '',
};

describe('ReceiptsView extra cash and WHT mismatch', () => {
  beforeEach(() => {
    mockGetReceipts.mockReset();
    mockGetInvoices.mockReset();
    mockGetReceipts.mockResolvedValue({ items: [], total: 0 });
    mockGetInvoices.mockResolvedValue({ items: [sampleInvoice], total: 1 });
  });

  it('shows Record extra as client credit only when unapplied cash is positive', async () => {
    render(<ReceiptsView initialInvoiceToPay={sampleInvoice} />);
    await screen.findByText('INV-001');

    expect(screen.queryByText('Record extra as client credit')).toBeNull();

    const amountInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(amountInputs[0], { target: { value: '160000' } });

    expect(await screen.findByText('Record extra as client credit')).toBeTruthy();

    fireEvent.change(amountInputs[0], { target: { value: '150000' } });
    await waitFor(() => {
      expect(screen.queryByText('Record extra as client credit')).toBeNull();
    });
  });

  it('disables Post Receipt and shows an error when WHT withheld is not fully applied', async () => {
    render(<ReceiptsView initialInvoiceToPay={sampleInvoice} />);
    await screen.findByText('INV-001');

    const amountInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(amountInputs[1], { target: { value: '6000' } });

    expect(
      await screen.findByText(
        'WHT withheld must be fully applied to invoices; WHT cannot be held as client credit.',
      ),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Post Receipt' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
