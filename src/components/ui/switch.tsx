import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, description, id, ...props }, ref) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const switchNode = (
    <SwitchPrimitive.Root
      id={inputId}
      className={cn(
        'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-transparent transition-colors duration-120 outline-none select-none',
        'bg-border-strong data-[state=checked]:bg-accent',
        'focus-visible:shadow-[0_0_0_3px_var(--ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-120',
          'translate-x-0.5 data-[state=checked]:translate-x-[15px]'
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label && !description) {
    return switchNode;
  }

  return (
    <div className="flex items-start justify-between gap-3 select-none">
      <div className="flex flex-col">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg cursor-pointer">
            {label}
          </label>
        )}
        {description && (
          <span className="text-xs text-fg-muted mt-0.5">{description}</span>
        )}
      </div>
      <div className="pt-0.5">{switchNode}</div>
    </div>
  );
});
Switch.displayName = 'Switch';
