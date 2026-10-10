/**
 * Service for Content Calendar API communications.
 * Communicates with /api/v1/content-calendar endpoints via apiClient.
 */
import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';

const ccItemsCache = new BoundedCache<ContentCalendarListResponse>(10);
const ccConstantsCache = new BoundedCache<ContentCalendarConstants>(2);
import type {
  ContentCalendarItem,
  ContentCalendarListResponse,
  ContentCalendarConstants,
  ContentCalendarFilter,
  BatchUpdateItem,
  BatchUpdateResponse,
  BulkImportRequest,
  BulkImportResponse,
  DrivePickedFile,
  DrivePickerConfig,
} from '../types/contentCalendar';

export const contentCalendarService = {
  async getItems(filter?: ContentCalendarFilter): Promise<ContentCalendarListResponse> {
    const filterKey = JSON.stringify(filter || {});
    const cached = ccItemsCache.get(filterKey);
    if (cached && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }

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

    const result = { items, total, stages_count: stagesCount };
    ccItemsCache.set(filterKey, result);
    return result;
  },

  async getItem(id: string): Promise<ContentCalendarItem> {
    return apiClient.get<ContentCalendarItem>(`/content-calendar/${id}`);
  },

  async createItem(payload: Partial<ContentCalendarItem>): Promise<ContentCalendarItem> {
    const res = await apiClient.post<ContentCalendarItem>('/content-calendar', payload);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reamarc-notification-refresh'));
    }
    return res;
  },

  async updateItem(id: string, payload: Partial<ContentCalendarItem>): Promise<ContentCalendarItem> {
    const res = await apiClient.patch<ContentCalendarItem>(`/content-calendar/${id}`, payload);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reamarc-notification-refresh'));
    }
    return res;
  },

  async batchUpdate(updates: BatchUpdateItem[]): Promise<BatchUpdateResponse> {
    const res = await apiClient.patch<BatchUpdateResponse>('/content-calendar/batch', { updates });
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reamarc-notification-refresh'));
    }
    return res;
  },

  async bulkImport(payload: BulkImportRequest): Promise<BulkImportResponse> {
    const res = await apiClient.post<BulkImportResponse>('/content-calendar/bulk-import', payload);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reamarc-notification-refresh'));
    }
    return res;
  },

  async transition(
    id: string,
    payload: { action: string; note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ): Promise<ContentCalendarItem> {
    const res = await apiClient.patch<ContentCalendarItem>(`/content-calendar/${id}/stage`, payload);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reamarc-notification-refresh'));
    }
    return res;
  },

  async getCreativeAssignees(): Promise<{ assignees: Array<{ id: string; name: string }> }> {
    return apiClient.get<{ assignees: Array<{ id: string; name: string }> }>('/content-calendar/creative-assignees');
  },

  async getContentAssignees(): Promise<{ assignees: Array<{ id: string; name: string }> }> {
    return apiClient.get<{ assignees: Array<{ id: string; name: string }> }>('/content-calendar/content-assignees');
  },

  async deleteItem(id: string): Promise<{ message: string; id: string }> {
    const res = await apiClient.delete<{ message: string; id: string }>(`/content-calendar/${id}`);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    return res;
  },

  async getConstants(): Promise<ContentCalendarConstants> {
    return apiClient.get<ContentCalendarConstants>('/content-calendar/constants');
  },

  async updateConstants(payload: Partial<ContentCalendarConstants>): Promise<ContentCalendarConstants> {
    const res = await apiClient.patch<ContentCalendarConstants>('/content-calendar/constants', payload);
    ccConstantsCache.clear();
    emitInvalidation(['content-calendar', 'settings']);
    return res;
  },

  async getNextSerial(clientName?: string): Promise<{ serial: string }> {
    const query = clientName ? `?client_name=${encodeURIComponent(clientName)}` : '';
    return apiClient.get<{ serial: string }>(`/content-calendar/next-serial${query}`);
  },


  async seedFromExcel(force: boolean = false): Promise<{ message: string; count: number }> {
    const res = await apiClient.post<{ message: string; count: number }>(`/content-calendar/seed-excel?force=${force}`, {});
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard', 'notifications']);
    return res;
  },

  async uploadAssets(itemId: string, files: File[], role: string = 'primary'): Promise<ContentCalendarItem> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('role', role);
    const res = await apiClient.upload<ContentCalendarItem>(`/content-calendar/${itemId}/assets`, formData);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard']);
    return res;
  },

  async deleteAsset(itemId: string, assetId: string): Promise<ContentCalendarItem> {
    const res = await apiClient.delete<ContentCalendarItem>(`/content-calendar/${itemId}/assets/${assetId}`);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard']);
    return res;
  },

  async reorderAssets(itemId: string, assetIds: string[]): Promise<ContentCalendarItem> {
    const res = await apiClient.patch<ContentCalendarItem>(`/content-calendar/${itemId}/assets/reorder`, { asset_ids: assetIds });
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard']);
    return res;
  },

  async addLinkAsset(
    itemId: string,
    payload: { url: string; title: string; role?: string },
  ): Promise<ContentCalendarItem> {
    const res = await apiClient.post<ContentCalendarItem>(`/content-calendar/${itemId}/links`, payload);
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard']);
    return res;
  },

  async getDrivePickerConfig(itemId: string): Promise<DrivePickerConfig> {
    return apiClient.get<DrivePickerConfig>(`/content-calendar/${itemId}/picker-config`);
  },

  async attachDriveAssets(
    itemId: string,
    files: DrivePickedFile[],
    role: string = 'primary',
  ): Promise<ContentCalendarItem> {
    const res = await apiClient.post<ContentCalendarItem>(`/content-calendar/${itemId}/assets/from-drive`, {
      files,
      role,
    });
    ccItemsCache.clear();
    emitInvalidation(['content-calendar', 'dashboard']);
    return res;
  },

  getCachedItems(filterKey: string): CacheEntry<ContentCalendarListResponse> | undefined {
    return ccItemsCache.get(filterKey);
  },
  setCachedItems(filterKey: string, data: ContentCalendarListResponse): void {
    ccItemsCache.set(filterKey, data);
  },
  getCachedConstants(): CacheEntry<ContentCalendarConstants> | undefined {
    return ccConstantsCache.get('constants');
  },
  setCachedConstants(data: ContentCalendarConstants): void {
    ccConstantsCache.set('constants', data);
  },
  hasInitialCache(): boolean {
    return ccItemsCache.size() > 0;
  },
  clearAllCaches(): void {
    ccItemsCache.clear();
    ccConstantsCache.clear();
  },
};

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => contentCalendarService.clearAllCaches());

