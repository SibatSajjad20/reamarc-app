import React from 'react';
import { CalendarOff } from 'lucide-react';
import type { OffDayInfo } from '../../utils/offDays';

interface OffDayBannerProps {
  info: OffDayInfo;
  date?: string;
  compact?: boolean;
  className?: string;
}

export const OffDayBanner: React.FC<OffDayBannerProps> = ({
  info,
  date,
  compact = false,
  className = '',
}) => {
  if (!info.isOff) return null;

  return (
    <div
      className={`rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/80 dark:bg-sky-950/20 text-sky-900 dark:text-sky-200 ${
        compact ? 'p-3' : 'p-4'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 shrink-0">
          <CalendarOff className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
        <div>
          <p className={`font-bold ${compact ? 'text-xs' : 'text-sm'}`}>{info.label}</p>
          <p className="text-xs text-sky-800/80 dark:text-sky-300/80 mt-0.5">
            {date ? `${date} is an official off day. ` : ''}
            Check-in and daily logs are not required. Leave, WFH, and punch corrections can still be submitted if needed.
          </p>
        </div>
      </div>
    </div>
  );
};
