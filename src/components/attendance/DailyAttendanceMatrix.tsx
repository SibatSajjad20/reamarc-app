import React, { useState, useMemo } from 'react';
import {
  Search,
  FileText,
  Edit3,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';
import type {
  DailyMatrixResponse,
  DailyMatrixEmployeeRow,
  AttendanceStatus,
  OverrideAttendancePayload,
} from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';
import { CustomTimePicker } from '../ui/CustomTimePicker';
import { NumberStepper } from '../ui/NumberStepper';
import { getAttendanceMinDate } from '../../constants/attendance';
import { getDeptBadgeClass } from '../../utils/badgeStyles';

interface DailyAttendanceMatrixProps {
  matrixData: DailyMatrixResponse | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;
  isLoading?: boolean;
  onRefresh: () => void;
  canEditOverride?: boolean;
  onSelectEmployee?: (userId: string) => void;
  minDate?: string;
}

const DEPARTMENTS = [
  'All',
  'website',
  'creative',
  'content',
  'seo',
  'performance marketing',
  'AI',
  'software development',
  'operations',
  'HR',
];

export const DailyAttendanceMatrix: React.FC<DailyAttendanceMatrixProps> = ({
  matrixData,
  selectedDate,
  onDateChange,
  selectedDepartment,
  onDepartmentChange,
  isLoading = false,
  onRefresh,
  canEditOverride = true,
  onSelectEmployee,
  minDate,
}) => {
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Override Modal State
  const [editingRow, setEditingRow] = useState<DailyMatrixEmployeeRow | null>(null);
  const [overrideIn, setOverrideIn] = useState('');
  const [overrideOut, setOverrideOut] = useState('');
  const [overrideBreak, setOverrideBreak] = useState(60);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const START_DATE = minDate || getAttendanceMinDate();
  const isAtStartDate = selectedDate <= START_DATE;
  const { getOffDay } = useOffDays();
  const selectedOff = getOffDay(selectedDate);

  // Date Jump Handlers
  const handleJumpDate = (offsetDays: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + offsetDays);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const nextDate = `${y}-${m}-${d}`;
    if (nextDate < START_DATE) {
      onDateChange(START_DATE);
    } else {
      onDateChange(nextDate);
    }
  };

  // Parse shift timings from '09:30 - 18:30'
  const parseShiftTiming = (timing?: string): { start: string; end: string } => {
    if (!timing || !timing.includes('-')) {
      return { start: '09:30', end: '18:30' };
    }
    const parts = timing.split('-').map((s) => s.trim());
    return {
      start: parts[0] || '09:30',
      end: parts[1] || '18:30',
    };
  };

  const calculateLateTime = (startTime: string, bufferMinutes = 30): string => {
    try {
      const [h, m] = startTime.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return '10:15';
      const totalMinutes = h * 60 + m + bufferMinutes + 15; // e.g. 9:30 + 30m + 15m = 10:15
      const newH = Math.floor(totalMinutes / 60) % 24;
      const newM = totalMinutes % 60;
      return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    } catch {
      return '10:15';
    }
  };

  // Open Override Modal
  const handleOpenOverride = (row: DailyMatrixEmployeeRow) => {
    setEditingRow(row);
    const currentStatus = row.status || 'present';
    setOverrideStatus(currentStatus);
    setOverrideBreak(row.break_minutes ?? 60);
    setOverrideReason('');

    const { start } = parseShiftTiming(row.shift_timing);
    const isNonWorking = ['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'sunday_off', 'first_saturday_off', 'holiday'].includes(currentStatus);

    if (row.punch_in || row.check_in) {
      setOverrideIn(row.punch_in || row.check_in || '');
      setOverrideOut(row.punch_out || row.check_out || '');
    } else if (isNonWorking) {
      setOverrideIn('');
      setOverrideOut('');
    } else if (currentStatus === 'late') {
      setOverrideIn(calculateLateTime(start, 30));
      setOverrideOut('');
    } else {
      setOverrideIn(start);
      setOverrideOut('');
    }
  };

  const checkIsLateForShift = (timeInStr: string, timingStr?: string, bufferMinutes = 30): boolean => {
    if (!timeInStr || !timeInStr.includes(':')) return false;
    const { start } = parseShiftTiming(timingStr);
    const [startH, startM] = start.split(':').map(Number);
    const [inH, inM] = timeInStr.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(inH) || isNaN(inM)) return false;

    const startTotal = startH * 60 + startM;
    const inTotal = inH * 60 + inM;
    return inTotal > startTotal + bufferMinutes;
  };

  // Change Status and auto-fill corresponding shift times
  const handleStatusOverrideChange = (newStatus: AttendanceStatus) => {
    setOverrideStatus(newStatus);
    const { start, end } = parseShiftTiming(editingRow?.shift_timing);

    if (newStatus === 'present' || newStatus === 'wfh') {
      setOverrideIn(start);
      // Leave Time Out empty so HR does not accidentally close an open shift.
      setOverrideBreak(editingRow?.break_minutes ?? 60);
    } else if (newStatus === 'late') {
      const lateIn = calculateLateTime(start, 30);
      setOverrideIn(lateIn);
      setOverrideBreak(editingRow?.break_minutes ?? 60);
    } else if (['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'sunday_off', 'first_saturday_off', 'holiday'].includes(newStatus)) {
      setOverrideIn('');
      setOverrideOut('');
      setOverrideBreak(0);
    } else if (newStatus === 'short_leave') {
      setOverrideIn(start);
      setOverrideOut(end);
    }
  };

  // When Time In changes manually, automatically sync status between present and late
  const handleTimeInChange = (newTimeIn: string) => {
    setOverrideIn(newTimeIn);
    if (!newTimeIn) return;

    const isLate = checkIsLateForShift(newTimeIn, editingRow?.shift_timing, 30);
    if (overrideStatus === 'present' && isLate) {
      setOverrideStatus('late');
    } else if (overrideStatus === 'late' && !isLate) {
      setOverrideStatus('present');
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;

    try {
      setIsSavingOverride(true);
      const isNonWorking = ['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'sunday_off', 'first_saturday_off', 'holiday'].includes(overrideStatus);
      const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if (!isNonWorking && !isValidTime(overrideIn)) {
        addToast('Time In required', 'Enter a valid Time In (HH:MM). Time Out can be left empty if they are still working.', 'warning');
        setIsSavingOverride(false);
        return;
      }
      if (!isNonWorking && overrideOut && !isValidTime(overrideOut)) {
        addToast('Invalid Time Out', 'Time Out must be HH:MM (24-hour), e.g. 18:30, or cleared to keep the day in progress.', 'warning');
        setIsSavingOverride(false);
        return;
      }
      const targetId = editingRow.record_id || editingRow.user_id;
      const payload: OverrideAttendancePayload & { user_id: string; date: string } = {
        user_id: editingRow.user_id,
        date: selectedDate,
        punch_in: isNonWorking ? null : (overrideIn || null),
        punch_out: isNonWorking ? null : (overrideOut || null),
        break_minutes: isNonWorking || !overrideOut ? 0 : Number(overrideBreak),
        status: overrideStatus,
        notes: overrideReason.trim() ? `HR Override: ${overrideReason.trim()}` : 'HR Attendance Override',
        reason: overrideReason.trim() || 'HR Attendance Override',
      };

      await attendanceService.overrideAttendance(targetId, payload);
      addToast('Attendance Updated', `Record for ${editingRow.employee_name} was adjusted.`, 'success');
      setEditingRow(null);
      onRefresh();
    } catch (err: any) {
      addToast('Override Failed', err.message || 'Could not save attendance override.', 'error');
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Filtered rows
  const normalizeDept = (d?: string) => (d || '').toLowerCase().replace(/[\s_-]+/g, '');

  const isDateMatching = Boolean(matrixData && matrixData.date === selectedDate);
  const isWaitingForNewDate = isLoading || !isDateMatching;

  const filteredRows = useMemo(() => {
    if (!matrixData?.rows || !isDateMatching) return [];
    return matrixData.rows.filter((row) => {
      const matchesDept =
        selectedDepartment === 'All' ||
        normalizeDept(row.department) === normalizeDept(selectedDepartment);

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        row.employee_name.toLowerCase().includes(term) ||
        row.employee_code.toLowerCase().includes(term) ||
        row.role.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Present' && (row.status === 'present' || row.status === 'late')) ||
        (statusFilter === 'Late' && (row.is_late || row.status === 'late')) ||
        (statusFilter === 'WFH' && (row.is_wfh_approved || row.status === 'wfh')) ||
        (statusFilter === 'Leaves' &&
          ['sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'short_leave'].includes(
            row.status
          )) ||
        (statusFilter === 'Missed' && row.status === 'missed_punch') ||
        (statusFilter === 'Absent' && row.status === 'absent');

      return matchesDept && matchesSearch && matchesStatus;
    });
  }, [matrixData, selectedDepartment, searchTerm, statusFilter, isDateMatching]);

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex flex-wrap items-end gap-2.5">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            Date
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleJumpDate(-1)}
              disabled={isAtStartDate}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={isAtStartDate ? `Attendance tracking starts from ${START_DATE}` : 'Previous Day'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <CustomDatePicker
              value={selectedDate}
              minDate={START_DATE}
              onChange={(d) => onDateChange(d < START_DATE ? START_DATE : d)}
              className="w-40"
              clearable={false}
              offDayMode="mark"
            />

            <button
              type="button"
              onClick={() => handleJumpDate(1)}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="w-40">
          <CustomSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'All', label: 'All' },
              { value: 'Present', label: 'Present' },
              { value: 'Late', label: 'Late Arrivals' },
              { value: 'WFH', label: 'WFH' },
              { value: 'Leaves', label: 'Approved Leaves' },
              { value: 'Missed', label: 'Missed Punch' },
              { value: 'Absent', label: 'Absent' },
            ]}
          />
        </div>

        <div className="w-48">
          <CustomSelect
            label="Department"
            value={selectedDepartment}
            onChange={onDepartmentChange}
            options={DEPARTMENTS.map((dept) => ({
              value: dept,
              label: dept === 'All' ? 'All' : dept,
            }))}
          />
        </div>

        <div className="flex-1 min-w-[180px] max-w-xs ml-auto">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            Search
          </span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-8 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {selectedOff.isOff && (
        <OffDayBanner info={selectedOff} date={selectedDate} compact />
      )}

      {/* Main Register Table */}
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Live Daily Attendance Register ({selectedDate})
            {isWaitingForNewDate && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
          </h3>
          <span className="text-xs font-semibold text-zinc-500">
            {isWaitingForNewDate
              ? 'Loading...'
              : `Showing ${filteredRows.length} of ${matrixData?.rows.length || 0} employees`}
          </span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-[#161822] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold">
                  <th className="py-3 px-4 w-10">#</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Shift</th>
                  <th className="py-3 px-4">Time In</th>
                  <th className="py-3 px-4">Time Out</th>
                  <th className="py-3 px-4">Break</th>
                  <th className="py-3 px-4">Effective Hours</th>
                  <th className="py-3 px-4">Register Status</th>
                  {canEditOverride && <th className="py-3 px-4 text-right">Override</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
                {isWaitingForNewDate ? (
                  Array.from({ length: 12 }).map((_, idx) => (
                    <tr key={`matrix-skel-${idx}`} className="animate-pulse">
                      <td className="py-3 px-4">
                        <div className="w-4 h-3 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                          <div className="space-y-1">
                            <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded w-28" />
                            <div className="h-2.5 bg-zinc-200/70 dark:bg-zinc-800/60 rounded w-16" />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="h-5 bg-zinc-200/80 dark:bg-zinc-800/70 rounded-lg w-24" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="h-4 bg-zinc-200/70 dark:bg-zinc-800/60 rounded w-20" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="h-4 bg-zinc-200/80 dark:bg-zinc-800/70 rounded w-14" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="h-4 bg-zinc-200/80 dark:bg-zinc-800/70 rounded w-14" />
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-numeric">
                        <div className="h-4 bg-zinc-200/60 dark:bg-zinc-800/50 rounded w-10" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="h-5 bg-zinc-200/80 dark:bg-zinc-800/70 rounded-md w-20" />
                      </td>
                      {canEditOverride && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="w-6 h-6 bg-zinc-200/60 dark:bg-zinc-800/50 rounded-lg ml-auto" />
                        </td>
                      )}
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-zinc-400 dark:text-zinc-500">
                      No employee records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const initials = row.employee_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase();

                    return (
                      <tr
                        key={row.user_id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        {/* Index */}
                        <td className="py-3 px-4 text-zinc-400 font-numeric">{idx + 1}</td>

                        {/* Employee Info */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold text-[11px] flex items-center justify-center">
                              {initials}
                            </div>
                            <span
                              className={`font-bold text-zinc-900 dark:text-zinc-100 leading-tight ${
                                onSelectEmployee
                                  ? 'hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer'
                                  : ''
                              }`}
                              onClick={() => onSelectEmployee?.(row.user_id)}
                              title={onSelectEmployee ? 'Open monthly timesheet' : undefined}
                            >
                              {row.employee_name}
                            </span>
                          </div>
                        </td>

                        {/* Department */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${getDeptBadgeClass(
                              row.department
                            )}`}
                          >
                            {row.department}
                          </span>
                        </td>

                        {/* Shift */}
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {row.shift_name}
                        </td>

                        {/* Punch In */}
                        <td className="py-3 px-4 font-numeric font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {row.punch_in ? (
                            <span
                              className={
                                row.is_late || row.is_late_alert || row.status === 'late'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }
                            >
                              {row.punch_in}
                            </span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Punch Out */}
                        <td className="py-3 px-4 font-numeric font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {row.punch_out ? (
                            <span>{row.punch_out}</span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Break */}
                        <td className="py-3 px-4 text-zinc-500 font-numeric">
                          {`${row.break_minutes ?? 0}m`}
                        </td>

                        {/* Effective Hours */}
                        <td className="py-3 px-4 font-numeric font-bold text-zinc-800 dark:text-zinc-200">
                          <div>
                            {row.punch_in || row.check_in ? (
                              row.status === 'missed_punch' ? (
                                <span className="text-zinc-400 font-normal">0h 0m</span>
                              ) : row.effective_hours_minutes > 0 ? (
                                `${Math.floor(row.effective_hours_minutes / 60)}h ${row.effective_hours_minutes % 60}m`
                              ) : row.punch_out || row.check_out ? (
                                '0h 0m'
                              ) : (
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">In Progress</span>
                              )
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                            )}
                            {row.overtime_status === 'pending' && (row.pending_overtime_minutes || 0) > 0 && (
                              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400" title={row.overtime_reason || 'Pending overtime'}>
                                OT pending +{String(Math.floor((row.pending_overtime_minutes || 0) / 60)).padStart(2, '0')}:
                                {String((row.pending_overtime_minutes || 0) % 60).padStart(2, '0')}
                              </p>
                            )}
                            {(row.overtime_reason || row.undertime_reason) && (
                              <p className="text-[10px] font-normal text-zinc-400 truncate max-w-[160px]" title={row.overtime_reason || row.undertime_reason || undefined}>
                                {row.overtime_reason || row.undertime_reason}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Register Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {row.status === 'missed_punch' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300">
                              ⚠️ Missed Punch
                            </span>
                          ) : row.status === 'present' ? (
                            row.is_late ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                Late Arrival
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                Present
                              </span>
                            )
                          ) : row.status === 'late' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Late Arrival
                            </span>
                          ) : row.status === 'wfh' || row.is_wfh_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              W.F.H
                            </span>
                          ) : ['sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'on_leave'].includes(row.status) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 capitalize">
                              {row.status.replace('_', ' ')}
                            </span>
                          ) : row.status === 'short_leave' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200">
                              Short Leave
                            </span>
                          ) : row.status === 'sunday_off' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              Sunday Off
                            </span>
                          ) : row.status === 'first_saturday_off' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              1st Sat Off
                            </span>
                          ) : row.status === 'holiday' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200">
                              Holiday
                            </span>
                          ) : row.status === 'awaiting_checkin' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                              Awaiting
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              Absent
                            </span>
                          )}
                        </td>

                        {/* HR Override Button */}
                        {canEditOverride && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenOverride(row)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                              title="HR Manual Override"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
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

      {/* HR Override Dialog Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                HR Attendance Override
              </h3>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Adjusting record for <strong className="text-zinc-900 dark:text-zinc-200">{editingRow.employee_name}</strong> on <strong className="text-zinc-900 dark:text-zinc-200">{selectedDate}</strong>.
            </p>

            <form onSubmit={handleSaveOverride} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomTimePicker
                    label={`Time In ${['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '(N/A)' : ''}`}
                    disabled={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus)}
                    value={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '' : overrideIn}
                    onChange={handleTimeInChange}
                  />
                </div>
                <div>
                  <CustomTimePicker
                    label={`Time Out ${['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '(N/A)' : '(optional)'}`}
                    disabled={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus)}
                    value={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '' : overrideOut}
                    onChange={setOverrideOut}
                    allowClear={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) === false}
                    clearTitle="Clear time out (keep day in progress)"
                  />
                </div>
              </div>
              {!['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 -mt-1">
                  Time Out is optional. Click the X to remove checkout so the day stays <strong>In Progress</strong> and the employee can still Check Out.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <NumberStepper
                    label="Break Duration"
                    min={0}
                    max={180}
                    step={15}
                    unit="mins"
                    value={overrideBreak}
                    onChange={setOverrideBreak}
                  />
                </div>
                <div>
                  <CustomSelect
                    label="Status Override"
                    value={overrideStatus}
                    onChange={(v) => handleStatusOverrideChange(v as AttendanceStatus)}
                    options={[
                      { value: 'present', label: 'Present (On-Time)' },
                      { value: 'late', label: 'Late Arrival' },
                      { value: 'wfh', label: 'Work From Home (WFH)' },
                      { value: 'short_leave', label: 'Short Leave' },
                      { value: 'sick_leave', label: 'Sick Leave' },
                      { value: 'annual_leave', label: 'Annual Leave' },
                      { value: 'absent', label: 'Absent' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Audit Reason (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional reason for manual adjustment (e.g. biometric machine glitch, client visit)..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOverride}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingOverride ? 'Saving...' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

