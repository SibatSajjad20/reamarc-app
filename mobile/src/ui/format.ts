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

export function formatHours(hours: number): string {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
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
  if (key.includes('leave_clarified') || key.includes('clarif')) {
    return { label: 'Clarification', icon: 'chatbubble-ellipses-outline' as const };
  }
  if (key.includes('leave_needs_info') || key.includes('needs_info')) {
    return { label: 'Needs Info', icon: 'help-circle-outline' as const };
  }
  if (key.includes('test')) return { label: 'Test', icon: 'pulse-outline' as const };
  return { label: 'Announcement', icon: 'megaphone-outline' as const };
}

export function isMissedAlert(kind?: string | null) {
  const key = String(kind || '').toLowerCase();
  // Personal late / missed prompts only — not staff fan-out kinds.
  return key === 'late_checkin' || key.includes('missed');
}

/** Display names for pipeline stages — avoids reusing “Contacted” for outreach. */
const CRM_STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Reached',
  qualified: 'Qualified',
  session_booked: 'Meeting booked',
  session_done: 'Meeting done',
  opportunity_created: 'Opportunity',
  requirement_confirmed: 'Requirements',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
  verbal_approval: 'Verbal yes',
  contract_sent: 'Contract sent',
  contract_signed: 'Signed',
  payment_pending: 'Payment pending',
  payment_done: 'Paid',
};

export function titleCaseName(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatCrmStage(stage?: string | null): string {
  const key = String(stage || '').toLowerCase();
  if (CRM_STAGE_LABELS[key]) return CRM_STAGE_LABELS[key];
  if (!key) return '—';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('92')) {
    return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  if (phone.startsWith('+') && digits.length > 8) {
    return `+${digits}`;
  }
  return phone;
}

export type OutreachTone = 'muted' | 'amber' | 'emerald';

export function getOutreachStatus(lead: {
  contacted?: boolean;
  whatsapp_opened_at?: string | null;
}): { label: string; tone: OutreachTone } {
  if (lead.contacted) return { label: 'Contacted', tone: 'emerald' };
  if (lead.whatsapp_opened_at) return { label: 'WhatsApp opened', tone: 'amber' };
  return { label: 'Uncontacted', tone: 'muted' };
}

export function formatFollowUp(iso?: string | null): string {
  if (!iso) return 'Not set';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Not set';
  const diffMs = then - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) {
    if (mins <= 0) return 'Due now';
    return `In ${mins} min`;
  }
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) {
    if (hours < 0) return `${Math.abs(hours)}h overdue`;
    return `In ${hours}h`;
  }
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
