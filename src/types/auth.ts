export type UserRole = 'admin' | 'hr' | 'operations' | 'team_lead' | 'team_member' | 'client' | 'member';

export type DepartmentType =
  | 'website'
  | 'creative'
  | 'content'
  | 'seo'
  | 'performance marketing'
  | 'AI'
  | 'software development'
  | 'Software Development';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  phone?: string;
  phone_number?: string;
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
