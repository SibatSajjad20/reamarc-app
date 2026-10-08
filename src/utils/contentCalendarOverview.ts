import type { ContentCalendarItem, PipelineStage } from '../types/contentCalendar';
import { getContentCalendarBucket } from './contentCalendarWorkflow';

export interface OverviewMetrics {
  totalItems: number;
  postedCount: number;
  completionRate: number;
  readyToPostCount: number;
  clientReviewCount: number;
  revisionCount: number;
  overdueCount: number;
  unassignedCount: number;
  missingAssetsCount: number;
}

export interface ClientHealthItem {
  clientName: string;
  workspaceId?: string;
  total: number;
  contentPhase: number;
  creativePhase: number;
  clientReview: number;
  readyToPost: number;
  posted: number;
  completionRate: number;
  overdueCount: number;
  revisionCount: number;
  nextScheduledDate: string | null;
}

export interface FunnelPhaseItem {
  key: string;
  name: string;
  count: number;
  percentage: number;
  substages: Array<{ stage: PipelineStage; count: number }>;
}

export interface TeamMemberWorkload {
  id: string;
  name: string;
  role: string;
  totalActive: number;
  revisions: number;
  overdue: number;
  completed: number;
}

export interface UrgentWatchlistItem {
  item: ContentCalendarItem;
  reason: 'overdue' | 'revision' | 'client_review' | 'unassigned';
  reasonLabel: string;
  severity: 'danger' | 'warning';
}

export interface DistributionItem {
  label: string;
  count: number;
  percentage: number;
}

export type OverviewTimeRange = 'all' | 'this_month' | 'last_30' | 'next_30';

function parseLocalMidnight(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length < 3) {
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  return new Date(year, month, day);
}

/**
 * Filter items by date range (using publish_date or design_due or created_at).
 */
export function filterItemsByTimeRange(
  items: ContentCalendarItem[],
  range: OverviewTimeRange,
  refDate: Date = new Date()
): ContentCalendarItem[] {
  if (range === 'all') return items;

  const now = new Date(refDate);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return items.filter((item) => {
    const rawDate = item.publish_date || item.design_due || item.created_at;
    if (!rawDate) return false;

    const d = parseLocalMidnight(rawDate);
    if (!d) return false;

    if (range === 'this_month') {
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }

    const itemTime = d.getTime();
    if (range === 'last_30') {
      const past30 = todayMidnight - 30 * 24 * 60 * 60 * 1000;
      return itemTime >= past30 && itemTime <= todayMidnight;
    }

    if (range === 'next_30') {
      const future30 = todayMidnight + 30 * 24 * 60 * 60 * 1000;
      return itemTime >= todayMidnight && itemTime <= future30;
    }

    return true;
  });
}

/**
 * Calculates top-level KPI metrics across given items.
 */
export function calculateOverviewMetrics(items: ContentCalendarItem[], now: Date = new Date()): OverviewMetrics {
  const totalItems = items.length;
  let postedCount = 0;
  let readyToPostCount = 0;
  let clientReviewCount = 0;
  let revisionCount = 0;
  let overdueCount = 0;
  let unassignedCount = 0;
  let missingAssetsCount = 0;

  for (const it of items) {
    if (it.stage === 'Posted') {
      postedCount++;
    } else if (it.stage === 'Ready to Post') {
      readyToPostCount++;
    } else if (it.stage === 'Content Client Review' || it.stage === 'Creative Client Review') {
      clientReviewCount++;
    } else if (it.stage === 'Content Revision' || it.stage === 'Creative Revision') {
      revisionCount++;
    }

    if (getContentCalendarBucket(it, now) === 'overdue') {
      overdueCount++;
    }

    const hasAssignee = Boolean(it.assignee_id || it.assignee_name?.trim());
    if (!hasAssignee && it.stage !== 'Posted' && it.stage !== 'Rejected') {
      unassignedCount++;
    }

    const isCreativeOrBeyond =
      it.stage === 'Creative Production' ||
      it.stage === 'Creative Internal Review' ||
      it.stage === 'Creative Client Review' ||
      it.stage === 'Ready to Post';
    const hasAsset = (it.attachments && it.attachments.length > 0) || Boolean(it.draft_preview_link?.trim()) || Boolean(it.final_asset_link?.trim());
    if (isCreativeOrBeyond && !hasAsset) {
      missingAssetsCount++;
    }
  }

  const completionRate = totalItems > 0 ? Math.round((postedCount / totalItems) * 100) : 0;

  return {
    totalItems,
    postedCount,
    completionRate,
    readyToPostCount,
    clientReviewCount,
    revisionCount,
    overdueCount,
    unassignedCount,
    missingAssetsCount,
  };
}

