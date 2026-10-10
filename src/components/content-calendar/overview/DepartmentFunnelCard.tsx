import React, { useMemo } from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import type { ContentCalendarItem } from '../../../types/contentCalendar';

interface Props {
  items: ContentCalendarItem[];
  isLoading?: boolean;
  onOpenPipeline: () => void;
}

export const DepartmentFunnelCard: React.FC<Props> = ({
  items,
  isLoading = false,
  onOpenPipeline,
}) => {
  const stageData = useMemo(() => {
    let contentCount = 0;
    let creativeCount = 0;
    let clientReviewCount = 0;
    let revisionCount = 0;
    let readyCount = 0;

    for (const it of items) {
      if (it.stage === 'Posted' || it.stage === 'Rejected') continue;

      if (it.stage === 'Content' || it.stage === 'Content Internal Review') {
        contentCount++;
      } else if (it.stage === 'Creative Production' || it.stage === 'Creative Internal Review') {
        creativeCount++;
      } else if (it.stage === 'Content Client Review' || it.stage === 'Creative Client Review') {
        clientReviewCount++;
      } else if (it.stage === 'Content Revision' || it.stage === 'Creative Revision') {
        revisionCount++;
      } else if (it.stage === 'Ready to Post') {
        readyCount++;
      }
    }

    const activeTotal = contentCount + creativeCount + clientReviewCount + revisionCount + readyCount;

    const stages = [
      {
        key: 'content',
        label: 'Content',
        count: contentCount,
        pct: activeTotal > 0 ? Math.round((contentCount / activeTotal) * 100) : 0,
        colorClass: 'bg-accent',
        dotClass: 'bg-accent',
      },
      {
        key: 'creative',
        label: 'Creative',
        count: creativeCount,
        pct: activeTotal > 0 ? Math.round((creativeCount / activeTotal) * 100) : 0,
        colorClass: 'bg-info-dot',
        dotClass: 'bg-info-dot',
      },
      {
        key: 'client_review',
        label: 'Client Review',
        count: clientReviewCount,
        pct: activeTotal > 0 ? Math.round((clientReviewCount / activeTotal) * 100) : 0,
        colorClass: 'bg-warning-dot',
        dotClass: 'bg-warning-dot',
      },
      {
        key: 'revisions',
        label: 'Revisions',
        count: revisionCount,
        pct: activeTotal > 0 ? Math.round((revisionCount / activeTotal) * 100) : 0,
        colorClass: 'bg-danger-dot',
        dotClass: 'bg-danger-dot',
      },
      {
        key: 'ready',
        label: 'Ready to Post',
        count: readyCount,
        pct: activeTotal > 0 ? Math.round((readyCount / activeTotal) * 100) : 0,
        colorClass: 'bg-success-dot',
        dotClass: 'bg-success-dot',
      },
    ];

    return { activeTotal, stages };
  }, [items]);

  return (
    <div className="w-full rounded-lg bg-surface border border-border shadow-xs p-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Pipeline Distribution
            </h3>
          </div>
          <p className="text-xs text-fg-muted mt-0.5 font-numeric">
            {stageData.activeTotal} active campaigns · Posted & Rejected excluded
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPipeline}
          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Open pipeline</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="py-4 space-y-3 animate-pulse">
          <div className="h-3 w-full bg-skel rounded-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-skel rounded-md" />
            ))}
          </div>
        </div>
      ) : (
        <div className="py-3 space-y-3">
          {/* Single Stacked Bar */}
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-subtle border border-border/50">
            {stageData.activeTotal === 0 ? (
              <div className="w-full h-full bg-subtle" />
            ) : (
              stageData.stages.map((st) =>
                st.count > 0 ? (
                  <div
                    key={st.key}
                    className={`${st.colorClass} h-full transition-all duration-300`}
                    style={{ width: `${(st.count / stageData.activeTotal) * 100}%` }}
                    title={`${st.label}: ${st.count} (${st.pct}%)`}
                  />
                ) : null
              )
            )}
          </div>

          {/* 5-Stage Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {stageData.stages.map((st) => (
              <div
                key={st.key}
                className="flex flex-col p-2 rounded-md bg-subtle/50 border border-border/40 transition hover:bg-subtle"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.dotClass}`} />
                  <span className="text-xs text-fg-muted font-medium truncate" title={st.label}>
                    {st.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold font-numeric text-fg">
                    {st.count}
                  </span>
                  <span className="text-[10.5px] font-numeric text-fg-muted">
                    ({st.pct}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
