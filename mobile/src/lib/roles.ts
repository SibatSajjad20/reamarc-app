export function normalizeRole(role?: string | null): string {
  return String(role || '').toLowerCase().trim();
}

export function isAdmin(role?: string | null): boolean {
  const value = normalizeRole(role);
  return value === 'admin' || value === 'super_admin';
}

export function canBroadcast(role?: string | null): boolean {
  const value = normalizeRole(role);
  return isAdmin(value) || value === 'hr';
}

export function canReviewRequests(role?: string | null): boolean {
  const value = normalizeRole(role);
  return value === 'hr' || value === 'admin' || value === 'super_admin' || value === 'operations';
}
