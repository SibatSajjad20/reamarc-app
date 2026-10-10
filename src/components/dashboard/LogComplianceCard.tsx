import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { OperatingSnapshot } from '../../types/dailyLog';
import type { ViewType } from '../../types';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

interface LogComplianceCardProps {
  snapshot: OperatingSnapshot | null;
  isLoading: boolean;
  onNavigateView: (view: ViewType, subSection?: string) => void;
  className?: string;
}

export const LogComplianceCard: React.FC<LogComplianceCardProps> = ({
  snapshot,
  isLoading,
  onNavigateView,
  className,
}) => {
  const departments = snapshot?.departments || [];
  const logsSubmitted = snapshot?.logs_submitted ?? 0;
  const employeesExpected = snapshot?.employees_expected ?? 0;

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
          <div>
            <h3 className="text-ui font-semibold text-fg">Log compliance</h3>
            <p className="text-xs text-fg-muted mt-0.5 font-numeric">
              {logsSubmitted} of {employeesExpected} logs this week
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('admin', 'compliance')}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            Open
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rows */}
        <div className="p-4 space-y-3">
          {isLoading && !snapshot ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-20 h-3 rounded-sm" />
                  <Skeleton className="flex-1 h-1.5 rounded-full" />
                  <Skeleton className="w-8 h-3 rounded-sm" />
                </div>
              ))}
            </div>
          ) : departments.length === 0 ? (
            <div className="py-6 text-center text-xs text-fg-muted">
              No department compliance data available.
            </div>
          ) : (
            departments.map((dept) => {
              const worked = dept.worked_hours || 0;
              const logged = dept.logged_hours || 0;
              const pct = worked > 0 ? Math.min(100, Math.round((logged / worked) * 100)) : logged > 0 ? 100 : 0;

              return (
                <div
                  key={dept.name}
                  className="grid grid-cols-[100px_1fr_40px] items-center gap-2.5 h-6 text-xs"
                >
                  <span className="text-fg-muted truncate">{dept.name}</span>
                  <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-semibold text-fg text-right font-numeric text-xs">
                    {dept.logged}/{dept.total}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-subtle/20 text-[11px] text-fg-muted">
        Bar = logged ÷ worked hours · count = people logged
      </div>
    </div>
  );
};
