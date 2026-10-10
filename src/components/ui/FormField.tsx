import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FormFieldProps {
  label?: React.ReactNode;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  id?: string;
  required?: boolean;
  className?: string;
  children:
    | React.ReactNode
    | ((props: {
        id: string;
        errorId?: string;
        hintId?: string;
        isInvalid: boolean;
        'aria-invalid'?: boolean;
        'aria-describedby'?: string;
      }) => React.ReactNode);
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  hint,
  id,
  required = false,
  className = '',
  children,
}) => {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const isInvalid = Boolean(error);

  return (
    <div className={cn('w-full space-y-1 text-left', className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-label font-medium text-fg mb-1"
        >
          {label}
          {required && <span className="text-danger-fg ml-0.5">*</span>}
        </label>
      )}

      {typeof children === 'function'
        ? children({
            id: fieldId,
            errorId,
            hintId,
            isInvalid,
            'aria-invalid': isInvalid,
            'aria-describedby': describedBy,
          })
        : children}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-small text-danger-fg flex items-center gap-1.5 mt-1"
        >
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {hint && !error && (
        <p id={hintId} className="text-caption text-fg-muted mt-1">
          {hint}
        </p>
      )}
    </div>
  );
};
