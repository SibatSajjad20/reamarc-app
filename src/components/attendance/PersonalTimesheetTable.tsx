import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
  Send,
  Clock,
} from 'lucide-react';
import type {
  AttendanceRecord,
  MonthlyPunctualityRow,
  AttendanceStatus,
} from '../../types/attendance';
import { getTimesheetStartDay } from '../../constants/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { KpiCard } from '../ui/KpiCard';
import { StatusPill } from '../ui/StatusPill';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface PersonalTimesheetTableProps {
  records: AttendanceRecord[];
  summary: MonthlyPunctualityRow | null;
  selectedYear: number;
  selectedMonth: number;
  onYearMonthChange: (year: number, month: number) => void;
  isLoading?: boolean;
  employeeName?: string;
  employeeId?: string;
  joiningDate?: string | null;
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
  joiningDate,
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
        'Inquiry dispatched',
        `Prompted ${employeeName || 'employee'} to provide checkout time and reason for ${targetDate}.`,
        'success'
      );
    } catch (err: any) {
      addToast(
        'Failed to send inquiry',
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

  const todayIso = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

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

    // Start day: max(company go-live, employee joining date) within this month
    const startDay = getTimesheetStartDay(selectedYear, selectedMonth, joiningDate);

    // End day: current active month shows day-by-day up to today; completed past months show full month
    let endDay = daysInMonth;
    if (selectedYear === currY && selectedMonth === currM) {
      endDay = Math.min(daysInMonth, currD);
    }

    if (startDay > endDay) {
      return [];
    }

    const list = [];
    for (let d = startDay; d <= endDay; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth - 1, d);
      const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
      const monthShort = dayDate.toLocaleDateString('en-US', { month: 'short' });
      const formattedDate = `${dayOfWeek}, ${d} ${monthShort}`;
      const isSunday = dayDate.getDay() === 0;
      const isFirstSaturday = dayDate.getDay() === 6 && d <= 7;

      const record = recordMap.get(dateStr);
      list.push({
        date: dateStr,
        formattedDate,
        dayNumber: d,
        dayOfWeek,
        isSunday,
        isFirstSaturday,
        record,
      });
    }
    return list;
  }, [selectedYear, selectedMonth, daysInMonth, recordMap, joiningDate]);

  // Helper for Status Pill rendering
  const renderStatusBadge = (status: AttendanceStatus | string, lateMin: number) => {
    switch (status) {
      case 'present':
        return <StatusPill status="present" />;
      case 'late':
        return <StatusPill variant="warning" label={lateMin > 0 ? `Late (+${lateMin}m)` : 'Late'} />;
      case 'missed_punch':
        return <StatusPill status="missed_punch" />;
      case 'wfh':
        return <StatusPill status="wfh" />;
      case 'short_leave':
        return <StatusPill status="short_leave" />;
      case 'sick_leave':
      case 'casual_leave':
      case 'annual_leave':
      case 'unpaid_leave':
      case 'first_saturday_off':
      case 'sunday_off':
      case 'holiday':
      case 'absent':
        return <StatusPill status={status} />;
      case 'not_tracked':
      case 'upcoming':
        return <span className="text-fg-muted font-numeric text-small">—</span>;
      case 'not_punched':
        return <StatusPill status="awaiting_checkin" label="Not checked in" />;
      default:
        return <StatusPill variant="neutral" label={status || '—'} />;
    }
  };

  return (
    <div className="bg-surface rounded-lg border border-border shadow-xs overflow-hidden">
      {/* Top Header & Month Selector */}
      <div className="p-4 sm:p-5 border-b border-border flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-h3 font-semibold text-fg flex items-center gap-2">
            <Calendar className="w-4 h-4 text-fg-muted" />
            {employeeName ? `${employeeName}'s timesheet` : 'My timesheet'}
          </h3>
          <p className="text-small text-fg-muted mt-0.5">
            Punches, assigned shifts, hours worked and variance records.
          </p>
        </div>

        {/* Month Stepper Controls */}
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-small text-fg-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Updating…</span>
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            aria-label="Previous month"
            icon={ChevronLeft}
          />

          <div className="px-3 py-1 rounded-md border border-border text-ui font-medium text-fg min-w-[130px] text-center font-sans">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={handleNextMonth}
            disabled={!canGoNext}
            aria-label="Next month"
            icon={ChevronRight}
          />
        </div>
      </div>

      {/* Monthly KPI Stats Strip (4 KpiCards per §13.4) */}
      {summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b border-border bg-subtle/30">
          <KpiCard
            label="Working days"
            value={summary.total_working_days ?? summary.working_days ?? 0}
            unit="days"
          />
          <KpiCard
            label="Present"
            value={summary.days_present ?? 0}
            unit="days"
          />
          <KpiCard
            label="Late strikes"
            value={summary.late_count ?? summary.late_strikes ?? 0}
            deltaType={(summary.late_count ?? summary.late_strikes ?? 0) > 0 ? 'warning' : 'neutral'}
          />
          <KpiCard
            label="Net variance"
            value={summary.net_variance_formatted || '+00:00'}
            deltaType={
              summary.net_variance_formatted?.startsWith('+') && summary.net_variance_formatted !== '+00:00'
                ? 'success'
                : summary.net_variance_formatted?.startsWith('-') && summary.net_variance_formatted !== '-00:00'
                ? 'danger'
                : 'neutral'
            }
          />
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b border-border bg-subtle/30">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-4 animate-pulse">
              <div className="h-3 w-20 bg-skel rounded-xs mb-3" />
              <div className="h-6 w-14 bg-skel rounded-xs" />
            </div>
          ))}
        </div>
      ) : null}

      {/* High-Density Timesheet Table (40px compact rows, sentence case headers) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-table border-collapse">
          <thead>
            <tr className="bg-canvas text-fg-muted border-b border-border text-xs font-medium">
              <th className="py-2.5 px-3 font-medium">Date</th>
              <th className="py-2.5 px-3 font-medium">Assigned shift</th>
              <th className="py-2.5 px-3 font-medium">Time in</th>
              <th className="py-2.5 px-3 font-medium">Time out</th>
              <th className="py-2.5 px-3 font-medium">Break</th>
              <th className="py-2.5 px-3 font-medium">Effective hours</th>
              <th className="py-2.5 px-3 font-medium">Overtime</th>
              <th className="py-2.5 px-3 font-medium">Undertime</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              {(!readOnly || (canInquireMissedPunch && employeeId)) && (
                <th className="py-2.5 px-3 font-medium text-right">Action</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-normal">
            {isLoading && rows.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`ts-skeleton-${i}`} className="h-10 animate-pulse">
                  <td className="py-2 px-3">
                    <div className="h-4 w-24 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-28 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-14 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-14 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-10 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-16 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-12 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-4 w-12 bg-skel rounded-xs" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="h-5 w-20 bg-skel rounded-full" />
                  </td>
                  {(!readOnly || (canInquireMissedPunch && employeeId)) && (
                    <td className="py-2 px-3 text-right">
                      <div className="h-6 w-16 bg-skel rounded-md ml-auto" />
                    </td>
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={(!readOnly || (canInquireMissedPunch && employeeId)) ? 10 : 9}
                  className="py-16 text-center text-fg-muted"
                >
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-fg-faint" />
                  <p className="text-body font-medium text-fg">No punches this month</p>
                  <p className="text-small text-fg-muted mt-0.5">Records are logged day-by-day for working shifts.</p>
                </td>
              </tr>
            ) : (
              rows.map(({ date, formattedDate, isSunday, isFirstSaturday, record }) => {
                const isHoliday = record?.status === 'holiday';
                const isOffDay = isSunday || isFirstSaturday || record?.status === 'sunday_off' || record?.status === 'first_saturday_off' || isHoliday;
                const isToday = date === todayIso;
                const defaultShiftName = summary?.shift_name || 'Standard 09:30–18:30';

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

                // Overtime & Undertime strings
                let otDisplay = '—';
                let utDisplay = '—';

                if (!isOffDay && record && isMissedPunch) {
                  otDisplay = '+00:00';
                  utDisplay = record.undertime_formatted || '−08:00';
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
                    utDisplay = `−${String(utH).padStart(2, '0')}:${String(utM).padStart(2, '0')}`;
                  } else {
                    utDisplay = '−00:00';
                  }
                } else if (!isOffDay && record && punchIn && !punchOut) {
                  otDisplay = '——:——';
                  utDisplay = '——:——';
                }

                // Effective hours
                let effHours = '—';
                if (record && punchIn) {
                  if (isMissedPunch) {
                    effHours = '0h 00m';
                  } else if (!punchOut) {
                    effHours = 'In progress';
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
                    className={cn(
                      'h-10 hover:bg-hover/60 transition-colors',
                      isOffDay && 'bg-subtle/40 text-fg-muted',
                      isToday && 'border-l-2 border-l-accent'
                    )}
                  >
                    {/* Date */}
                    <td className="py-2 px-3 whitespace-nowrap text-fg font-medium">
                      <span>{formattedDate}</span>
                    </td>

                    {/* Shift */}
                    <td className="py-2 px-3 text-fg-muted whitespace-nowrap">
                      {isHoliday
                        ? record?.shift_name || record?.notes || 'Public holiday'
                        : record?.shift_name || (isSunday ? 'Sunday rest' : isFirstSaturday ? '1st Sat rest' : defaultShiftName)}
                    </td>

                    {/* Punch In */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {punchIn ? (
                        <span className={cn('font-numeric', isLate ? 'text-warning-fg font-medium' : 'text-fg')}>
                          {punchIn}
                        </span>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>

                    {/* Punch Out */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {punchOut ? (
                        <span className="font-numeric text-fg">{punchOut}</span>
                      ) : isMissedPunch ? (
                        <span className="text-danger-fg font-medium">Missed</span>
                      ) : punchIn ? (
                        <span className="text-success-fg font-medium">Active</span>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>

                    {/* Break */}
                    <td className="py-2 px-3 text-fg-muted font-numeric whitespace-nowrap">
                      {record ? `${breakMin ?? 0}m` : '—'}
                    </td>

                    {/* Effective Hours */}
                    <td className="py-2 px-3 font-numeric text-fg whitespace-nowrap">
                      {effHours}
                    </td>

                    {/* Overtime */}
                    <td className="py-2 px-3 font-numeric whitespace-nowrap">
                      {otDisplay !== '—' ? (
                        <span
                          className={cn(
                            record?.overtime_status === 'pending'
                              ? 'text-warning-fg font-medium'
                              : record && record.overtime_minutes > 0
                              ? 'text-success-fg font-medium'
                              : 'text-fg-muted'
                          )}
                          title={record?.overtime_reason || undefined}
                        >
                          {otDisplay}
                        </span>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>

                    {/* Undertime */}
                    <td className="py-2 px-3 font-numeric whitespace-nowrap">
                      {utDisplay !== '—' ? (
                        <span
                          className={cn(
                            record && record.undertime_minutes > 0
                              ? 'text-danger-fg font-medium'
                              : 'text-fg-muted'
                          )}
                          title={record?.undertime_reason || undefined}
                        >
                          {utDisplay}
                        </span>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>

                    {/* Status Pill */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {renderStatusBadge(status, lateMin)}
                    </td>

                    {/* Regularization Action (Employee) or Ask Checkout (HR) */}
                    {(!readOnly || (canInquireMissedPunch && employeeId)) && (
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {!readOnly ? (
                          isOffDay ? (
                            <span className="text-fg-faint">—</span>
                          ) : isMissedPunch ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => onOpenRegularizationModal?.(record)}
                            >
                              Correction
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onOpenRegularizationModal?.(record || ({ date } as any))}
                            >
                              Adjustment
                            </Button>
                          )
                        ) : (
                          // HR / Admin Viewing Employee Timesheet
                          isMissedPunch ? (
                            inquiredDates.has(date) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-micro font-medium rounded-full bg-accent-soft-2 text-accent-text">
                                <Clock className="w-3 h-3 text-accent" />
                                <span>Inquired</span>
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleInquireMissedCheckout(date, record)}
                                loading={inquiryLoadingDate === date}
                                icon={Send}
                                title={`Ask ${employeeName || 'employee'} to provide checkout time and explanation`}
                              >
                                Ask checkout
                              </Button>
                            )
                          ) : (
                            <span className="text-fg-faint">—</span>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
