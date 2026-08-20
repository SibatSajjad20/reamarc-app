import React, { useState, useMemo } from 'react';
import {
  Search,
  FileText,
  Edit3,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
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
import { CustomTimePicker } from '../ui/CustomTimePicker';
import { NumberStepper } from '../ui/NumberStepper';

interface DailyAttendanceMatrixProps {
  matrixData: DailyMatrixResponse | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;
  isLoading?: boolean;
  onRefresh: () => void;
  canEditOverride?: boolean;
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

const getDeptBadgeClass = (dept?: string) => {
  const nd = (dept || '').toLowerCase().trim();
  if (nd.includes('software') || nd.includes('dev')) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (nd.includes('website')) {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
  }
  if (nd.includes('creative')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
  }
  if (nd.includes('content')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  if (nd.includes('seo')) {
    return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
  }
  if (nd.includes('performance') || nd.includes('marketing')) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
  if (nd.includes('ai')) {
    return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
  }
  if (nd.includes('hr')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  }
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
};

export const DailyAttendanceMatrix: React.FC<DailyAttendanceMatrixProps> = ({
  matrixData,
  selectedDate,
  onDateChange,
  selectedDepartment,
  onDepartmentChange,
  isLoading = false,
  onRefresh,
  canEditOverride = true,
}) => {
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Zoom Level State
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_attendance_matrix_zoom');
      if (saved) return Number(saved);
    } catch (e) {}
    return 100;
  });

  // Override Modal State
  const [editingRow, setEditingRow] = useState<DailyMatrixEmployeeRow | null>(null);
  const [overrideIn, setOverrideIn] = useState('');
  const [overrideOut, setOverrideOut] = useState('');
  const [overrideBreak, setOverrideBreak] = useState(60);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const START_DATE = '2026-08-19';
  const isAtStartDate = selectedDate <= START_DATE;

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

  const handleSetToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    onDateChange(todayStr < START_DATE ? START_DATE : todayStr);
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

    const { start, end } = parseShiftTiming(row.shift_timing);
    const isNonWorking = ['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'sunday_off', 'first_saturday_off', 'holiday'].includes(currentStatus);

    if (row.punch_in || row.check_in) {
      setOverrideIn(row.punch_in || row.check_in || '');
      setOverrideOut(row.punch_out || row.check_out || '');
    } else if (isNonWorking) {
      setOverrideIn('');
      setOverrideOut('');
    } else if (currentStatus === 'late') {
      setOverrideIn(calculateLateTime(start, 30));
      setOverrideOut(end);
    } else {
      setOverrideIn(start);
      setOverrideOut(end);
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
      setOverrideOut(end);
      setOverrideBreak(editingRow?.break_minutes ?? 60);
    } else if (newStatus === 'late') {
      const lateIn = calculateLateTime(start, 30);
      setOverrideIn(lateIn);
      setOverrideOut(end);
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
      const targetId = editingRow.record_id || editingRow.user_id;
      const payload: OverrideAttendancePayload & { user_id: string; date: string } = {
        user_id: editingRow.user_id,
        date: selectedDate,
        punch_in: isNonWorking ? null : (overrideIn || null),
        punch_out: isNonWorking ? null : (overrideOut || null),
        break_minutes: isNonWorking ? 0 : Number(overrideBreak),
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

  const filteredRows = useMemo(() => {
    if (!matrixData?.rows) return [];
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
  }, [matrixData, selectedDepartment, searchTerm, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Control Bar: Date Selector, Zoom Controls, Status & Search */}
      <div className="p-4 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Date Jump Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleJumpDate(-1)}
            disabled={isAtStartDate}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={isAtStartDate ? 'Attendance tracking starts from 19 Aug 2026' : 'Previous Day'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <CustomDatePicker
            value={selectedDate}
            minDate="2026-08-19"
            onChange={(d) => onDateChange(d < '2026-08-19' ? '2026-08-19' : d)}
            className="w-40"
          />

          <button
            type="button"
            onClick={() => handleJumpDate(1)}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSetToday}
            className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-bold text-xs border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          >
            Today
          </button>
        </div>

        {/* Zoom Controls & Search & Status Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-0.5 border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(70, zoomLevel - 5);
                setZoomLevel(next);
                try { localStorage.setItem('reamarc_attendance_matrix_zoom', String(next)); } catch (e) {}
              }}
              disabled={zoomLevel <= 70}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 min-w-[40px] text-center select-none">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(130, zoomLevel + 5);
                setZoomLevel(next);
                try { localStorage.setItem('reamarc_attendance_matrix_zoom', String(next)); } catch (e) {}
              }}
              disabled={zoomLevel >= 130}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Layout */}
          <button
            type="button"
            onClick={() => {
              setZoomLevel(100);
              try { localStorage.setItem('reamarc_attendance_matrix_zoom', '100'); } catch (e) {}
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-pointer"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
            <span>Reset</span>
          </button>

          {/* Status Filter */}
          <div className="w-48">
            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'All', label: 'Status: All' },
                { value: 'Present', label: 'Status: Present' },
                { value: 'Late', label: 'Status: Late Arrivals' },
                { value: 'WFH', label: 'Status: WFH' },
                { value: 'Leaves', label: 'Status: Approved Leaves' },
                { value: 'Missed', label: 'Status: Missed Punch' },
                { value: 'Absent', label: 'Status: Absent' },
              ]}
            />
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>
        </div>
      </div>

      {/* ─── Department Navigation Tabs Bar ─── */}
      <div className="px-4 py-2.5 bg-zinc-50 dark:bg-[#0c0d12] rounded-2xl border border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-2 shrink-0 overflow-x-auto">
        {DEPARTMENTS.map((dept) => {
          const isSelected = selectedDepartment.toLowerCase() === dept.toLowerCase();
          return (
            <button
              key={dept}
              type="button"
              onClick={() => onDepartmentChange(dept)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 select-none capitalize ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>{dept === 'All' ? 'All Departments' : dept}</span>
            </button>
          );
        })}
      </div>

      {/* Main Register Table */}
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Live Daily Attendance Register ({selectedDate})
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
          </h3>
          <span className="text-xs font-semibold text-zinc-500">
            Showing {filteredRows.length} of {matrixData?.rows.length || 0} employees
          </span>
        </div>
        {isLoading && !matrixData ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading live daily attendance register...</span>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ zoom: `${zoomLevel}%` }}>
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
                {filteredRows.length === 0 ? (
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
                        <td className="py-3 px-4 text-zinc-400 font-mono">{idx + 1}</td>

                        {/* Employee Info */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] flex items-center justify-center">
                              {initials}
                            </div>
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
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
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {row.punch_in ? (
                            <span
                              className={
                                row.status === 'late' || (row.status !== 'present' && row.status !== 'wfh' && (row.is_late || row.is_late_alert))
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
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {row.punch_out ? (
                            <span>{row.punch_out}</span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Break */}
                        <td className="py-3 px-4 text-zinc-500 font-mono">
                          {row.break_minutes}m
                        </td>

                        {/* Effective Hours */}
                        <td className="py-3 px-4 font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {row.effective_hours_minutes > 0 ? (
                            `${Math.floor(row.effective_hours_minutes / 60)}h ${row.effective_hours_minutes % 60}m`
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Register Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {row.status === 'present' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Present
                            </span>
                          ) : row.status === 'late' || (row.status !== 'wfh' && row.is_late) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Late Arrival
                            </span>
                          ) : row.status === 'wfh' || row.is_wfh_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              W.F.H
                            </span>
                          ) : ['sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'on_leave'].includes(row.status) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 capitalize">
                              {row.status.replace('_', ' ')}
                            </span>
                          ) : row.status === 'short_leave' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200">
                              Short Leave
                            </span>
                          ) : row.status === 'missed_punch' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300">
                              ⚠️ Missed Punch
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
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
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
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
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
        )}
      </div>

      {/* HR Override Dialog Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                HR Attendance Override
              </h3>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
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
                    label={`Time Out ${['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '(N/A)' : ''}`}
                    disabled={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus)}
                    value={['absent', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(overrideStatus) ? '' : overrideOut}
                    onChange={setOverrideOut}
                  />
                </div>
              </div>

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
                      { value: 'casual_leave', label: 'Casual Leave' },
                      { value: 'sick_leave', label: 'Sick Leave' },
                      { value: 'annual_leave', label: 'Annual Leave' },
                      { value: 'unpaid_leave', label: 'Unpaid Leave' },
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
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer disabled:opacity-50"
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
