export type UserRole = 'admin' | 'editor' | 'viewer' | 'client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active?: boolean;
  workspace_ids?: string[];
  workspaceIds?: string[];
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
