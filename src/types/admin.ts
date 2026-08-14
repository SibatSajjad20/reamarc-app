import type { UserRole } from './auth';

export interface AdminMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department?: string;
  designation?: string;
  is_active: boolean;
  workspace_ids?: string[];
  created_at?: string;
}

export type AdminUser = AdminMember;

export interface CreateMemberPayload {
  full_name: string;
  email: string;
  role: UserRole;
  department?: string;
  designation?: string;
  temporary_password?: string;
  send_invite_email?: boolean;
  is_active?: boolean;
  workspace_ids?: string[];
}

export type AdminCreateUserPayload = CreateMemberPayload;

export interface UpdateMemberPayload {
  full_name?: string;
  role?: UserRole;
  department?: string;
  designation?: string;
  is_active?: boolean;
  workspace_ids?: string[];
}

export type AdminUpdateUserPayload = UpdateMemberPayload;

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
