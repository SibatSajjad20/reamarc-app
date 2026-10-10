import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';
import type { WorkspaceCreatePayload } from './workspaceService';
import type {
  CrmApproveWonPayload,
  CrmAssignee,
  CrmCounts,
  CrmDeal,
  CrmDealCreatePayload,
  CrmDealList,
  CrmDealUpdatePayload,
  CrmLead,
  CrmLeadCreatePayload,
  CrmLeadUpdatePayload,
  CrmLeadDetail,
  CrmLeadList,
  CrmPipelineStage,
  CrmReopenPayload,
  CrmAssignmentRule,
  CrmRulePayload,
  CrmTemplate,
  CrmTemplatePayload,
  CrmIngestSource,
  CrmIngestSourcePayload,
  CrmWhatsAppOpenResult,
  CrmMetaPage,
  CrmQueueStats,
} from '../types/crm';

export interface CrmLeadQuery {
  search?: string;
  stage?: string;
  assigned_to?: string;
  include_junk?: boolean;
  uncontacted?: boolean;
  outcome?: string;
  limit?: number;
}

function toQuery(params?: CrmLeadQuery): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.search) sp.set('search', params.search);
  if (params.stage) sp.set('stage', params.stage);
  if (params.assigned_to) sp.set('assigned_to', params.assigned_to);
  if (params.include_junk) sp.set('include_junk', 'true');
  if (params.uncontacted) sp.set('uncontacted', 'true');
  if (params.outcome) sp.set('outcome', params.outcome);
  if (params.limit) sp.set('limit', String(params.limit));
  const q = sp.toString();
  return q ? `?${q}` : '';
}

// Bounded in-memory caches for CRM module SWR persistence
const crmLeadsCache = new BoundedCache<CrmLeadList>(20);
const crmLeadDetailCache = new BoundedCache<CrmLeadDetail>(50);
const crmCountsCache = new BoundedCache<CrmCounts>(5);
const crmPipelineCache = new BoundedCache<{ stages: CrmPipelineStage[]; outcomes: string[] }>(5);
const crmAssigneesCache = new BoundedCache<CrmAssignee[]>(5);
const crmTemplatesCache = new BoundedCache<CrmTemplate[]>(5);
const crmDealsCache = new BoundedCache<CrmDealList>(10);
const crmDealPipelineCache = new BoundedCache<{ stages: CrmPipelineStage[]; statuses: string[] }>(5);

