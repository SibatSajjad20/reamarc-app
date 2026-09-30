export type FollowUpBucket = 'overdue' | 'today' | 'scheduled' | 'idle';

const CLOSED = new Set(['won', 'lost', 'trashed', 'disqualified']);

export function followUpBucket(
  lead: { outcome?: string | null; next_follow_up_at?: string | null },
  now = Date.now()
): FollowUpBucket | null {
  if (lead.outcome && CLOSED.has(lead.outcome)) return null;
  const raw = lead.next_follow_up_at;
  if (!raw) return 'idle';
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return 'idle';
  if (time < now) return 'overdue';
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (time <= end.getTime()) return 'today';
  return 'scheduled';
}

export function formatFollowUpStamp(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
