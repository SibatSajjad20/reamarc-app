import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { DailyMatrixResponse } from '../../types/attendance';
import type { ViewType } from '../../types';
import { StatusPill } from '../ui/StatusPill';
import { Skeleton } from '../ui/skeleton';
import { sortAttendanceRows } from '../../utils/attendanceFilters';
import { getStatusMapping } from '../../lib/statusMap';
import { cn } from '../../lib/utils';

interface HrAttendanceTodayCardProps {
  matrixData: DailyMatrixResponse | null;
  isLoading?: boolean;
  onNavigateView: (view: ViewType) => void;
  className?: string;
}

export const HrAttendanceTodayCard: React.FC<HrAttendanceTodayCardProps> = ({
  matrixData,
  isLoading,
  onNavigateView,
  className,
}) => {
  const summary = matrixData?.summary;
  const rows = useMemo(() => {
    if (!matrixData?.rows) return [];
    return sortAttendanceRows(matrixData.rows).slice(0, 3);
  }, [matrixData]);

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col justify-between',
        className
      )}
    >
      <div>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-ui font-semibold text-fg">Attendance today</h3>
          <button
            type="button"
            onClick={() => onNavigateView('attendance')}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            Open
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Summary Tiles */}
        <div className="p-4 border-b border-border/60 grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-md bg-subtle">
            <span className="text-[10px] text-fg-muted uppercase tracking-wider block">Present</span>
            <span className="text-base font-semibold text-fg font-numeric">{summary?.present ?? 0}</span>
          </div>
          <div className="p-2 rounded-md bg-subtle">
            <span className="text-[10px] text-fg-muted uppercase tracking-wider block">Late</span>
            <span className="text-base font-semibold text-warning-fg font-numeric">{summary?.late ?? 0}</span>
          </div>
          <div className="p-2 rounded-md bg-subtle">
            <span className="text-[10px] text-fg-muted uppercase tracking-wider block">WFH</span>
            <span className="text-base font-semibold text-fg font-numeric">{summary?.wfh ?? 0}</span>
          </div>
          <div className="p-2 rounded-md bg-subtle">
            <span className="text-[10px] text-fg-muted uppercase tracking-wider block">Leaves</span>
            <span className="text-base font-semibold text-fg font-numeric">{summary?.leaves ?? 0}</span>
          </div>
        </div>

        {/* 3 Urgent Rows */}
        <div className="p-4 divide-y divide-border/60">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <Skeleton className="w-28 h-3.5 rounded-sm" />
                  <Skeleton className="w-16 h-5 rounded-full" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-4 text-center text-xs text-fg-muted">
              No urgent attendance issues today.
            </div>
          ) : (
            rows.map((row) => {
              const statusMap = getStatusMapping(row.status);
              return (
                <div
                  key={row.user_id || row.employee_code}
                  className="flex items-center justify-between py-2 first:pt-0 last:pb-0 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium text-fg truncate">{row.employee_name}</p>
                    <p className="text-[11px] text-fg-muted truncate">
                      {row.shift_name} {row.is_late && row.late_minutes ? `(+${row.late_minutes}m)` : ''}
                    </p>
                  </div>
                  <StatusPill variant={statusMap.variant} dot label={statusMap.label} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
