import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-2', className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'aspect-square h-4 w-4 rounded-full border border-border-strong bg-surface text-accent outline-none cursor-pointer',
        'focus-visible:shadow-[0_0_0_3px_var(--ring)] focus-visible:border-ring-border',
        'data-[state=checked]:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-accent" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = 'RadioGroupItem';

export interface RadioCardProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
}

export const RadioCard = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioCardProps
>(({ className, title, description, id, ...props }, ref) => {
  const generatedId = React.useId();
  const itemId = id || generatedId;

  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      id={itemId}
      className={cn(
        'relative flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-left transition-colors cursor-pointer outline-none select-none',
        'hover:bg-subtle/50',
        'data-[state=checked]:bg-accent-soft data-[state=checked]:border-accent',
        'focus-visible:shadow-[0_0_0_3px_var(--ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <div className="aspect-square h-4 w-4 shrink-0 mt-0.5 rounded-full border border-border-strong bg-surface flex items-center justify-center">
        <RadioGroupPrimitive.Indicator>
          <div className="h-1.5 w-1.5 rounded-full bg-accent" />
        </RadioGroupPrimitive.Indicator>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-fg">{title}</span>
        {description && <span className="text-xs text-fg-muted mt-0.5">{description}</span>}
      </div>
    </RadioGroupPrimitive.Item>
  );
});
RadioCard.displayName = 'RadioCard';
