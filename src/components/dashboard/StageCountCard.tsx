import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

export interface StageItem {
  label: string;
  count: number;
}

interface StageCountCardProps {
  title: string;
  subtitle?: string;
  linkText: string;
  onNavigate: () => void;
  stages: StageItem[];
  layout?: 'single-col' | 'two-col';
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
}

export const StageCountCard: React.FC<StageCountCardProps> = ({
  title,
  subtitle,
  linkText,
  onNavigate,
  stages,
  layout = 'single-col',
  className,
  isLoading,
  isError,
}) => {
  const totalCount = stages.reduce((acc, s) => acc + (s.count || 0), 0);

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-ui font-semibold text-fg">{title}</h3>
          {subtitle && (
            <p className="text-xs text-fg-muted mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onNavigate}
          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          {linkText}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex-1">
        {isLoading && stages.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-24 h-3.5 rounded-sm" />
                <Skeleton className="flex-1 h-1.5 rounded-full" />
                <Skeleton className="w-6 h-3.5 rounded-sm" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-xs text-danger-fg">
            Failed to load stages
          </div>
        ) : stages.length === 0 ? (
          <div className="py-6 text-center text-xs text-fg-muted">
            No items yet
          </div>
        ) : (
          <div
            className={cn(
              'space-y-2.5',
              layout === 'two-col' && 'space-y-0 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3'
            )}
          >
            {stages.map((stage) => {
              const pct = totalCount > 0 ? Math.round((stage.count / totalCount) * 100) : 0;
              return (
                <div
                  key={stage.label}
                  className="grid grid-cols-[130px_1fr_32px] items-center gap-3 h-6 text-xs"
                >
                  <span className="text-fg-muted truncate" title={stage.label}>
                    {stage.label}
                  </span>
                  <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-semibold text-fg text-right font-numeric text-xs">
                    {stage.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
