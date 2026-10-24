import React from 'react';
import { cn } from '@/lib/utils';
import type { Invoice, InvoiceStatus } from '../../types/finance';
import type { SelectOption } from '../ui/CustomSelect';

export const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'PKR', label: 'PKR (₨)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
];

export const ACCOUNT_OPTIONS: SelectOption[] = [
  { value: 'cash', label: 'Cash in Hand' },
  { value: 'abl', label: 'Allied Bank (ABL)' },
  { value: 'meezan', label: 'Meezan Bank' },
];

export const BANK_OPTIONS: SelectOption[] = [
  { value: 'abl', label: 'Allied Bank (ABL)' },
  { value: 'meezan', label: 'Meezan Bank' },
];

export const TERMS_OPTIONS: SelectOption[] = [
  { value: 'Due on receipt', label: 'Due on receipt' },
  { value: 'Due on Receipt', label: 'Due on receipt' },
  { value: 'Net 7', label: 'Net 7' },
  { value: 'Net 15', label: 'Net 15' },
  { value: 'Net 30', label: 'Net 30' },
  { value: 'Custom', label: 'Custom date' },
];

const STATUS_CLASS: Record<string, string> = {
  draft:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700',
  issued:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  paid:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  partially_paid:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  overdue:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
  void: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 line-through',
  posted:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  void: 'Void',
  posted: 'Posted',
};

export function resolveInvoiceStatus(inv: Pick<Invoice, 'status' | 'balance_due' | 'due_date'>): InvoiceStatus | 'overdue' {
  const today = new Date().toISOString().split('T')[0];
  if (
    inv.balance_due > 0 &&
    inv.due_date < today &&
    inv.status !== 'void' &&
    inv.status !== 'draft' &&
    inv.status !== 'paid'
  ) {
    return 'overdue';
  }
  return inv.status;
}

export const FinanceStatusBadge: React.FC<{ status: string; className?: string }> = ({
  status,
  className,
}) => {
  const cls = STATUS_CLASS[status] || STATUS_CLASS.draft;
  const label = STATUS_LABEL[status] || status.replace(/_/g, ' ');
  return <span className={cn(cls, className)}>{label}</span>;
};

export const InvoiceStatusBadge: React.FC<{ invoice: Invoice }> = ({ invoice }) => (
  <FinanceStatusBadge status={resolveInvoiceStatus(invoice)} />
);
