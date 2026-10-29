export type Currency = 'PKR' | 'USD' | 'GBP';
export type PaymentMethod = 'cash' | 'bank';
export type BankId = 'abl' | 'meezan';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'deleted';
export type ReceiptStatus = 'posted' | 'pending' | 'void' | 'deleted';
export type FinanceTab = 'overview' | 'invoices' | 'receivables' | 'receipts' | 'collections' | 'reports' | 'summary' | 'accounts' | 'wht' | 'settings';

export interface BankAccountConfig {
  bank_id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  swift_code: string;
  branch?: string | null;
}

export interface ClientBillingDetails {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  tax_id?: string | null;
}

export interface InvoiceLineItem {
  serial: number;
  service_id?: string | null;
  description: string;
  quantity: number;
  rate: number; // minor units (e.g. paisa)
  amount: number; // minor units
}

export interface Invoice {
  id: string;
  company_id: string;
  number: string;
  workspace_id?: string | null;
  client_name: string;
  client_billing?: ClientBillingDetails | null;
  issue_date: string;
  due_date: string;
  terms: string;
  reference?: string | null;
  currency: Currency;
  line_items: InvoiceLineItem[];
  subtotal: number;
  discount_type: 'amount' | 'percent';
  discount_value: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  wht_settled: number;
  balance_due: number;
  status: InvoiceStatus;
  notes?: string | null;
  terms_text?: string | null;
  pay_to_bank?: BankAccountConfig | null;
  pdf_file_id?: string | null;
  share_token?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  deleted_reason?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  is_recurring?: boolean;
  recurring_interval?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  receipts?: Receipt[];
}

export interface InvoiceCreatePayload {
  workspace_id?: string | null;
  client_name: string;
  client_billing?: ClientBillingDetails;
  issue_date: string;
  due_date: string;
  terms?: string;
  reference?: string | null;
  currency?: Currency;
  line_items: InvoiceLineItem[];
  discount_type?: 'amount' | 'percent';
  discount_value?: number;
  notes?: string | null;
  terms_text?: string | null;
  pay_to_bank?: BankAccountConfig | null;
  is_recurring?: boolean;
  recurring_interval?: string | null;
}

export interface InvoiceUpdatePayload {
  workspace_id?: string | null;
  client_name?: string;
  client_billing?: ClientBillingDetails;
  issue_date?: string;
  due_date?: string;
  terms?: string;
  reference?: string | null;
  currency?: Currency;
  line_items?: InvoiceLineItem[];
  discount_type?: 'amount' | 'percent';
  discount_value?: number;
  notes?: string | null;
  terms_text?: string | null;
  pay_to_bank?: BankAccountConfig | null;
}

export interface ReceiptAllocation {
  invoice_id: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_total?: number;
  invoice_balance_due?: number;
  amount: number; // minor units
  wht: number; // minor units
}

