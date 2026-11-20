import React, { Suspense, lazy, useState } from 'react';
import { FileChartColumn } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';

// The report (view, charts, print styles) is its own chunk: nothing loads until the first tap.
const ContentCalendarReportDialog = lazy(() =>
  import('./ContentCalendarReportDialog').then((m) => ({ default: m.ContentCalendarReportDialog })),
);

export interface GenerateReportButtonProps {
  mode: 'staff' | 'client';
  defaultWorkspaceId?: string | null;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'outline' | 'primary';
}

export const GenerateReportButton: React.FC<GenerateReportButtonProps> = ({
  mode,
  defaultWorkspaceId,
  className,
  size = 'sm',
  variant = 'secondary',
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={FileChartColumn}
        className={cn('min-h-[44px] sm:min-h-0', className)}
        onClick={() => setOpen(true)}
        onMouseEnter={() => void import('./ContentCalendarReportDialog')}
        title="Generate a monthly content report"
      >
        <span className="sm:hidden">Report</span>
        <span className="hidden sm:inline">Generate report</span>
      </Button>
      {open && (
        <Suspense fallback={null}>
          <ContentCalendarReportDialog
            open={open}
            onClose={() => setOpen(false)}
            mode={mode}
            defaultWorkspaceId={defaultWorkspaceId}
          />
        </Suspense>
      )}
    </>
  );
};