/**
 * Calculates client-by-client health metrics matrix.
 */
export function calculateClientHealthMatrix(
  items: ContentCalendarItem[],
  activeClients: Array<{ id: string; name: string }> = [],
  now: Date = new Date()
): ClientHealthItem[] {
  const clientMap = new Map<string, {
    clientName: string;
    workspaceId?: string;
    items: ContentCalendarItem[];
  }>();

  // Initialize with known active workspaces
  for (const c of activeClients) {
    const name = (c.name || '').trim();
    if (name) {
      clientMap.set(name.toLowerCase(), {
        clientName: name,
        workspaceId: c.id,
        items: [],
      });
    }
  }

  // Populate with item data
  for (const it of items) {
    const rawName = (it.client_name || '').trim();
    const name = rawName || 'Unassigned Client';
    const key = name.toLowerCase();

    if (!clientMap.has(key)) {
      clientMap.set(key, {
        clientName: name,
        workspaceId: it.workspace_id || undefined,
        items: [],
      });
    }
    clientMap.get(key)!.items.push(it);
  }

  const result: ClientHealthItem[] = [];

  for (const entry of clientMap.values()) {
    const list = entry.items;
    const total = list.length;
    let contentPhase = 0;
    let creativePhase = 0;
    let clientReview = 0;
    let readyToPost = 0;
    let posted = 0;
    let overdueCount = 0;
    let revisionCount = 0;
    let nextScheduledDate: string | null = null;
    let minUpcomingTimestamp = Infinity;

    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const it of list) {
      if (it.stage === 'Content' || it.stage === 'Content Internal Review') {
        contentPhase++;
      } else if (it.stage === 'Creative Production' || it.stage === 'Creative Internal Review') {
        creativePhase++;
      } else if (it.stage === 'Content Client Review' || it.stage === 'Creative Client Review') {
        clientReview++;
      } else if (it.stage === 'Content Revision' || it.stage === 'Creative Revision') {
        revisionCount++;
      } else if (it.stage === 'Ready to Post') {
        readyToPost++;
      } else if (it.stage === 'Posted') {
        posted++;
      }

      if (getContentCalendarBucket(it, now) === 'overdue') {
        overdueCount++;
      }

      if (it.publish_date && it.stage !== 'Posted' && it.stage !== 'Rejected') {
        const d = parseLocalMidnight(it.publish_date);
        if (d) {
          const pubTime = d.getTime();
          if (pubTime >= todayMid && pubTime < minUpcomingTimestamp) {
            minUpcomingTimestamp = pubTime;
            nextScheduledDate = it.publish_date.split('T')[0];
          }
        }
      }
    }

    const completionRate = total > 0 ? Math.round((posted / total) * 100) : 0;

    result.push({
      clientName: entry.clientName,
      workspaceId: entry.workspaceId,
      total,
      contentPhase,
      creativePhase,
      clientReview,
      readyToPost,
      posted,
      completionRate,
      overdueCount,
      revisionCount,
      nextScheduledDate,
    });
  }

  // Sort: clients with overdue items first, then by total items descending
  return result.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) {
      return b.overdueCount - a.overdueCount;
    }
    return b.total - a.total;
  });
}

/**
 * Calculates phase & bottleneck distribution across the pipeline stages.
 */
export function calculateDepartmentFunnel(items: ContentCalendarItem[]): FunnelPhaseItem[] {
  const total = items.length;

  const contentStages: PipelineStage[] = ['Content', 'Content Internal Review'];
  const creativeStages: PipelineStage[] = ['Creative Production', 'Creative Internal Review'];
  const reviewStages: PipelineStage[] = ['Content Client Review', 'Creative Client Review'];
  const revisionStages: PipelineStage[] = ['Content Revision', 'Creative Revision'];
  const deliveryStages: PipelineStage[] = ['Ready to Post', 'Posted'];

  const stageCounts = new Map<PipelineStage, number>();
  for (const it of items) {
    stageCounts.set(it.stage, (stageCounts.get(it.stage) || 0) + 1);
  }

  const countFor = (stages: PipelineStage[]) =>
    stages.reduce((sum, s) => sum + (stageCounts.get(s) || 0), 0);

  const phases = [
    {
      key: 'content',
      name: 'Content Phase',
      stages: contentStages,
    },
    {
      key: 'creative',
      name: 'Creative Phase',
      stages: creativeStages,
    },
    {
      key: 'client_review',
      name: 'Client Review Gate',
      stages: reviewStages,
    },
    {
      key: 'revision',
      name: 'Revisions Requested',
      stages: revisionStages,
    },
    {
      key: 'ready_posted',
      name: 'Ready / Posted',
      stages: deliveryStages,
    },
  ];

  return phases.map((p) => {
    const count = countFor(p.stages);
    return {
      key: p.key,
      name: p.name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      substages: p.stages.map((st) => ({
        stage: st,
        count: stageCounts.get(st) || 0,
      })),
    };
  });
}

