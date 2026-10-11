function parseDepts(user?: { department?: string; departments?: string[]; permissions?: any } | null): string[] {
  if (!user) return [];
  const list: string[] = [];
  if (Array.isArray(user.departments)) {
    list.push(...user.departments);
  }
  if (user.permissions?.departments && Array.isArray(user.permissions.departments)) {
    list.push(...user.permissions.departments);
  }
  if (typeof user.department === 'string' && user.department) {
    list.push(
      ...user.department
        .split(/[,;/]|\band\b|&/i)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return list.map((d) => d.toLowerCase().trim());
}

export function canAccessCrm(user?: {
  role?: string;
  department?: string;
  departments?: string[];
  crm_enabled?: boolean;
  permissions?: any;
} | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const role = (user.role || '').toLowerCase().trim();

  // Admin and Operations have full access
  if (role === 'admin' || role === 'operations') {
    return true;
  }

  // Permissions resolver precedence
  if (user.permissions) {
    const summary = user.permissions.summary?.sales;
    if (summary && summary !== 'none') return true;
    const mod = user.permissions.modules?.sales;
    if (mod && Object.values(mod).some((lvl) => lvl && lvl !== 'none')) {
      return true;
    }
  }

  const depts = parseDepts(user);
  if (depts.includes('operations') || depts.includes('admin')) {
    return true;
  }

  // Only team leads and team members of Sales department
  if (depts.includes('sales') && (role === 'team_lead' || role === 'team_member' || role === 'member')) {
    return true;
  }

  return false;
}

export function canAssignCrmLeads(user?: {
  role?: string;
  department?: string;
  departments?: string[];
  crm_enabled?: boolean;
  permissions?: any;
} | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = (user?.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'operations') return true;

  if (user?.permissions) {
    const summary = user.permissions.summary?.sales;
    if (summary === 'department' || summary === 'all') return role === 'team_lead';
    const mod = user.permissions.modules?.sales;
    if (mod) {
      const salesLvl = mod['Sales'] || mod['sales'];
      if (salesLvl === 'department' || salesLvl === 'all') return role === 'team_lead';
    }
  }

  const depts = parseDepts(user);
  return role === 'team_lead' && depts.includes('sales');
}
