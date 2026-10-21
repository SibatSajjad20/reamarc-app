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
  users?: any[];
  workspaces?: any[];
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
  company_id?: string;
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

  async getCompany(id: string) {
    return apiClient.get<Company & { users?: any[]; workspaces?: any[] }>(`/owner/companies/${id}`);
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

  async exitCompany() {
    return apiClient.post<{ ok: boolean; message: string }>('/owner/exit');
  },

  async resetTokenVersion(id: string) {
    return apiClient.post<{ ok: boolean; company_id: string; token_version: number }>(
      `/owner/companies/${id}/reset-token-version`
    );
  },

  async getAuditLog(limit = 50) {
    return apiClient.get<OwnerAuditEvent[]>(`/owner/audit?limit=${limit}`);
  },

  async verifyAuditChain() {
    return apiClient.get<{ ok: boolean; checked: number }>('/owner/audit/verify');
  },

  async getMembers(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<OwnerMember[]>(`/owner/members${q}`);
  },

  async grantCompanyAccess(userId: string, companyId: string, role?: string) {
    return apiClient.post<{
      ok: boolean;
      membership_id: string;
      user_id: string;
      company_id: string;
      status: string;
      needs_setup: boolean;
      role: string;
      note?: string;
    }>(`/owner/members/${userId}/companies`, { company_id: companyId, role: role || 'team_member' });
  },

  async removeCompanyAccess(userId: string, companyId: string) {
    return apiClient.post<{
      ok: boolean;
      user_id: string;
      company_id: string;
      status: string;
    }>(`/owner/members/${userId}/companies/${companyId}/remove`);
  },

  async setStartingPassword(userId: string, startingPassword: string) {
    return apiClient.post<{ ok: boolean; message: string }>(
      `/owner/members/${userId}/starting-password`,
      { starting_password: startingPassword }
    );
  },

  async provisionMember(payload: {
    full_name: string;
    email: string;
    phone?: string;
    company_id: string;
    role?: string;
    temporary_password?: string;
  }) {
    return apiClient.post<{
      ok: boolean;
      user_id: string;
      email: string;
      membership_id: string;
      company_id: string;
      is_new_user: boolean;
    }>('/owner/members', payload);
  },
};
