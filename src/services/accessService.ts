import { apiClient } from './apiClient';

export interface AccessModuleStatus {
  value: boolean;
  default: boolean;
  changed: boolean;
}

export interface AccessUserRow {
  id: string;
  name: string;
  avatar?: string | null;
  role: string;
  primary_department: string;
  departments?: string[];
  secondary_departments?: string[];
  modules: {
    attendance: AccessModuleStatus;
    daily_log: AccessModuleStatus;
    sales: AccessModuleStatus;
    content_calendar: AccessModuleStatus;
    website: AccessModuleStatus;
    ads: AccessModuleStatus;
  };
  content_stages: {
    locked: string | null;
    extra: string[];
  };
}

export const accessService = {
  async getUsers(params?: {
    department?: string;
    role?: string;
    q?: string;
    changed_only?: boolean;
  }): Promise<AccessUserRow[]> {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    if (params?.role) q.set('role', params.role);
    if (params?.q) q.set('q', params.q);
    if (params?.changed_only) q.set('changed_only', 'true');
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<AccessUserRow[]>(`/access/users${qs}`);
  },

  async patchUser(
    userId: string,
    payload: { module?: string; value?: boolean; content_stages?: string[] }
  ): Promise<AccessUserRow> {
    return apiClient.patch<AccessUserRow>(`/access/users/${userId}`, payload);
  },

  async resetUser(userId: string, module?: string): Promise<AccessUserRow> {
    return apiClient.post<AccessUserRow>(`/access/users/${userId}/reset`, { module });
  },

  async bulkApply(payload: {
    department?: string;
    role?: string;
    module: string;
    value: boolean;
  }): Promise<{ changed: number }> {
    return apiClient.post<{ changed: number }>('/access/bulk', payload);
  },
};
