import React from 'react';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  isDanger?: boolean;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  title,
  description,
  children,
  className,
  isDanger = false,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 sm:p-6 bg-surface shadow-xs transition-colors',
        isDanger ? 'border-danger-bd bg-danger-bg/20' : 'border-border',
        className
      )}
    >
      {title ? (
        <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] gap-6 items-start">
          <div>
            <h2 className={cn('text-sm font-semibold leading-tight', isDanger ? 'text-danger-fg' : 'text-fg')}>
              {title}
            </h2>
            {description && (
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <div className="space-y-4 min-w-0">
            {children}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};
