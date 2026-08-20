/** Shared department, role, and task-type badge classes. */

export function getDeptBadgeClass(dept?: string): string {
  const nd = (dept || '').toLowerCase().trim();
  if (nd.includes('software') || nd.includes('dev')) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (nd.includes('website')) {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
  }
  if (nd.includes('creative') || nd.includes('design')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
  }
  if (nd.includes('content')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  if (nd.includes('seo')) {
    return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
  }
  if (nd.includes('performance') || nd.includes('marketing')) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
  if (nd === 'ai' || nd.includes('artificial intelligence') || nd.includes('ai')) {
    return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
  }
  if (nd.includes('hr') || nd.includes('human resources')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  }
  if (nd.includes('operations') || nd === 'ops') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
}

export function getRoleBadgeClass(_role?: string): string {
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
}

export function getTaskTypeBadgeClass(taskType?: string): string {
  const t = (taskType || '').toLowerCase();
  if (t.includes('runtime')) {
    return 'bg-transparent text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700';
  }
  return 'bg-transparent text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700';
}

export function getRoleLabel(role?: string): string {
  if (role === 'admin') return 'Super Administrator';
  if (role === 'hr') return 'HR Manager';
  if (role === 'operations') return 'Operations Lead';
  if (role === 'team_lead') return 'Team Lead';
  if (role === 'client') return 'Client';
  return 'Team Member';
}

export function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().substring(0, 2).toUpperCase();
  }
  return 'EM';
}
