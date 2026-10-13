import React from 'react';
import { cn } from '../../lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  viewOnly?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  children,
  className,
  viewOnly = false,
}) => {
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        {/* Left Column: Title & Description */}
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-semibold text-fg tracking-tight inline-flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {viewOnly && (
              <span className="inline-flex items-center h-6 px-2 rounded-md text-[11px] font-medium uppercase tracking-wide bg-surface-2 text-fg-muted border border-border">
                View only
              </span>
            )}
          </h1>
          {description && (
            <p className="text-ui text-fg-muted mt-1 truncate">
              {description}
            </p>
          )}
        </div>

        {/* Right Column: Actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>

      {/* Optional Row Below (Tabs / Filter toolbar / View switchers) */}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};
