import React, { useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AttendanceRequest, RequestType } from '../../types/attendance';
import type { ViewType } from '../../types';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

interface HrApprovalInboxCardProps {
  requests: AttendanceRequest[];
  isLoading?: boolean;
  onNavigateView: (view: ViewType, subSection?: string) => void;
  onOpenReview: (request: AttendanceRequest) => void;
  className?: string;
}

const CHIP_TYPES: { label: string; type: RequestType | 'all' }[] = [
  { label: 'All', type: 'all' },
  { label: 'Leave', type: 'leave' },
  { label: 'WFH', type: 'wfh' },
  { label: 'Overtime', type: 'overtime' },
];

export const HrApprovalInboxCard: React.FC<HrApprovalInboxCardProps> = ({
  requests,
  isLoading,
  onNavigateView,
  onOpenReview,
  className,
}) => {
  const [activeChip, setActiveChip] = useState<RequestType | 'all'>('all');

  const filteredRequests = useMemo(() => {
    if (activeChip === 'all') return requests;
    return requests.filter((r) => r.request_type === activeChip);
  }, [requests, activeChip]);

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
          <div className="flex items-center gap-3">
            <h3 className="text-ui font-semibold text-fg">Approval inbox</h3>
            <span className="text-xs text-fg-muted font-numeric">({requests.length})</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('attendance', 'approvals')}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            Open approvals
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Chips */}
        <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-1.5 bg-subtle/30 overflow-x-auto scrollbar-none">
          {CHIP_TYPES.map((chip) => {
            const count = chip.type === 'all'
              ? requests.length
              : requests.filter((r) => r.request_type === chip.type).length;
            const isSelected = activeChip === chip.type;

            return (
              <button
                key={chip.type}
                type="button"
                onClick={() => setActiveChip(chip.type)}
                className={cn(
                  'h-6 px-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer shrink-0',
                  isSelected
                    ? 'bg-accent text-white shadow-xs'
                    : 'bg-surface hover:bg-subtle text-fg border border-border'
                )}
              >
                <span>{chip.label}</span>
                <span className={cn('text-[11px] font-numeric', isSelected ? 'text-white/90' : 'text-fg-muted')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Rows */}
        <div className="p-4 divide-y divide-border/60">
          {isLoading && requests.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="space-y-1">
                    <Skeleton className="w-32 h-3.5 rounded-sm" />
                    <Skeleton className="w-48 h-2.5 rounded-sm" />
                  </div>
                  <Skeleton className="w-16 h-7 rounded-md" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-6 text-center text-xs text-fg-muted">
              No pending approval requests in this category.
            </div>
          ) : (
            filteredRequests.slice(0, 4).map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-medium text-fg truncate">{req.user_name || 'Employee'}</p>
                  <p className="text-[11px] text-fg-muted truncate">
                    <span className="capitalize">{req.request_type}</span> · {req.start_date || req.regularization_date || req.overtime_date || '—'}
                    {req.reason ? ` · ${req.reason}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenReview(req)}
                  className="shrink-0 h-7 text-xs px-2.5"
                >
                  Review
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
