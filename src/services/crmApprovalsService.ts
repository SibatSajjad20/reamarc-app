import { apiClient } from './apiClient';

export interface WonDealApprovalItem {
  id: string;
  title: string;
  value: number;
  currency: string;
  won_date: string;
  sales_owner_name: string;
  lead_or_company_name: string;
  won_note: string;
}

export const crmApprovalsService = {
  listPending(): Promise<WonDealApprovalItem[]> {
    return apiClient.get<WonDealApprovalItem[]>('/crm/approvals/won-deals');
  },
  approve(dealId: string): Promise<unknown> {
    return apiClient.post(`/crm/approvals/won-deals/${encodeURIComponent(dealId)}/approve`, {});
  },
  reject(dealId: string, reason: string): Promise<unknown> {
    return apiClient.post(`/crm/approvals/won-deals/${encodeURIComponent(dealId)}/reject`, { reason });
  },
};
