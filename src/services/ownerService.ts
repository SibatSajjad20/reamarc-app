import { apiClient } from './apiClient';

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  timezone: string;
  accent_color: string;
  logo_url?: string | null;
  user_count?: number;
  limits?: {
    max_users?: number;
  };
  created_at?: string;
  created_by?: string;
}

export interface CreateCompanyPayload {
  name: string;
  slug: string;
  plan: 'starter' | 'pro' | 'enterprise';
  timezone: string;
  accent_color: string;
  admin_name: string;
  admin_email: string;
  admin_password?: string;
  max_users?: number;
}

export interface OwnerAuditEvent {
  id: string;
  action: string;
  actor_user_id?: string;
  target_company_id?: string;
  created_at: string;
  hash: string;
  prev_hash: string;
  details?: Record<string, any>;
}

export const ownerService = {
  async getSession() {
    return apiClient.get<{ user: any; is_owner: boolean }>('/owner/session');
  },

  async getCompanies() {
    return apiClient.get<Company[]>('/owner/companies');
  },

  async createCompany(payload: CreateCompanyPayload) {
    return apiClient.post<Company>('/owner/companies', payload);
  },

  async updateCompany(id: string, payload: Partial<Company>) {
    return apiClient.patch<Company>(`/owner/companies/${id}`, payload);
  },

  async enterCompany(id: string, reason = 'Support / Inspection', readOnly = true) {
    return apiClient.post<{
      impersonation_token: string;
      company: Company;
      read_only: boolean;
      expires_in_minutes: number;
    }>(`/owner/companies/${id}/enter`, { reason, read_only: readOnly });
  },

  async resetTokenVersion(id: string) {
    return apiClient.post<{ ok: boolean; company_id: string; token_version: number }>(
      `/owner/companies/${id}/reset-token-version`
    );
  },

  async getAuditLog(limit = 50) {
    return apiClient.get<OwnerAuditEvent[]>(`/owner/audit?limit=${limit}`);
  },
};
