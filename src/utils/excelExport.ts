import * as XLSX from 'xlsx';
import type {
  MonthlyPunctualityRow,
  MonthlyPunctualitySummary,
  AttendanceRecord,
} from '../types/attendance';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface ExportOptions {
  year: number;
  month: number;
  summaryRows: MonthlyPunctualityRow[];
  summaryStats?: MonthlyPunctualitySummary;
  employeeTimesheets?: Record<string, AttendanceRecord[]>;
  companyName?: string;
}

/**
 * Sanitize SheetJS worksheet name (max 31 chars, no invalid chars: \ / ? * : [ ])
 */
function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  let clean = name.replace(/[:\\/?*[\]]/g, '').trim();
  if (clean.length > 25) {
    clean = clean.substring(0, 25).trim();
  }
  if (!clean) {
    clean = 'Timesheet';
  }

  let finalName = clean;
  let counter = 2;
  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${clean.substring(0, 22)} (${counter})`;
    counter++;
  }
  usedNames.add(finalName.toLowerCase());
  return finalName;
}

/**
 * Generate multi-tab workbook (.xlsx) with:
 * Tab 1: Company Punctuality Summary
 * Tabs 2..N: Individual Employee Monthly Timesheets with daily records & color/status labels
 */
export function exportMonthlyAttendanceWorkbook({
  year,
  month,
  summaryRows,
  summaryStats,
  employeeTimesheets = {},
  companyName = 'Reamarc AI',
}: ExportOptions): void {
  const monthName = MONTH_NAMES[month - 1] || `Month-${month}`;
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  // ==========================================
  // TAB 1: COMPANY PUNCTUALITY SUMMARY
  // ==========================================
  const summarySheetData: any[][] = [];

  // Title Block
  summarySheetData.push([`${companyName.toUpperCase()} - MONTHLY ATTENDANCE & PUNCTUALITY SUMMARY`]);
  summarySheetData.push([`Month & Year: ${monthName} ${year}`, '', `Generated: ${new Date().toLocaleString()}`]);
  summarySheetData.push([
    `Total Headcount: ${summaryRows.length}`,
    `Company Avg Punctuality: ${summaryStats?.average_punctuality_percent ?? 'N/A'}%`,
    `Total Overtime: ${summaryStats?.total_overtime_formatted ?? '00:00'}`,
    `Total Undertime: ${summaryStats?.total_undertime_formatted ?? '00:00'}`,
    `Total Late Strikes: ${summaryStats?.total_late_strikes ?? 0}`,
  ]);
  summarySheetData.push([]); // Spacer row

  // Table Column Headers
  const summaryHeaders = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Primary Shift',
    'Working Days',
    'Days Present',
    'Leaves Taken',
    'Late Strikes (>10:00 AM)',
    'Short Leaves (Count)',
    'Short Leaves (Hours)',
    'Missed Punches',
    'Expected Hours',
    'Actual Hours',
    'Overtime (+HH:MM)',
    'Undertime (-HH:MM)',
    'Net Variance',
    'Punctuality Score (%)',
    'Bonus Recommendation',
  ];
  summarySheetData.push(summaryHeaders);

  // Table Data Rows
  summaryRows.forEach((row) => {
    summarySheetData.push([
      row.employee_code || 'N/A',
      row.employee_name,
      row.department,
      row.shift_name,
      row.working_days,
      row.days_present,
      row.leaves_taken,
      row.late_strikes,
      row.short_leaves_count,
      row.short_leaves_hours,
      row.missed_punches,
      row.expected_hours_formatted,
      row.actual_hours_formatted,
      row.overtime_formatted,
      row.undertime_formatted,
      row.net_variance_formatted,
      `${row.punctuality_score_percent}%`,
      row.bonus_recommendation,
    ]);
  });

  // Summary Totals Row
  const totalWorkingDays = summaryRows.reduce((acc, r) => acc + (r.working_days || 0), 0);
  const totalDaysPresent = summaryRows.reduce((acc, r) => acc + (r.days_present || 0), 0);
  const totalLeaves = summaryRows.reduce((acc, r) => acc + (r.leaves_taken || 0), 0);
  const totalLateStrikes = summaryRows.reduce((acc, r) => acc + (r.late_strikes || 0), 0);
  const totalShortLeaves = summaryRows.reduce((acc, r) => acc + (r.short_leaves_count || 0), 0);
  const totalShortLeaveHours = summaryRows.reduce((acc, r) => acc + (r.short_leaves_hours || 0), 0);
  const totalMissedPunches = summaryRows.reduce((acc, r) => acc + (r.missed_punches || 0), 0);

  summarySheetData.push([]);
  summarySheetData.push([
    'TOTAL / SUMMARY',
    `Employees: ${summaryRows.length}`,
    '',
    '',
    totalWorkingDays,
    totalDaysPresent,
    totalLeaves,
    totalLateStrikes,
    totalShortLeaves,
    totalShortLeaveHours,
    totalMissedPunches,
    '',
    '',
    summaryStats?.total_overtime_formatted || '',
    summaryStats?.total_undertime_formatted || '',
    '',
    summaryStats ? `${summaryStats.average_punctuality_percent}%` : '',
    `${summaryStats?.bonus_eligible_count ?? 0} Eligible for Bonus`,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);

  // Set column widths for Tab 1
  wsSummary['!cols'] = [
    { wch: 14 }, // Employee ID
    { wch: 22 }, // Employee Name
    { wch: 18 }, // Department
    { wch: 20 }, // Primary Shift
    { wch: 14 }, // Working Days
    { wch: 14 }, // Days Present
    { wch: 14 }, // Leaves Taken
    { wch: 22 }, // Late Strikes
    { wch: 18 }, // Short Leaves
    { wch: 18 }, // Short Leave Hours
    { wch: 16 }, // Missed Punches
    { wch: 16 }, // Expected Hours
    { wch: 16 }, // Actual Hours
    { wch: 18 }, // Overtime
    { wch: 18 }, // Undertime
    { wch: 16 }, // Net Variance
    { wch: 20 }, // Punctuality Score
    { wch: 26 }, // Bonus Recommendation
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Punctuality Summary');
  usedSheetNames.add('punctuality summary');

  // ==========================================
  // TABS 2..N: INDIVIDUAL EMPLOYEE TIMESHEETS
  // ==========================================
  const daysInMonth = new Date(year, month, 0).getDate();

  summaryRows.forEach((emp) => {
    const sheetName = sanitizeSheetName(`${emp.employee_name} Timesheet`, usedSheetNames);
    const empRecords = employeeTimesheets[emp.user_id] || [];
    const recordByDate = new Map<string, AttendanceRecord>();
    empRecords.forEach((rec) => {
      recordByDate.set(rec.date, rec);
    });

    const empSheetData: any[][] = [];

    // Header Block
    empSheetData.push([`${emp.employee_name.toUpperCase()} - MONTHLY TIMESHEET (${monthName} ${year})`]);
    empSheetData.push([
      `Employee ID: ${emp.employee_code || 'N/A'}`,
      `Department: ${emp.department}`,
      `Assigned Shift: ${emp.shift_name}`,
      `Punctuality Score: ${emp.punctuality_score_percent}%`,
    ]);
    empSheetData.push([
      `Expected Hours: ${emp.expected_hours_formatted}`,
      `Actual Hours: ${emp.actual_hours_formatted}`,
      `Overtime: ${emp.overtime_formatted}`,
      `Undertime: ${emp.undertime_formatted}`,
      `Bonus Status: ${emp.bonus_recommendation}`,
    ]);
    empSheetData.push([]); // Spacer row

    // Table Headers
    const empHeaders = [
      'Date',
      'Day of Week',
      'Shift',
      'Time In',
      'Time Out',
      'Break (min)',
      'Effective Hours',
      'Overtime (+HH:MM)',
      'Undertime (-HH:MM)',
      'Status / Register Tag',
      'Late Minutes (>10:00 AM)',
      'Security Tier / Geo Verification',
      'Notes & Audit Trail',
    ];
    empSheetData.push(empHeaders);

    // Days 1 to daysInMonth
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(year, month - 1, d);
      const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
      const isSunday = dayDate.getDay() === 0;
      const isFirstSaturday = dayDate.getDay() === 6 && d <= 7;

      const record = recordByDate.get(dateStr);

      let shift = emp.shift_name;
      let punchIn = '-';
      let punchOut = '-';
      let breakMin = '-';
      let effHours = '-';
      let ot = '+00:00';
      let ut = '-00:00';
      let statusTag = 'Absent';
      let lateMinutes = '-';
      let securityTier = '-';
      let notes = '';

      if (isSunday) {
        statusTag = 'Sunday Off';
        shift = 'Weekly Rest';
      } else if (isFirstSaturday) {
        statusTag = 'First Saturday Off';
        shift = 'Monthly Rest';
      }

      if (record) {
        shift = record.shift_name || shift;
        punchIn = record.punch_in || '-';
        punchOut = record.punch_out || '-';
        breakMin = record.break_minutes ? `${record.break_minutes}m` : '0m';

        const hours = Math.floor(record.working_hours_minutes / 60);
        const mins = record.working_hours_minutes % 60;
        effHours = record.punch_in ? `${hours}h ${String(mins).padStart(2, '0')}m` : '-';

        const otH = Math.floor(record.overtime_minutes / 60);
        const otM = record.overtime_minutes % 60;
        ot = `+${String(otH).padStart(2, '0')}:${String(otM).padStart(2, '0')}`;

        const utH = Math.floor(record.undertime_minutes / 60);
        const utM = record.undertime_minutes % 60;
        ut = `-${String(utH).padStart(2, '0')}:${String(utM).padStart(2, '0')}`;

        // Status tag formatting
        switch (record.status) {
          case 'present':
            statusTag = 'Present (On-Time)';
            break;
          case 'late':
            statusTag = `Late Arrival (${record.late_minutes}m)`;
            lateMinutes = `${record.late_minutes} mins`;
            break;
          case 'wfh':
            statusTag = 'Work From Home (WFH)';
            break;
          case 'short_leave':
            statusTag = 'Short Leave (1-3h)';
            break;
          case 'sick_leave':
            statusTag = 'Sick Leave (Approved)';
            break;
          case 'casual_leave':
            statusTag = 'Casual Leave (Approved)';
            break;
          case 'annual_leave':
            statusTag = 'Annual Leave (Approved)';
            break;
          case 'unpaid_leave':
            statusTag = 'Unpaid Leave';
            break;
          case 'missed_punch':
            statusTag = '⚠️ Missed Punch (Unclosed)';
            break;
          case 'first_saturday_off':
            statusTag = 'First Saturday Off';
            break;
          case 'sunday_off':
            statusTag = 'Sunday Off';
            break;
          case 'holiday':
            statusTag = 'Public Holiday';
            break;
          default:
            statusTag = record.status;
        }

        if (record.is_wfh_approved) {
          securityTier = '🏠 Approved WFH Bypass';
        } else if (record.ip_verified && record.gps_verified) {
          securityTier = `🔒 IP Verified + 📍 GPS (${record.distance_meters || 0}m)`;
        } else if (record.ip_verified) {
          securityTier = '🔒 Tier 1 Office IP Verified';
        } else if (record.gps_verified) {
          securityTier = `📍 Tier 3 GPS Verified (${record.distance_meters || 0}m)`;
        } else if (record.punch_in) {
          securityTier = '⚠️ External IP / Manual Override';
        }

        notes = record.notes || '';
      }

      empSheetData.push([
        dateStr,
        dayName,
        shift,
        punchIn,
        punchOut,
        breakMin,
        effHours,
        ot,
        ut,
        statusTag,
        lateMinutes,
        securityTier,
        notes,
      ]);
    }

    const wsEmp = XLSX.utils.aoa_to_sheet(empSheetData);

    // Column widths for Employee Tab
    wsEmp['!cols'] = [
      { wch: 14 }, // Date
      { wch: 12 }, // Day
      { wch: 20 }, // Shift
      { wch: 14 }, // Time In
      { wch: 14 }, // Time Out
      { wch: 12 }, // Break
      { wch: 16 }, // Effective Hours
      { wch: 18 }, // Overtime
      { wch: 18 }, // Undertime
      { wch: 24 }, // Status
      { wch: 22 }, // Late Minutes
      { wch: 30 }, // Security Tier
      { wch: 30 }, // Notes
    ];

    XLSX.utils.book_append_sheet(wb, wsEmp, sheetName);
  });

  // Write and trigger download in browser
  const filename = `Reamarc_Attendance_Summary_${year}_${String(month).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
