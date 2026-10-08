import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { getStatusMapping, type StatusVariant } from '@/lib/statusMap';

export const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-xs font-medium leading-4 whitespace-nowrap select-none shrink-0',
  {
    variants: {
      variant: {
        success: 'bg-success-bg text-success-fg',
        warning: 'bg-warning-bg text-warning-fg',
        danger: 'bg-danger-bg text-danger-fg',
        info: 'bg-info-bg text-info-fg',
        neutral: 'bg-neutral-bg text-neutral-fg',
        accent: 'bg-accent-pill-bg text-accent-pill-fg',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {
  status?: string | null;
  hasDot?: boolean;
  dot?: boolean;
  label?: React.ReactNode;
}

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, variant, status, hasDot, dot, label, children, ...props }, ref) => {
    let resolvedVariant: StatusVariant = variant || 'neutral';
    let resolvedLabel = label ?? children;
    const showDot = dot !== undefined ? dot : (hasDot !== undefined ? hasDot : true);

    if (status) {
      const mapping = getStatusMapping(status);
      if (!variant) {
        resolvedVariant = mapping.variant;
      }
      if (!resolvedLabel) {
        resolvedLabel = mapping.label;
      }
    }

    return (
      <span
        ref={ref}
        className={cn(statusPillVariants({ variant: resolvedVariant }), className)}
        {...props}
      >
        {showDot && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
            aria-hidden="true"
          />
        )}
        <span>{resolvedLabel}</span>
      </span>
    );
  }
);
StatusPill.displayName = 'StatusPill';
