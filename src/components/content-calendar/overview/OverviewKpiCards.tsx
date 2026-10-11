import React from 'react';
import type { OverviewMetrics } from '../../../utils/contentCalendarOverview';

interface Props {
  metrics: OverviewMetrics;
  clientCount?: number;
  isLoading?: boolean;
}

export const OverviewKpiCards: React.FC<Props> = ({
  metrics,
  clientCount,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-stretch">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full animate-pulse"
          >
            <div className="h-4 w-20 bg-skel rounded" />
            <div className="h-8 w-14 bg-skel rounded my-2" />
            <div className="h-3 w-28 bg-skel rounded" />
          </div>
        ))}
      </div>
    );
  }

  const clientScopeText =
    clientCount !== undefined
      ? `Across ${clientCount} ${clientCount === 1 ? 'client' : 'clients'}`
      : 'Across all clients';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-stretch">
      {/* 1. Total posts */}
      <div className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full">
        <span className="text-ui font-semibold text-fg truncate">
          Total posts
        </span>
        <div className="text-kpi font-semibold text-fg font-numeric tracking-tight my-1">
          {metrics.totalItems}
        </div>
        <p className="text-caption text-fg-muted font-numeric truncate">
          {clientScopeText}
        </p>
      </div>

      {/* 2. In production */}
      <div className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full">
        <span className="text-ui font-semibold text-fg truncate">
          In production
        </span>
        <div className="text-kpi font-semibold text-fg font-numeric tracking-tight my-1">
          {metrics.inProductionCount}
        </div>
        <p className="text-caption text-fg-muted font-numeric truncate">
          Drafting, creative & internal review
        </p>
      </div>

      {/* 3. Awaiting client */}
      <div className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full">
        <span className="text-ui font-semibold text-fg truncate">
          Awaiting client
        </span>
        <div className="text-kpi font-semibold text-fg font-numeric tracking-tight my-1">
          {metrics.clientReviewCount}
        </div>
        <p className="text-caption text-fg-muted font-numeric truncate">
          Pending external signoff
        </p>
      </div>

      {/* 4. Ready to post */}
      <div className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full">
        <span className="text-ui font-semibold text-fg truncate">
          Ready to post
        </span>
        <div className="text-kpi font-semibold text-fg font-numeric tracking-tight my-1">
          {metrics.readyToPostCount}
        </div>
        <p className="text-caption text-fg-muted font-numeric truncate">
          Approved & queued to post
        </p>
      </div>

      {/* 5. Overdue */}
      <div className="bg-surface border border-border rounded-xl shadow-xs p-4 flex flex-col justify-between h-full">
        <span className="text-ui font-semibold text-fg truncate">
          Overdue
        </span>
        <div
          className={`text-kpi font-semibold font-numeric tracking-tight my-1 ${
            metrics.overdueCount > 0 ? 'text-danger-fg' : 'text-fg'
          }`}
        >
          {metrics.overdueCount}
        </div>
        <p className="text-caption text-fg-muted font-numeric truncate">
          {metrics.overdueCount > 0
            ? 'Past target publish or design date'
            : 'All deliverables on schedule'}
        </p>
      </div>
    </div>
  );
};
