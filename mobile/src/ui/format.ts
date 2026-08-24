export function initials(name?: string | null) {
  const parts = String(name || 'R').trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] || 'R') + (parts[1]?.[0] || '');
  return letters.toUpperCase();
}

export function prettyRole(role?: string | null) {
  const value = String(role || 'team_member').toLowerCase();
  const map: Record<string, string> = {
    admin: 'Admin',
    hr: 'HR',
    operations: 'Operations',
    team_lead: 'Team Lead',
    team_member: 'Team Member',
    member: 'Team Member',
    client: 'Client',
  };
  return map[value] || role || 'Team Member';
}

export function employeeCode(userId?: string | null) {
  const raw = String(userId || '000').replace(/[^a-zA-Z0-9]/g, '');
  return `EMP-${raw.slice(-3).toUpperCase().padStart(3, '0')}`;
}

export function formatLongDate(d = new Date()) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function formatDisplayDate(iso: string) {
  const [y, m, day] = iso.split('-').map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(hhmm?: string | null) {
  if (!hhmm) return '—';
  return hhmm.slice(0, 5);
}

export function relativeTime(iso?: string | null) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function alertKindMeta(kind?: string | null) {
  const key = String(kind || 'custom').toLowerCase();
  if (key.includes('missed')) return { label: 'Missed Punch', icon: 'warning-outline' as const };
  if (key.includes('pre_shift') || key.includes('shift') || key.includes('checkout')) {
    return { label: 'Shift Reminder', icon: 'alarm-outline' as const };
  }
  if (key.includes('test')) return { label: 'Test', icon: 'pulse-outline' as const };
  return { label: 'Announcement', icon: 'megaphone-outline' as const };
}

export function isMissedAlert(kind?: string | null) {
  return /missed/i.test(String(kind || ''));
}
