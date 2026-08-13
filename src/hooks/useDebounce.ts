import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce a value by a specified delay in milliseconds (default 400ms).
 * Prevents rapid API calls during rapid user inputs (e.g., date changes).
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
