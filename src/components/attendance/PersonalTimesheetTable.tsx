import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Clock,
} from 'lucide-react';
import type {
  AttendanceRecord,
  MonthlyPunctualityRow,
  AttendanceStatus,
} from '../../types/attendance';
import { getAugust2026StartDay } from '../../constants/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';

interface PersonalTimesheetTableProps {
  records: AttendanceRecord[];
  summary: MonthlyPunctualityRow | null;
  selectedYear: number;
  selectedMonth: number;
  onYearMonthChange: (year: number, month: number) => void;
  isLoading?: boolean;
  employeeName?: string;
  employeeId?: string;
  canInquireMissedPunch?: boolean;
  readOnly?: boolean;
  onOpenRegularizationModal?: (record?: AttendanceRecord) => void;
  allowHistoryMonths?: boolean;
}

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

export const PersonalTimesheetTable: React.FC<PersonalTimesheetTableProps> = ({
  records,
  summary,
  selectedYear,
  selectedMonth,
  onYearMonthChange,
  isLoading = false,
  employeeName,
  employeeId,
  canInquireMissedPunch = false,
  readOnly = false,
  onOpenRegularizationModal,
  allowHistoryMonths = false,
}) => {
  const { addToast } = useToast();
  const [inquiredDates, setInquiredDates] = useState<Set<string>>(new Set());
  const [inquiryLoadingDate, setInquiryLoadingDate] = useState<string | null>(null);

  // Fetch active inquiries for this employee if HR/Admin
  useEffect(() => {
    if (!employeeId || !canInquireMissedPunch) return;
    attendanceService
      .getMissedPunchInquiries({ user_id: employeeId, status: 'pending' })
      .then((inquiries) => {
        const dates = new Set(inquiries.map((i) => i.date));
        setInquiredDates(dates);
      })
      .catch(() => {});
  }, [employeeId, canInquireMissedPunch, selectedYear, selectedMonth]);

  const handleInquireMissedCheckout = async (targetDate: string, _record?: AttendanceRecord) => {
    if (!employeeId || inquiryLoadingDate) return;
    setInquiryLoadingDate(targetDate);
    try {
      await attendanceService.createMissedPunchInquiry({
        user_id: employeeId,
        date: targetDate,
        note: 'Requested by HR via Monthly Timesheet',
      });
      setInquiredDates((prev) => new Set([...prev, targetDate]));
      addToast(
        'Inquiry Dispatched',
        `Prompted ${employeeName || 'employee'} to provide checkout time and reason for ${targetDate}.`,
        'success'
      );
    } catch (err: any) {
      addToast(
        'Failed to Send Inquiry',
        err.response?.data?.detail || err.message || 'Could not dispatch inquiry.',
        'error'
      );
    } finally {
      setInquiryLoadingDate(null);
    }
  };
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const minYear = 2026;
  const minMonth = 8;
  const canGoPrev =
    allowHistoryMonths &&
    (selectedYear > minYear || (selectedYear === minYear && selectedMonth > minMonth));
  const canGoNext =
    allowHistoryMonths &&
    (selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth));

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    if (selectedMonth === 1) {
      onYearMonthChange(selectedYear - 1, 12);
    } else {
      onYearMonthChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    if (selectedMonth === 12) {
      onYearMonthChange(selectedYear + 1, 1);
    } else {
      onYearMonthChange(selectedYear, selectedMonth + 1);
    }
  };

  // Build full month list of days
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((r) => {
      map.set(r.date, r);
    });
    return map;
  }, [records]);

  const rows = useMemo(() => {
    const today = new Date();
    const currY = today.getFullYear();
    const currM = today.getMonth() + 1;
    const currD = today.getDate();

    // Pre-launch months (before August 2026) have no tracking
    if (selectedYear < 2026 || (selectedYear === 2026 && selectedMonth < 8)) {
      return [];
    }

    // Future months have no records yet
    if (selectedYear > currY || (selectedYear === currY && selectedMonth > currM)) {
      return [];
    }

    // Start day: August 2026 starts at go-live (21st after midnight; 19th while testing)
    const startDay = (selectedYear === 2026 && selectedMonth === 8) ? getAugust2026StartDay() : 1;

    // End day: current active month shows day-by-day up to today; completed past months show full month
    let endDay = daysInMonth;
    if (selectedYear === currY && selectedMonth === currM) {
      endDay = Math.min(daysInMonth, currD);
    }

    const list = [];
    for (let d = startDay; d <= endDay; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth - 1, d);
      const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
      const isSunday = dayDate.getDay() === 0;
      const isFirstSaturday = dayDate.getDay() === 6 && d <= 7;

      const record = recordMap.get(dateStr);
      list.push({
        date: dateStr,
        dayNumber: d,
        dayOfWeek,
        isSunday,
        isFirstSaturday,
        record,
      });
    }
    return list;
  }, [selectedYear, selectedMonth, daysInMonth, recordMap]);

  // Helper for Status Badge styling
  const renderStatusBadge = (status: AttendanceStatus | string, lateMin: number) => {
    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Present
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="w-3 h-3" /> Late (+{lateMin}m)
          </span>
        );
      case 'missed_punch':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="w-3 h-3" /> Missed Punch
          </span>
        );
      case 'wfh':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            W.F.H
          </span>
        );
      case 'short_leave':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Short Leave
          </span>
        );
      case 'sick_leave':
      case 'casual_leave':
      case 'annual_leave':
      case 'unpaid_leave':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 capitalize">
            {status.replace('_', ' ')}
          </span>
        );
      case 'first_saturday_off':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            First Sat Off
          </span>
        );
      case 'sunday_off':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            Sunday Off
          </span>
        );
      case 'holiday':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700">
            Public Holiday
          </span>
        );
      case 'not_tracked':
      case 'upcoming':
        return (
          <span className="text-zinc-400 font-mono text-[11px]">-</span>
        );
      case 'absent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Absent
          </span>
        );
      case 'not_punched':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Not Checked In
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            {status || '-'}
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm overflow-hidden">
      {/* Top Header & Month Selector */}
      <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
        <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            {employeeName ? `${employeeName}'s Monthly Timesheet` : 'Monthly Attendance Timesheet'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Daily logs, punch records, overtime/undertime calculations
            {readOnly ? '.' : ' and regularization status.'}
          </p>
        </div>

        {/* Month Picker Controls */}
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Updating...</span>
            </div>
          )}

          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={allowHistoryMonths ? 'Previous Month' : 'Current month only'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <span>{MONTH_NAMES[selectedMonth - 1]}</span>
            <span>{selectedYear}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            disabled={!canGoNext}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={allowHistoryMonths ? 'Next Month' : 'Current month only'}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monthly KPI Stats Strip (Punctuality Score & Bonus Status Removed) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-zinc-50/70 dark:bg-[#161822] border-b border-zinc-200 dark:border-zinc-800">
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Working Days</span>
            <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{summary.total_working_days ?? summary.working_days ?? 11} Days</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Present Days</span>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{summary.days_present} Days</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Late Strikes</span>
            <p className={`text-sm font-bold mt-0.5 ${(summary.late_count ?? summary.late_strikes ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {summary.late_count ?? summary.late_strikes ?? 0} Strikes
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Total Overtime</span>
            <p className={`text-sm font-bold mt-0.5 ${(summary.overtime_hours ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {summary.overtime_formatted || '+00:00'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Total Undertime</span>
            <p className={`text-sm font-bold mt-0.5 ${(summary.undertime_hours ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {summary.undertime_formatted || '-00:00'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Net Variance</span>
            <p
              className={`text-sm font-bold font-mono mt-0.5 ${
                summary.net_variance_formatted?.startsWith('+') && summary.net_variance_formatted !== '+00:00'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summary.net_variance_formatted?.startsWith('-') && summary.net_variance_formatted !== '-00:00'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {summary.net_variance_formatted || '+00:00'}
            </p>
          </div>
        </div>
      )}

      {/* High-Density Timesheet Table */}
      {isLoading && rows.length === 0 && !summary ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {employeeName ? `Loading ${employeeName}'s timesheet...` : 'Loading timesheet data...'}
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-zinc-400 dark:text-zinc-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-semibold">No attendance records for this period.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Records are logged day-by-day starting from August 19, 2026.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161822] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold">
                <th className="py-3 px-4">Date & Day</th>
                <th className="py-3 px-4">Assigned Shift</th>
                <th className="py-3 px-4">Time In</th>
                <th className="py-3 px-4">Time Out</th>
                <th className="py-3 px-4">Break</th>
                <th className="py-3 px-4">Effective Hours</th>
                <th className="py-3 px-4">Overtime</th>
                <th className="py-3 px-4">Undertime</th>
                <th className="py-3 px-4">Status Tag</th>
                {(!readOnly || (canInquireMissedPunch && employeeId)) && (
                  <th className="py-3 px-4 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
              {rows.map(({ date, dayNumber, dayOfWeek, isSunday, isFirstSaturday, record }) => {
                const isHoliday = record?.status === 'holiday';
                const isOffDay = isSunday || isFirstSaturday || record?.status === 'sunday_off' || record?.status === 'first_saturday_off' || isHoliday;
                const defaultShiftName = summary?.shift_name || 'Standard 09:30-18:30';

                let defaultStatus = 'absent';
                if (isSunday) defaultStatus = 'sunday_off';
                else if (isFirstSaturday) defaultStatus = 'first_saturday_off';
                else if (isHoliday) defaultStatus = 'holiday';
                else defaultStatus = 'not_punched';

                const punchIn = record?.punch_in || (record as any)?.check_in || null;
                const punchOut = record?.punch_out || (record as any)?.check_out || null;
                const breakMin = record?.break_minutes ?? (record as any)?.break_duration_minutes ?? null;
                const isLate = record?.is_late || false;
                const lateMin = record?.late_minutes || 0;
                const isMissedPunch = Boolean(record?.is_missed_punch || record?.status === 'missed_punch');

                let status = record?.status || defaultStatus;
                if (isMissedPunch) {
                  status = 'missed_punch';
                } else if (punchIn && (status === 'absent' || status === 'not_punched')) {
                  status = isLate ? 'late' : 'present';
                } else if (!punchIn && status === 'absent' && !isOffDay) {
                  status = 'not_punched';
                }

                // Overtime & Undertime strings: only show computed values if not an off-day and employee punched in and out
                let otDisplay = '-';
                let utDisplay = '-';

                if (!isOffDay && record && isMissedPunch) {
                  otDisplay = '+00:00';
                  utDisplay = record.undertime_formatted || '-08:00';
                } else if (!isOffDay && record && punchIn && punchOut) {
                  if (record.overtime_status === 'pending' && (record.pending_overtime_minutes || 0) > 0) {
                    const otH = Math.floor((record.pending_overtime_minutes || 0) / 60);
                    const otM = (record.pending_overtime_minutes || 0) % 60;
                    otDisplay = `Pending +${String(otH).padStart(2, '0')}:${String(otM).padStart(2, '0')}`;
                  } else if (record.overtime_minutes > 0) {
                    const otH = Math.floor(record.overtime_minutes / 60);
                    const otM = record.overtime_minutes % 60;
                    otDisplay = `+${String(otH).padStart(2, '0')}:${String(otM).padStart(2, '0')}`;
                  } else {
                    otDisplay = '+00:00';
                  }

                  if (record.undertime_minutes > 0) {
                    const utH = Math.floor(record.undertime_minutes / 60);
                    const utM = record.undertime_minutes % 60;
                    utDisplay = `-${String(utH).padStart(2, '0')}:${String(utM).padStart(2, '0')}`;
                  } else {
                    utDisplay = '-00:00';
                  }
                } else if (!isOffDay && record && punchIn && !punchOut) {
                  otDisplay = '--:--';
                  utDisplay = '--:--';
                }

                // Effective hours
                let effHours = '-';
                if (record && punchIn) {
                  if (isMissedPunch) {
                    effHours = '0h 00m';
                  } else if (!punchOut) {
                    effHours = 'In Progress';
                  } else {
                    const totalMins = record.working_hours_minutes || ((record as any).work_hours ? Math.round((record as any).work_hours * 60) : 0);
                    const h = Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    effHours = `${h}h ${String(m).padStart(2, '0')}m`;
                  }
                }

                return (
                  <tr
                    key={date}
                    className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                      isOffDay ? 'bg-zinc-50/40 dark:bg-zinc-900/20' : ''
                    }`}
                  >
                    {/* Date & Day */}
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 text-zinc-400 font-normal">{dayNumber}</span>
                        <span>{date}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          {dayOfWeek}
                        </span>
                      </div>
                    </td>

                    {/* Shift */}
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {isHoliday
                        ? record?.shift_name || record?.notes || 'Public Holiday'
                        : record?.shift_name || (isSunday ? 'Sunday Rest' : isFirstSaturday ? '1st Sat Rest' : defaultShiftName)}
                    </td>

                    {/* Punch In */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {punchIn ? (
                        <span className={`font-mono font-bold ${isLate ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                          {punchIn}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>

                    {/* Punch Out */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {punchOut ? (
                        <span className="font-mono text-zinc-800 dark:text-zinc-200">{punchOut}</span>
                      ) : isMissedPunch ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">Missed</span>
                      ) : punchIn ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">● Active</span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>

                    {/* Break */}
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {record ? `${breakMin ?? 0}m` : '-'}
                    </td>

                    {/* Effective Hours */}
                    <td className="py-3 px-4 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                      {effHours}
                    </td>

                    {/* Overtime */}
                    <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                      {otDisplay !== '-' ? (
                        <span
                          className={
                            record?.overtime_status === 'pending'
                              ? 'text-amber-600 dark:text-amber-400'
                              : record && record.overtime_minutes > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }
                          title={record?.overtime_reason || undefined}
                        >
                          {otDisplay}
                          {record?.overtime_reason ? (
                            <span className="block text-[10px] font-normal text-zinc-400 truncate max-w-[140px]">
                              {record.overtime_reason}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-normal">-</span>
                      )}
                    </td>

                    {/* Undertime */}
                    <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                      {utDisplay !== '-' ? (
                        <span
                          className={record && record.undertime_minutes > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-600 dark:text-zinc-400"}
                          title={record?.undertime_reason || undefined}
                        >
                          {utDisplay}
                          {record?.undertime_reason && !record?.overtime_reason ? (
                            <span className="block text-[10px] font-normal text-zinc-400 truncate max-w-[140px]">
                              {record.undertime_reason}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-normal">-</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderStatusBadge(status, lateMin)}
                    </td>

                    {/* Regularization Action (Employee) or Ask Checkout (HR) */}
                    {(!readOnly || (canInquireMissedPunch && employeeId)) && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {!readOnly ? (
                          isOffDay ? (
                            <span className="text-zinc-400">-</span>
                          ) : isMissedPunch ? (
                            <button
                              type="button"
                              onClick={() => onOpenRegularizationModal?.(record)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                            >
                              Correction
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenRegularizationModal?.(record || ({ date } as any))}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              Correct
                            </button>
                          )
                        ) : (
                          // HR / Admin Viewing Employee Timesheet (Only show Ask Checkout for true missed punch days)
                          isMissedPunch ? (
                            inquiredDates.has(date) ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80">
                                <Clock className="w-3 h-3 text-indigo-500 animate-pulse" />
                                <span>Inquired</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleInquireMissedCheckout(date, record)}
                                disabled={inquiryLoadingDate === date}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                title={`Ask ${employeeName || 'employee'} to provide checkout time and explanation`}
                              >
                                {inquiryLoadingDate === date ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                <span>Ask Checkout</span>
                              </button>
                            )
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
