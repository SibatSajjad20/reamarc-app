import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { UrgentWatchlistItem } from '../../../utils/contentCalendarOverview';
import type { ContentCalendarItem } from '../../../types/contentCalendar';
import { ClientAvatar } from '../../ui/ClientAvatar';
import { useResolvedClient } from '../../../hooks/useClientLookup';

interface Props {
  watchlist: UrgentWatchlistItem[];
  isLoading?: boolean;
  onSelectItem: (item: ContentCalendarItem) => void;
  onViewAll?: () => void;
}

export const UrgentWatchlistCard: React.FC<Props> = ({
  watchlist,
  isLoading = false,
  onSelectItem,
  onViewAll,
}) => {
  const resolveClient = useResolvedClient();
  const itemsToShow = watchlist.slice(0, 5);
  const remainingCount = watchlist.length - itemsToShow.length;

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                watchlist.length > 0 ? 'text-danger-fg' : 'text-fg-muted'
              }`}
            />
            <h3 className="text-ui font-semibold text-fg">
              Needs Attention
            </h3>
            {watchlist.length > 0 ? (
              <span className="font-numeric text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-danger-bg text-danger-fg border border-danger-bd">
                {watchlist.length} urgent
              </span>
            ) : (
              <span className="font-numeric text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-border">
                0 urgent
              </span>
            )}
          </div>
          <p className="text-caption text-fg-muted mt-0.5 font-numeric">
            Overdue posts, revisions, and unassigned work
          </p>
        </div>
        {watchlist.length > 0 && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View all</span>
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
                <div className="h-3.5 w-44 bg-skel rounded" />
                <div className="h-3 w-32 bg-skel rounded" />
              </div>
              <div className="h-5 w-20 bg-skel rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : itemsToShow.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[160px]">
          <div className="w-9 h-9 rounded-full bg-success-bg text-success-fg flex items-center justify-center mb-2">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-fg">All clear</p>
          <p className="text-caption text-fg-muted mt-0.5 max-w-xs">
            No overdue posts, revisions, or unassigned work.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between pt-2">
          <div className="space-y-1">
            {itemsToShow.map((entry) => {
              const { item } = entry;
              const clientWs = resolveClient(item);
              const dateRaw = item.publish_date || item.design_due;
              const dateStr = dateRaw ? dateRaw.split('T')[0] : 'No date';

              let badgeContent: React.ReactNode = null;
              if (entry.reason === 'overdue') {
                let diffDays = 0;
                if (dateRaw) {
                  const parts = dateRaw.split('T')[0].split('-');
                  if (parts.length === 3) {
                    const targetDate = new Date(
                      parseInt(parts[0], 10),
                      parseInt(parts[1], 10) - 1,
                      parseInt(parts[2], 10)
                    );
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    diffDays = Math.max(
                      0,
                      Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))
                    );
                  }
                }
                const label = diffDays > 0 ? `Overdue ${diffDays}d` : 'Overdue';
                badgeContent = (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-danger-bg text-danger-fg border border-danger-bd font-numeric">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger-dot shrink-0" />
                    <span>{label}</span>
                  </span>
                );
              } else if (entry.reason === 'revision') {
                badgeContent = (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-danger-bg text-danger-fg border border-danger-bd font-numeric">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger-dot shrink-0" />
                    <span>Revision</span>
                  </span>
                );
              } else if (entry.reason === 'unassigned') {
                badgeContent = (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-warning-bg text-warning-fg border border-warning-bd font-numeric">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-dot shrink-0" />
                    <span>Unassigned</span>
                  </span>
                );
              } else {
                badgeContent = (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-warning-bg text-warning-fg border border-warning-bd font-numeric">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-dot shrink-0" />
                    <span>Client review</span>
                  </span>
                );
              }

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-hover transition cursor-pointer group border border-transparent hover:border-border"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <ClientAvatar
                      name={clientWs?.name || item.client_name || 'Client'}
                      logoUrl={clientWs?.logo_url}
                      clientId={clientWs?.id || item.workspace_id}
                      brandColor={clientWs?.brandColor}
                      initials={clientWs?.initials}
                      size={18}
                      decorative
                    />
                    <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-fg truncate group-hover:text-accent transition-colors">
                      {item.content_concept || item.primary_text || 'Untitled campaign'}
                    </div>
                    <div className="text-caption text-fg-muted truncate font-numeric mt-0.5">
                      {item.client_name || 'No client'} · #{item.serial} · {dateStr}
                    </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {badgeContent}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Overflow Indicator */}
          {remainingCount > 0 ? (
            <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-caption text-fg-muted font-numeric">
              <span>+{remainingCount} more needing attention</span>
              {onViewAll && (
                <button
                  type="button"
                  onClick={onViewAll}
                  className="text-accent-text hover:underline font-medium cursor-pointer"
                >
                  View all in table
                </button>
              )}
            </div>
          ) : (
            <div className="pt-2 mt-2 border-t border-border text-caption text-fg-muted font-numeric">
              {watchlist.length} {watchlist.length === 1 ? 'item' : 'items'} in watchlist
            </div>
          )}
        </div>
      )}
    </div>
  );
};
