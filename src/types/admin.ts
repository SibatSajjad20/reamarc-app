import type { UserRole } from './auth';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  workspace_ids: string[];
}

export interface AdminCreateUserPayload {
  email: string;
  full_name: string;
  initial_password: string;
  role: UserRole;
  workspace_ids: string[];
}

export interface AdminUpdateUserPayload {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  workspace_ids?: string[];
}

export interface AdminCreateWorkspacePayload {
  name: string;
  industry?: string;
  brand_color?: string;
  initials?: string;
}

export interface AdminAssignWorkspacePayload {
  user_id: string;
  workspace_id: string;
  action: 'assign' | 'remove';
}
