import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Loader2,
} from 'lucide-react';
import type {
  MonthlyPunctualityResponse,
} from '../../types/attendance';
import { CustomSelect } from '../ui/CustomSelect';
import { getDeptBadgeClass } from '../../utils/badgeStyles';
import { LoadingScreen } from '../ui/LoadingScreen';

interface MonthlyPunctualityCommandCenterProps {
  summaryData: MonthlyPunctualityResponse | null;
  selectedYear: number;
  selectedMonth: number;
  onYearMonthChange: (year: number, month: number) => void;
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;
  isLoading: boolean;
  onExportExcel: () => void;
  isExporting?: boolean;
  onSelectEmployee?: (userId: string) => void;
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

const DEPARTMENTS = [
  'All',
  'Software Development',
  'Performance Marketing',
  'SEO',
  'Creative',
  'Content',
  'AI',
  'Website',
  'Operations',
  'HR',
];

export const MonthlyPunctualityCommandCenter: React.FC<MonthlyPunctualityCommandCenterProps> = ({
  summaryData,
  selectedYear,
  selectedMonth,
  onYearMonthChange,
  selectedDepartment,
  onDepartmentChange,
  isLoading,
  onExportExcel,
  isExporting = false,
  onSelectEmployee,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const canGoPrev = selectedYear > 2026 || (selectedYear === 2026 && selectedMonth > 8);
  const canGoNext = selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);

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

  // Filtered Rows
  const filteredRows = useMemo(() => {
    if (!summaryData?.rows) return [];
    return summaryData.rows.filter((row) => {
      const rowDept = row.department || '';
      const matchesDept =
        selectedDepartment === 'All' ||
        rowDept.toLowerCase() === selectedDepartment.toLowerCase();

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        row.employee_name.toLowerCase().includes(term) ||
        (row.employee_code && row.employee_code.toLowerCase().includes(term)) ||
        rowDept.toLowerCase().includes(term);

      return matchesDept && matchesSearch;
    });
  }, [summaryData, selectedDepartment, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Control Bar: Month Picker, Department Filter, Search & Export */}
      <div className="p-4 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex flex-wrap items-end justify-between gap-4">
        {/* Month Selector */}
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            Month
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!canGoPrev}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={canGoPrev ? 'Previous Month' : 'Attendance starts August 2026'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="h-10 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{MONTH_NAMES[selectedMonth - 1]}</span>
              <span>{selectedYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!canGoNext}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={canGoNext ? 'Next Month' : 'Cannot view future months'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters & Export */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <CustomSelect
              label="Department"
              value={selectedDepartment}
              onChange={onDepartmentChange}
              options={DEPARTMENTS.map((dept) => ({
                value: dept,
                label: dept,
              }))}
            />
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
              Search
            </span>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-8 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              />
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
              Export
            </span>
            <button
              type="button"
              onClick={onExportExcel}
              disabled={isExporting || isLoading}
              className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Generating .XLSX...' : 'Export Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Data Table */}
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Company-Wide Monthly Summary ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
          </h3>
          <span className="text-xs font-semibold text-zinc-500">
            {filteredRows.length} employees listed
            {onSelectEmployee ? ' · click a name to open timesheet' : ''}
          </span>
        </div>

        {isLoading && !summaryData ? (
          <LoadingScreen message="Loading monthly punctuality summary..." size={72} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-[#161822] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold">
                  <th className="py-3 px-4 w-10">#</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department & Shift</th>
                  <th className="py-3 px-4 text-center">Days (Pres/Work)</th>
                  <th className="py-3 px-4 text-center">Leaves</th>
                  <th className="py-3 px-4 text-center">Late Strikes</th>
                  <th className="py-3 px-4 text-center">Short Leaves</th>
                  <th className="py-3 px-4 text-center">Missed</th>
                  <th className="py-3 px-4">Overtime</th>
                  <th className="py-3 px-4">Undertime</th>
                  <th className="py-3 px-4">Net Variance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-zinc-400">
                      No punctuality summary records match current filters.
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

                    const workingDays = row.total_working_days ?? row.working_days ?? 22;
                    const leavesTaken = row.leave_count ?? row.leaves_taken ?? 0;
                    const lateStrikes = row.late_count ?? row.late_strikes ?? 0;
                    const shortLeaves = row.short_leaves_count ?? 0;
                    const missedPunches = row.missed_punches ?? 0;

                    const hasOvertime = row.overtime_formatted && row.overtime_formatted !== '+00:00' && row.overtime_formatted !== '00:00';
                    const hasUndertime = row.undertime_formatted && row.undertime_formatted !== '-00:00' && row.undertime_formatted !== '00:00';
                    const hasActivity = row.days_present > 0 || (row.total_work_hours ?? 0) > 0 || hasOvertime || hasUndertime;
                    const mutedDash = (
                      <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                    );

                    return (
                      <tr
                        key={row.user_id}
                        className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                          onSelectEmployee ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onSelectEmployee?.(row.user_id)}
                        title={onSelectEmployee ? 'Open this employee monthly timesheet' : undefined}
                      >
                        {/* Index */}
                        <td className="py-3 px-4 text-zinc-400 font-numeric">{idx + 1}</td>

                        {/* Employee Name */}
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

                        {/* Department & Shift */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border w-fit ${getDeptBadgeClass(
                                row.department
                              )}`}
                            >
                              {row.department || 'General'}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {row.shift_name}
                            </span>
                          </div>
                        </td>

                        {/* Days Present / Working */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {row.days_present}
                          </span>
                          <span className="text-zinc-400"> / {workingDays}</span>
                        </td>

                        {/* Leaves Taken */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {leavesTaken > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                              {leavesTaken}d
                            </span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Late Strikes */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {lateStrikes > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                              {lateStrikes}
                            </span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Short Leaves */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric text-zinc-600 dark:text-zinc-400">
                          {shortLeaves > 0 ? shortLeaves : mutedDash}
                        </td>

                        {/* Missed Punches */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {missedPunches > 0 ? (
                            <span className="text-rose-600 font-bold">{missedPunches}</span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Overtime */}
                        <td className="py-3 px-4 font-numeric font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {hasOvertime ? row.overtime_formatted : mutedDash}
                        </td>

                        {/* Undertime */}
                        <td className="py-3 px-4 font-numeric font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          {hasUndertime ? row.undertime_formatted : mutedDash}
                        </td>

                        {/* Net Variance */}
                        <td className="py-3 px-4 font-numeric font-bold whitespace-nowrap">
                          {!hasActivity ? (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          ) : (
                            <span
                              className={
                                row.net_variance_formatted.startsWith('+') && row.net_variance_formatted !== '+00:00'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : row.net_variance_formatted.startsWith('-') && row.net_variance_formatted !== '-00:00'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-zinc-500'
                              }
                            >
                              {row.net_variance_formatted}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {onSelectEmployee && (
                            <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 ml-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

