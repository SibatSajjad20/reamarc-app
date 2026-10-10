import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { UrgentWatchlistItem } from '../../../utils/contentCalendarOverview';
import type { ContentCalendarItem } from '../../../types/contentCalendar';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../../utils/badgeStyles';

interface Props {
  watchlist: UrgentWatchlistItem[];
  isLoading?: boolean;
  onSelectItem: (item: ContentCalendarItem) => void;
}

export const UrgentWatchlistCard: React.FC<Props> = ({
  watchlist,
  isLoading = false,
  onSelectItem,
}) => {
  const itemsToShow = watchlist.slice(0, 5);

  return (
    <div className="w-full rounded-lg bg-surface border border-border shadow-xs overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0 bg-subtle border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-danger-fg" />
          <h3 className="text-ui font-semibold text-fg">
            Needs Attention
          </h3>
          {watchlist.length > 0 ? (
            <span className="font-numeric text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-danger-bg text-danger-fg border border-danger-bd">
              {watchlist.length} urgent
            </span>
          ) : (
            <span className="font-numeric text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-surface text-fg-muted border border-border">
              0 urgent
            </span>
          )}
        </div>
        <p className="text-xs text-fg-muted hidden sm:block">
          Overdue posts, revisions, and unassigned work
        </p>
      </div>

      {/* Table / List */}
      <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 min-w-0 divide-y divide-border">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-subtle">
            <tr className="text-fg-muted border-b border-border font-medium text-caption">
              <th className="py-2 px-3">Client & Deliverable</th>
              <th className="py-2 px-3">Stage</th>
              <th className="py-2 px-3 text-center">Urgency</th>
              <th className="py-2 px-3 text-right">Target Date</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border font-medium">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-2.5 px-3">
                    <div className="space-y-1">
                      <div className="h-3.5 w-28 bg-skel rounded" />
                      <div className="h-3 w-48 bg-skel rounded" />
                    </div>
                  </td>
                  <td className="py-2.5 px-3"><div className="h-4 w-20 bg-skel rounded" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-5 w-24 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-right"><div className="h-4 w-16 bg-skel rounded ml-auto" /></td>
                  <td className="py-2.5 px-3 text-right"><div className="h-6 w-12 bg-skel rounded ml-auto" /></td>
                </tr>
              ))
            ) : itemsToShow.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-fg-muted">
                  <p className="text-sm font-semibold text-fg">Zero urgent items detected</p>
                  <p className="text-xs mt-0.5 text-fg-muted">All scheduled deliverables are currently on track.</p>
                </td>
              </tr>
            ) : (
              itemsToShow.map((entry) => {
                const { item } = entry;
                const dateStr = item.publish_date || item.design_due;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-hover transition-colors cursor-pointer"
                    onClick={() => onSelectItem(item)}
                  >
                    {/* Client & Headline / Concept */}
                    <td className="py-2 px-3">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-xs text-fg truncate">
                            {item.client_name || 'No client'}
                          </span>
                          <span className="font-numeric text-[10px] font-medium text-fg-muted shrink-0">
                            #{item.serial}
                          </span>
                        </div>
                        <div className="text-xs text-fg-muted font-normal line-clamp-1 leading-tight mt-0.5">
                          {item.content_concept || 'Untitled Campaign'}
                        </div>
                      </div>
                    </td>

                    {/* Stage */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>
                        {item.stage}
                      </span>
                    </td>

                    {/* Urgency Badge */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {entry.severity === 'danger' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-danger-bg text-danger-fg border border-danger-bd">
                          <span className="w-1.5 h-1.5 rounded-full bg-danger-solid" />
                          <span>{entry.reasonLabel}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-warning-bg text-warning-fg border border-warning-bd">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning-solid" />
                          <span>{entry.reasonLabel}</span>
                        </span>
                      )}
                    </td>

                    {/* Target Date */}
                    <td className="py-2 px-3 text-right font-numeric text-fg-muted whitespace-nowrap text-xs">
                      {dateStr ? dateStr.split('T')[0] : 'None'}
                    </td>

                    {/* Action */}
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item);
                        }}
                        className="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-subtle hover:bg-hover text-fg border border-border transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
