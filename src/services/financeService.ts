import { apiClient } from './apiClient';
import { validateFinanceProofFile } from '../utils/financeProof';
import type {
  AgeingSummaryReport,
  ClientStatementReport,
  CollectionsReport,
  FinanceAccount,
  FinanceLedgerEntry,
  FinanceService,
  FinanceSettings,
  Invoice,
  InvoiceCreatePayload,
  InvoiceUpdatePayload,
  Receipt,
  ReceiptCreatePayload,
  WhtReport,
} from '../types/finance';

export const financeService = {
  // Settings
  async getSettings(): Promise<FinanceSettings> {
    return apiClient.get<FinanceSettings>('/finance/settings');
  },

  async updateSettings(payload: Partial<FinanceSettings>): Promise<FinanceSettings> {
    return apiClient.put<FinanceSettings>('/finance/settings', payload);
  },

  // Services Catalog
  async getServices(activeOnly = true): Promise<FinanceService[]> {
    return apiClient.get<FinanceService[]>(`/finance/services?active_only=${activeOnly}`);
  },

  async createService(payload: Partial<FinanceService>): Promise<FinanceService> {
    return apiClient.post<FinanceService>('/finance/services', payload);
  },

  async updateService(serviceId: string, payload: Partial<FinanceService>): Promise<FinanceService> {
    return apiClient.patch<FinanceService>(`/finance/services/${serviceId}`, payload);
  },

  // Invoices
  async getInvoices(params: {
    status?: string;
    workspace_id?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<{ items: Invoice[]; total: number }> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.workspace_id) query.set('workspace_id', params.workspace_id);
    if (params.search) query.set('search', params.search);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    return apiClient.get<{ items: Invoice[]; total: number }>(`/finance/invoices${qs ? `?${qs}` : ''}`);
  },

  async getInvoice(id: string): Promise<Invoice> {
    return apiClient.get<Invoice>(`/finance/invoices/${id}`);
  },

  async createInvoice(payload: InvoiceCreatePayload): Promise<Invoice> {
    return apiClient.post<Invoice>('/finance/invoices', payload);
  },

  async updateInvoice(id: string, payload: InvoiceUpdatePayload): Promise<Invoice> {
    return apiClient.put<Invoice>(`/finance/invoices/${id}`, payload);
  },

  async issueInvoice(id: string): Promise<Invoice> {
    return apiClient.post<Invoice>(`/finance/invoices/${id}/issue`);
  },

  async voidInvoice(id: string, reason: string): Promise<Invoice> {
    return apiClient.post<Invoice>(`/finance/invoices/${id}/void`, { reason });
  },

  async duplicateInvoice(id: string): Promise<Invoice> {
    return apiClient.post<Invoice>(`/finance/invoices/${id}/duplicate`);
  },

  getInvoicePdfUrl(id: string): string {
    return `/api/v1/finance/invoices/${id}/pdf`;
  },

  // Receipts
  async getReceipts(params: {
    status?: string;
    workspace_id?: string;
    client_name?: string;
    search?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<{ items: Receipt[]; total: number }> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.workspace_id) query.set('workspace_id', params.workspace_id);
    if (params.client_name) query.set('client_name', params.client_name);
    if (params.search) query.set('search', params.search);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    return apiClient.get<{ items: Receipt[]; total: number }>(`/finance/receipts${qs ? `?${qs}` : ''}`);
  },

  async getReceipt(id: string): Promise<Receipt> {
    return apiClient.get<Receipt>(`/finance/receipts/${id}`);
  },

  async postReceipt(payload: ReceiptCreatePayload): Promise<Receipt> {
    return apiClient.post<Receipt>('/finance/receipts', payload);
  },

  async voidReceipt(id: string, reason: string): Promise<Receipt> {
    return apiClient.post<Receipt>(`/finance/receipts/${id}/void`, { reason });
  },

  getReceiptPdfUrl(id: string): string {
    return `/api/v1/finance/receipts/${id}/pdf`;
  },

  // Accounts & Ledger
  async getAccounts(): Promise<FinanceAccount[]> {
    return apiClient.get<FinanceAccount[]>('/finance/accounts');
  },

  async getLedger(params: {
    account?: string;
    source_type?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<{ items: FinanceLedgerEntry[]; total: number }> {
    const query = new URLSearchParams();
    if (params.account) query.set('account', params.account);
    if (params.source_type) query.set('source_type', params.source_type);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    return apiClient.get<{ items: FinanceLedgerEntry[]; total: number }>(`/finance/ledger${qs ? `?${qs}` : ''}`);
  },

  async transferCashToBank(payload: {
    to_account: 'abl' | 'meezan';
    amount: number;
    date: string;
    deposit_slip_reference?: string;
    slip_file_id?: string;
    notes?: string;
  }): Promise<any> {
    return apiClient.post('/finance/transfers', payload);
  },

  async setOpeningBalance(payload: {
    account_code: 'cash' | 'abl' | 'meezan';
    amount: number;
    date: string;
    memo?: string;
  }): Promise<any> {
    return apiClient.post('/finance/accounts/opening-balance', payload);
  },

  async makeAdjustment(payload: {
    account_code: 'cash' | 'abl' | 'meezan';
    direction: 'in' | 'out';
    amount: number;
    date: string;
    memo: string;
    reason: string;
  }): Promise<any> {
    return apiClient.post('/finance/accounts/adjustment', payload);
  },

  // Reports
  async getAgeingSummary(asOf?: string, currency?: string): Promise<AgeingSummaryReport> {
    const query = new URLSearchParams();
    if (asOf) query.set('as_of', asOf);
    if (currency) query.set('currency', currency);
    return apiClient.get<AgeingSummaryReport>(`/finance/reports/ageing-summary?${query.toString()}`);
  },

  async getAgeingDetail(asOf?: string, clientName?: string, currency?: string): Promise<any> {
    const query = new URLSearchParams();
    if (asOf) query.set('as_of', asOf);
    if (clientName) query.set('client_name', clientName);
    if (currency) query.set('currency', currency);
    return apiClient.get<any>(`/finance/reports/ageing-detail?${query.toString()}`);
  },

  async getClientStatement(clientName: string, dateFrom?: string, dateTo?: string, currency?: string): Promise<ClientStatementReport> {
    const query = new URLSearchParams();
    query.set('client_name', clientName);
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (currency) query.set('currency', currency);
    return apiClient.get<ClientStatementReport>(`/finance/reports/statement?${query.toString()}`);
  },

  async getCollectionsReport(dateFrom?: string, dateTo?: string, method?: string, bank?: string): Promise<CollectionsReport> {
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (method) query.set('method', method);
    if (bank) query.set('bank', bank);
    return apiClient.get<CollectionsReport>(`/finance/reports/collections?${query.toString()}`);
  },

  async getWhtReport(dateFrom?: string, dateTo?: string, clientName?: string): Promise<WhtReport> {
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (clientName) query.set('client_name', clientName);
    return apiClient.get<WhtReport>(`/finance/reports/wht?${query.toString()}`);
  },

  getReportDownloadUrl(reportType: string, format: 'pdf' | 'xlsx', params: Record<string, string> = {}): string {
    const query = new URLSearchParams(params);
    query.set('format', format);
    return `/api/v1/finance/reports/${reportType}?${query.toString()}`;
  },

  // File Upload
  async uploadProofFile(file: File): Promise<{ file_id: string; url: string; filename: string }> {
    const proofError = validateFinanceProofFile(file);
    if (proofError) {
      throw new Error(proofError);
    }
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/v1/finance/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'File upload failed');
    }
    return res.json();
  },

  // Public Links
  async getPublicInvoice(shareToken: string): Promise<any> {
    const res = await fetch(`/api/v1/finance/public/invoice/${shareToken}`);
    if (!res.ok) throw new Error('Invoice link not found or expired');
    return res.json();
  },

  getPublicInvoicePdfUrl(shareToken: string): string {
    return `/api/v1/finance/public/invoice/${shareToken}/pdf`;
  },
};
