export type UserRole = 'admin' | 'hr' | 'operations' | 'team_lead' | 'team_member' | 'client' | 'member';

export type DepartmentType =
  | 'website'
  | 'creative'
  | 'content'
  | 'seo'
  | 'performance marketing'
  | 'AI'
  | 'software development'
  | 'Software Development'
  | 'sales'
  | 'Sales';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  phone?: string;
  phone_number?: string;
  role: UserRole;
  department?: string;
  departments?: string[];
  primary_department?: string;
  permissions?: any;
  joining_date?: string | null;
  employment_type?: 'probation' | 'contract' | 'full_time' | string;
  is_active?: boolean;
  crm_enabled?: boolean;
  crm_paused?: boolean;
  workspace_ids?: string[];
  avatar_url?: string | null;
  content_stages?: string[];
  company_id?: string;
  is_super_admin?: boolean;
  company?: {
    id?: string;
    name?: string;
    display_name?: string | null;
    brand_name?: string | null;
    slug?: string;
    status?: 'active' | 'suspended';
    logo_url?: string | null;
    accent_color?: string;
    timezone?: string;
  };
  impersonating?: boolean;
  read_only?: boolean;
  membership_id?: string;
  needs_setup?: boolean;
  companies?: Array<{
    id: string;
    name: string;
    slug?: string;
    logo_url?: string | null;
    role?: string;
    accent_color?: string;
  }>;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  access_token?: string | null;
  token_type: string;
  user: AuthUser;
  refresh_token?: string | null;
  membership_id?: string;
  needs_setup?: boolean;
  companies?: Array<{
    id: string;
    name: string;
    slug?: string;
    logo_url?: string | null;
    role?: string;
    accent_color?: string;
  }>;
}
