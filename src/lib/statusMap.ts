export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export interface StatusMapping {
  variant: StatusVariant;
  label: string;
}

const STATUS_DICTIONARY: Record<string, StatusMapping> = {
  // Attendance
  present: { variant: 'success', label: 'Present' },
  late: { variant: 'warning', label: 'Late' },
  wfh: { variant: 'accent', label: 'WFH' },
  awaiting_checkin: { variant: 'neutral', label: 'Not checked in' },
  short_leave: { variant: 'info', label: 'Short leave' },
  sick_leave: { variant: 'info', label: 'Sick leave' },
  casual_leave: { variant: 'info', label: 'Casual leave' },
  annual_leave: { variant: 'info', label: 'Annual leave' },
  unpaid_leave: { variant: 'info', label: 'Unpaid leave' },
  first_saturday_off: { variant: 'neutral', label: 'First Saturday off' },
  sunday_off: { variant: 'neutral', label: 'Sunday off' },
  holiday: { variant: 'neutral', label: 'Holiday' },
  missed_punch: { variant: 'danger', label: 'Missed punch' },
  absent: { variant: 'danger', label: 'Absent' },

  // Requests
  pending: { variant: 'warning', label: 'Pending' },
  needs_info: { variant: 'info', label: 'Needs info' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'danger', label: 'Rejected' },
  appealed: { variant: 'accent', label: 'Appealed' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },

  // Lead Outcomes
  won: { variant: 'success', label: 'Won' },
  lost: { variant: 'danger', label: 'Lost' },
  disqualified: { variant: 'neutral', label: 'Disqualified' },
  trashed: { variant: 'neutral', label: 'Trash' },

  // Lead Operational Status
  overdue: { variant: 'danger', label: 'Follow-up due' },
  uncontacted: { variant: 'warning', label: 'Uncontacted' },
  client_form_pending: { variant: 'warning', label: 'Needs client form' },
  inert: { variant: 'neutral', label: 'Contacted' },

  // Deal Payment & Approval
  payment_pending: { variant: 'warning', label: 'Payment pending' },
  payment_done: { variant: 'success', label: 'Payment done' },
  partial: { variant: 'info', label: 'Partial' },
  cleared: { variant: 'success', label: 'Cleared' },
  pending_operations: { variant: 'warning', label: 'Pending ops approval' },

  // Content Stages & Setup
  content: { variant: 'info', label: 'Content' },
  content_internal_review: { variant: 'warning', label: 'Content internal review' },
  content_client_review: { variant: 'warning', label: 'Content client review' },
  content_revision: { variant: 'danger', label: 'Content revision' },
  creative_production: { variant: 'info', label: 'Creative production' },
  creative_internal_review: { variant: 'warning', label: 'Creative internal review' },
  creative_client_review: { variant: 'warning', label: 'Creative client review' },
  creative_revision: { variant: 'danger', label: 'Creative revision' },
  ready_to_post: { variant: 'accent', label: 'Ready to post' },
  posted: { variant: 'success', label: 'Posted' },
  not_started: { variant: 'neutral', label: 'Not started' },
  in_setup: { variant: 'info', label: 'In setup' },
  live: { variant: 'success', label: 'Live' },
  paused: { variant: 'warning', label: 'Paused' },

  // Exceptions
  needs_review: { variant: 'warning', label: 'Needs review' },
  waiting_on_reviewer: { variant: 'accent', label: 'Reason submitted' },
  waiting_on_employee: { variant: 'info', label: 'Awaiting employee' },
  employee_notified: { variant: 'info', label: 'Awaiting employee' },
  escalated: { variant: 'danger', label: 'Sent to HR' },
  reviewed: { variant: 'success', label: 'Resolved' },

  // Daily Log Tasks
  completed: { variant: 'success', label: 'Completed' },
  incomplete: { variant: 'warning', label: 'Incomplete' },
  blocker: { variant: 'danger', label: 'Blocker' },

  // Log Compliance
  submitted: { variant: 'success', label: 'Submitted' },
  missing: { variant: 'danger', label: 'Missing' },
  in_shift: { variant: 'info', label: 'In shift' },
  on_leave: { variant: 'info', label: 'On leave' },

  // Client Health & Priority
  excellent: { variant: 'success', label: 'Excellent' },
  good: { variant: 'info', label: 'Good' },
  moderate: { variant: 'warning', label: 'Moderate' },
  emergency: { variant: 'danger', label: 'Emergency' },
  high: { variant: 'warning', label: 'High' },
  medium: { variant: 'neutral', label: 'Medium' },
  low: { variant: 'neutral', label: 'Low' },

  // Client & Member Status
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'neutral', label: 'Inactive' },
  stopped: { variant: 'neutral', label: 'Stopped' },
  error: { variant: 'danger', label: 'Error' },
};

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function getStatusMapping(rawStatus?: string | null): StatusMapping {
  if (!rawStatus) {
    return { variant: 'neutral', label: 'Unknown' };
  }
  const normalized = rawStatus.trim().toLowerCase().replace(/\s+/g, '_');
  if (STATUS_DICTIONARY[normalized]) {
    return STATUS_DICTIONARY[normalized];
  }
  return {
    variant: 'neutral',
    label: humanize(rawStatus),
  };
}
