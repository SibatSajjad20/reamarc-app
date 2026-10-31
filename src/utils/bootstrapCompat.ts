import { ApiError } from '../services/apiClient';

const MISSING = new Set([404, 405, 501]);

/** True when a newer bootstrap route is absent on this backend. */
export function isBootstrapMissing(error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : (error as { status?: number } | undefined)?.status;
  return typeof status === 'number' && MISSING.has(status);
}
