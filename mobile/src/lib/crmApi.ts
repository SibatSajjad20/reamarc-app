import { api } from './api';
import type {
  CrmActivity,
  CrmAssignee,
  CrmCounts,
  CrmDeal,
  CrmDealCreatePayload,
  CrmLead,
  CrmLeadCreatePayload,
  CrmLeadDetail,
  CrmPipelineStage,
  CrmTemplate,
} from '../types/crm';

export const crmApi = {
  async getPipeline(): Promise<CrmPipelineStage[]> {
    const res = await api<{ stages: CrmPipelineStage[] }>('/crm/pipeline');
    return res.stages || [];
  },

  async getDealPipeline(): Promise<CrmPipelineStage[]> {
    const res = await api<{ stages: CrmPipelineStage[] }>('/crm/deal-pipeline');
    return res.stages || [];
  },

  async getCounts(): Promise<CrmCounts> {
    return api<CrmCounts>('/crm/counts');
  },

  async getAssignees(): Promise<CrmAssignee[]> {
    return api<CrmAssignee[]>('/crm/assignees');
  },

  async listLeads(params?: {
    search?: string;
    stage?: string;
    assigned_to?: string;
    include_junk?: boolean;
    uncontacted?: boolean;
    limit?: number;
    skip?: number;
  }): Promise<{ items: CrmLead[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.stage) query.append('stage', params.stage);
    if (params?.assigned_to) query.append('assigned_to', params.assigned_to);
    if (params?.include_junk) query.append('include_junk', 'true');
    if (params?.uncontacted !== undefined) query.append('uncontacted', String(params.uncontacted));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.skip) query.append('skip', String(params.skip));

    const qs = query.toString();
    return api<{ items: CrmLead[]; total: number }>(`/crm/leads${qs ? `?${qs}` : ''}`);
  },

  async getLead(id: string): Promise<CrmLeadDetail> {
    return api<CrmLeadDetail>(`/crm/leads/${encodeURIComponent(id)}`);
  },

  async createLead(payload: CrmLeadCreatePayload): Promise<CrmLead> {
    return api<CrmLead>('/crm/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateLead(id: string, payload: Partial<CrmLead>): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteLead(id: string): Promise<void> {
    return api<void>(`/crm/leads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async assignLead(id: string, userId: string): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  async claimLead(id: string): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/claim`, {
      method: 'POST',
    });
  },

  async markContacted(id: string): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/contacted`, {
      method: 'POST',
    });
  },

  async logWhatsappOpened(id: string, templateId?: string): Promise<CrmLead & { wa_url?: string; rendered_text?: string }> {
    return api<CrmLead & { wa_url?: string; rendered_text?: string }>(
      `/crm/leads/${encodeURIComponent(id)}/whatsapp-opened`,
      {
        method: 'POST',
        body: JSON.stringify({ template_id: templateId || null }),
      }
    );
  },

  async addNote(id: string, body: string): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },

  async setFollowUp(id: string, nextFollowUpAt: string | null): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ next_follow_up_at: nextFollowUpAt }),
    });
  },

  async listTemplates(): Promise<CrmTemplate[]> {
    return api<CrmTemplate[]>('/crm/templates');
  },

  async setOutcome(
    id: string,
    outcome: 'won' | 'lost',
    reason?: string,
    note?: string
  ): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/outcome`, {
      method: 'POST',
      body: JSON.stringify({ outcome, reason, note }),
    });
  },

  async disqualifyLead(id: string, reason: string, note?: string): Promise<CrmLead> {
    return api<CrmLead>(`/crm/leads/${encodeURIComponent(id)}/disqualify`, {
      method: 'POST',
      body: JSON.stringify({ reason, note }),
    });
  },

  async listDeals(params?: {
    search?: string;
    stage?: string;
    status?: string;
    lead_id?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ deals: CrmDeal[]; total_count: number; total_value: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.stage) query.append('stage', params.stage);
    if (params?.status) query.append('status', params.status);
    if (params?.lead_id) query.append('lead_id', params.lead_id);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.skip) query.append('skip', String(params.skip));

    const qs = query.toString();
    return api<{ deals: CrmDeal[]; total_count: number; total_value: number }>(
      `/crm/deals${qs ? `?${qs}` : ''}`
    );
  },

  async createDeal(leadId: string, payload: CrmDealCreatePayload): Promise<CrmDeal> {
    return api<CrmDeal>(`/crm/leads/${encodeURIComponent(leadId)}/deals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateDeal(dealId: string, payload: Partial<CrmDeal>): Promise<CrmDeal> {
    return api<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async markDealWon(dealId: string, note?: string): Promise<CrmDeal> {
    return api<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/won`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  async markDealLost(dealId: string, reason: string, note?: string): Promise<CrmDeal> {
    return api<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/lost`, {
      method: 'POST',
      body: JSON.stringify({ reason, note }),
    });
  },

  async approveWonDeal(dealId: string): Promise<CrmDeal> {
    return api<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/approve-won`, {
      method: 'POST',
    });
  },
};