export const crmService = {
  // --- Cached accessors for instant paint ---
  getCachedPipeline(): CacheEntry<{ stages: CrmPipelineStage[]; outcomes: string[] }> | undefined {
    return crmPipelineCache.get('pipeline');
  },
  setCachedPipeline(data: { stages: CrmPipelineStage[]; outcomes: string[] }): void {
    crmPipelineCache.set('pipeline', data);
  },

  getCachedAssignees(): CacheEntry<CrmAssignee[]> | undefined {
    return crmAssigneesCache.get('assignees');
  },
  setCachedAssignees(data: CrmAssignee[]): void {
    crmAssigneesCache.set('assignees', data);
  },

  getCachedCounts(): CacheEntry<CrmCounts> | undefined {
    return crmCountsCache.get('counts');
  },
  setCachedCounts(data: CrmCounts): void {
    crmCountsCache.set('counts', data);
  },

  getCachedLeads(params?: CrmLeadQuery): CacheEntry<CrmLeadList> | undefined {
    return crmLeadsCache.get(toQuery(params) || 'default');
  },
  setCachedLeads(data: CrmLeadList, params?: CrmLeadQuery): void {
    crmLeadsCache.set(toQuery(params) || 'default', data);
  },

  getCachedLead(id: string): CacheEntry<CrmLeadDetail> | undefined {
    return crmLeadDetailCache.get(id);
  },
  setCachedLead(id: string, data: CrmLeadDetail): void {
    crmLeadDetailCache.set(id, data);
  },

  getCachedTemplates(): CacheEntry<CrmTemplate[]> | undefined {
    return crmTemplatesCache.get('templates');
  },
  setCachedTemplates(data: CrmTemplate[]): void {
    crmTemplatesCache.set('templates', data);
  },

  getCachedDeals(key: string = 'default'): CacheEntry<CrmDealList> | undefined {
    return crmDealsCache.get(key);
  },
  setCachedDeals(key: string = 'default', data: CrmDealList): void {
    crmDealsCache.set(key, data);
  },

  getCachedDealPipeline(): CacheEntry<{ stages: CrmPipelineStage[]; statuses: string[] }> | undefined {
    return crmDealPipelineCache.get('deal_pipeline');
  },
  setCachedDealPipeline(data: { stages: CrmPipelineStage[]; statuses: string[] }): void {
    crmDealPipelineCache.set('deal_pipeline', data);
  },

  hasCache(): boolean {
    return crmLeadsCache.size() > 0 || crmCountsCache.size() > 0 || crmPipelineCache.size() > 0;
  },

  // --- API Read Methods ---
  async getPipeline(options?: { signal?: AbortSignal }): Promise<{ stages: CrmPipelineStage[]; outcomes: string[] }> {
    const cached = crmPipelineCache.get('pipeline');
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }
    const res = await apiClient.get<{ stages: CrmPipelineStage[]; outcomes: string[] }>('/crm/pipeline', { signal: options?.signal });
    crmPipelineCache.set('pipeline', res);
    return res;
  },

  async getAssignees(options?: { signal?: AbortSignal }): Promise<CrmAssignee[]> {
    const cached = crmAssigneesCache.get('assignees');
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmAssignee[]>('/crm/assignees', { signal: options?.signal });
    crmAssigneesCache.set('assignees', res);
    return res;
  },

  async getCounts(options?: { signal?: AbortSignal }): Promise<CrmCounts> {
    const cached = crmCountsCache.get('counts');
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 30_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmCounts>('/crm/counts', { signal: options?.signal });
    crmCountsCache.set('counts', res);
    return res;
  },

  async listLeads(params?: CrmLeadQuery, options?: { signal?: AbortSignal }): Promise<CrmLeadList> {
    const key = toQuery(params) || 'default';
    const cached = crmLeadsCache.get(key);
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 30_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmLeadList>(`/crm/leads${toQuery(params)}`, { signal: options?.signal });
    crmLeadsCache.set(key, res);
    return res;
  },

  async getLead(id: string, options?: { signal?: AbortSignal }): Promise<CrmLeadDetail> {
    const cached = crmLeadDetailCache.get(id);
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 30_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmLeadDetail>(`/crm/leads/${encodeURIComponent(id)}`, { signal: options?.signal });
    crmLeadDetailCache.set(id, res);
    return res;
  },

  // --- API Write Methods (with cache invalidation + invalidation bus) ---
  async createLead(payload: CrmLeadCreatePayload): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>('/crm/leads', payload);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async updateLead(id: string, payload: CrmLeadUpdatePayload): Promise<CrmLead> {
    const res = await apiClient.patch<CrmLead>(`/crm/leads/${encodeURIComponent(id)}`, payload);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async deleteLead(id: string): Promise<void> {
    await apiClient.delete(`/crm/leads/${encodeURIComponent(id)}`);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
  },

  async assignLead(id: string, userId: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/assign`, { user_id: userId });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async trashLead(id: string, reason: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/trash`, { reason });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async disqualifyLead(id: string, reason: string, note?: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/disqualify`, { reason, note });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async setOutcome(id: string, outcome: 'won' | 'lost', note?: string, reason?: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/outcome`, {
      outcome,
      note: note || null,
      reason: reason || null,
    });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async convertLead(id: string, workspaceId?: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/convert`, {
      workspace_id: workspaceId || null,
    });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmDealsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.deals', 'crm.counts', 'workspaces', 'dashboard']);
    return res;
  },

  async registerClient(id: string, payload: WorkspaceCreatePayload): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/register-client`, payload);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmDealsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.deals', 'crm.counts', 'workspaces', 'dashboard']);
    return res;
  },

  async approveWonLead(id: string, payload?: CrmApproveWonPayload): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/approve-won`, payload || {});
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async reopenLead(id: string, payload?: CrmReopenPayload): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/reopen`, payload || {});
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async listDeals(leadId: string, options?: { signal?: AbortSignal }): Promise<CrmDealList> {
    return apiClient.get(`/crm/leads/${encodeURIComponent(leadId)}/deals`, { signal: options?.signal });
  },

  async listAllDeals(
    params?: {
      search?: string;
      stage?: string;
      status?: string;
      lead_id?: string;
    },
    options?: { signal?: AbortSignal }
  ): Promise<CrmDealList> {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.stage) sp.set('stage', params.stage);
    if (params?.status) sp.set('status', params.status);
    if (params?.lead_id) sp.set('lead_id', params.lead_id);
    const q = sp.toString();
    const key = q || 'default';
    const cached = crmDealsCache.get(key);
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 30_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmDealList>(`/crm/deals${q ? `?${q}` : ''}`, { signal: options?.signal });
    crmDealsCache.set(key, res);
    return res;
  },

  async getDealPipeline(options?: { signal?: AbortSignal }): Promise<{ stages: CrmPipelineStage[]; statuses: string[] }> {
    const cached = crmDealPipelineCache.get('deal_pipeline');
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }
    const res = await apiClient.get<{ stages: CrmPipelineStage[]; statuses: string[] }>('/crm/deal-pipeline', { signal: options?.signal });
    crmDealPipelineCache.set('deal_pipeline', res);
    return res;
  },

  async createDeal(leadId: string, payload: CrmDealCreatePayload): Promise<CrmDeal> {
    const res = await apiClient.post<CrmDeal>(`/crm/leads/${encodeURIComponent(leadId)}/deals`, payload);
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
    return res;
  },

  async updateDeal(dealId: string, payload: CrmDealUpdatePayload): Promise<CrmDeal> {
    const res = await apiClient.patch<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}`, payload);
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
    return res;
  },

  async markDealWon(dealId: string, note?: string): Promise<CrmDeal> {
    const res = await apiClient.post<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/won`, { note: note || null });
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
    return res;
  },

  async markDealLost(dealId: string, reason: string, note?: string): Promise<CrmDeal> {
    const res = await apiClient.post<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/lost`, {
      reason,
      note: note || null,
    });
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
    return res;
  },

  async reopenDeal(dealId: string, payload?: { target_stage?: string; note?: string }): Promise<CrmDeal> {
    const res = await apiClient.post<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/reopen`, payload || {});
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
    return res;
  },

  async approveWonDeal(
    dealId: string,
    payload?: {
      payment_cleared?: boolean;
      workspace_name?: string;
      brand_color?: string;
      services?: string[];
      project_cycle?: string;
      note?: string;
      workspace_id?: string;
    }
  ): Promise<CrmDeal> {
    const res = await apiClient.post<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/approve-won`, payload || {});
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard', 'workspaces']);
    return res;
  },

  async deleteDeal(dealId: string): Promise<void> {
    await apiClient.delete(`/crm/deals/${encodeURIComponent(dealId)}`);
    crmDealsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.deals', 'crm.counts', 'dashboard']);
  },

  async addNote(id: string, body: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/notes`, { body });
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'dashboard']);
    return res;
  },

  async logWhatsappOpened(id: string, templateId?: string): Promise<CrmWhatsAppOpenResult> {
    const res = await apiClient.post<CrmWhatsAppOpenResult>(`/crm/leads/${encodeURIComponent(id)}/whatsapp-opened`, {
      template_id: templateId || null,
    });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async setFollowUp(id: string, nextFollowUpAt: string | null): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/follow-up`, {
      next_follow_up_at: nextFollowUpAt,
    });
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async markContacted(id: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/contacted`);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async claimLead(id: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/claim`);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async applyRules(id: string): Promise<CrmLead> {
    const res = await apiClient.post<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/apply-rules`);
    crmLeadsCache.clear();
    crmCountsCache.clear();
    crmLeadDetailCache.delete(id);
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async listRules(): Promise<CrmAssignmentRule[]> {
    return apiClient.get('/crm/rules');
  },

  async createRule(payload: CrmRulePayload): Promise<CrmAssignmentRule> {
    const res = await apiClient.post<CrmAssignmentRule>('/crm/rules', payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async updateRule(id: string, payload: Partial<CrmRulePayload>): Promise<CrmAssignmentRule> {
    const res = await apiClient.patch<CrmAssignmentRule>(`/crm/rules/${encodeURIComponent(id)}`, payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async deleteRule(id: string): Promise<void> {
    await apiClient.delete(`/crm/rules/${encodeURIComponent(id)}`);
    emitInvalidation(['crm', 'settings', 'dashboard']);
  },

  async listTemplates(options?: { signal?: AbortSignal }): Promise<CrmTemplate[]> {
    const cached = crmTemplatesCache.get('templates');
    if (cached && !options?.signal && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }
    const res = await apiClient.get<CrmTemplate[]>('/crm/templates', { signal: options?.signal });
    crmTemplatesCache.set('templates', res);
    return res;
  },

  async createTemplate(payload: CrmTemplatePayload): Promise<CrmTemplate> {
    const res = await apiClient.post<CrmTemplate>('/crm/templates', payload);
    crmTemplatesCache.clear();
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async updateTemplate(id: string, payload: Partial<CrmTemplatePayload>): Promise<CrmTemplate> {
    const res = await apiClient.patch<CrmTemplate>(`/crm/templates/${encodeURIComponent(id)}`, payload);
    crmTemplatesCache.clear();
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async deleteTemplate(id: string): Promise<void> {
    await apiClient.delete(`/crm/templates/${encodeURIComponent(id)}`);
    crmTemplatesCache.clear();
    emitInvalidation(['crm', 'settings', 'dashboard']);
  },

  async listIngestSources(): Promise<CrmIngestSource[]> {
    return apiClient.get('/crm/ingest-sources');
  },

  async createIngestSource(payload: CrmIngestSourcePayload): Promise<CrmIngestSource> {
    const res = await apiClient.post<CrmIngestSource>('/crm/ingest-sources', payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async updateIngestSource(
    id: string,
    payload: Partial<CrmIngestSourcePayload> & { enabled?: boolean }
  ): Promise<CrmIngestSource> {
    const res = await apiClient.patch<CrmIngestSource>(`/crm/ingest-sources/${encodeURIComponent(id)}`, payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async deleteIngestSource(id: string): Promise<void> {
    await apiClient.delete(`/crm/ingest-sources/${encodeURIComponent(id)}`);
    emitInvalidation(['crm', 'settings', 'dashboard']);
  },

  async pollMetaForms(): Promise<{ forms: Array<{ form_id: string; created: number; duplicates: number }> }> {
    const res = await apiClient.post<{ forms: Array<{ form_id: string; created: number; duplicates: number }> }>('/crm/meta/poll');
    crmLeadsCache.clear();
    crmCountsCache.clear();
    emitInvalidation(['crm', 'crm.leads', 'crm.counts', 'dashboard']);
    return res;
  },

  async listMetaPages(): Promise<CrmMetaPage[]> {
    return apiClient.get('/crm/meta/pages');
  },

  async connectMetaPage(payload: {
    page_id: string;
    page_name: string;
    access_token: string;
    app_secret?: string;
    workspace_id?: string | null;
    default_campaign?: string | null;
  }): Promise<CrmMetaPage> {
    const res = await apiClient.post<CrmMetaPage>('/crm/meta/pages', payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  async disconnectMetaPage(pageId: string): Promise<void> {
    await apiClient.delete(`/crm/meta/pages/${encodeURIComponent(pageId)}`);
    emitInvalidation(['crm', 'settings', 'dashboard']);
  },

  async getQueueStats(): Promise<CrmQueueStats> {
    return apiClient.get('/crm/ingest/queue-stats');
  },

  async getSchedulerSettings(): Promise<any> {
    return apiClient.get('/crm/scheduler/settings');
  },

  async updateSchedulerSettings(payload: Record<string, any>): Promise<any> {
    const res = await apiClient.patch('/crm/scheduler/settings', payload);
    emitInvalidation(['crm', 'settings', 'dashboard']);
    return res;
  },

  clearAllCaches(): void {
    crmLeadsCache.clear();
    crmLeadDetailCache.clear();
    crmCountsCache.clear();
    crmPipelineCache.clear();
    crmAssigneesCache.clear();
    crmTemplatesCache.clear();
    crmDealsCache.clear();
    crmDealPipelineCache.clear();
  },
};

// Register for app-wide cache sweeps on logout and user switch
registerCacheClearer(() => crmService.clearAllCaches());
