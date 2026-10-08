import React from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export interface ErrorStateProps {
  title?: React.ReactNode;
  message?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Couldn't load data",
  message = 'Check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  className,
}) => {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg p-8 flex flex-col items-center justify-center text-center select-none shadow-xs',
        className
      )}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-danger-bg flex items-center justify-center text-danger-fg mb-3 shrink-0">
        <CircleAlert size={20} />
      </div>

      <h3 className="text-h3 font-semibold text-fg tracking-tight">
        {title}
      </h3>

      {message && (
        <p className="text-ui text-fg-muted max-w-[380px] mt-1 text-balance">
          {message}
        </p>
      )}

      {(onRetry || secondaryAction) && (
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
