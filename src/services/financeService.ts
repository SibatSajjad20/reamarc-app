import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';
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

type ListResult<T> = { items: T[]; total: number };
type RequestOptions = { signal?: AbortSignal };

const LIST_TTL_MS = 30_000;
const STABLE_TTL_MS = 60_000;

const invoicesCache = new BoundedCache<ListResult<Invoice>>(20);
const invoiceDetailCache = new BoundedCache<Invoice>(40);
const receiptsCache = new BoundedCache<ListResult<Receipt>>(10);
const accountsCache = new BoundedCache<FinanceAccount[]>(4);
const ledgerCache = new BoundedCache<ListResult<FinanceLedgerEntry>>(10);
const settingsCache = new BoundedCache<FinanceSettings>(2);
const servicesCache = new BoundedCache<FinanceService[]>(4);
const reportsCache = new BoundedCache<unknown>(16);

function queryKey(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : 'default';
}

function fresh<T>(entry: CacheEntry<T> | undefined, ttl: number, options?: RequestOptions): T | undefined {
  if (!entry || options?.signal) return undefined;
  if (Date.now() - entry.fetchedAt >= ttl) return undefined;
  return entry.data;
}

function bustOperationalCaches() {
  invoicesCache.clear();
  invoiceDetailCache.clear();
  receiptsCache.clear();
  accountsCache.clear();
  ledgerCache.clear();
  reportsCache.clear();
}

