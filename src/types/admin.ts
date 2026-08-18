import type { UserRole } from './auth';

export interface AdminMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  department?: string;
  is_active: boolean;
  created_at?: string;
}

export type AdminUser = AdminMember;

export interface CreateMemberPayload {
  full_name: string;
  email: string;
  role: UserRole;
  phone?: string;
  department?: string;
  temporary_password?: string;
  send_invite_email?: boolean;
  is_active?: boolean;
}

export type AdminCreateUserPayload = CreateMemberPayload;

export interface UpdateMemberPayload {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: UserRole;
  department?: string;
  is_active?: boolean;
}

export type AdminUpdateUserPayload = UpdateMemberPayload;

export interface MemberActivity {
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  department?: string;
  role: string;
  last_logged_date?: string | null;
  logged_today: boolean;
  days_missed: number;
  missing_dates: string[];
}

export interface ReminderResponse {
  success: boolean;
  message: string;
  user_id: string;
  channel: string;
}

export interface SendReminderPayload {
  channel: 'email' | 'in_app' | 'all';
  custom_message?: string;
}

export interface AdAccount {
  id: string;
  name: string;
  platform: string;
  account_id: string;
  pixel_id?: string;
  workspace_id?: string;
  workspace_name?: string;
  brandColor?: string;
  initials?: string;
  industry?: string;
  currency?: string;
  status?: 'active' | 'inactive' | 'paused';
  created_at?: string;
  updated_at?: string;
}

export interface CreateAdAccountPayload {
  name: string;
  platform: string;
  account_id: string;
  pixel_id?: string;
  workspace_id?: string;
  currency?: string;
  access_token?: string;
  refresh_token?: string;
  developer_token?: string;
  client_id?: string;
  client_secret?: string;
}

export interface UpdateAdAccountPayload {
  name?: string;
  platform?: string;
  account_id?: string;
  pixel_id?: string;
  workspace_id?: string;
  currency?: string;
  access_token?: string;
  refresh_token?: string;
  developer_token?: string;
  client_id?: string;
  client_secret?: string;
}

export interface CreateWorkspacePayload {
  name: string;
  brand_color?: string;
  status?: 'active' | 'inactive';
  initials?: string;
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  is_default?: boolean;
}

export interface UpdateWorkspacePayload {
  name?: string;
  brand_color?: string;
  status?: 'active' | 'inactive';
  initials?: string;
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  is_default?: boolean;
}

export type AdminCreateWorkspacePayload = CreateWorkspacePayload;
export type AdminUpdateWorkspacePayload = UpdateWorkspacePayload;
