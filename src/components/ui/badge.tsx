import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center font-medium transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'border border-border bg-subtle text-fg-2 rounded-sm text-xs px-2 py-0.5',
        tag: 'border border-border bg-surface text-fg-2 rounded-sm h-[22px] px-1.5 text-xs font-medium shrink-0',
        count: 'bg-subtle text-fg-2 rounded-full px-1.5 py-0.5 text-micro font-medium tabular-nums font-numeric shrink-0',
        attention: 'bg-accent-soft-2 text-accent-text rounded-full px-1.5 py-0.5 text-micro font-medium tabular-nums font-numeric shrink-0',
        outline: 'border border-border-strong text-fg-2 rounded-sm text-xs px-1.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export const Tag = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant: 'tag' }), className)}
      {...props}
    />
  )
);
Tag.displayName = 'Tag';

