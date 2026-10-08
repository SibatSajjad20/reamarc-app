import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, label, description, checked, id, ...props }, ref) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const checkboxNode = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={inputId}
      checked={checked}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-xs border border-border-strong bg-surface transition-colors cursor-pointer outline-none',
        'focus-visible:shadow-[0_0_0_3px_var(--ring)] focus-visible:border-ring-border',
        'data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-fg',
        'data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-accent-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {checked === 'indeterminate' ? (
          <Minus className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description) {
    return checkboxNode;
  }

  return (
    <div className="flex items-start gap-2 select-none">
      <div className="pt-0.5">{checkboxNode}</div>
      <div className="flex flex-col">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg cursor-pointer">
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-fg-muted">{description}</p>
        )}
      </div>
    </div>
  );
});
Checkbox.displayName = 'Checkbox';
