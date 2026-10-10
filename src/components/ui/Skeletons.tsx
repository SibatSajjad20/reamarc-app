import React from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './skeleton';

/**
 * KPI Row Skeleton: renders a grid of 4 KPI card placeholders
 * Label line: 40% width, value block: 24px x 35%, comparison line: 55%
 */
export const KpiRowSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className,
}) => {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between"
        >
          {/* Label line (40%) */}
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded-sm" />
            <Skeleton className="w-2/5 h-3.5 rounded-sm" />
          </div>

          {/* Value block (24px x 35%) */}
          <div className="mt-3 flex items-baseline justify-between">
            <Skeleton className="w-[35%] h-6 rounded-sm" />
            <Skeleton className="w-20 h-6 rounded-sm" />
          </div>

          {/* Comparison line (55%) */}
          <div className="mt-2">
            <Skeleton className="w-[55%] h-3 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Card List Skeleton: generic card container with header and list rows
 */
export const CardListSkeleton: React.FC<{
  rows?: number;
  className?: string;
  hasHeader?: boolean;
}> = ({ rows = 5, className, hasHeader = true }) => {
  return (
    <div className={cn('bg-surface border border-border rounded-lg shadow-xs overflow-hidden', className)}>
      {hasHeader && (
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Skeleton className="w-1/3 h-4 rounded-sm" />
          <Skeleton className="w-16 h-4 rounded-sm" />
        </div>
      )}
      <div className="p-4 divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="w-3/5 h-3.5 rounded-sm" />
              <Skeleton className="w-1/3 h-3 rounded-sm" />
            </div>
            <Skeleton className="w-16 h-5 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Table Skeleton Rows: used inside a <tbody> tag
 * 8 rows (or custom), variable cell widths (90/70/50/80%), pills as 22px x 64px full-radius blocks
 */
export const TableSkeletonRows: React.FC<{
  rows?: number;
  columns?: number;
  compact?: boolean;
}> = ({ rows = 8, columns = 5, compact = false }) => {
  const widths = ['w-4/5', 'w-3/5', 'w-2/5', 'w-3/4', 'w-1/2', 'w-2/3'];

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr
          key={rowIdx}
          className={cn(
            'border-b border-border last:border-b-0',
            compact ? 'h-10' : 'h-12'
          )}
        >
          {Array.from({ length: columns }).map((_, colIdx) => {
            const widthClass = widths[(rowIdx + colIdx) % widths.length];
            const isPill = colIdx === columns - 2;
            const isAvatar = colIdx === 0 && rowIdx % 2 === 0;

            return (
              <td key={colIdx} className="px-3">
                {isAvatar ? (
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                    <Skeleton className={cn('h-3.5 rounded-sm', widthClass)} />
                  </div>
                ) : isPill ? (
                  <Skeleton className="w-16 h-[22px] rounded-full" />
                ) : (
                  <Skeleton className={cn('h-3.5 rounded-sm', widthClass)} />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
};

/**
 * Kanban Skeleton: real column headers with skeleton counts; 3/2/2/1 cards per column
 */
export const KanbanSkeleton: React.FC<{ columns?: number; className?: string }> = ({
  columns = 4,
  className,
}) => {
  const cardCounts = [3, 2, 2, 1];

  return (
    <div className={cn('flex gap-3 overflow-x-auto pb-4', className)}>
      {Array.from({ length: columns }).map((_, colIdx) => (
        <div key={colIdx} className="w-[200px] shrink-0 flex flex-col gap-2">
          {/* Column Header */}
          <div className="h-7 flex items-center justify-between px-1">
            <Skeleton className="w-20 h-4 rounded-sm" />
            <Skeleton className="w-6 h-4 rounded-full" />
          </div>

          {/* Column Body */}
          <div className="bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[400px]">
            {Array.from({ length: cardCounts[colIdx % cardCounts.length] }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="bg-surface border border-border rounded-lg p-3 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="w-[70%] h-3.5 rounded-sm" />
                  <Skeleton className="w-5 h-5 rounded-full" />
                </div>
                <Skeleton className="w-[45%] h-3 rounded-sm" />
                <div className="pt-2 flex items-center justify-between">
                  <Skeleton className="w-14 h-4 rounded-full" />
                  <Skeleton className="w-10 h-3 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Calendar Skeleton: month grid with deterministic 0-2 event chips per cell
 */
export const CalendarSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  // Deterministic chip count per day in a 35-cell grid
  const chipPattern = [1, 2, 0, 1, 0, 2, 0, 0, 1, 2, 1, 0, 0, 1, 2, 0, 1, 0, 0, 2, 1, 0, 1, 2, 0, 1, 0, 0, 1, 2, 0, 1, 0, 1, 0];

  return (
    <div className={cn('bg-surface border border-border rounded-lg overflow-hidden shadow-xs', className)}>
      {/* Calendar Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <Skeleton className="w-32 h-5 rounded-sm" />
        <div className="flex gap-2">
          <Skeleton className="w-16 h-7 rounded-md" />
          <Skeleton className="w-24 h-7 rounded-md" />
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="p-2 text-center border-r border-border last:border-r-0">
            <Skeleton className="w-8 h-3 mx-auto rounded-sm" />
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {chipPattern.map((chips, idx) => (
          <div
            key={idx}
            className="h-[104px] p-1.5 border-r border-b border-border last:border-r-0 flex flex-col gap-1"
          >
            <Skeleton className="w-5 h-5 rounded-full self-start mb-1" />
            {Array.from({ length: chips }).map((_, cIdx) => (
              <Skeleton key={cIdx} className="w-full h-5 rounded-sm" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Drawer Skeleton: side sheet placeholder with header and key-value rows
 */
export const DrawerSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('p-6 space-y-6', className)}>
      {/* Header */}
      <div className="space-y-2 border-b border-border pb-4">
        <Skeleton className="w-24 h-3 rounded-sm font-mono" />
        <Skeleton className="w-3/4 h-6 rounded-sm" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="w-16 h-5 rounded-full" />
          <Skeleton className="w-24 h-4 rounded-sm" />
        </div>
      </div>

      {/* 8 Key-Value Rows */}
      <div className="space-y-3.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[116px_1fr] items-center gap-2">
            <Skeleton className="w-20 h-3 rounded-sm" />
            <Skeleton className={cn('h-3.5 rounded-sm', i % 2 === 0 ? 'w-3/5' : 'w-4/5')} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const DashboardSkeleton: React.FC<{ role?: string; className?: string }> = ({ role, className }) => {
  const isAdmin = role === 'admin';
  const isOps = role === 'operations';

  if (isAdmin) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Row 1: Team daily attendance (span 2) + Col 3 (Needs attention + Log compliance) */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
          {/* Team daily attendance list skeleton (span 2) */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton className="w-40 h-5 rounded-sm" />
                <Skeleton className="w-56 h-3 rounded-sm" />
              </div>
              <Skeleton className="w-36 h-4 rounded-sm" />
            </div>
            {/* Search and filter controls */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex gap-3">
                <Skeleton className="flex-1 h-9 rounded-md" />
                <Skeleton className="w-40 h-9 rounded-md" />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="w-16 h-7 rounded-full" />
                ))}
              </div>
            </div>
            {/* 8 rows */}
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="w-28 h-3.5 rounded-sm" />
                      <Skeleton className="w-16 h-2.5 rounded-sm" />
                    </div>
                  </div>
                  <Skeleton className="w-20 h-3 rounded-sm" />
                  <Skeleton className="w-16 h-3 rounded-sm" />
                  <Skeleton className="w-20 h-6 rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Col 3: Needs attention + Log compliance */}
          <div className="space-y-4 flex flex-col">
            {/* Needs attention */}
            <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <Skeleton className="w-28 h-4 rounded-sm" />
                <Skeleton className="w-14 h-3 rounded-sm" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="space-y-1">
                    <Skeleton className="w-40 h-3.5 rounded-sm" />
                    <Skeleton className="w-24 h-2.5 rounded-sm" />
                  </div>
                  <Skeleton className="w-14 h-7 rounded-md" />
                </div>
              ))}
            </div>

            {/* Log compliance */}
            <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3 flex-1">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <Skeleton className="w-44 h-4 rounded-sm" />
                <Skeleton className="w-14 h-3 rounded-sm" />
              </div>
              <div className="space-y-3 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-16 h-3 rounded-sm" />
                    <Skeleton className="flex-1 h-1.5 rounded-full" />
                    <Skeleton className="w-8 h-3 rounded-sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: 3 stage cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <Skeleton className="w-28 h-4 rounded-sm" />
                <Skeleton className="w-20 h-3 rounded-sm" />
              </div>
              <div className="space-y-2.5 pt-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="w-24 h-3 rounded-sm" />
                    <Skeleton className="flex-1 h-1.5 rounded-full" />
                    <Skeleton className="w-6 h-3 rounded-sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isOps) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Row 1: 3 cards */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
          <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
            <Skeleton className="w-32 h-4 rounded-sm" />
            <Skeleton className="w-20 h-8 rounded-sm" />
            <Skeleton className="w-48 h-3 rounded-sm" />
            <div className="flex gap-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="flex-1 h-12 rounded-sm" />
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
            <Skeleton className="w-36 h-4 rounded-sm" />
            <Skeleton className="w-40 h-8 rounded-sm" />
            <Skeleton className="w-24 h-3 rounded-sm" />
            <div className="grid grid-cols-10 gap-1.5 pt-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="w-4 h-4 rounded-full" />
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <Skeleton className="w-20 h-4 rounded-sm" />
              <Skeleton className="w-16 h-4 rounded-full" />
            </div>
            <Skeleton className="w-28 h-7 rounded-sm" />
            <Skeleton className="w-20 h-3 rounded-sm" />
            <Skeleton className="w-full h-9 rounded-md pt-2" />
          </div>
        </div>

        {/* Row 2: Full-width Needs attention */}
        <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <Skeleton className="w-28 h-4 rounded-sm" />
            <Skeleton className="w-14 h-3 rounded-sm" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50">
              <div className="space-y-1">
                <Skeleton className="w-64 h-3.5 rounded-sm" />
                <Skeleton className="w-40 h-2.5 rounded-sm" />
              </div>
              <Skeleton className="w-16 h-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Others: HR, lead, member
  return (
    <div className={cn('space-y-4', className)}>
      {/* Row 1: 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
        <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <Skeleton className="w-32 h-4 rounded-sm" />
          <Skeleton className="w-16 h-8 rounded-sm" />
          <Skeleton className="w-48 h-3 rounded-sm" />
          <div className="flex gap-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 h-12 rounded-sm" />
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <Skeleton className="w-36 h-4 rounded-sm" />
          <Skeleton className="w-40 h-8 rounded-sm" />
          <Skeleton className="w-24 h-3 rounded-sm" />
          <div className="grid grid-cols-10 gap-1.5 pt-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <Skeleton key={i} className="w-4 h-4 rounded-full" />
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <Skeleton className="w-20 h-4 rounded-sm" />
            <Skeleton className="w-16 h-4 rounded-full" />
          </div>
          <Skeleton className="w-28 h-7 rounded-sm" />
          <Skeleton className="w-24 h-3 rounded-sm" />
          <Skeleton className="w-full h-1.5 rounded-full" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="flex-1 h-8 rounded-md" />
            <Skeleton className="flex-1 h-8 rounded-md" />
          </div>
        </div>
      </div>

      {/* Row 2: Chart (span 2) + Needs attention (col 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="space-y-1">
              <Skeleton className="w-28 h-4 rounded-sm" />
              <Skeleton className="w-48 h-3 rounded-sm" />
            </div>
            <Skeleton className="w-32 h-7 rounded-md" />
          </div>
          <Skeleton className="w-full h-48 rounded-md" />
        </div>

        <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <Skeleton className="w-28 h-4 rounded-sm" />
            <Skeleton className="w-14 h-3 rounded-sm" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="space-y-1">
                <Skeleton className="w-40 h-3.5 rounded-sm" />
                <Skeleton className="w-24 h-2.5 rounded-sm" />
              </div>
              <Skeleton className="w-14 h-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Card row */}
      <div className="bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <Skeleton className="w-36 h-4 rounded-sm" />
          <Skeleton className="w-24 h-3 rounded-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="w-28 h-3 rounded-sm" />
              <Skeleton className="flex-1 h-1.5 rounded-full" />
              <Skeleton className="w-6 h-3 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Follow-ups View Skeleton: mirrors CrmFollowUpView layout
 * 3 sections (Overdue, Today, Scheduled) with headers, count chips, and 48px rows
 */
export const FollowUpSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  const sections = [
    { rowCount: 3 },
    { rowCount: 1 },
    { rowCount: 2 },
  ];

  return (
    <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', className)}>
      {sections.map((sec, secIdx) => (
        <section key={secIdx} className="space-y-2">
          {/* Header: 64px h3 bar + 20x16 count chip */}
          <div className="flex items-center gap-2">
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="w-16 h-4 rounded-sm" />
            <Skeleton className="w-5 h-4 rounded-full" />
          </div>

          {/* Bordered card of rows */}
          <div className="rounded-lg border border-border overflow-hidden bg-surface divide-y divide-border">
            {Array.from({ length: sec.rowCount }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="flex items-center gap-3 px-3.5 py-2.5 h-12 bg-surface"
              >
                {/* Left: name bar (140px) over sub-bar (200px) */}
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="w-36 h-3 rounded-sm" />
                  <Skeleton className="w-52 h-2.5 rounded-sm" />
                </div>

                {/* Right: stage chip (56px), owner (70px), time pill (90px), Reschedule (86x28), check (28x28) */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <Skeleton className="w-14 h-5 rounded" />
                  <div className="inline-flex items-center gap-1.5">
                    <Skeleton className="w-5 h-5 rounded-full" />
                    <Skeleton className="w-16 h-3.5 rounded-sm" />
                  </div>
                </div>

                <div className="shrink-0">
                  <Skeleton className="w-24 h-5 rounded" />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Skeleton className="w-[86px] h-7 rounded-md" />
                  <Skeleton className="w-7 h-7 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

