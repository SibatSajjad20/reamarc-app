import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
}

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, indicatorClassName, ...props }, ref) => {
  const safeValue = Math.min(100, Math.max(0, value ?? 0));

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-subtle',
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'h-full w-full flex-1 bg-accent transition-all duration-200',
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;
