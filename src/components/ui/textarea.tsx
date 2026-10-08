import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxLength?: number;
  showCount?: boolean;
  label?: React.ReactNode;
  error?: React.ReactNode;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      maxLength,
      showCount = false,
      label,
      error,
      value,
      defaultValue,
      onChange,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const textareaId = id || (label ? generatedId : undefined);

    const [currentLength, setCurrentLength] = React.useState(() => {
      if (typeof value === 'string') return value.length;
      if (typeof defaultValue === 'string') return defaultValue.length;
      return 0;
    });

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCurrentLength(e.target.value.length);
      onChange?.(e);
    };

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={textareaId} className="block text-label font-medium text-fg">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          className={cn(
            'w-full min-h-[76px] rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint leading-5 resize-y transition-colors duration-120 outline-none',
            'hover:border-fg-faint focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)]',
            'aria-invalid:border-danger-dot aria-invalid:focus:shadow-[0_0_0_3px_rgba(240,68,56,0.2)]',
            'disabled:bg-subtle disabled:text-fg-faint disabled:cursor-not-allowed',
            'read-only:bg-subtle read-only:focus:shadow-none read-only:focus:border-border-strong',
            error && 'border-danger-bd focus:border-danger-fg',
            className
          )}
          {...props}
        />
        <div className="flex items-center justify-between text-xs">
          {error ? <p className="text-danger-fg">{error}</p> : <span />}
          {showCount && maxLength && (
            <div className="text-right text-fg-muted font-numeric">
              {currentLength} / {maxLength}
            </div>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
