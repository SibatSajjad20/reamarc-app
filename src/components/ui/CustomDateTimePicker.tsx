import React, { useCallback } from 'react';
import { CustomDatePicker } from './CustomDatePicker';
import { CustomTimePicker } from './CustomTimePicker';
import { cn } from '../../lib/utils';

export interface CustomDateTimePickerProps {
  value?: string; // 'YYYY-MM-DDTHH:mm' or ISO string
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  minDate?: string;
  maxDate?: string;
  layout?: 'row' | 'stacked';
  placeholder?: string;
  clearable?: boolean;
}

export const CustomDateTimePicker: React.FC<CustomDateTimePickerProps> = ({
  value = '',
  onChange,
  disabled = false,
  className = '',
  minDate,
  maxDate,
  layout = 'row',
  placeholder = 'Select date',
  clearable = false,
}) => {
  let datePart = '';
  let timePart = '';

  if (value) {
    if (value.includes('T')) {
      const [d, t] = value.split('T');
      datePart = d || '';
      timePart = (t || '').slice(0, 5);
    } else if (value.length === 10) {
      datePart = value;
      timePart = '09:00';
    }
  }

  const handleDateChange = useCallback(
    (newDate: string) => {
      if (!newDate) {
        onChange('');
        return;
      }
      const t = timePart || '09:00';
      onChange(`${newDate}T${t}`);
    },
    [onChange, timePart]
  );

  const handleTimeChange = useCallback(
    (newTime: string) => {
      if (!newTime) {
        if (datePart) {
          onChange(`${datePart}T09:00`);
        } else {
          onChange('');
        }
        return;
      }
      const d = datePart || new Date().toISOString().split('T')[0];
      onChange(`${d}T${newTime}`);
    },
    [datePart, onChange]
  );

  if (layout === 'stacked') {
    return (
      <div className={cn('space-y-2 w-full', className)}>
        <CustomDatePicker
          value={datePart}
          onChange={handleDateChange}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
          placeholder={placeholder}
          clearable={clearable}
        />
        <CustomTimePicker
          value={timePart}
          onChange={handleTimeChange}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 w-full min-w-0', className)}>
      <div className="flex-1 min-w-0">
        <CustomDatePicker
          value={datePart}
          onChange={handleDateChange}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
          placeholder={placeholder}
          clearable={clearable}
        />
      </div>
      <div className="w-[120px] shrink-0">
        <CustomTimePicker
          value={timePart}
          onChange={handleTimeChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
