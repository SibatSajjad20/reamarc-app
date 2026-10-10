import React, { useState, useMemo, useRef } from 'react';
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
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';

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
  'Sales',
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
  const { getAvatarUrl } = useMemberAvatars();
  const lastSwitchTimeRef = useRef<number>(0);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const canGoPrev = selectedYear > 2026 || (selectedYear === 2026 && selectedMonth > 8);
  const canGoNext = selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);

  // Check if data is loading or belongs to a different month/year
  const isDataLoading =
    isLoading ||
    !summaryData ||
    summaryData.year !== selectedYear ||
    summaryData.month !== selectedMonth;

  // Rate-limited month navigation
  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    const nowTime = Date.now();
    if (nowTime - lastSwitchTimeRef.current < 200) return;
    lastSwitchTimeRef.current = nowTime;
    if (selectedMonth === 1) {
      onYearMonthChange(selectedYear - 1, 12);
    } else {
      onYearMonthChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    const nowTime = Date.now();
    if (nowTime - lastSwitchTimeRef.current < 200) return;
    lastSwitchTimeRef.current = nowTime;
    if (selectedMonth === 12) {
      onYearMonthChange(selectedYear + 1, 1);
    } else {
      onYearMonthChange(selectedYear, selectedMonth + 1);
    }
  };

  // Filtered Rows
  const filteredRows = useMemo(() => {
    if (isDataLoading || !summaryData?.rows) return [];
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
  }, [summaryData, selectedDepartment, searchTerm, isDataLoading]);

  return (
    <div className="space-y-4">
      {/* Control Bar: Month Picker, Department Filter, Search & Export */}
      <div className="p-4 bg-surface rounded-xl border border-border shadow-xs flex flex-wrap items-end justify-between gap-4">
        {/* Month Selector */}
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1">
            Month
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!canGoPrev}
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-subtle hover:bg-hover text-fg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={canGoPrev ? 'Previous Month' : 'Attendance starts August 2026'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="h-10 px-4 rounded-lg bg-subtle border border-border text-xs font-semibold text-fg inline-flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-accent-text" />
              <span>{MONTH_NAMES[selectedMonth - 1]}</span>
              <span>{selectedYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!canGoNext}
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-subtle hover:bg-hover text-fg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1">
              Search
            </span>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-8 pr-3 rounded-lg bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-border-strong w-44"
              />
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1">
              Export
            </span>
            <button
              type="button"
              onClick={onExportExcel}
              disabled={isExporting || isLoading}
              className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-semibold text-white bg-success-fg hover:opacity-90 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Generating .XLSX...' : 'Export Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Data Table */}
      <div className="bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent-text" />
            Company-Wide Monthly Summary ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
            {isDataLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-text" />}
          </h3>
          <span className="text-xs font-semibold text-fg-muted">
            {isDataLoading
              ? 'Loading summary...'
              : `${filteredRows.length} employees listed${onSelectEmployee ? ' · click a name to open timesheet' : ''}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-subtle text-fg-muted border-b border-border font-semibold">
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
            <tbody className="divide-y divide-border font-medium">
              {isDataLoading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={`punctuality-skeleton-${idx}`}>
                    {/* Index */}
                    <td className="py-3.5 px-4 text-fg-muted">
                      <div className="h-4 w-4 bg-skel animate-pulse rounded" />
                    </td>
                    {/* Employee */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-skel animate-pulse shrink-0" />
                        <div className="h-4 w-28 bg-skel animate-pulse rounded" />
                      </div>
                    </td>
                    {/* Department & Shift */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="h-4 w-20 bg-skel animate-pulse rounded-lg" />
                        <div className="h-3 w-16 bg-skel animate-pulse rounded" />
                      </div>
                    </td>
                    {/* Days Pres / Work */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="h-4 w-12 bg-skel animate-pulse rounded mx-auto" />
                    </td>
                    {/* Leaves */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="h-4 w-8 bg-skel animate-pulse rounded mx-auto" />
                    </td>
                    {/* Late Strikes */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="h-4 w-8 bg-skel animate-pulse rounded mx-auto" />
                    </td>
                    {/* Short Leaves */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="h-4 w-6 bg-skel animate-pulse rounded mx-auto" />
                    </td>
                    {/* Missed */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="h-4 w-6 bg-skel animate-pulse rounded mx-auto" />
                    </td>
                    {/* Overtime */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="h-4 w-12 bg-skel animate-pulse rounded" />
                    </td>
                    {/* Undertime */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="h-4 w-12 bg-skel animate-pulse rounded" />
                    </td>
                    {/* Net Variance */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="h-4 w-14 bg-skel animate-pulse rounded" />
                    </td>
                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="h-4 w-4 bg-skel animate-pulse rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-fg-muted">
                    No punctuality summary records match current filters.
                  </td>
                </tr>
              ) : (
                  filteredRows.map((row, idx) => {
                    const workingDays = row.total_working_days ?? row.working_days ?? 22;
                    const leavesTaken = row.leave_count ?? row.leaves_taken ?? 0;
                    const lateStrikes = row.late_count ?? row.late_strikes ?? 0;
                    const shortLeaves = row.short_leaves_count ?? 0;
                    const missedPunches = row.missed_punches ?? 0;

                    const hasOvertime = row.overtime_formatted && row.overtime_formatted !== '+00:00' && row.overtime_formatted !== '00:00';
                    const hasUndertime = row.undertime_formatted && row.undertime_formatted !== '-00:00' && row.undertime_formatted !== '00:00';
                    const hasActivity = row.days_present > 0 || (row.total_work_hours ?? 0) > 0 || hasOvertime || hasUndertime;
                    const mutedDash = (
                      <span className="text-fg-muted font-normal">&mdash;</span>
                    );

                    return (
                      <tr
                        key={row.user_id}
                        className={`hover:bg-hover transition-colors ${
                          onSelectEmployee ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onSelectEmployee?.(row.user_id)}
                        title={onSelectEmployee ? 'Open this employee monthly timesheet' : undefined}
                      >
                        {/* Index */}
                        <td className="py-3 px-4 text-fg-muted font-numeric">{idx + 1}</td>

                        {/* Employee Name */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              name={row.employee_name}
                              src={(row as any).avatar_url || getAvatarUrl(row.user_id, row.employee_name)}
                              size={28}
                              className="rounded-lg shrink-0"
                            />
                            <span className="font-semibold text-fg leading-tight">
                              {row.employee_name}
                            </span>
                          </div>
                        </td>

                        {/* Department & Shift */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={getDeptBadgeClass(row.department)}>
                              {row.department || 'General'}
                            </span>
                            <span className="text-[10px] text-fg-muted font-medium">
                              {row.shift_name}
                            </span>
                          </div>
                        </td>

                        {/* Days Present / Working */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          <span className="font-semibold text-success-fg">
                            {row.days_present}
                          </span>
                          <span className="text-fg-muted"> / {workingDays}</span>
                        </td>

                        {/* Leaves Taken */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {leavesTaken > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-warning-bg text-warning-fg font-semibold text-xs">
                              {leavesTaken}d
                            </span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Late Strikes */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {lateStrikes > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-danger-bg text-danger-fg font-semibold text-xs">
                              {lateStrikes}
                            </span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Short Leaves */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric text-fg-muted">
                          {shortLeaves > 0 ? shortLeaves : mutedDash}
                        </td>

                        {/* Missed Punches */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-numeric">
                          {missedPunches > 0 ? (
                            <span className="text-danger-fg font-semibold">{missedPunches}</span>
                          ) : (
                            mutedDash
                          )}
                        </td>

                        {/* Overtime */}
                        <td className="py-3 px-4 font-numeric font-semibold text-success-fg whitespace-nowrap">
                          {hasOvertime ? row.overtime_formatted : mutedDash}
                        </td>

                        {/* Undertime */}
                        <td className="py-3 px-4 font-numeric font-semibold text-danger-fg whitespace-nowrap">
                          {hasUndertime ? row.undertime_formatted : mutedDash}
                        </td>

                        {/* Net Variance */}
                        <td className="py-3 px-4 font-numeric font-semibold whitespace-nowrap">
                          {!hasActivity ? (
                            <span className="text-fg-muted font-normal">&mdash;</span>
                          ) : (
                            <span
                              className={
                                row.net_variance_formatted.startsWith('+') && row.net_variance_formatted !== '+00:00'
                                   ? 'text-success-fg'
                                  : row.net_variance_formatted.startsWith('-') && row.net_variance_formatted !== '-00:00'
                                  ? 'text-danger-fg'
                                  : 'text-fg-muted'
                              }
                            >
                              {row.net_variance_formatted}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {onSelectEmployee && (
                            <ChevronRight className="w-4 h-4 text-fg-muted ml-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  );
};