export const financeService = {
  getCachedSettings(): CacheEntry<FinanceSettings> | undefined {
    return settingsCache.get('settings');
  },
  getCachedServices(activeOnly = true): CacheEntry<FinanceService[]> | undefined {
    return servicesCache.get(activeOnly ? 'active' : 'all');
  },
  getCachedInvoices(params: Record<string, unknown> = {}): CacheEntry<ListResult<Invoice>> | undefined {
    return invoicesCache.get(queryKey(params));
  },
  getCachedInvoice(id: string): CacheEntry<Invoice> | undefined {
    return invoiceDetailCache.get(id);
  },
  getCachedReceipts(params: Record<string, unknown> = {}): CacheEntry<ListResult<Receipt>> | undefined {
    return receiptsCache.get(queryKey(params));
  },
  getCachedAccounts(): CacheEntry<FinanceAccount[]> | undefined {
    return accountsCache.get('accounts');
  },
  getCachedLedger(params: Record<string, unknown> = {}): CacheEntry<ListResult<FinanceLedgerEntry>> | undefined {
    return ledgerCache.get(queryKey(params));
  },
  getCachedAgeingSummary(asOf?: string, currency?: string): CacheEntry<AgeingSummaryReport> | undefined {
    return reportsCache.get(`ageing-summary:${queryKey({ asOf, currency })}`) as
      | CacheEntry<AgeingSummaryReport>
      | undefined;
  },
  getCachedAgeingDetail(asOf?: string, clientName?: string, currency?: string): CacheEntry<unknown> | undefined {
    return reportsCache.get(`ageing-detail:${queryKey({ asOf, clientName, currency })}`);
  },
  getCachedClientStatement(
    clientName: string,
    dateFrom?: string,
    dateTo?: string,
    currency?: string,
  ): CacheEntry<ClientStatementReport> | undefined {
    return reportsCache.get(`statement:${queryKey({ clientName, dateFrom, dateTo, currency })}`) as
      | CacheEntry<ClientStatementReport>
      | undefined;
  },
  getCachedCollections(dateFrom?: string, dateTo?: string, method?: string, bank?: string, clientName?: string): CacheEntry<CollectionsReport> | undefined {
    return reportsCache.get(`collections:${queryKey({ dateFrom, dateTo, method, bank, clientName })}`) as
      | CacheEntry<CollectionsReport>
      | undefined;
  },
  getCachedWht(dateFrom?: string, dateTo?: string, clientName?: string): CacheEntry<WhtReport> | undefined {
    return reportsCache.get(`wht:${queryKey({ dateFrom, dateTo, clientName })}`) as CacheEntry<WhtReport> | undefined;
  },

  hasInitialCache(): boolean {
    return (
      invoicesCache.size() > 0 ||
      accountsCache.size() > 0 ||
      receiptsCache.size() > 0 ||
      settingsCache.size() > 0
    );
  },

  clearAllCaches(): void {
    bustOperationalCaches();
    settingsCache.clear();
    servicesCache.clear();
  },

  async getSettings(options?: RequestOptions): Promise<FinanceSettings> {
    const cached = fresh(settingsCache.get('settings'), STABLE_TTL_MS, options);
    if (cached) return cached;
    const res = await apiClient.get<FinanceSettings>('/finance/settings', options);
    settingsCache.set('settings', res);
    return res;
  },

  async updateSettings(payload: Partial<FinanceSettings>): Promise<FinanceSettings> {
    const res = await apiClient.put<FinanceSettings>('/finance/settings', payload);
    settingsCache.set('settings', res);
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async getServices(activeOnly = true, options?: RequestOptions): Promise<FinanceService[]> {
    const key = activeOnly ? 'active' : 'all';
    const cached = fresh(servicesCache.get(key), STABLE_TTL_MS, options);
    if (cached) return cached;
    const res = await apiClient.get<FinanceService[]>(`/finance/services?active_only=${activeOnly}`, options);
    servicesCache.set(key, res);
    return res;
  },

  async createService(payload: Partial<FinanceService>): Promise<FinanceService> {
    const res = await apiClient.post<FinanceService>('/finance/services', payload);
    servicesCache.clear();
    emitInvalidation(['finance']);
    return res;
  },

  async updateService(serviceId: string, payload: Partial<FinanceService>): Promise<FinanceService> {
    const res = await apiClient.patch<FinanceService>(`/finance/services/${serviceId}`, payload);
    servicesCache.clear();
    emitInvalidation(['finance']);
    return res;
  },

  async getInvoices(
    params: {
      status?: string;
      workspace_id?: string;
      search?: string;
      date_from?: string;
      date_to?: string;
      skip?: number;
      limit?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<ListResult<Invoice>> {
    const key = queryKey(params);
    const cached = fresh(invoicesCache.get(key), LIST_TTL_MS, options);
    if (cached) return cached;

    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.workspace_id) query.set('workspace_id', params.workspace_id);
    if (params.search) query.set('search', params.search);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    const res = await apiClient.get<ListResult<Invoice>>(`/finance/invoices${qs ? `?${qs}` : ''}`, options);
    invoicesCache.set(key, res);
    return res;
  },

  async getInvoice(id: string, options?: RequestOptions): Promise<Invoice> {
    const cached = fresh(invoiceDetailCache.get(id), LIST_TTL_MS, options);
    if (cached) return cached;
    const res = await apiClient.get<Invoice>(`/finance/invoices/${id}`, options);
    invoiceDetailCache.set(id, res);
    return res;
  },

  async createInvoice(payload: InvoiceCreatePayload): Promise<Invoice> {
    const res = await apiClient.post<Invoice>('/finance/invoices', payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async updateInvoice(id: string, payload: InvoiceUpdatePayload): Promise<Invoice> {
    const res = await apiClient.put<Invoice>(`/finance/invoices/${id}`, payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async issueInvoice(id: string): Promise<Invoice> {
    const res = await apiClient.post<Invoice>(`/finance/invoices/${id}/issue`);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async voidInvoice(id: string, reason: string): Promise<Invoice> {
    const res = await apiClient.post<Invoice>(`/finance/invoices/${id}/void`, { reason });
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async deleteInvoice(id: string, reason: string): Promise<Invoice> {
    const res = await apiClient.post<Invoice>(`/finance/invoices/${id}/delete`, { reason });
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async duplicateInvoice(id: string): Promise<Invoice> {
    const res = await apiClient.post<Invoice>(`/finance/invoices/${id}/duplicate`);
    invoicesCache.clear();
    emitInvalidation(['finance']);
    return res;
  },

  async regenerateInvoiceShareLink(id: string): Promise<{ id: string; share_token: string }> {
    const res = await apiClient.post<{ id: string; share_token: string }>(
      `/finance/invoices/${id}/share-link/regenerate`
    );
    invoicesCache.clear();
    emitInvalidation(['finance']);
    return res;
  },

  getInvoicePdfUrl(id: string): string {
    return `/api/v1/finance/invoices/${id}/pdf`;
  },

  async getReceipts(
    params: {
      status?: string;
      workspace_id?: string;
      client_name?: string;
      search?: string;
      date_from?: string;
      date_to?: string;
      skip?: number;
      limit?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<ListResult<Receipt>> {
    const key = queryKey(params);
    const cached = fresh(receiptsCache.get(key), LIST_TTL_MS, options);
    if (cached) return cached;

    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.workspace_id) query.set('workspace_id', params.workspace_id);
    if (params.client_name) query.set('client_name', params.client_name);
    if (params.search) query.set('search', params.search);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    const res = await apiClient.get<ListResult<Receipt>>(`/finance/receipts${qs ? `?${qs}` : ''}`, options);
    receiptsCache.set(key, res);
    return res;
  },

  async getReceipt(id: string): Promise<Receipt> {
    return apiClient.get<Receipt>(`/finance/receipts/${id}`);
  },

  async postReceipt(payload: ReceiptCreatePayload): Promise<Receipt> {
    const res = await apiClient.post<Receipt>('/finance/receipts', payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async confirmReceipt(id: string): Promise<Receipt> {
    const res = await apiClient.post<Receipt>(`/finance/receipts/${id}/confirm`);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  getReceiptPdfUrl(id: string): string {
    return `/api/v1/finance/receipts/${id}/pdf`;
  },

  getProofFileUrl(fileId: string): string {
    return `/api/v1/uploads/${fileId}`;
  },

  async getAccounts(options?: RequestOptions): Promise<FinanceAccount[]> {
    const cached = fresh(accountsCache.get('accounts'), LIST_TTL_MS, options);
    if (cached) return cached;
    const res = await apiClient.get<FinanceAccount[]>('/finance/accounts', options);
    accountsCache.set('accounts', res);
    return res;
  },

  async getLedger(
    params: {
      account?: string;
      source_type?: string;
      date_from?: string;
      date_to?: string;
      skip?: number;
      limit?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<ListResult<FinanceLedgerEntry>> {
    const key = queryKey(params);
    const cached = fresh(ledgerCache.get(key), LIST_TTL_MS, options);
    if (cached) return cached;

    const query = new URLSearchParams();
    if (params.account) query.set('account', params.account);
    if (params.source_type) query.set('source_type', params.source_type);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const qs = query.toString();
    const res = await apiClient.get<ListResult<FinanceLedgerEntry>>(
      `/finance/ledger${qs ? `?${qs}` : ''}`,
      options,
    );
    ledgerCache.set(key, res);
    return res;
  },

  async transferCashToBank(payload: {
    to_account: 'abl' | 'meezan';
    amount: number;
    date: string;
    deposit_slip_reference?: string;
    slip_file_id?: string;
    notes?: string;
  }): Promise<any> {
    const res = await apiClient.post('/finance/transfers', payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async setOpeningBalance(payload: {
    account_code: 'cash' | 'abl' | 'meezan';
    amount: number;
    date: string;
    memo?: string;
  }): Promise<any> {
    const res = await apiClient.post('/finance/accounts/opening-balance', payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async makeAdjustment(payload: {
    account_code: 'cash' | 'abl' | 'meezan';
    direction: 'in' | 'out';
    amount: number;
    date: string;
    memo: string;
    reason: string;
  }): Promise<any> {
    const res = await apiClient.post('/finance/accounts/adjustment', payload);
    bustOperationalCaches();
    emitInvalidation(['finance', 'dashboard']);
    return res;
  },

  async getAgeingSummary(asOf?: string, currency?: string, options?: RequestOptions): Promise<AgeingSummaryReport> {
    const key = `ageing-summary:${queryKey({ asOf, currency })}`;
    const cached = fresh(reportsCache.get(key) as CacheEntry<AgeingSummaryReport> | undefined, LIST_TTL_MS, options);
    if (cached) return cached;
    const query = new URLSearchParams();
    if (asOf) query.set('as_of', asOf);
    if (currency) query.set('currency', currency);
    const res = await apiClient.get<AgeingSummaryReport>(`/finance/reports/ageing-summary?${query.toString()}`, options);
    reportsCache.set(key, res);
    return res;
  },

  async getAgeingDetail(asOf?: string, clientName?: string, currency?: string, options?: RequestOptions): Promise<any> {
    const key = `ageing-detail:${queryKey({ asOf, clientName, currency })}`;
    const cached = fresh(reportsCache.get(key), LIST_TTL_MS, options);
    if (cached) return cached;
    const query = new URLSearchParams();
    if (asOf) query.set('as_of', asOf);
    if (clientName) query.set('client_name', clientName);
    if (currency) query.set('currency', currency);
    const res = await apiClient.get<any>(`/finance/reports/ageing-detail?${query.toString()}`, options);
    reportsCache.set(key, res);
    return res;
  },

  async getClientStatement(
    clientName: string,
    dateFrom?: string,
    dateTo?: string,
    currency?: string,
    options?: RequestOptions,
  ): Promise<ClientStatementReport> {
    const key = `statement:${queryKey({ clientName, dateFrom, dateTo, currency })}`;
    const cached = fresh(
      reportsCache.get(key) as CacheEntry<ClientStatementReport> | undefined,
      LIST_TTL_MS,
      options,
    );
    if (cached) return cached;
    const query = new URLSearchParams();
    query.set('client_name', clientName);
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (currency) query.set('currency', currency);
    const res = await apiClient.get<ClientStatementReport>(`/finance/reports/statement?${query.toString()}`, options);
    reportsCache.set(key, res);
    return res;
  },

  async getCollectionsReport(
    dateFrom?: string,
    dateTo?: string,
    method?: string,
    bank?: string,
    clientName?: string,
    options?: RequestOptions,
  ): Promise<CollectionsReport> {
    const key = `collections:${queryKey({ dateFrom, dateTo, method, bank, clientName })}`;
    const cached = fresh(reportsCache.get(key) as CacheEntry<CollectionsReport> | undefined, LIST_TTL_MS, options);
    if (cached) return cached;
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (method) query.set('method', method);
    if (bank) query.set('bank', bank);
    if (clientName) query.set('client_name', clientName);
    const res = await apiClient.get<CollectionsReport>(`/finance/reports/collections?${query.toString()}`, options);
    reportsCache.set(key, res);
    return res;
  },

  async getWhtReport(
    dateFrom?: string,
    dateTo?: string,
    clientName?: string,
    options?: RequestOptions,
  ): Promise<WhtReport> {
    const key = `wht:${queryKey({ dateFrom, dateTo, clientName })}`;
    const cached = fresh(reportsCache.get(key) as CacheEntry<WhtReport> | undefined, LIST_TTL_MS, options);
    if (cached) return cached;
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (clientName) query.set('client_name', clientName);
    const res = await apiClient.get<WhtReport>(`/finance/reports/wht?${query.toString()}`, options);
    reportsCache.set(key, res);
    return res;
  },

  getReportDownloadUrl(reportType: string, format: 'pdf' | 'xlsx', params: Record<string, string> = {}): string {
    const query = new URLSearchParams(params);
    query.set('format', format);
    return `/finance/reports/${reportType}?${query.toString()}`;
  },

  async downloadReport(
    reportType: string,
    params: Record<string, string | undefined> = {},
    filename?: string,
  ): Promise<void> {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value) query[key] = value;
    }
    const blob = await apiClient.getBlob(this.getReportDownloadUrl(reportType, 'pdf', query));
    if (blob.type && blob.type.includes('json')) {
      throw new Error('Report download was blocked. Try again in a minute.');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const from = query.date_from || query.as_of || 'report';
    const to = query.date_to || '';
    link.href = url;
    link.download = filename || `${reportType}_${from}${to ? `_${to}` : ''}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async uploadProofFile(file: File): Promise<{ file_id: string; url: string; filename: string }> {
    const proofError = validateFinanceProofFile(file);
    if (proofError) {
      throw new Error(proofError);
    }
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<{ file_id: string; url: string; filename: string }>('/finance/upload', formData);
  },

  async getPublicInvoice(shareToken: string): Promise<any> {
    const res = await fetch(`/api/v1/finance/public/invoice/${shareToken}`);
    if (!res.ok) throw new Error('Invoice link not found or expired');
    return res.json();
  },

  getPublicInvoicePdfUrl(shareToken: string): string {
    return `/api/v1/finance/public/invoice/${shareToken}/pdf`;
  },
};

registerCacheClearer(() => financeService.clearAllCaches());