/**
 * Calculates urgent attention items (overdue, in revision, client review, unassigned).
 */
export function calculateUrgentWatchlist(
  items: ContentCalendarItem[],
  now: Date = new Date(),
  limit: number = 20
): UrgentWatchlistItem[] {
  const list: UrgentWatchlistItem[] = [];

  for (const it of items) {
    if (it.stage === 'Posted' || it.stage === 'Rejected') continue;

    const bucket = getContentCalendarBucket(it, now);
    if (bucket === 'overdue') {
      list.push({
        item: it,
        reason: 'overdue',
        reasonLabel: 'Overdue Deadline',
        severity: 'danger',
      });
      continue;
    }

    if (it.stage === 'Content Revision' || it.stage === 'Creative Revision') {
      list.push({
        item: it,
        reason: 'revision',
        reasonLabel: 'Changes Requested',
        severity: 'danger',
      });
      continue;
    }

    if (it.stage === 'Content Client Review' || it.stage === 'Creative Client Review') {
      list.push({
        item: it,
        reason: 'client_review',
        reasonLabel: 'Waiting on Client',
        severity: 'warning',
      });
      continue;
    }

    const hasAssignee = Boolean(it.assignee_id || it.assignee_name?.trim());
    if (!hasAssignee) {
      list.push({
        item: it,
        reason: 'unassigned',
        reasonLabel: 'Unassigned',
        severity: 'warning',
      });
    }
  }

  // Sort danger items first, then by updated_at descending
  return list
    .sort((a, b) => {
      if (a.severity === 'danger' && b.severity !== 'danger') return -1;
      if (b.severity === 'danger' && a.severity !== 'danger') return 1;
      return new Date(b.item.updated_at).getTime() - new Date(a.item.updated_at).getTime();
    })
    .slice(0, limit);
}

/**
 * Calculates team member workload and allocation.
 */
export function calculateTeamWorkload(items: ContentCalendarItem[], now: Date = new Date()): TeamMemberWorkload[] {
  const memberMap = new Map<string, {
    id: string;
    name: string;
    role: string;
    active: number;
    revisions: number;
    overdue: number;
    completed: number;
  }>();

  for (const it of items) {
    const name = it.assignee_name?.trim();
    if (!name) continue;
    const id = it.assignee_id || `name:${name}`;

    if (!memberMap.has(id)) {
      memberMap.set(id, {
        id,
        name,
        role: 'Assignee',
        active: 0,
        revisions: 0,
        overdue: 0,
        completed: 0,
      });
    }

    const rec = memberMap.get(id)!;
    if (it.stage === 'Posted') {
      rec.completed++;
    } else if (it.stage !== 'Rejected') {
      rec.active++;
      if (it.stage === 'Content Revision' || it.stage === 'Creative Revision') {
        rec.revisions++;
      }
      if (getContentCalendarBucket(it, now) === 'overdue') {
        rec.overdue++;
      }
    }
  }

  return Array.from(memberMap.values())
    .map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      totalActive: m.active,
      revisions: m.revisions,
      overdue: m.overdue,
      completed: m.completed,
    }))
    .sort((a, b) => b.totalActive - a.totalActive);
}

/**
 * Calculates distribution by Creative Type and Channel.
 */
export function calculateContentMix(items: ContentCalendarItem[]): {
  creativeTypes: DistributionItem[];
  channels: DistributionItem[];
  pillars: DistributionItem[];
} {
  const total = items.length;
  const typeCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  const pillarCounts = new Map<string, number>();

  for (const it of items) {
    const cType = (it.creative_type || 'Unspecified').trim();
    typeCounts.set(cType, (typeCounts.get(cType) || 0) + 1);

    const pillar = (it.content_pillar || 'General').trim();
    pillarCounts.set(pillar, (pillarCounts.get(pillar) || 0) + 1);

    if (it.channels && it.channels.length > 0) {
      for (const ch of it.channels) {
        const clean = ch.trim();
        if (clean) channelCounts.set(clean, (channelCounts.get(clean) || 0) + 1);
      }
    } else {
      channelCounts.set('Not Specified', (channelCounts.get('Not Specified') || 0) + 1);
    }
  }

  const toSortedList = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([label, count]) => ({
        label,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

  return {
    creativeTypes: toSortedList(typeCounts),
    channels: toSortedList(channelCounts),
    pillars: toSortedList(pillarCounts),
  };
}
