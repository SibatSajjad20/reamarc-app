export type UserRole = 'admin' | 'hr' | 'team_lead' | 'team_member' | 'client' | 'member';

export type DepartmentType =
  | 'website'
  | 'creative'
  | 'content'
  | 'seo'
  | 'performance marketing'
  | 'AI';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  role: UserRole;
  department?: string;
  is_active?: boolean;
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
  access_token: string;
  token_type: string;
  user: AuthUser;
}
