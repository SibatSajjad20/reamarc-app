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
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      onYearMonthChange(selectedYear - 1, 12);
    } else {
      onYearMonthChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
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
      <div className="p-4 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>{MONTH_NAMES[selectedMonth - 1]}</span>
            <span>{selectedYear}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Filters & Export */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter */}
          <div className="w-48">
            <CustomSelect
              value={selectedDepartment}
              onChange={onDepartmentChange}
              options={DEPARTMENTS.map((dept) => ({
                value: dept,
                label: `Dept: ${dept}`,
              }))}
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
            />
          </div>

          {/* 1-Click Excel Export Trigger */}
          <button
            type="button"
            onClick={onExportExcel}
            disabled={isExporting || isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating .XLSX...' : 'Export Excel (.xlsx)'}</span>
          </button>
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
          </span>
        </div>

        {isLoading && !summaryData ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading monthly punctuality summary...</span>
          </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-zinc-400">
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

                    return (
                      <tr
                        key={row.user_id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        {/* Index */}
                        <td className="py-3 px-4 text-zinc-400 font-mono">{idx + 1}</td>

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
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {row.days_present}
                          </span>
                          <span className="text-zinc-400"> / {workingDays}</span>
                        </td>

                        {/* Leaves Taken */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          {leavesTaken > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                              {leavesTaken}d
                            </span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>

                        {/* Late Strikes */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          {lateStrikes > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                              {lateStrikes}
                            </span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>

                        {/* Short Leaves */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-zinc-600 dark:text-zinc-400">
                          {shortLeaves > 0 ? shortLeaves : '0'}
                        </td>

                        {/* Missed Punches */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          {missedPunches > 0 ? (
                            <span className="text-rose-600 font-bold">{missedPunches}</span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>

                        {/* Overtime */}
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {hasOvertime ? (
                            row.overtime_formatted
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Undertime */}
                        <td className="py-3 px-4 font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          {hasUndertime ? (
                            row.undertime_formatted
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 font-normal">&mdash;</span>
                          )}
                        </td>

                        {/* Net Variance */}
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
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
