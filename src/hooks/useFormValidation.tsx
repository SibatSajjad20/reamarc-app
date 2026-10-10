import React, { useState, useCallback, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { focusFirstError } from '../utils/formFocus';

export interface UseFormValidationOptions<T extends Record<string, any>> {
  validate: (values: T) => Partial<Record<keyof T | 'form', string | undefined>>;
}

export function useFormValidation<T extends Record<string, any>>({
  validate,
}: UseFormValidationOptions<T>) {
  const [errors, setErrors] = useState<Partial<Record<keyof T | 'form', string | undefined>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errorCount = useMemo(() => {
    return Object.entries(errors).filter(([k, v]) => k !== 'form' && Boolean(v)).length;
  }, [errors]);

  const validateAll = useCallback(
    (values: T, container?: HTMLElement | null): boolean => {
      setHasAttemptedSubmit(true);
      const validationErrors = validate(values);
      const cleaned: Partial<Record<keyof T | 'form', string | undefined>> = {};
      let hasError = false;
      for (const [k, v] of Object.entries(validationErrors)) {
        if (v) {
          cleaned[k as keyof T] = v;
          hasError = true;
        }
      }
      setErrors(cleaned);
      if (hasError) {
        setTimeout(() => focusFirstError(container), 10);
        return false;
      }
      return true;
    },
    [validate]
  );

  const validateField = useCallback(
    (field: keyof T, values: T) => {
      if (!hasAttemptedSubmit) return;
      const all = validate(values);
      const err = all[field];
      setErrors((prev) => {
        if (!err && !prev[field]) return prev;
        const next = { ...prev };
        if (err) {
          next[field] = err;
        } else {
          delete next[field];
        }
        return next;
      });
    },
    [hasAttemptedSubmit, validate]
  );

  const clearErrors = useCallback(() => {
    setErrors({});
    setHasAttemptedSubmit(false);
    setServerError(null);
  }, []);

  const setFieldError = useCallback((field: keyof T | 'form', message?: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }, []);

  const focusFirst = useCallback((container?: HTMLElement | null) => {
    focusFirstError(container);
  }, []);

  return {
    errors,
    setErrors,
    hasAttemptedSubmit,
    setHasAttemptedSubmit,
    serverError,
    setServerError,
    errorCount,
    validateAll,
    validateField,
    clearErrors,
    setFieldError,
    focusFirstError: focusFirst,
  };
}

export const FormErrorSummaryButton: React.FC<{
  errorCount?: number;
  count?: number;
  onClick?: () => void;
  className?: string;
}> = ({ errorCount, count, onClick, className = '' }) => {
  const actualCount = count ?? errorCount ?? 0;
  if (actualCount < 2) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={`text-small text-danger-fg hover:underline cursor-pointer flex items-center gap-1.5 font-medium transition-colors ${className}`}
    >
      <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
      <span>
        {actualCount} {actualCount === 1 ? 'field needs' : 'fields need'} attention
      </span>
    </button>
  );
};
