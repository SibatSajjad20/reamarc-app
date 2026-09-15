import type {
  CrmAssignee,
  CrmCounts,
  CrmDeal,
  CrmLead,
  CrmLeadDetail,
  CrmPipelineStage,
} from '../types/crm';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Stale window for CRM pipeline data (ms). Defaults to 2 minutes. */
export const CRM_CACHE_STALE_MS = 120_000;

/** Debounce before background revalidation — matches Overview / Daily Log settle. */
export const CRM_SETTLE_MS = 400;

class BoundedCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 40) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): CacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (entry) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  public set(key: string, data: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { data, fetchedAt: Date.now() });
  }

  public delete(key: string): boolean {
    return this.map.delete(key);
  }

  public values(): IterableIterator<CacheEntry<T>> {
    return this.map.values();
  }

  public clear(): void {
    this.map.clear();
  }
}

export type CrmPipelineCachePayload = {
  stages: CrmPipelineStage[];
  dealStages: CrmPipelineStage[];
};

export type CrmLeadsListCachePayload = {
  items: CrmLead[];
  total: number;
};

export type CrmDealsListCachePayload = {
  deals: CrmDeal[];
  total_count: number;
  total_value: number;
};

const pipelineCache = new BoundedCache<CrmPipelineCachePayload>(5);
const countsCache = new BoundedCache<CrmCounts>(5);
const assigneesCache = new BoundedCache<CrmAssignee[]>(5);
const leadsListCache = new BoundedCache<CrmLeadsListCachePayload>(20);
const dealsListCache = new BoundedCache<CrmDealsListCachePayload>(20);
const leadDetailCache = new BoundedCache<CrmLeadDetail>(50);

export function isCrmCacheStale<T>(entry: CacheEntry<T> | undefined, maxAgeMs: number = CRM_CACHE_STALE_MS): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > maxAgeMs;
}

// Pipeline stages
export function getCachedPipeline(): CacheEntry<CrmPipelineCachePayload> | undefined {
  return pipelineCache.get('pipeline');
}

export function setCachedPipeline(data: CrmPipelineCachePayload): void {
  pipelineCache.set('pipeline', data);
}

// Counts
export function getCachedCounts(): CacheEntry<CrmCounts> | undefined {
  return countsCache.get('counts');
}

export function setCachedCounts(data: CrmCounts): void {
  countsCache.set('counts', data);
}

// Assignees
export function getCachedAssignees(): CacheEntry<CrmAssignee[]> | undefined {
  return assigneesCache.get('assignees');
}

export function setCachedAssignees(data: CrmAssignee[]): void {
  assigneesCache.set('assignees', data);
}

// Leads List
export function getCachedLeadsList(key: string = 'default'): CacheEntry<CrmLeadsListCachePayload> | undefined {
  return leadsListCache.get(key);
}

export function setCachedLeadsList(key: string = 'default', data: CrmLeadsListCachePayload): void {
  leadsListCache.set(key, data);
}

// Deals List
export function getCachedDealsList(key: string = 'default'): CacheEntry<CrmDealsListCachePayload> | undefined {
  return dealsListCache.get(key);
}

export function setCachedDealsList(key: string = 'default', data: CrmDealsListCachePayload): void {
  dealsListCache.set(key, data);
}

// Lead Detail
export function getCachedLeadDetail(id: string): CacheEntry<CrmLeadDetail> | undefined {
  return leadDetailCache.get(id);
}

export function setCachedLeadDetail(id: string, data: CrmLeadDetail): void {
  leadDetailCache.set(id, data);
}

/** Atomic optimistic update: Update a lead's stage across detail cache and list caches */
export function updateCachedLeadStage(leadId: string, newStage: string): void {
  // Update detail cache
  const detailEntry = leadDetailCache.get(leadId);
  if (detailEntry) {
    leadDetailCache.set(leadId, {
      ...detailEntry.data,
      stage: newStage,
      outcome: null,
      updated_at: new Date().toISOString(),
    });
  }

  // Update in all cached lists
  for (const entry of leadsListCache.values()) {
    const idx = entry.data.items.findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      entry.data.items[idx] = {
        ...entry.data.items[idx],
        stage: newStage,
        outcome: null,
        updated_at: new Date().toISOString(),
      };
    }
  }
}

/** Atomic optimistic update: Update a lead's outcome (e.g. won, lost) across caches */
export function updateCachedLeadOutcome(
  leadId: string,
  outcome: 'won' | 'lost',
  lostReason?: string,
): void {
  const detailEntry = leadDetailCache.get(leadId);
  if (detailEntry) {
    leadDetailCache.set(leadId, {
      ...detailEntry.data,
      outcome,
      lost_reason: lostReason || null,
      updated_at: new Date().toISOString(),
    });
  }

  for (const entry of leadsListCache.values()) {
    const idx = entry.data.items.findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      entry.data.items[idx] = {
        ...entry.data.items[idx],
        outcome,
        lost_reason: lostReason || null,
        updated_at: new Date().toISOString(),
      };
    }
  }
}

/** Atomic optimistic update: Mark lead contacted across caches */
export function updateCachedLeadContacted(leadId: string): void {
  const detailEntry = leadDetailCache.get(leadId);
  if (detailEntry) {
    leadDetailCache.set(leadId, {
      ...detailEntry.data,
      contacted: true,
      contacted_at: new Date().toISOString(),
    });
  }

  for (const entry of leadsListCache.values()) {
    const idx = entry.data.items.findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      entry.data.items[idx] = {
        ...entry.data.items[idx],
        contacted: true,
        contacted_at: new Date().toISOString(),
      };
    }
  }
}

/** Atomic optimistic update: Claim lead across caches */
export function updateCachedLeadClaimed(leadId: string, userId: string, userName: string): void {
  const now = new Date().toISOString();
  const detailEntry = leadDetailCache.get(leadId);
  if (detailEntry) {
    leadDetailCache.set(leadId, {
      ...detailEntry.data,
      assigned_to: userId,
      assigned_to_name: userName,
      assigned_at: now,
    });
  }

  for (const entry of leadsListCache.values()) {
    const idx = entry.data.items.findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      entry.data.items[idx] = {
        ...entry.data.items[idx],
        assigned_to: userId,
        assigned_to_name: userName,
        assigned_at: now,
      };
    }
  }
}

/** Clear all CRM caches (e.g. on logout or manual pull-to-refresh) */
export function clearCrmCaches(): void {
  pipelineCache.clear();
  countsCache.clear();
  assigneesCache.clear();
  leadsListCache.clear();
  dealsListCache.clear();
  leadDetailCache.clear();
}
