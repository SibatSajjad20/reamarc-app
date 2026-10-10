import React, { useState, useMemo } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import type { DailyMatrixResponse } from '../../types/attendance';
import type { ViewType } from '../../types';
import { StatusPill } from '../ui/StatusPill';
import { CustomSelect } from '../ui/CustomSelect';
import {
  matchesAttendanceStatus,
  sortAttendanceRows,
  type AttendanceStatusBucket,
} from '../../utils/attendanceFilters';
import { getStatusMapping } from '../../lib/statusMap';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';

interface TeamDailyAttendanceCardProps {
  matrixData: DailyMatrixResponse | null;
  isLoading: boolean;
  onNavigateView: (view: ViewType, subSection?: string) => void;
  className?: string;
}

const FILTER_CHIPS: { label: string; filter: AttendanceStatusBucket }[] = [
  { label: 'All', filter: 'All' },
  { label: 'Present', filter: 'Present' },
  { label: 'Late', filter: 'Late' },
  { label: 'WFH', filter: 'WFH' },
  { label: 'Leave', filter: 'Leave' },
  { label: 'Absent', filter: 'Absent' },
  { label: 'Missed punch', filter: 'Missed punch' },
  { label: 'Not checked in', filter: 'Not checked in' },
];

function formatCheckTime(val?: string | null): string {
  if (!val) return '—';
  if (val.includes('T')) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    }
  }
  const match = val.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = match[3] ? match[3].toUpperCase() : h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  return val;
}

function formatHeaderDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T00:00:00`);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

export const TeamDailyAttendanceCard: React.FC<TeamDailyAttendanceCardProps> = ({
  matrixData,
  isLoading,
  onNavigateView,
  className,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [activeFilter, setActiveFilter] = useState<AttendanceStatusBucket>('All');

  const rows = useMemo(() => matrixData?.rows || [], [matrixData]);

  // Distinct departments
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.department && r.department.trim()) {
        set.add(r.department.trim());
      }
    });
    return [
      { value: 'All', label: 'All departments' },
      ...Array.from(set)
        .sort()
        .map((dept) => ({ value: dept, label: dept })),
    ];
  }, [rows]);

  // Status counts for chips
  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: rows.length,
      Present: 0,
      Late: 0,
      WFH: 0,
      Leave: 0,
      Absent: 0,
      'Missed punch': 0,
      'Not checked in': 0,
      Off: 0,
    };
    rows.forEach((r) => {
      if (matchesAttendanceStatus(r, 'Present')) counts['Present']++;
      if (matchesAttendanceStatus(r, 'Late')) counts['Late']++;
      if (matchesAttendanceStatus(r, 'WFH')) counts['WFH']++;
      if (matchesAttendanceStatus(r, 'Leave')) counts['Leave']++;
      if (matchesAttendanceStatus(r, 'Absent')) counts['Absent']++;
      if (matchesAttendanceStatus(r, 'Missed punch')) counts['Missed punch']++;
      if (matchesAttendanceStatus(r, 'Not checked in')) counts['Not checked in']++;
      if (matchesAttendanceStatus(r, 'Off')) counts['Off']++;
    });
    return counts;
  }, [rows]);

  // Filtered and sorted rows
  const filteredAndSortedRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      // Dept match
      if (selectedDept !== 'All' && r.department !== selectedDept) {
        return false;
      }
      // Search match
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesName = r.employee_name?.toLowerCase().includes(term);
        const matchesCode = r.employee_code?.toLowerCase().includes(term);
        const matchesRole = r.role?.toLowerCase().includes(term);
        if (!matchesName && !matchesCode && !matchesRole) return false;
      }
      // Status match
      return matchesAttendanceStatus(r, activeFilter);
    });

    return sortAttendanceRows(filtered);
  }, [rows, selectedDept, searchTerm, activeFilter]);

  const displayedRows = useMemo(
    () => filteredAndSortedRows.slice(0, 10),
    [filteredAndSortedRows]
  );

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-ui font-semibold text-fg">Team daily attendance</h3>
          <p className="text-xs text-fg-muted mt-0.5">
            {matrixData?.date ? formatHeaderDate(matrixData.date) : 'Today'} · needs action first
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateView('attendance', 'daily-matrix')}
          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          Open daily attendance
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-border space-y-3 bg-subtle/30">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, code or role"
              className="w-full pl-9 pr-3 py-1.5 rounded-md bg-surface border border-border text-xs text-fg placeholder:text-fg-faint focus:focus-ring outline-none"
            />
          </div>
          <div className="w-full sm:w-48">
            <CustomSelect
              value={selectedDept}
              onChange={setSelectedDept}
              options={departmentOptions}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_CHIPS.map((chip) => {
            const count = chipCounts[chip.filter] ?? 0;
            const isSelected = activeFilter === chip.filter;
            return (
              <button
                key={chip.filter}
                type="button"
                onClick={() => setActiveFilter(chip.filter)}
                className={cn(
                  'h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0',
                  isSelected
                    ? 'bg-accent text-white shadow-xs'
                    : 'bg-surface hover:bg-subtle text-fg border border-border'
                )}
              >
                <span>{chip.label}</span>
                <span
                  className={cn(
                    'font-numeric text-[11px]',
                    isSelected ? 'text-white/90' : 'text-fg-muted'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {chipCounts['Off'] > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('Off')}
              className={cn(
                'h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0',
                activeFilter === 'Off'
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-surface hover:bg-subtle text-fg border border-border'
              )}
            >
              <span>Off</span>
              <span
                className={cn(
                  'font-numeric text-[11px]',
                  activeFilter === 'Off' ? 'text-white/90' : 'text-fg-muted'
                )}
              >
                {chipCounts['Off']}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Rows Table */}
      <div className="overflow-y-auto max-h-[440px] flex-1 divide-y divide-border/60">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] px-4 py-2 bg-subtle/50 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
          <span>Employee</span>
          <span>Shift</span>
          <span>Check-in</span>
          <span>Check-out</span>
          <span className="text-right">Status</span>
        </div>

        {isLoading && rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-fg-muted">
            Loading team attendance…
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-fg-muted">
            No employees match the filter criteria.
          </div>
        ) : (
          displayedRows.map((row) => {
            const statusMap = getStatusMapping(row.status);
            const isLate = Boolean(row.is_late || row.status === 'late');
            return (
              <div
                key={row.user_id || row.employee_code}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] items-center px-4 py-2.5 hover:bg-subtle/40 transition-colors text-xs"
              >
                {/* Employee */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Avatar
                    name={row.employee_name}
                    src={(row as any).avatar_url || getAvatarUrl(row.user_id, row.employee_name)}
                    size={28}
                    className="rounded-full shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-fg truncate">
                      {row.employee_name}
                    </p>
                    <p className="text-[11px] text-fg-muted truncate">
                      {row.department || row.role || '—'}
                    </p>
                  </div>
                </div>

                {/* Shift */}
                <div className="text-fg-muted truncate">
                  {row.shift_name || 'General'}
                </div>

                {/* Check-in */}
                <div className="font-numeric text-fg">
                  {formatCheckTime(row.check_in ?? (row as any).punch_in)}
                  {isLate && row.late_minutes ? (
                    <span className="ml-1 text-[11px] font-medium text-warning-fg">
                      +{row.late_minutes}m
                    </span>
                  ) : null}
                </div>

                {/* Check-out */}
                <div className="font-numeric text-fg-muted">
                  {formatCheckTime(row.check_out ?? (row as any).punch_out)}
                </div>

                {/* Status Pill */}
                <div className="flex justify-end">
                  <StatusPill
                    variant={statusMap.variant}
                    dot
                    label={statusMap.label}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-subtle/20 text-xs text-fg-muted flex items-center justify-between">
        <span>
          Showing {displayedRows.length} of {filteredAndSortedRows.length} · scroll for more
        </span>
        <button
          type="button"
          onClick={() => onNavigateView('attendance')}
          className="text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          Open daily attendance
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
