import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../ui/sheet';
import type { LogVarianceThresholds } from '../../../types/logVariance';

export interface LogVarianceFormulasPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thresholds?: LogVarianceThresholds;
}

export const LogVarianceFormulasPopover: React.FC<LogVarianceFormulasPopoverProps> = ({
  open,
  onOpenChange,
  thresholds,
}) => {
  const underMin = thresholds?.under_target_min ?? 30;

  const items = [
    {
      term: 'Present day',
      desc: 'A finished scheduled workday with a check-in and a check-out. Off days, holidays, leave, absent days, missing-checkout days and today (until checkout) are not present days.',
    },
    {
      term: 'Worked',
      desc: 'Check-in to check-out, minus the unpaid break where it overlaps, counted from shift start. Includes approved and pending overtime; rejected overtime is removed. Not capped at the shift.',
    },
    {
      term: 'Logged',
      desc: "Sum of the employee's daily log entries dated that day (entries added later still count on their date).",
    },
    {
      term: 'Variance',
      desc: (
        <span>
          <code className="px-1.5 py-0.5 bg-muted-bg text-fg text-xs rounded border border-border">
            Worked − Logged
          </code>
          . + means time not logged, − means more logged than worked. Colour by average per present day:{' '}
          <span className="text-success-fg font-medium">within ±30m/day</span>,{' '}
          <span className="text-warning-fg font-medium">+31–60m/day</span>,{' '}
          <span className="text-danger-fg font-medium">over +60m/day</span>,{' '}
          <span className="text-info-fg font-medium">logged more than worked</span>.
        </span>
      ),
    },
    {
      term: 'Coverage %',
      desc: (
        <span>
          <code className="px-1.5 py-0.5 bg-muted-bg text-fg text-xs rounded border border-border">
            Total logged ÷ Total worked
          </code>{' '}
          over the same present days. Never averaged per day, never capped at 100%.
        </span>
      ),
    },
    {
      term: 'Avg logged / day',
      desc: (
        <span>
          <code className="px-1.5 py-0.5 bg-muted-bg text-fg text-xs rounded border border-border">
            Logged on present days ÷ Days present
          </code>
          . Same for Avg worked / day. Averages use finished present days only.
        </span>
      ),
    },
    {
      term: 'Submission %',
      desc: (
        <span>
          <code className="px-1.5 py-0.5 bg-muted-bg text-fg text-xs rounded border border-border">
            Present days with any log ÷ Days present
          </code>
          .
        </span>
      ),
    },
    {
      term: 'Team numbers',
      desc: 'Sum of every row, then divided: totals ÷ totals, not an average of averages.',
    },
    {
      term: 'Under target',
      desc: `A present day with more than ${underMin}m unlogged (Variance > ${underMin}m).`,
    },
    {
      term: 'Today',
      desc: 'A live in-progress day is not a present day and is not in totals or averages until the person checks out.',
    },
    {
      term: 'Flags',
      desc: 'One chip per person, with every exception type in this range joined together: No log, Checkout, Unlogged, Over-logged, No attendance, Leave. Under-target days are the Under column, not a flag.',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-accent-fg shrink-0" />
            <SheetTitle className="text-base font-semibold text-fg">
              How these numbers are calculated
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm custom-scrollbar">
          <div className="divide-y divide-border">
            {items.map((it, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0 grid grid-cols-[130px_1fr] gap-3">
                <span className="font-medium text-fg">{it.term}</span>
                <span className="text-fg-muted text-xs leading-relaxed">{it.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border text-xs text-fg-muted leading-relaxed">
            All maths is done in minutes and rounded only for display. Web and mobile read the same
            backend calculation, so the numbers always match.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
