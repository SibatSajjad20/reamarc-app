import React from 'react';
import { cn } from '../../lib/utils';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  sparklineData?: number[];
  delta?: React.ReactNode;
  deltaType?: 'success' | 'danger' | 'warning' | 'neutral';
  deltaContext?: string;
  className?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  icon: Icon,
  sparklineData,
  delta,
  deltaType = 'neutral',
  deltaContext,
  className,
  onClick,
}) => {
  const deltaColorClass = {
    success: 'text-success-fg',
    danger: 'text-danger-fg',
    warning: 'text-warning-fg',
    neutral: 'text-fg-muted',
  }[deltaType];

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between transition-colors',
        onClick && 'cursor-pointer hover:bg-hover',
        className
      )}
    >
      {/* Label Row */}
      <div className="flex items-center gap-1.5 text-fg-muted">
        {Icon && <Icon size={16} className="shrink-0 text-fg-muted" />}
        <span className="text-ui font-medium truncate">{label}</span>
      </div>

      {/* Value Row */}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-0.5 min-w-0">
          <span className="text-kpi font-semibold text-fg tracking-tight font-numeric tabular-nums truncate">
            {value}
          </span>
          {unit && (
            <span className="text-body font-medium text-fg-muted ml-1 shrink-0">
              {unit}
            </span>
          )}
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="shrink-0 ml-auto self-center">
            <Sparkline data={sparklineData} width={96} height={28} />
          </div>
        )}
      </div>

      {/* Comparison Line */}
      {(delta !== undefined || deltaContext) && (
        <div className="mt-1 flex items-center gap-1 text-small">
          {delta !== undefined && (
            <span className={cn('font-medium font-numeric tabular-nums', deltaColorClass)}>
              {delta}
            </span>
          )}
          {deltaContext && (
            <span className="text-fg-muted truncate">{deltaContext}</span>
          )}
        </div>
      )}
    </div>
  );
};
