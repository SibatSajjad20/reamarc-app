import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3 bg-surface text-fg rounded-lg', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4 relative',
        month: 'flex flex-col gap-2',
        month_caption: 'flex justify-center pt-1 relative items-center mb-1',
        caption_label: 'text-sm font-semibold text-fg',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'absolute left-1 top-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 text-fg-muted'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'absolute right-1 top-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 text-fg-muted'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-fg-muted rounded-md w-9 font-normal text-xs text-center select-none',
        week: 'flex w-full mt-1',
        day: 'h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-hover rounded-md select-none font-numeric'
        ),
        range_end: 'range-end',
        selected: cn(
          'bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg focus:bg-accent focus:text-accent-fg rounded-md'
        ),
        today: 'border border-accent text-accent font-semibold',
        outside: 'text-fg-faint opacity-50',
        disabled: 'text-fg-faint opacity-30 cursor-not-allowed line-through',
        range_middle: 'aria-selected:bg-accent-soft aria-selected:text-accent-text rounded-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === 'left') {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';
