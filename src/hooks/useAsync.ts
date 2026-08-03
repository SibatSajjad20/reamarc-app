import { useState, useCallback } from 'react';
import { ApiError } from '../services/apiClient';

interface UseAsyncState<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | Error | null;
}

export function useAsync<T>(
  asyncFunction: (...args: any[]) => Promise<T>,
  immediate = false
) {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    isLoading: immediate,
    isError: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: any[]): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, isError: false, error: null }));
      try {
        const response = await asyncFunction(...args);
        setState({ data: response, isLoading: false, isError: false, error: null });
        return response;
      } catch (err: any) {
        setState({ data: null, isLoading: false, isError: true, error: err });
        return null;
      }
    },
    [asyncFunction]
  );

  const setData = useCallback((newData: T | ((prev: T | null) => T | null)) => {
    setState((prev) => ({
      ...prev,
      data: typeof newData === 'function' ? (newData as Function)(prev.data) : newData,
    }));
  }, []);

  return {
    ...state,
    execute,
    setData,
  };
}
