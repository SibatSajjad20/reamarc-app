import * as React from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: 'md' | 'sm';
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  onClear?: () => void;
  clearable?: boolean;
  label?: React.ReactNode;
  error?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      inputSize = 'md',
      icon: Icon,
      onClear,
      clearable = false,
      label,
      error,
      disabled,
      readOnly,
      value,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || (label ? generatedId : undefined);
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === 'password';
    const computedType = isPassword ? (showPassword ? 'text' : 'password') : type;

    const inputElement = (
      <div className="relative inline-flex items-center w-full">
        {Icon && (
          <span className="absolute left-3 text-fg-muted pointer-events-none flex items-center justify-center">
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
        <input
          id={inputId}
          type={computedType}
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          value={value}
          className={cn(
            'w-full rounded-md border border-border-strong bg-surface text-fg placeholder:text-fg-faint transition-colors duration-120 outline-none',
            'hover:border-fg-faint focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)]',
            'aria-invalid:border-danger-dot aria-invalid:focus:shadow-[0_0_0_3px_rgba(240,68,56,0.2)]',
            'disabled:bg-subtle disabled:text-fg-faint disabled:cursor-not-allowed',
            'read-only:bg-subtle read-only:focus:shadow-none read-only:focus:border-border-strong',
            inputSize === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3 text-sm',
            Icon && 'pl-9',
            (isPassword || ((onClear || clearable) && value)) && 'pr-9',
            error && 'border-danger-bd focus:border-danger-fg',
            className
          )}
          {...props}
        />
        {(onClear || clearable) && value && !disabled && !readOnly && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2.5 text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
            aria-label="Clear input"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        {isPassword && !disabled && (
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-2.5 text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );

    if (label || error) {
      return (
        <div className="w-full space-y-1.5 text-left">
          {label && (
            <label htmlFor={inputId} className="block text-label font-medium text-fg">
              {label}
            </label>
          )}
          {inputElement}
          {error && <p className="text-small text-danger-fg">{error}</p>}
        </div>
      );
    }

    return inputElement;
  }
);
Input.displayName = 'Input';
