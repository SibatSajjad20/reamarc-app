import type { DailyMatrixEmployeeRow } from '../types/attendance';

export type AttendanceStatusBucket =
  | 'All'
  | 'Present'
  | 'Late'
  | 'WFH'
  | 'Leave'
  | 'Absent'
  | 'Missed punch'
  | 'Not checked in'
  | 'Off';

export const isLeaveStatus = (status: string): boolean => {
  if (!status) return false;
  return (
    status === 'on_leave' ||
    status === 'leave' ||
    status === 'short_leave' ||
    status === 'sick_leave' ||
    status === 'casual_leave' ||
    status === 'annual_leave' ||
    status === 'unpaid_leave' ||
    status.endsWith('_leave')
  );
};

export const isOffStatus = (status: string): boolean => {
  if (!status) return false;
  return (
    status === 'weekend_off' ||
    status === 'holiday' ||
    status === 'first_saturday_off' ||
    status === 'sunday_off' ||
    status.endsWith('_off')
  );
};

export const matchesAttendanceStatus = (
  row: DailyMatrixEmployeeRow,
  filter: AttendanceStatusBucket | string
): boolean => {
  if (!filter || filter === 'All') return true;

  switch (filter) {
    case 'Present':
      return row.status === 'present' || (row.status as string) === 'half_day';
    case 'Late':
      return Boolean(row.is_late) || row.status === 'late';
    case 'WFH':
      return row.status === 'wfh' || Boolean(row.is_wfh_approved);
    case 'Leave':
    case 'Leaves':
      return isLeaveStatus(row.status);
    case 'Absent':
      return row.status === 'absent';
    case 'Missed punch':
    case 'Missed':
      return row.status === 'missed_punch';
    case 'Not checked in':
      return row.status === 'awaiting_checkin';
    case 'Off':
      return isOffStatus(row.status);
    default:
      return row.status === filter;
  }
};

export const getAttendanceSortPriority = (row: DailyMatrixEmployeeRow): number => {
  if (row.status === 'missed_punch') return 1;
  if (row.is_late || row.status === 'late') return 2;
  if (row.status === 'absent') return 3;
  if (row.status === 'awaiting_checkin') return 4;
  if (
    row.status === 'present' ||
    (row.status as string) === 'half_day' ||
    row.status === 'wfh' ||
    row.is_wfh_approved
  ) {
    return 5;
  }
  if (isLeaveStatus(row.status)) return 6;
  if (isOffStatus(row.status)) return 7;
  return 8;
};

export const sortAttendanceRows = (rows: DailyMatrixEmployeeRow[]): DailyMatrixEmployeeRow[] => {
  return [...rows].sort((a, b) => {
    const prioA = getAttendanceSortPriority(a);
    const prioB = getAttendanceSortPriority(b);
    if (prioA !== prioB) return prioA - prioB;

    // For group 5 (Present / WFH), sort by check-in time earliest first
    if (prioA === 5) {
      const timeA = a.check_in || '99:99';
      const timeB = b.check_in || '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
    }

    return (a.employee_name || '').localeCompare(b.employee_name || '');
  });
};
