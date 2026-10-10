import React from 'react';
import type { OverviewMetrics } from '../../../utils/contentCalendarOverview';

interface Props {
  metrics: OverviewMetrics;
  isLoading?: boolean;
}

export const OverviewKpiCards: React.FC<Props> = ({ metrics, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-2 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-skel rounded" />
              <div className="h-4 w-10 bg-skel rounded-full" />
            </div>
            <div className="h-7 w-12 bg-skel rounded" />
            <div className="h-3 w-28 bg-skel rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. Total */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Total
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted border border-border">
              Scope
            </span>
          </div>
          <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
            {metrics.totalItems}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-numeric truncate">
            Across filtered clients
          </p>
        </div>
      </div>

      {/* 2. In production */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              In production
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-info-bg text-info-fg border border-info-bd">
              Active
            </span>
          </div>
          <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
            {metrics.inProductionCount}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-numeric truncate">
            Drafting, creative & internal review
          </p>
        </div>
      </div>

      {/* 3. Awaiting client */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Awaiting client
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-warning-bg text-warning-fg border border-warning-bd">
              Review
            </span>
          </div>
          <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
            {metrics.clientReviewCount}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-numeric truncate">
            Pending external signoff
          </p>
        </div>
      </div>

      {/* 4. Ready */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Ready
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success-bg text-success-fg border border-success-bd">
              Queued
            </span>
          </div>
          <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
            {metrics.readyToPostCount}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-numeric truncate">
            Approved & queued to post
          </p>
        </div>
      </div>

      {/* 5. Overdue */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Overdue
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                metrics.overdueCount > 0
                  ? 'bg-danger-bg text-danger-fg border-danger-bd'
                  : 'bg-subtle text-fg-muted border-border'
              }`}
            >
              Action
            </span>
          </div>
          <div
            className={`text-kpi font-semibold font-numeric tracking-tight ${
              metrics.overdueCount > 0 ? 'text-danger-fg' : 'text-fg'
            }`}
          >
            {metrics.overdueCount}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-numeric truncate">
            {metrics.overdueCount > 0 ? 'Past target publish or design date' : 'All deliverables on schedule'}
          </p>
        </div>
      </div>
    </div>
  );
};
