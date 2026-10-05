/**
 * Service for Content Calendar API communications.
 * Communicates with /api/v1/content-calendar endpoints via apiClient.
 */
import { apiClient } from './apiClient';
import type {
  ContentCalendarItem,
  ContentCalendarListResponse,
  ContentCalendarConstants,
  ContentCalendarFilter,
  BatchUpdateItem,
  BatchUpdateResponse,
  BulkImportRequest,
  BulkImportResponse,
} from '../types/contentCalendar';

export const contentCalendarService = {
  async getItems(filter?: ContentCalendarFilter): Promise<ContentCalendarListResponse> {
    const pageSize = 1000;
    const maxRows = 20000;
    const items: ContentCalendarListResponse['items'] = [];
    let skip = 0;
    let total = 0;
    let stagesCount = {} as ContentCalendarListResponse['stages_count'];

    while (skip < maxRows) {
      const params = new URLSearchParams();
      if (filter?.search?.trim()) params.set('search', filter.search.trim());
      if (filter?.client_name && filter.client_name !== 'all') params.set('client_name', filter.client_name);
      if (filter?.stage && filter.stage !== 'all') params.set('stage', filter.stage);
      if (filter?.creative_type && filter.creative_type !== 'all') params.set('creative_type', filter.creative_type);
      if (filter?.approval_status && filter.approval_status !== 'all') params.set('approval_status', filter.approval_status);
      if (filter?.start_date) params.set('start_date', filter.start_date);
      if (filter?.end_date) params.set('end_date', filter.end_date);
      params.set('limit', String(pageSize));
      params.set('skip', String(skip));

      const page = await apiClient.get<ContentCalendarListResponse>(`/content-calendar?${params.toString()}`);
      if (skip === 0) {
        total = page.total;
        stagesCount = page.stages_count;
      }
      items.push(...page.items);
      if (page.items.length === 0 || items.length >= total) break;
      skip += page.items.length;
    }

    return { items, total, stages_count: stagesCount };
  },

  async getItem(id: string): Promise<ContentCalendarItem> {
    return apiClient.get<ContentCalendarItem>(`/content-calendar/${id}`);
  },

  async createItem(payload: Partial<ContentCalendarItem>): Promise<ContentCalendarItem> {
    return apiClient.post<ContentCalendarItem>('/content-calendar', payload);
  },

  async updateItem(id: string, payload: Partial<ContentCalendarItem>): Promise<ContentCalendarItem> {
    return apiClient.patch<ContentCalendarItem>(`/content-calendar/${id}`, payload);
  },

  async batchUpdate(updates: BatchUpdateItem[]): Promise<BatchUpdateResponse> {
    return apiClient.patch<BatchUpdateResponse>('/content-calendar/batch', { updates });
  },

  async bulkImport(payload: BulkImportRequest): Promise<BulkImportResponse> {
    return apiClient.post<BulkImportResponse>('/content-calendar/bulk-import', payload);
  },

  async transition(
    id: string,
    payload: { action: string; note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ): Promise<ContentCalendarItem> {
    return apiClient.patch<ContentCalendarItem>(`/content-calendar/${id}/stage`, payload);
  },

  async getCreativeAssignees(): Promise<{ assignees: Array<{ id: string; name: string }> }> {
    return apiClient.get<{ assignees: Array<{ id: string; name: string }> }>('/content-calendar/creative-assignees');
  },

  async deleteItem(id: string): Promise<{ message: string; id: string }> {
    return apiClient.delete<{ message: string; id: string }>(`/content-calendar/${id}`);
  },

  async getConstants(): Promise<ContentCalendarConstants> {
    return apiClient.get<ContentCalendarConstants>('/content-calendar/constants');
  },

  async updateConstants(payload: Partial<ContentCalendarConstants>): Promise<ContentCalendarConstants> {
    return apiClient.patch<ContentCalendarConstants>('/content-calendar/constants', payload);
  },

  async getNextSerial(clientName?: string): Promise<{ serial: string }> {
    const query = clientName ? `?client_name=${encodeURIComponent(clientName)}` : '';
    return apiClient.get<{ serial: string }>(`/content-calendar/next-serial${query}`);
  },


  async seedFromExcel(force: boolean = false): Promise<{ message: string; count: number }> {
    return apiClient.post<{ message: string; count: number }>(`/content-calendar/seed-excel?force=${force}`, {});
  },

  async uploadAssets(itemId: string, files: File[], role: string = 'primary'): Promise<ContentCalendarItem> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('role', role);
    return apiClient.upload<ContentCalendarItem>(`/content-calendar/${itemId}/assets`, formData);
  },

  async deleteAsset(itemId: string, assetId: string): Promise<ContentCalendarItem> {
    return apiClient.delete<ContentCalendarItem>(`/content-calendar/${itemId}/assets/${assetId}`);
  },

  async reorderAssets(itemId: string, assetIds: string[]): Promise<ContentCalendarItem> {
    return apiClient.patch<ContentCalendarItem>(`/content-calendar/${itemId}/assets/reorder`, { asset_ids: assetIds });
  },

  async addLinkAsset(
    itemId: string,
    payload: { url: string; title: string; role?: string },
  ): Promise<ContentCalendarItem> {
    return apiClient.post<ContentCalendarItem>(`/content-calendar/${itemId}/links`, payload);
  },
};

