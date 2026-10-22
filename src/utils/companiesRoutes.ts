export function isOwnerLegacyPath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  return p === 'owner' || p.startsWith('owner/');
}

export function ownerPathToCompaniesPath(pathname: string): string {
  const p = pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  const sub = p.startsWith('owner/') ? p.slice(6) : '';
  if (sub === 'members' || p.endsWith('/members')) return '/admin/companies/members';
  if (sub === 'activity' || p.endsWith('/activity')) return '/admin/companies/activity';
  return '/admin/companies';
}

export function companiesTabFromPath(pathname: string): 'companies' | 'members' | 'activity' {
  const p = pathname.toLowerCase();
  if (p.endsWith('/members')) return 'members';
  if (p.endsWith('/activity')) return 'activity';
  return 'companies';
}

export function companiesPathForTab(tab: 'companies' | 'members' | 'activity'): string {
  if (tab === 'members') return '/admin/companies/members';
  if (tab === 'activity') return '/admin/companies/activity';
  return '/admin/companies';
}
