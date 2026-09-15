import { apiClient } from './apiClient';
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
}

function toQuery(params?: CrmLeadQuery): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.search) sp.set('search', params.search);
  if (params.stage) sp.set('stage', params.stage);
  if (params.assigned_to) sp.set('assigned_to', params.assigned_to);
  if (params.include_junk) sp.set('include_junk', 'true');
  if (params.uncontacted) sp.set('uncontacted', 'true');
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export const crmService = {
  getPipeline(options?: { signal?: AbortSignal }): Promise<{ stages: CrmPipelineStage[]; outcomes: string[] }> {
    return apiClient.get('/crm/pipeline', { signal: options?.signal });
  },

  getAssignees(options?: { signal?: AbortSignal }): Promise<CrmAssignee[]> {
    return apiClient.get('/crm/assignees', { signal: options?.signal });
  },

  getCounts(options?: { signal?: AbortSignal }): Promise<CrmCounts> {
    return apiClient.get('/crm/counts', { signal: options?.signal });
  },

  listLeads(params?: CrmLeadQuery, options?: { signal?: AbortSignal }): Promise<CrmLeadList> {
    return apiClient.get(`/crm/leads${toQuery(params)}`, { signal: options?.signal });
  },

  getLead(id: string, options?: { signal?: AbortSignal }): Promise<CrmLeadDetail> {
    return apiClient.get(`/crm/leads/${encodeURIComponent(id)}`, { signal: options?.signal });
  },

  createLead(payload: CrmLeadCreatePayload): Promise<CrmLead> {
    return apiClient.post('/crm/leads', payload);
  },

  updateLead(id: string, payload: CrmLeadUpdatePayload): Promise<CrmLead> {
    return apiClient.patch(`/crm/leads/${encodeURIComponent(id)}`, payload);
  },

  deleteLead(id: string): Promise<void> {
    return apiClient.delete(`/crm/leads/${encodeURIComponent(id)}`);
  },


  assignLead(id: string, userId: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/assign`, { user_id: userId });
  },

  disqualifyLead(id: string, reason: string, note?: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/disqualify`, { reason, note });
  },

  setOutcome(id: string, outcome: 'won' | 'lost', note?: string, reason?: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/outcome`, {
      outcome,
      note: note || null,
      reason: reason || null,
    });
  },

  convertLead(id: string, workspaceId?: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/convert`, {
      workspace_id: workspaceId || null,
    });
  },

  approveWonLead(id: string, payload?: CrmApproveWonPayload): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/approve-won`, payload || {});
  },

  reopenLead(id: string, payload?: CrmReopenPayload): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/reopen`, payload || {});
  },

  listDeals(leadId: string, options?: { signal?: AbortSignal }): Promise<CrmDealList> {
    return apiClient.get(`/crm/leads/${encodeURIComponent(leadId)}/deals`, { signal: options?.signal });
  },

  listAllDeals(
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
    return apiClient.get(`/crm/deals${q ? `?${q}` : ''}`, { signal: options?.signal });
  },

  getDealPipeline(options?: { signal?: AbortSignal }): Promise<{ stages: CrmPipelineStage[]; statuses: string[] }> {
    return apiClient.get('/crm/deal-pipeline', { signal: options?.signal });
  },

  createDeal(leadId: string, payload: CrmDealCreatePayload): Promise<CrmDeal> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(leadId)}/deals`, payload);
  },

  updateDeal(dealId: string, payload: CrmDealUpdatePayload): Promise<CrmDeal> {
    return apiClient.patch(`/crm/deals/${encodeURIComponent(dealId)}`, payload);
  },

  markDealWon(dealId: string, note?: string): Promise<CrmDeal> {
    return apiClient.post(`/crm/deals/${encodeURIComponent(dealId)}/won`, { note: note || null });
  },

  markDealLost(dealId: string, reason: string, note?: string): Promise<CrmDeal> {
    return apiClient.post(`/crm/deals/${encodeURIComponent(dealId)}/lost`, {
      reason,
      note: note || null,
    });
  },

  reopenDeal(dealId: string, payload?: { target_stage?: string; note?: string }): Promise<CrmDeal> {
    return apiClient.post(`/crm/deals/${encodeURIComponent(dealId)}/reopen`, payload || {});
  },

  approveWonDeal(
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
    return apiClient.post(`/crm/deals/${encodeURIComponent(dealId)}/approve-won`, payload || {});
  },

  deleteDeal(dealId: string): Promise<void> {
    return apiClient.delete(`/crm/deals/${encodeURIComponent(dealId)}`);
  },

  addNote(id: string, body: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/notes`, { body });
  },

  logWhatsappOpened(id: string, templateId?: string): Promise<CrmWhatsAppOpenResult> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/whatsapp-opened`, {
      template_id: templateId || null,
    });
  },

  setFollowUp(id: string, nextFollowUpAt: string | null): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/follow-up`, {
      next_follow_up_at: nextFollowUpAt,
    });
  },

  markContacted(id: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/contacted`);
  },

  claimLead(id: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/claim`);
  },

  applyRules(id: string): Promise<CrmLead> {
    return apiClient.post(`/crm/leads/${encodeURIComponent(id)}/apply-rules`);
  },

  listRules(): Promise<CrmAssignmentRule[]> {
    return apiClient.get('/crm/rules');
  },

  createRule(payload: CrmRulePayload): Promise<CrmAssignmentRule> {
    return apiClient.post('/crm/rules', payload);
  },

  updateRule(id: string, payload: Partial<CrmRulePayload>): Promise<CrmAssignmentRule> {
    return apiClient.patch(`/crm/rules/${encodeURIComponent(id)}`, payload);
  },

  deleteRule(id: string): Promise<void> {
    return apiClient.delete(`/crm/rules/${encodeURIComponent(id)}`);
  },

  listTemplates(options?: { signal?: AbortSignal }): Promise<CrmTemplate[]> {
    return apiClient.get('/crm/templates', { signal: options?.signal });
  },

  createTemplate(payload: CrmTemplatePayload): Promise<CrmTemplate> {
    return apiClient.post('/crm/templates', payload);
  },

  updateTemplate(id: string, payload: Partial<CrmTemplatePayload>): Promise<CrmTemplate> {
    return apiClient.patch(`/crm/templates/${encodeURIComponent(id)}`, payload);
  },

  deleteTemplate(id: string): Promise<void> {
    return apiClient.delete(`/crm/templates/${encodeURIComponent(id)}`);
  },

  listIngestSources(): Promise<CrmIngestSource[]> {
    return apiClient.get('/crm/ingest-sources');
  },

  createIngestSource(payload: CrmIngestSourcePayload): Promise<CrmIngestSource> {
    return apiClient.post('/crm/ingest-sources', payload);
  },

  updateIngestSource(
    id: string,
    payload: Partial<CrmIngestSourcePayload> & { enabled?: boolean }
  ): Promise<CrmIngestSource> {
    return apiClient.patch(`/crm/ingest-sources/${encodeURIComponent(id)}`, payload);
  },

  deleteIngestSource(id: string): Promise<void> {
    return apiClient.delete(`/crm/ingest-sources/${encodeURIComponent(id)}`);
  },

  pollMetaForms(): Promise<{ forms: Array<{ form_id: string; created: number; duplicates: number }> }> {
    return apiClient.post('/crm/meta/poll');
  },

  listMetaPages(): Promise<CrmMetaPage[]> {
    return apiClient.get('/crm/meta/pages');
  },

  connectMetaPage(payload: {
    page_id: string;
    page_name: string;
    access_token: string;
    app_secret?: string;
    workspace_id?: string | null;
    default_campaign?: string | null;
  }): Promise<CrmMetaPage> {
    return apiClient.post('/crm/meta/pages', payload);
  },

  disconnectMetaPage(pageId: string): Promise<void> {
    return apiClient.delete(`/crm/meta/pages/${encodeURIComponent(pageId)}`);
  },

  getQueueStats(): Promise<CrmQueueStats> {
    return apiClient.get('/crm/ingest/queue-stats');
  },
};
