import { lazy, type ComponentType } from 'react';
import type { ViewType } from './types';

export const viewLoaders: Record<ViewType, () => Promise<{ default: ComponentType<any> }>> = {
  dashboard: () =>
    import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView })),
  marketing: () =>
    import('./components/views/PerformanceMarketing').then((m) => ({ default: m.PerformanceMarketing })),
  admin: () =>
    import('./components/admin/AdminPanel').then((m) => ({ default: m.AdminPanel })),
  'daily-log': () =>
    import('./components/views/DailyLogView').then((m) => ({ default: m.DailyLogView })),
  exceptions: () =>
    import('./components/views/ExceptionInboxView').then((m) => ({ default: m.ExceptionInboxView })),
  attendance: () =>
    import('./components/views/AttendanceView').then((m) => ({ default: m.AttendanceView })),
  settings: () =>
    import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
  'active-clients': () =>
    import('./components/views/ActiveClientsView').then((m) => ({ default: m.ActiveClientsView })),
  crm: () => import('./components/views/CrmView').then((m) => ({ default: m.CrmView })),
  'won-deal-approvals': () =>
    import('./components/views/WonDealApprovalsView').then((m) => ({ default: m.WonDealApprovalsView })),
  'content-calendar': () =>
    import('./components/views/ContentCalendarView').then((m) => ({ default: m.ContentCalendarView })),
  'website-pipeline': () =>
    import('./components/views/WebsitePipelineView').then((m) => ({ default: m.WebsitePipelineView })),
  owner: () => import('./components/views/OwnerView').then((m) => ({ default: m.OwnerView })),
  portal: () =>
    import('./components/portal/ClientPortalContainer').then((m) => ({ default: m.ClientPortalContainer })),
  profile: () =>
    import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
};

export const DashboardView = lazy(viewLoaders.dashboard);
export const PerformanceMarketing = lazy(viewLoaders.marketing);
export const AdminPanel = lazy(viewLoaders.admin);
export const DailyLogView = lazy(viewLoaders['daily-log']);
export const ExceptionInboxView = lazy(viewLoaders.exceptions);
export const AttendanceView = lazy(viewLoaders.attendance);
export const SettingsView = lazy(viewLoaders.settings);
export const ActiveClientsView = lazy(viewLoaders['active-clients']);
export const CrmView = lazy(viewLoaders.crm);
export const WonDealApprovalsView = lazy(viewLoaders['won-deal-approvals']);
export const ContentCalendarView = lazy(viewLoaders['content-calendar']);
export const WebsitePipelineView = lazy(viewLoaders['website-pipeline']);
export const OwnerView = lazy(viewLoaders.owner);
export const ClientPortalContainer = lazy(viewLoaders.portal);

export const PublicSchedulerView = lazy(() =>
  import('./components/views/PublicSchedulerView').then((m) => ({ default: m.PublicSchedulerView })),
);
export const PublicClientReviewView = lazy(() =>
  import('./components/views/PublicClientReviewView').then((m) => ({ default: m.PublicClientReviewView })),
);

export function prefetchView(view: ViewType) {
  const loader = viewLoaders[view];
  if (loader) void loader();
}
