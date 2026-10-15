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
  | 'Shift changed'
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
    case 'Shift changed':
    case 'ShiftChanged':
      return Boolean(row.shift_changed);
    case 'Off':
      return isOffStatus(row.status);
    default:
      return row.status === filter;
  }
};

function parseTimeMinutes(val?: string | null): number {
  if (!val) return 999999;
  if (val.includes('T')) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  const match = val.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  return 999999;
}

export const getAttendanceSortPriority = (row: DailyMatrixEmployeeRow): number => {
  const isWfh = row.status === 'wfh' || Boolean(row.is_wfh_approved);
  const isLate = Boolean(row.is_late) || row.status === 'late';

  // 1. Present (on time)
  if ((row.status === 'present' || (row.status as string) === 'half_day') && !isLate && !isWfh) {
    return 1;
  }

  // 2. Late
  if (isLate && !isWfh) {
    return 2;
  }

  // 3. WFH
  if (isWfh) {
    return 3;
  }

  // 4. Leave
  if (isLeaveStatus(row.status)) {
    return 4;
  }

  // 5. Absent
  if (row.status === 'absent') {
    return 5;
  }

  // 6. Missed punch
  if (row.status === 'missed_punch') {
    return 6;
  }

  // 7. Not checked in
  if (row.status === 'awaiting_checkin' || (!row.status && !row.check_in && !(row as any).punch_in)) {
    return 7;
  }

  // 8. Off
  if (isOffStatus(row.status)) {
    return 8;
  }

  return 9;
};

export const sortAttendanceRows = (rows: DailyMatrixEmployeeRow[]): DailyMatrixEmployeeRow[] => {
  return [...rows].sort((a, b) => {
    const prioA = getAttendanceSortPriority(a);
    const prioB = getAttendanceSortPriority(b);
    if (prioA !== prioB) return prioA - prioB;

    // For checked-in groups (Present, Late, WFH), sort by check-in time earliest first
    if (prioA <= 3) {
      const minA = parseTimeMinutes(a.check_in ?? (a as any).punch_in);
      const minB = parseTimeMinutes(b.check_in ?? (b as any).punch_in);
      if (minA !== minB) return minA - minB;
    }

    return (a.employee_name || '').localeCompare(b.employee_name || '');
  });
};
