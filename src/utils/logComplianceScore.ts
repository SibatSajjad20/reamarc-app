export type ComplianceStatus = 'submitted' | 'missing' | 'in_shift' | 'not_started' | 'on_leave';

export interface ComplianceInput {
  range: 'today' | 'week' | string;
  status: ComplianceStatus;
  worked?: number;
  loggedHours?: number;
  daysMissed?: number;
  daysDue?: number | null;
  daysOnLeave?: number | null;
}

/** pct === null means there was nothing to score (on leave, no shifts) - show a reason, never 100%. */
export interface ComplianceScore {
  pct: number | null;
  reason?: 'On leave' | 'No shifts' | 'Not due yet';
}

export function complianceScore(i: ComplianceInput): ComplianceScore {
  const hoursRatio =
    i.worked && i.worked > 0 && i.loggedHours !== undefined
      ? Math.min(100, Math.round((i.loggedHours / i.worked) * 100))
      : null;

  if (i.range === 'today') {
    if (i.status === 'on_leave') return { pct: null, reason: 'On leave' };
    if (i.status === 'missing') return { pct: 0 };
    if (i.status === 'submitted') return { pct: 100 };
    if (hoursRatio !== null) return { pct: hoursRatio };
    return { pct: null, reason: 'Not due yet' };
  }

  if (hoursRatio !== null) return { pct: hoursRatio };
  if (typeof i.daysDue === 'number') {
    if (i.daysDue <= 0) return { pct: null, reason: (i.daysOnLeave || 0) > 0 ? 'On leave' : 'No shifts' };
    const missed = Math.min(i.daysDue, Math.max(0, i.daysMissed || 0));
    return { pct: Math.round(((i.daysDue - missed) / i.daysDue) * 100) };
  }
  // Older API without days_due.
  if (i.status === 'on_leave') return { pct: null, reason: 'On leave' };
  if (i.daysMissed !== undefined && i.daysMissed > 0) {
    const totalDays = i.range === 'week' ? 6 : 7;
    return { pct: Math.max(0, Math.round(((totalDays - i.daysMissed) / totalDays) * 100)) };
  }
  if (i.status === 'missing') return { pct: 0 };
  return { pct: null, reason: 'No shifts' };
}
