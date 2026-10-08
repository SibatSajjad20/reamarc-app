import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'flex gap-5 border-b border-border mb-4 items-center overflow-x-auto no-scrollbar',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    count?: number | string;
  }
>(({ className, count, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'h-10 inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted border-b-2 border-transparent -mb-[1px] whitespace-nowrap cursor-pointer transition-all duration-150 outline-none select-none active:scale-[0.98]',
      'hover:text-fg',
      'data-[state=active]:text-fg data-[state=active]:border-accent',
      'focus-visible:outline-none',
      'disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  >
    <span>{children}</span>
    {count !== undefined && (
      <span className="text-micro font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-2 font-numeric">
        {count}
      </span>
    )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('outline-none focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
