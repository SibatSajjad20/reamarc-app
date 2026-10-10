import React from 'react';
import type { OverviewMetrics } from '../../../utils/contentCalendarOverview';

interface Props {
  metrics: OverviewMetrics;
  isLoading?: boolean;
}

export const OverviewKpiCards: React.FC<Props> = ({ metrics, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 space-y-2 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-16 bg-skel rounded" />
              <div className="h-4 w-12 bg-skel rounded-full" />
            </div>
            <div className="h-6 w-12 bg-skel rounded" />
            <div className="h-2 w-20 bg-skel rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {/* 1. Total Campaigns */}
      <div className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Total Posts
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted shrink-0 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              <span>Total</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold font-numeric text-fg">
              {metrics.totalItems}
            </span>
          </div>
        </div>
        <div className="mt-1 text-[10.5px] text-fg-muted truncate">
          Across filtered clients
        </div>
      </div>

      {/* 2. Completion / Velocity */}
      <div className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Posted (Done)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted shrink-0 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              <span>{metrics.completionRate}%</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold font-numeric text-fg">
              {metrics.postedCount}
            </span>
          </div>
        </div>
        <div className="mt-1">
          <div className="w-full bg-border rounded-full h-1 overflow-hidden">
            <div
              className="bg-success-fg h-1 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(metrics.completionRate, 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[10.5px] text-fg-muted truncate">
            Delivered & verified
          </div>
        </div>
      </div>

      {/* 3. Ready to Post */}
      <div className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Ready to Post
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted shrink-0 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              <span>Queued</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold font-numeric text-fg">
              {metrics.readyToPostCount}
            </span>
          </div>
        </div>
        <div className="mt-1 text-[10.5px] text-fg-muted truncate">
          Approved for release
        </div>
      </div>

      {/* 4. Client Review Gate */}
      <div className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              In Review
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted shrink-0 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              <span>Waiting</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold font-numeric text-fg">
              {metrics.clientReviewCount}
            </span>
          </div>
        </div>
        <div className="mt-1 text-[10.5px] text-fg-muted truncate">
          Awaiting client feedback
        </div>
      </div>

      {/* 5. In Revision */}
      <div className="rounded-xl bg-surface border border-border p-2.5 sm:p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-medium text-fg-muted truncate">
              Revisions
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted shrink-0 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              <span>Feedback</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold font-numeric text-fg">
              {metrics.revisionCount}
            </span>
          </div>
        </div>
        <div className="mt-1 text-[10.5px] text-fg-muted truncate">
          Changes requested
        </div>
      </div>

      {/* 6. Overdue / SLA Breaches (Critical Red Alert) */}
      <div
        className={`rounded-xl p-2.5 sm:p-3 transition-colors flex flex-col justify-between ${
          metrics.overdueCount > 0
            ? 'bg-danger-bg border border-danger-bd'
            : 'bg-surface border border-border'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={`text-xs font-medium truncate ${
                metrics.overdueCount > 0
                  ? 'text-danger-fg font-semibold'
                  : 'text-fg-muted'
              }`}
            >
              Overdue
            </span>
            {metrics.overdueCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-danger-bg text-danger-fg border border-danger-bd shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-danger-solid animate-pulse" />
                <span>Action Req.</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-subtle text-fg-muted border border-border shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
                <span>On Track</span>
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-xl sm:text-2xl font-semibold font-numeric ${
                metrics.overdueCount > 0
                  ? 'text-danger-fg'
                  : 'text-fg'
              }`}
            >
              {metrics.overdueCount}
            </span>
          </div>
        </div>
        <div
          className={`mt-1 text-[10.5px] truncate ${
            metrics.overdueCount > 0
              ? 'text-danger-fg font-medium'
              : 'text-fg-muted'
          }`}
        >
          {metrics.overdueCount > 0 ? 'Past SLA deadline' : 'All deliverables on schedule'}
        </div>
      </div>
    </div>
  );
};
