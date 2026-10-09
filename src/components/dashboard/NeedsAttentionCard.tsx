import React, { useState } from 'react';
import {
  CheckCircle2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import type { ViewType } from '../../types';

export interface NeedsAttentionItem {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel: 'Open' | 'Review' | 'View' | 'Log';
  onAction: () => void;
}

interface NeedsAttentionCardProps {
  items: NeedsAttentionItem[];
  isLoading?: boolean;
  onNavigateView?: (view: ViewType) => void;
  className?: string;
}

export const NeedsAttentionCard: React.FC<NeedsAttentionCardProps> = ({
  items,
  isLoading,
  onNavigateView: _onNavigateView,
  className,
}) => {
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const displayedItems = items.slice(0, 3);

  return (
    <>
      <div
        className={cn(
          'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col',
          className
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-ui font-semibold text-fg">Needs attention</h3>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setViewAllOpen(true)}
              className="text-xs text-accent-text hover:underline font-medium cursor-pointer"
            >
              View all
            </button>
          )}
        </div>

        {/* List */}
        <div className="p-4 flex-1">
          {isLoading && items.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-8 h-8 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="w-36 h-3.5 rounded-sm" />
                      <Skeleton className="w-24 h-2.5 rounded-sm" />
                    </div>
                  </div>
                  <Skeleton className="w-14 h-7 rounded-md" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center text-fg-muted space-y-1">
              <CheckCircle2 className="w-6 h-6 text-success-fg mb-1" />
              <p className="text-xs font-medium text-fg">You&apos;re all caught up</p>
              <p className="text-[11px] text-fg-muted">No pending items requiring your attention.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {displayedItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-subtle border border-border flex items-center justify-center text-fg-muted shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-fg-muted truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={item.onAction}
                      className="shrink-0 h-7 text-xs px-2.5"
                    >
                      {item.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* View All Modal */}
      {viewAllOpen && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-lg shadow-lg flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-ui font-semibold text-fg">
                Needs attention ({items.length})
              </h3>
              <button
                type="button"
                onClick={() => setViewAllOpen(false)}
                className="text-fg-muted hover:text-fg p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto divide-y divide-border/60 flex-1">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-subtle border border-border flex items-center justify-center text-fg-muted shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-fg-muted truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setViewAllOpen(false);
                        item.onAction();
                      }}
                      className="shrink-0 h-7 text-xs px-2.5"
                    >
                      {item.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
