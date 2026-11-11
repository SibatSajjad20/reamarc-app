import { apiClient } from './apiClient';
import type {
  EmployeeDetailResponse,
  ExceptionsResponse,
  LogVarianceResponse,
} from '../types/logVariance';

export interface LogVarianceParams {
  startDate: string;
  endDate?: string;
  department?: string;
  userId?: string;
}

export interface ExceptionsParams {
  startDate: string;
  endDate?: string;
  department?: string;
  type?: string;
  group?: 'employee' | 'day';
  includeReviewed?: boolean;
}

export const logVarianceService = {
  async getOverview(params: LogVarianceParams): Promise<LogVarianceResponse> {
    const q = new URLSearchParams();
    q.set('start_date', params.startDate);
    if (params.endDate) q.set('end_date', params.endDate);
    if (params.department && params.department !== 'all') {
      q.set('department', params.department);
    }
    if (params.userId) q.set('user_id', params.userId);

    return apiClient.get<LogVarianceResponse>(`/log-variance?${q.toString()}`);
  },

  async getEmployeeDetail(
    userId: string,
    startDate: string,
    endDate?: string
  ): Promise<EmployeeDetailResponse> {
    const q = new URLSearchParams();
    q.set('start_date', startDate);
    if (endDate) q.set('end_date', endDate);

    return apiClient.get<EmployeeDetailResponse>(
      `/log-variance/employee/${encodeURIComponent(userId)}?${q.toString()}`
    );
  },

  async getExceptions(params: ExceptionsParams): Promise<ExceptionsResponse> {
    const q = new URLSearchParams();
    q.set('start_date', params.startDate);
    if (params.endDate) q.set('end_date', params.endDate);
    if (params.department && params.department !== 'all') {
      q.set('department', params.department);
    }
    if (params.type && params.type !== 'all') {
      q.set('type', params.type);
    }
    if (params.group) {
      q.set('group', params.group);
    }
    if (params.includeReviewed) {
      q.set('include_reviewed', 'true');
    }

    return apiClient.get<ExceptionsResponse>(`/log-variance/exceptions?${q.toString()}`);
  },

  async exportExcel(startDate: string, endDate?: string, department?: string): Promise<Blob> {
    const q = new URLSearchParams();
    q.set('start_date', startDate);
    if (endDate) q.set('end_date', endDate);
    if (department && department !== 'all') {
      q.set('department', department);
    }

    return apiClient.getBlob(`/log-variance/export?${q.toString()}`);
  },
};
