import { describe, it, expect } from 'vitest';
import { majorToMinor, minorToMajor } from '../../../utils/money';
import { distributeReceiptAllocRows, type AllocRowState } from '../ReceiptsView';
import type { Invoice } from '../../../types/finance';

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
