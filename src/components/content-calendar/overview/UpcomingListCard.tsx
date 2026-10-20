import React, { useMemo } from 'react';
import { Calendar, ArrowRight, Plus } from 'lucide-react';
import type { ContentCalendarItem } from '../../../types/contentCalendar';
import { getUpcomingItemsByDay } from '../../../utils/contentCalendarOverview';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../../utils/badgeStyles';
import { ClientAvatar } from '../../ui/ClientAvatar';
import { useResolvedClient } from '../../../hooks/useClientLookup';

interface Props {
  items: ContentCalendarItem[];
  isLoading?: boolean;
  onSelectItem?: (item: ContentCalendarItem) => void;
  onOpenCalendar?: () => void;
  onAddContent?: () => void;
}

export const UpcomingListCard: React.FC<Props> = ({
  items,
  isLoading = false,
  onSelectItem,
  onOpenCalendar,
  onAddContent,
}) => {
  const resolveClient = useResolvedClient();
  const { groups, totalPosts } = useMemo(() => getUpcomingItemsByDay(items, 7), [items]);

  const { displayRows, renderedCount } = useMemo(() => {
    const rows: Array<{
      groupLabel: string;
      isGroupHeader: boolean;
      item: ContentCalendarItem;
    }> = [];

    let count = 0;
    for (const group of groups) {
      if (group.items.length === 0) continue;
      let isFirst = true;
      for (const item of group.items) {
        if (count >= 5) break;
        rows.push({
          groupLabel: group.dayLabel,
          isGroupHeader: isFirst,
          item,
        });
        isFirst = false;
        count++;
      }
      if (count >= 5) break;
    }

    return { displayRows: rows, renderedCount: count };
  }, [groups]);

  const remainingCount = totalPosts - renderedCount;
  const restOfWeekCount = useMemo(() => {
    return groups.slice(1).reduce((sum, g) => sum + g.items.length, 0);
  }, [groups]);

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Upcoming 7 Days
            </h3>
          </div>
          <p className="text-caption text-fg-muted mt-0.5 font-numeric">
            {totalPosts} {totalPosts === 1 ? 'post' : 'posts'} scheduled in the next 7 days
          </p>
        </div>
        {onOpenCalendar && (
          <button
            type="button"
            onClick={onOpenCalendar}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Open calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-3 space-y-2 flex-1 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-2 rounded-lg bg-subtle/50 flex items-center justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-40 bg-skel rounded" />
                <div className="h-3 w-28 bg-skel rounded" />
              </div>
              <div className="h-5 w-16 bg-skel rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : totalPosts === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[160px]">
          <div className="w-9 h-9 rounded-full bg-subtle text-fg-muted flex items-center justify-center mb-2">
            <Calendar className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-fg">Nothing scheduled in the next 7 days</p>
          <p className="text-caption text-fg-muted mt-0.5 mb-3 max-w-xs">
            No deliverables have target publish dates in this upcoming week.
          </p>
          {onAddContent && (
            <button
              type="button"
              onClick={onAddContent}
              className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add content</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between pt-2">
          <div className="space-y-1">
            {displayRows.map(({ groupLabel, isGroupHeader, item }) => {
              const clientWs = resolveClient(item);
              const client = (clientWs?.name || item.client_name || '').trim() || 'No client';
              const channel =
                item.channels && item.channels.length > 0
                  ? item.channels.join(', ')
                  : item.creative_type || 'General';

              return (
                <div key={item.id} className="space-y-0.5">
                  {isGroupHeader && (
                    <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider pt-1.5 pb-0.5 px-1 font-numeric">
                      {groupLabel}
                    </div>
                  )}
                  <div
                    onClick={() => onSelectItem?.(item)}
                    className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-hover transition cursor-pointer group border border-transparent hover:border-border"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <ClientAvatar name={client} logoUrl={clientWs?.logo_url} clientId={clientWs?.id || item.workspace_id} brandColor={clientWs?.brandColor} initials={clientWs?.initials} size={18} decorative />
                      <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-fg truncate group-hover:text-accent transition-colors">
                        {item.content_concept || item.primary_text || 'Untitled campaign'}
                      </div>
                      <div className="text-caption text-fg-muted truncate font-numeric mt-0.5">
                        {client} · {channel}
                      </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>
                        {item.stage}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Overflow Indicator */}
          {remainingCount > 0 ? (
            <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-caption text-fg-muted font-numeric">
              <span>
                +{remainingCount} more · rest of week: {restOfWeekCount} {restOfWeekCount === 1 ? 'post' : 'posts'}
              </span>
              {onOpenCalendar && (
                <button
                  type="button"
                  onClick={onOpenCalendar}
                  className="text-accent-text hover:underline font-medium cursor-pointer"
                >
                  View calendar
                </button>
              )}
            </div>
          ) : (
            <div className="pt-2 mt-2 border-t border-border text-caption text-fg-muted font-numeric">
              {totalPosts} {totalPosts === 1 ? 'post' : 'posts'} scheduled in this 7-day window
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const NextSevenDaysStripCard = UpcomingListCard;