export interface Receipt {
  id: string;
  company_id: string;
  number: string;
  workspace_id?: string | null;
  client_name: string;
  date: string;
  currency: Currency;
  amount_received: number;
  wht_amount: number;
  settles_total: number;
  method: PaymentMethod;
  bank?: BankId | null;
  reference_number?: string | null;
  exchange_rate?: number | null;
  pkr_amount: number;
  allocations: ReceiptAllocation[];
  unapplied_amount: number;
  memo?: string | null;
  proof_file_ids: string[];
  wht_certificate_file_id?: string | null;
  status: ReceiptStatus;
  is_cheque?: boolean;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  deleted_reason?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface ReceiptCreatePayload {
  workspace_id?: string | null;
  client_name: string;
  date: string;
  currency?: Currency;
  amount_received: number;
  wht_amount?: number;
  method: PaymentMethod;
  bank?: BankId | null;
  reference_number?: string | null;
  exchange_rate?: number | null;
  memo?: string | null;
  allocations: { invoice_id: string; amount: number; wht?: number }[];
  proof_file_ids?: string[];
  wht_certificate_file_id?: string | null;
  is_cheque?: boolean;
}

export interface FinanceAccount {
  id: string;
  company_id: string;
  code: 'cash' | 'abl' | 'meezan';
  name: string;
  bank_name?: string;
  account_number?: string;
  iban?: string;
  currency: string;
  balance: number; // minor units (PKR paisa)
}

export interface FinanceLedgerEntry {
  id: string;
  company_id: string;
  account_code: string;
  date: string;
  direction: 'in' | 'out';
  amount: number;
  source_type: string;
  source_id?: string | null;
  memo?: string | null;
  slip_file_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface FinanceSettings {
  id: string;
  company_id: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_website: string;
  tax_id: string;
  invoice_prefix: string;
  receipt_prefix: string;
  default_payment_terms: string;
  bank_accounts: BankAccountConfig[];
  signature_labels: string[];
  notes_template: string;
  terms_template: string;
  updated_at?: string;
}

export interface FinanceService {
  id: string;
  company_id: string;
  name: string;
  default_rate: number;
  currency: Currency;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgeingSummaryRow {
  client_name: string;
  currency: Currency;
  current: number;
  '1_30': number;
  '31_60': number;
  '61_90': number;
  '90_plus': number;
  total: number;
}

export interface AgeingSummaryReport {
  as_of_date: string;
  rows: AgeingSummaryRow[];
  currencies_summary: Record<string, {
    current: number;
    '1_30': number;
    '31_60': number;
    '61_90': number;
    '90_plus': number;
    total: number;
  }>;
}

export interface StatementTransaction {
  type: 'invoice' | 'receipt';
  date: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface ClientStatementReport {
  client_name: string;
  currency: Currency;
  date_from: string;
  date_to: string;
  opening_balance: number;
  closing_balance: number;
  transactions: StatementTransaction[];
}

export interface CollectionsReport {
  date_from: string;
  date_to: string;
  receipts: Receipt[];
  summary: {
    cash_pkr: number;
    abl_pkr: number;
    meezan_pkr: number;
    total_wht_pkr: number;
    total_collected_pkr: number;
    pending_pkr?: number;
    on_hold_pkr?: number;
  };
}

export interface WhtReportItem {
  receipt_id: string;
  receipt_number: string;
  date: string;
  client_name: string;
  currency: string;
  wht_amount: number;
  wht_pkr: number;
  has_certificate: boolean;
  certificate_file_id?: string | null;
}

export interface MonthlyAnalysisMonthRow {
  month: string;
  label: string;
  collected_pkr: number;
  billed_pkr: number;
  pending_pkr: number;
  wht_pkr: number;
  avg_3m_pkr: number;
  is_partial: boolean;
  collected_new_invoices_pkr: number;
  collected_prior_invoices_pkr: number;
  collected_unallocated_pkr: number;
  channels: { cash: number; abl: number; meezan: number; other: number };
}

export interface MonthlyAnalysisMover {
  client_name: string;
  this_month_pkr: number;
  prior_month_pkr: number;
  delta_pkr: number;
}

export type ReportPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface MonthlyAnalysisReport {
  /** Bucket size. With non-monthly periods, `month` keys hold 2026-Q4 / 2026-H2 / 2026. */
  period?: ReportPeriod;
  date_from: string;
  date_to: string;
  headline_metric: string;
  headline_rule: string;
  selected: {
    month: string;
    label: string;
    is_partial: boolean;
    days_elapsed: number;
    days_in_month: number;
    collected_pkr: number;
    prior_month: string | null;
    prior_label: string | null;
    prior_collected_pkr: number | null;
    delta_pkr: number | null;
    pct_change: number | null;
    direction: 'improving' | 'down' | 'flat' | 'no_prior';
    billed_pkr: number;
    pending_pkr: number;
    wht_pkr: number;
    run_rate_3m_pkr: number | null;
    run_rate_compare_pkr: number | null;
    run_rate_status: 'above' | 'below' | 'in_line' | null;
    /** % above (+) / below (-) the pace-adjusted 3-period run rate; null when there is no run rate. */
    run_rate_pct?: number | null;
    channels: { cash: number; abl: number; meezan: number; other: number };
    collected_new_invoices_pkr: number;
    collected_prior_invoices_pkr: number;
    collected_unallocated_pkr: number;
    top_client_share_pct: number;
  };
  months: MonthlyAnalysisMonthRow[];
  movers_up: MonthlyAnalysisMover[];
  movers_down: MonthlyAnalysisMover[];
}

export interface WhtReport {
  date_from: string;
  date_to: string;
  total_wht_pkr: number;
  total_with_cert: number;
  total_pending_cert: number;
  items: WhtReportItem[];
}
