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

export interface OwnerMemberMembership {
  id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  company_logo_url?: string | null;
  company_status?: string;
  role: string;
  status: 'active' | 'removed';
  needs_setup: boolean;
  granted_at?: string;
  removed_at?: string;
}

export interface OwnerMember {
  id: string;
  email: string;
  name: string;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  created_at?: string;
  memberships: OwnerMemberMembership[];
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

  async getMembers(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<OwnerMember[]>(`/owner/members${q}`);
  },

  async grantCompanyAccess(userId: string, companyId: string) {
    return apiClient.post<{
      ok: boolean;
      membership_id: string;
      user_id: string;
      company_id: string;
      status: string;
      needs_setup: boolean;
      role: string;
    }>(`/owner/members/${userId}/companies`, { company_id: companyId });
  },

  async removeCompanyAccess(userId: string, companyId: string) {
    return apiClient.post<{
      ok: boolean;
      user_id: string;
      company_id: string;
      status: string;
    }>(`/owner/members/${userId}/companies/${companyId}/remove`);
  },
};
