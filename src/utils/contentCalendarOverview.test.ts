import {
  calculateOverviewMetrics,
  calculateClientHealthMatrix,
  calculateDepartmentFunnel,
  calculateUrgentWatchlist,
  calculateTeamWorkload,
  calculateContentMix,
  filterItemsByTimeRange,
} from './contentCalendarOverview';
import type { ContentCalendarItem } from '../types/contentCalendar';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const mockNow = new Date('2026-10-06T12:00:00Z');

const sampleItems: ContentCalendarItem[] = [
  {
    id: '1',
    serial: 'CC-001',
    client_name: 'Apex Brands',
    campaign_type: 'Product Launch',
    creative_type: 'Carousel',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Educational',
    content_concept: '5 Tips for Growth',
    offer: 'Free Audit',
    cta: 'Learn More',
    approval_status: 'Approved for Campaign',
    setup_status: 'Ready',
    stage: 'Ready to Post',
    publish_date: '2026-10-10',
    channels: ['Instagram', 'LinkedIn'],
    assignee_id: 'user_1',
    assignee_name: 'Sarah Connor',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
  },
  {
    id: '2',
    serial: 'CC-002',
    client_name: 'Apex Brands',
    campaign_type: 'Brand Awareness',
    creative_type: 'Reel',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Entertainment',
    content_concept: 'Behind the Scenes',
    offer: 'None',
    cta: 'Follow Us',
    approval_status: 'Posted',
    setup_status: 'Completed',
    stage: 'Posted',
    publish_date: '2026-10-02',
    channels: ['Instagram', 'TikTok'],
    assignee_id: 'user_1',
    assignee_name: 'Sarah Connor',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T12:00:00Z',
  },
  {
    id: '3',
    serial: 'CC-003',
    client_name: 'Apex Brands',
    campaign_type: 'Lead Gen',
    creative_type: 'Static Image',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Promotional',
    content_concept: 'October Special',
    offer: '20% Off',
    cta: 'Shop Now',
    approval_status: 'Changes Requested',
    setup_status: 'Draft',
    stage: 'Content Revision',
    publish_date: '2026-10-01', // Overdue!
    channels: ['Facebook'],
    assignee_id: 'user_2',
    assignee_name: 'John Doe',
    created_at: '2026-09-25T10:00:00Z',
    updated_at: '2026-10-05T10:00:00Z',
  },
  {
    id: '4',
    serial: 'CC-004',
    client_name: 'Zenith Health',
    campaign_type: 'Lead Gen',
    creative_type: 'Video',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Educational',
    content_concept: 'Doctor Advice',
    offer: 'Consultation',
    cta: 'Book Now',
    approval_status: 'Content Client Review',
    setup_status: 'Draft',
    stage: 'Content Client Review',
    publish_date: '2026-10-15',
    channels: ['Instagram'],
    created_at: '2026-10-03T10:00:00Z',
    updated_at: '2026-10-03T10:00:00Z',
  },
];

// 1. Overview Metrics
const metrics = calculateOverviewMetrics(sampleItems, mockNow);
assert(metrics.totalItems === 4, 'Total items should be 4');
assert(metrics.postedCount === 1, 'Posted count should be 1');
assert(metrics.readyToPostCount === 1, 'Ready to post should be 1');
assert(metrics.clientReviewCount === 1, 'Client review should be 1');
assert(metrics.revisionCount === 1, 'Revision count should be 1');
assert(metrics.completionRate === 25, 'Completion rate should be 25%');
assert(metrics.overdueCount === 1, 'Overdue count should be 1');
assert(metrics.unassignedCount === 1, 'Unassigned count should be 1 (item 4)');

// 2. Client Health Matrix
const activeClients = [
  { id: 'ws_apex', name: 'Apex Brands' },
  { id: 'ws_zenith', name: 'Zenith Health' },
  { id: 'ws_empty', name: 'Empty Client' },
];
const matrix = calculateClientHealthMatrix(sampleItems, activeClients, mockNow);
assert(matrix.length === 3, 'Matrix should contain all 3 clients');

