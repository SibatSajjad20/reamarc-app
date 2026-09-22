import type { ViewType } from '../types';

const ATTENDANCE_KINDS = new Set([
  'late_checkin',
  'employee_late',
  'pre_shift',
  'checkout',
  'missed_yesterday',
  'missed_punch_inquiry',
  'missed_punch_resolved',
  'attendance_check_in',
  'attendance_check_out',
]);

export function viewForNotificationKind(kind: string | undefined): ViewType {
  const name = (kind || '').toLowerCase();
  if (name === 'crm_lead' || name.startsWith('crm')) return 'crm';
  if (ATTENDANCE_KINDS.has(name) || name.startsWith('leave_') || name.startsWith('attendance_')) {
    return 'attendance';
  }
  return 'dashboard';
}

export function viewFromNotificationPath(path: string): ViewType | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  const segment = path.replace(/^\/+|\/+$/g, '').split('/')[0]?.toLowerCase();
  if (segment === 'crm') return 'crm';
  if (segment === 'attendance') return 'attendance';
  if (segment === 'dashboard') return 'dashboard';
  return null;
}
