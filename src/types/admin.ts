import type { UserRole } from './auth';

export interface AdminMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  department?: string;
  designation?: string;
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
  designation?: string;
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
  designation?: string;
  is_active?: boolean;
}

export type AdminUpdateUserPayload = UpdateMemberPayload;

export interface MemberActivity {
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  designation?: string;
  role: string;
  last_logged_date?: string | null;
  logged_today: boolean;
  days_missed: number;
  missing_dates: string[];
}

export interface ReminderResponse {
  success: boolean;
  message: string;
  channel: string;
  recipient_email: string;
  recipient_name: string;
  missing_dates: string[];
  timestamp: string;
}

export interface AdAccount {
  id: string;
  name: string;
  platform?: string;
  industry?: string;
  brandColor: string;
  brand_color?: string;
  initials: string;
  account_id?: string;
  pixel_id?: string;
  isDefault?: boolean;
  created_at?: string;
}

export interface CreateAdAccountPayload {
  name: string;
  platform?: string;
  industry?: string;
  brand_color?: string;
  initials?: string;
  account_id?: string;
  pixel_id?: string;
}

export interface UpdateAdAccountPayload {
  name?: string;
  platform?: string;
  industry?: string;
  brand_color?: string;
  initials?: string;
  account_id?: string;
  pixel_id?: string;
}

export type AdminCreateWorkspacePayload = CreateAdAccountPayload;
export type AdminUpdateWorkspacePayload = UpdateAdAccountPayload;
