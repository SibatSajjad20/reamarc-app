import React from 'react';
import { CalendarOff } from 'lucide-react';
import type { OffDayInfo } from '../../utils/offDays';
import { Callout } from './Callout';

export interface OffDayBannerProps {
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
    <Callout
      variant="info"
      icon={CalendarOff}
      title={info.label}
      className={className}
    >
      <span className={compact ? 'text-small' : 'text-ui'}>
        {date ? `${date} is an official off day. ` : ''}
        Check-in and daily logs are not required. Leave, WFH, and punch corrections can still be submitted if needed.
      </span>
    </Callout>
  );
};
