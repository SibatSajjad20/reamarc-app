import React from 'react';
import { Download, Filter, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FINANCE_PROOF_ACCEPT } from '../../utils/financeProof';
import type { Invoice, InvoiceStatus } from '../../types/finance';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { formatMajorGrouped } from '../../utils/money';

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
  approved:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  pending:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  deleted:
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  void: 'On hold',
  posted: 'Approved',
  approved: 'Approved',
  pending: 'Pending',
  deleted: 'Deleted',
};

export function resolveInvoiceStatus(inv: Pick<Invoice, 'status' | 'balance_due' | 'due_date'>): InvoiceStatus | 'overdue' {
  const today = new Date().toISOString().split('T')[0];
  if (
    inv.balance_due > 0 &&
    inv.due_date < today &&
    inv.status !== 'void' &&
    inv.status !== 'deleted' &&
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

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string | number;
  onChange: (raw: string) => void;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  className,
  placeholder = '0.00',
  ...props
}) => (
  <input
    {...props}
    type="text"
    inputMode="decimal"
    placeholder={placeholder}
    value={formatMajorGrouped(value)}
    onChange={(e) => onChange(e.target.value)}
    className={cn(
      'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-numeric text-fg',
      'placeholder:text-fg-faint outline-none hover:border-fg-faint',
      'focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)]',
      'disabled:bg-subtle disabled:text-fg-faint disabled:cursor-not-allowed',
      className,
    )}
  />
);

interface FinanceReportFiltersProps {
  dateFrom: string;
  dateTo: string;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  clientName?: string;
  onClientName?: (value: string) => void;
  clientOptions?: SelectOption[];
  actions?: React.ReactNode;
}

export const FinanceReportFilters: React.FC<FinanceReportFiltersProps> = ({
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  clientName,
  onClientName,
  clientOptions,
  actions,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted shrink-0">
      <Filter className="w-3.5 h-3.5" />
      Filters
    </span>
    <CustomDatePicker
      className="w-48 shrink-0"
      value={dateFrom}
      onChange={onDateFrom}
      clearable={false}
      offDayMode="none"
      aria-label="From date"
    />
    <span className="text-caption text-fg-muted shrink-0">to</span>
    <CustomDatePicker
      className="w-48 shrink-0"
      value={dateTo}
      onChange={onDateTo}
      clearable={false}
      offDayMode="none"
      aria-label="To date"
    />
    {onClientName && (
      <CustomSelect
        className="w-52 shrink-0"
        size="sm"
        value={clientName || ''}
        onChange={onClientName}
        searchable
        placeholder="All clients"
        options={[{ value: '', label: 'All clients' }, ...(clientOptions || [])]}
      />
    )}
    {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
  </div>
);

export const ReportDownloadButton: React.FC<{
  onClick: () => void | Promise<void>;
  downloading?: boolean;
}> = ({ onClick, downloading = false }) => (
  <button
    type="button"
    onClick={() => void onClick()}
    disabled={downloading}
    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-hover disabled:opacity-60"
  >
    <Download className="h-3.5 w-3.5" />
    {downloading ? 'Preparing…' : 'Download report'}
  </button>
);

export interface FinanceProofSlotProps {
  emptyLabel: string;
  filename?: string | null;
  uploading?: boolean;
  disabled?: boolean;
  accept?: string;
  icon?: React.ReactNode;
  onFile: (file: File) => void;
  onClear: () => void;
  onOpen?: () => void;
}

export const FinanceProofSlot: React.FC<FinanceProofSlotProps> = ({
  emptyLabel,
  filename,
  uploading = false,
  disabled = false,
  accept = FINANCE_PROOF_ACCEPT,
  icon,
  onFile,
  onClear,
  onOpen,
}) => {
  const attached = Boolean(filename && !uploading);

  if (attached) {
    return (
      <div className="flex min-w-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-800">
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold"
          title={filename || emptyLabel}
        >
          {filename || emptyLabel}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md p-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-950"
          aria-label={`Remove ${filename || emptyLabel}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label
      className={cn(
        'flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong p-2 text-center text-xs text-fg-2 transition hover:bg-canvas',
        (uploading || disabled) && 'pointer-events-none opacity-60',
      )}
    >
      {icon ?? <Upload className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{uploading ? 'Uploading…' : emptyLabel}</span>
      <input
        type="file"
        className="hidden"
        accept={accept}
        disabled={uploading || disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
};