const apex = matrix.find((c) => c.clientName === 'Apex Brands');
assert(apex !== undefined, 'Apex Brands should exist');
assert(apex?.total === 3, 'Apex should have 3 items');
assert(apex?.posted === 1, 'Apex posted count should be 1');
assert(apex?.readyToPost === 1, 'Apex readyToPost should be 1');
assert(apex?.revisionCount === 1, 'Apex revisions should be 1');
assert(apex?.overdueCount === 1, 'Apex overdue should be 1');
assert(apex?.nextScheduledDate === '2026-10-10', 'Apex next date should be 2026-10-10');

const emptyClient = matrix.find((c) => c.clientName === 'Empty Client');
assert(emptyClient !== undefined, 'Empty client should exist');
assert(emptyClient?.total === 0, 'Empty client total should be 0');
assert(emptyClient?.completionRate === 0, 'Empty client completion should be 0');

// 3. Department Funnel
const funnel = calculateDepartmentFunnel(sampleItems);
assert(funnel.length === 5, 'Funnel should have 5 main phases');
const contentPhase = funnel.find((p) => p.key === 'content');
assert(contentPhase?.count === 0, 'Content phase count should be 0');
const clientReviewPhase = funnel.find((p) => p.key === 'client_review');
assert(clientReviewPhase?.count === 1, 'Client review phase count should be 1');

// 4. Urgent Watchlist
const watchlist = calculateUrgentWatchlist(sampleItems, mockNow);
assert(watchlist.length > 0, 'Watchlist should have items');
// Overdue item CC-003 should be first (danger)
assert(watchlist[0].item.serial === 'CC-003', 'CC-003 should be first urgent item due to overdue');
assert(watchlist[0].severity === 'danger', 'CC-003 should be danger');

// 5. Team Workload
const workload = calculateTeamWorkload(sampleItems, mockNow);
assert(workload.length === 2, 'Workload should only track real assignees (Sarah Connor and John Doe)');
const sarah = workload.find((w) => w.name === 'Sarah Connor');
assert(sarah !== undefined, 'Sarah Connor should be tracked');
assert(sarah?.completed === 1, 'Sarah should have 1 completed');
assert(sarah?.totalActive === 1, 'Sarah should have 1 active (ready to post)');
assert(!workload.some((w) => w.name === 'Creative' || w.name === 'Content'), 'Departments must not be treated as people');

// Check design_owner handling: Department must not count as an assignee
const itemsWithDesignOwner: ContentCalendarItem[] = [
  ...sampleItems,
  {
    id: '5',
    serial: 'CC-005',
    client_name: 'Apex Brands',
    campaign_type: 'Promo',
    creative_type: 'Video',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Brand Awareness',
    content_concept: 'Promo Video',
    offer: 'None',
    cta: 'Learn More',
    approval_status: 'Creative Production',
    setup_status: 'Draft',
    stage: 'Creative Production',
    design_owner: 'Creative', // Department name, NOT a real user
    publish_date: '2026-10-20',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  },
];
const metricsWithDept = calculateOverviewMetrics(itemsWithDesignOwner, mockNow);
assert(metricsWithDept.unassignedCount === 2, 'Item with only design_owner must still be counted as unassigned');
const workloadWithDept = calculateTeamWorkload(itemsWithDesignOwner, mockNow);
assert(!workloadWithDept.some((w) => w.name === 'Creative'), 'Creative department must not appear in team workload');

// 6. Content Mix
const mix = calculateContentMix(sampleItems);
assert(mix.creativeTypes.length === 4, 'Should have 4 creative types');
assert(mix.channels.some((c) => c.label === 'Instagram'), 'Instagram should be in channels');

// 7. Time Range Filter
const thisMonth = filterItemsByTimeRange(sampleItems, 'this_month', mockNow);
assert(thisMonth.length >= 3, 'This month should include items created or scheduled in October');

console.log('All contentCalendarOverview unit tests passed successfully!');
