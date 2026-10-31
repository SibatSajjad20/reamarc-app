import { lazy } from 'react';
import type { ViewType } from '../types';

export const loadDashboardView = () => import('../components/views/DashboardView');
export const loadAttendanceView = () => import('../components/views/AttendanceView');
export const loadCrmView = () => import('../components/views/CrmView');
export const loadDailyLogView = () => import('../components/views/DailyLogView');
export const loadSettingsView = () => import('../components/settings/SettingsView');
export const loadFinanceContainer = () => import('../components/finance/FinanceContainer');
export const loadContentCalendarView = () => import('../components/views/ContentCalendarView');
export const loadWebsitePipelineView = () => import('../components/views/WebsitePipelineView');
export const loadPerformanceMarketing = () => import('../components/views/PerformanceMarketing');
export const loadAdminPanel = () => import('../components/admin/AdminPanel');
export const loadExceptionInboxView = () => import('../components/views/ExceptionInboxView');
export const loadActiveClientsView = () => import('../components/views/ActiveClientsView');
export const loadClientPage = () => import('../components/views/ClientPage');
export const loadWonDealApprovalsView = () => import('../components/views/WonDealApprovalsView');
export const loadClientPortalContainer = () => import('../components/portal/ClientPortalContainer');
export const loadAuthScreen = () => import('../components/auth/AuthScreen');
export const loadPublicSchedulerView = () => import('../components/views/PublicSchedulerView');
export const loadPublicClientReviewView = () => import('../components/views/PublicClientReviewView');
export const loadPublicInvoiceView = () => import('../components/finance/PublicInvoiceView');

export const DashboardView = lazy(() => loadDashboardView().then((m) => ({ default: m.DashboardView })));
export const AttendanceView = lazy(() => loadAttendanceView().then((m) => ({ default: m.AttendanceView })));
export const PerformanceMarketing = lazy(() =>
  loadPerformanceMarketing().then((m) => ({ default: m.PerformanceMarketing })),
);
export const AdminPanel = lazy(() => loadAdminPanel().then((m) => ({ default: m.AdminPanel })));
export const DailyLogView = lazy(() => loadDailyLogView().then((m) => ({ default: m.DailyLogView })));
export const ExceptionInboxView = lazy(() =>
  loadExceptionInboxView().then((m) => ({ default: m.ExceptionInboxView })),
);
export const SettingsView = lazy(() => loadSettingsView().then((m) => ({ default: m.SettingsView })));
export const ActiveClientsView = lazy(() =>
  loadActiveClientsView().then((m) => ({ default: m.ActiveClientsView })),
);
export const ClientPage = lazy(() => loadClientPage().then((m) => ({ default: m.ClientPage })));
export const CrmView = lazy(() => loadCrmView().then((m) => ({ default: m.CrmView })));
export const WonDealApprovalsView = lazy(() =>
  loadWonDealApprovalsView().then((m) => ({ default: m.WonDealApprovalsView })),
);
export const ContentCalendarView = lazy(() =>
  loadContentCalendarView().then((m) => ({ default: m.ContentCalendarView })),
);
export const WebsitePipelineView = lazy(() =>
  loadWebsitePipelineView().then((m) => ({ default: m.WebsitePipelineView })),
);
export const FinanceContainer = lazy(() =>
  loadFinanceContainer().then((m) => ({ default: m.FinanceContainer })),
);
export const ClientPortalContainer = lazy(() =>
  loadClientPortalContainer().then((m) => ({ default: m.ClientPortalContainer })),
);
export const AuthScreen = lazy(() => loadAuthScreen().then((m) => ({ default: m.AuthScreen })));
export const PublicSchedulerView = lazy(() =>
  loadPublicSchedulerView().then((m) => ({ default: m.PublicSchedulerView })),
);
export const PublicClientReviewView = lazy(() =>
  loadPublicClientReviewView().then((m) => ({ default: m.PublicClientReviewView })),
);
export const PublicInvoiceView = lazy(() =>
  loadPublicInvoiceView().then((m) => ({ default: m.PublicInvoiceView })),
);

const PRIMARY_LOADERS: Partial<Record<ViewType, () => Promise<unknown>>> = {
  dashboard: loadDashboardView,
  attendance: loadAttendanceView,
  crm: loadCrmView,
  'daily-log': loadDailyLogView,
  settings: loadSettingsView,
  finance: loadFinanceContainer,
  'content-calendar': loadContentCalendarView,
  'website-pipeline': loadWebsitePipelineView,
};

export function prefetchView(view: ViewType): void {
  void PRIMARY_LOADERS[view]?.();
}

export function prefetchPrimaryViews(): void {
  for (const load of Object.values(PRIMARY_LOADERS)) {
    void load();
  }
}
