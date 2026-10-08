import React from 'react';
import { Inbox, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export interface EmptyStateProps {
  icon?: LucideIcon | React.ComponentType<{ size?: number; className?: string }>;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'page' | 'compact';
  isFiltered?: boolean;
  onClearFilters?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: CustomIcon,
  title = 'No items found',
  description,
  action,
  actions,
  variant = 'page',
  isFiltered = false,
  onClearFilters,
  className,
}) => {
  const IconComponent = CustomIcon || (isFiltered ? SearchX : Inbox);
  const displayTitle = isFiltered ? (title === 'No items found' ? 'No results' : title) : title;
  const displayDesc = isFiltered
    ? (description || 'Nothing matches your search or filters.')
    : description;

  const isCompact = variant === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center select-none',
        isCompact ? 'py-8 px-4' : 'py-12 px-6',
        className
      )}
    >
      {/* 40px Circle */}
      <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-fg-muted mb-3 shrink-0">
        <IconComponent size={20} />
      </div>

      {/* Title */}
      <h3 className="text-h3 font-semibold text-fg tracking-tight">
        {displayTitle}
      </h3>

      {/* Description */}
      {!isCompact && displayDesc && (
        <p className="text-ui text-fg-muted max-w-[380px] mt-1 text-balance">
          {displayDesc}
        </p>
      )}

      {/* Actions */}
      {(action || actions || (isFiltered && onClearFilters)) && (
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          {isFiltered && onClearFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
          {action}
          {actions}
        </div>
      )}
    </div>
  );
};
