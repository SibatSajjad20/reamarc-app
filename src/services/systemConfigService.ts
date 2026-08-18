import { apiClient } from './apiClient';

export interface SystemRole {
  id: string;
  label: string;
  description: string;
}

export interface SystemConfig {
  departments: string[];
  roles: SystemRole[];
}

export const DEFAULT_DEPARTMENTS: string[] = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'Performance Marketing',
  'AI',
  'HR',
];

export const DEFAULT_ROLES: SystemRole[] = [
  { id: 'admin', label: 'Admin', description: 'Full system control and user management' },
  { id: 'hr', label: 'HR', description: 'All departments logs & compliance access' },
  { id: 'team_lead', label: 'Team Lead', description: 'Leads department and oversees team logs' },
  { id: 'team_member', label: 'Team Member', description: 'Records own tasks & daily logs' },
  { id: 'client', label: 'Client', description: 'Sandbox Client Portal & Approvals only' },
];

export const systemConfigService = {
  async getConfig(): Promise<SystemConfig> {
    try {
      const res = await apiClient.get<SystemConfig>('/admin/system-config');
      return res;
    } catch (e) {
      return {
        departments: DEFAULT_DEPARTMENTS,
        roles: DEFAULT_ROLES,
      };
    }
  },

  async updateConfig(payload: { departments: string[]; roles: SystemRole[] }): Promise<SystemConfig> {
    const res = await apiClient.put<SystemConfig>('/admin/system-config', payload);
    return res;
  },
};
