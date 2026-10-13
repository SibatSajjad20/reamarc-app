import { apiClient } from './apiClient';

export interface ModuleConfigItem {
  label: string;
  levels: [string, string][];
  notes: string;
  has_none?: boolean;
}

export interface RoleDefaultsResponse {
  roles: string[];
  modules: string[];
  module_config: Record<string, ModuleConfigItem>;
  defaults: Record<string, Record<string, string>>;
  member_counts: Record<string, number>;
  override_counts: Record<string, number>;
}

export interface PermissionMember {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: string[];
  primary_department: string;
  override_count: number;
  has_custom: boolean;
  avatar_url?: string | null;
}

export interface MembersListResponse {
  members: PermissionMember[];
  total: number;
  total_directory: number;
  total_custom: number;
}

export interface UserOverrideItem {
  department: string;
  module: string;
  level: string;
}

export interface UserPermissionsProfile {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: string;
    departments: string[];
    primary_department: string;
    avatar_url?: string | null;
  };
  overrides: Array<{
    _id?: string;
    department: string;
    module: string;
    level: string;
    updated_at?: string;
    updated_by?: string;
  }>;
  capability_overrides?: Record<string, boolean>;
  effective: {
    primary_department: string;
    departments: string[];
    modules: Record<string, Record<string, string>>;
    summary: Record<string, string>;
    capabilities?: Record<string, boolean>;
    role: string;
    is_admin: boolean;
    is_lead: boolean;
  };
}

export interface ViewAsEffectiveResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    primary_department: string;
    departments: string[];
  };
  sidebar_items: string[];
  table_rows: Array<{
    module: string;
    scope: string;
    why: string;
  }>;
  cannot_see: Array<{
    item: string;
    reason: string;
  }>;
  effective: Record<string, any>;
}

export interface PermissionAuditItem {
  id: string;
  at: string;
  actor_id: string;
  actor_name: string;
  target_type: 'role' | 'user';
  target_id: string;
  target_name?: string;
  department?: string | null;
  module: string;
  before: string;
  after: string;
  reason?: string;
}

export interface AuditLogsResponse {
  items: PermissionAuditItem[];
  total: number;
  retention_notice: string;
}

function toQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.append(key, String(val));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const permissionsService = {
  getRoleDefaults(): Promise<RoleDefaultsResponse> {
    return apiClient.get<RoleDefaultsResponse>('/settings/permissions/roles');
  },

  updateRoleDefaults(
    role: string,
    modules: Record<string, string>
  ): Promise<{ message: string; defaults: Record<string, string> }> {
    return apiClient.put<{ message: string; defaults: Record<string, string> }>(
      `/settings/permissions/roles/${encodeURIComponent(role)}`,
      { modules }
    );
  },

  resetRoleDefaults(
    role: string
  ): Promise<{ message: string; defaults: Record<string, string> }> {
    return apiClient.post<{ message: string; defaults: Record<string, string> }>(
      `/settings/permissions/roles/${encodeURIComponent(role)}/reset`,
      {}
    );
  },

  listUsers(params?: {
    search?: string;
    role?: string;
    dept?: string;
    custom?: string;
  }): Promise<MembersListResponse> {
    return apiClient.get<MembersListResponse>(
      `/settings/permissions/users${toQueryString(params)}`
    );
  },

  getUserPermissions(userId: string): Promise<UserPermissionsProfile> {
    return apiClient.get<UserPermissionsProfile>(
      `/settings/permissions/users/${encodeURIComponent(userId)}`
    );
  },

  updateUserPermissions(
    userId: string,
    data: {
      primary_department?: string;
      departments?: string[];
      overrides: UserOverrideItem[];
      capability_overrides?: Record<string, boolean>;
    }
  ): Promise<{ message: string; effective: any }> {
    return apiClient.put<{ message: string; effective: any }>(
      `/settings/permissions/users/${encodeURIComponent(userId)}`,
      data
    );
  },

  resetUserOverrides(
    userId: string,
    department?: string
  ): Promise<{ message: string; effective: any }> {
    const qs = department ? `?department=${encodeURIComponent(department)}` : '';
    return apiClient.delete<{ message: string; effective: any }>(
      `/settings/permissions/users/${encodeURIComponent(userId)}/overrides${qs}`
    );
  },

  getViewAsEffective(userId: string): Promise<ViewAsEffectiveResponse> {
    return apiClient.get<ViewAsEffectiveResponse>(
      `/settings/permissions/users/${encodeURIComponent(userId)}/effective`
    );
  },

  getAuditLogs(params?: {
    time_filter?: string;
    actor?: string;
    target?: string;
    search?: string;
    limit?: number;
    skip?: number;
  }): Promise<AuditLogsResponse> {
    return apiClient.get<AuditLogsResponse>(
      `/settings/permissions/audit${toQueryString(params)}`
    );
  },
};
