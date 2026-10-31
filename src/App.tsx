import { brandNameOf } from './utils/branding';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ViewType, Workspace, ThemeMode, ThemePreference } from './types';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/views/DashboardView';
import { PerformanceMarketing } from './components/views/PerformanceMarketing';
import { AdminPanel } from './components/admin/AdminPanel';
import { DailyLogView } from './components/views/DailyLogView';
import { ExceptionInboxView } from './components/views/ExceptionInboxView';
import { AttendanceView } from './components/views/AttendanceView';
import { SettingsView } from './components/settings/SettingsView';
import { ActiveClientsView } from './components/views/ActiveClientsView';
import { ClientPage, type ClientPageState } from './components/views/ClientPage';
import type { WorkspaceFormSeed } from './hooks/useClientForm';
import { CrmView } from './components/views/CrmView';
import { WonDealApprovalsView } from './components/views/WonDealApprovalsView';
import { ContentCalendarView } from './components/views/ContentCalendarView';
import { WebsitePipelineView } from './components/views/WebsitePipelineView';
import { FinanceContainer } from './components/finance/FinanceContainer';
import { ClientPortalContainer } from './components/portal/ClientPortalContainer';
import type { CrmSubSection } from './types/crm';
import type { AttendanceSubSection } from './types/attendance';
import type { AdminSectionType } from './types/admin';
import type { SettingsSectionSlug } from './types/settings';
import { isSettingsSectionAllowed } from './utils/settingsAccess';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingProvider';
import { ModuleLoadGateProvider, useModuleLoadBlocked } from './context/ModuleLoadGate';
import { AuthScreen } from './components/auth/AuthScreen';
import { useWorkspaces } from './hooks/useWorkspaces';
import { usePermissions } from './hooks/usePermissions';
import { viewFromNotificationPath } from './utils/notificationRoute';
import { showDesktopPopup } from './services/webPushService';
import { useAdAccounts } from './hooks/useAdAccounts';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { removeBootSplash } from './utils/bootSplash';
import { PublicSchedulerView } from './components/views/PublicSchedulerView';
import { PublicClientReviewView } from './components/views/PublicClientReviewView';
import { PublicInvoiceView } from './components/finance/PublicInvoiceView';
import { NotificationPromptBanner } from './components/NotificationPromptBanner';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/layout/CommandPalette';
import { ShortcutsDialog } from './components/layout/ShortcutsDialog';
import { BreadcrumbProvider } from './components/layout/BreadcrumbContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AccessDenied } from './components/ui/AccessDenied';
import { CompanySuspensionGate } from './components/ui/CompanySuspensionGate';
import { isOwnerLegacyPath, ownerPathToCompaniesPath } from './utils/companiesRoutes';
import {
  applyResolvedTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
} from './utils/themePreference';

function AppInner() {
  const { addToast } = useToast();
  const { user, logout, setActiveWorkspaceId, isLoading: isAuthLoading, pendingBrand } = useAuth();
  const moduleClicksBlocked = useModuleLoadBlocked();

  // Keep the HTML #boot-splash up through auth bootstrap (and under React's
  // LoadingScreen). Removing it in main.tsx caused blank gaps + remount blinks.
  useEffect(() => {
    const path = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
    const isPublic =
      path.startsWith('/book') ||
      path.startsWith('/schedule') ||
      path.startsWith('/review') ||
      path.startsWith('/client-review') ||
      path.startsWith('/invoice/');
    if (isPublic || !isAuthLoading) {
      removeBootSplash();
    }
  }, [isAuthLoading]);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // User-persisted sidebar state without flash (§8.5, requirement 5)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const lastUserId = localStorage.getItem('reamarc_last_user_id');
      const userKey = lastUserId ? `sidebar_collapsed_${lastUserId}` : 'sidebar_collapsed';
      const saved = localStorage.getItem(userKey) ?? localStorage.getItem('sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Sync state whenever authenticated user changes
  useEffect(() => {
    if (user?.id) {
      try {
        localStorage.setItem('reamarc_last_user_id', user.id);
        const userKey = `sidebar_collapsed_${user.id}`;
        const saved = localStorage.getItem(userKey);
        if (saved !== null) {
          setIsSidebarCollapsed(saved === 'true');
        } else {
          const generic = localStorage.getItem('sidebar_collapsed');
          if (generic !== null) {
            setIsSidebarCollapsed(generic === 'true');
            localStorage.setItem(userKey, generic);
          }
        }
      } catch {}
    }
  }, [user?.id]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        if (user?.id) {
          localStorage.setItem(`sidebar_collapsed_${user.id}`, String(next));
        }
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // ⌘\ or Ctrl+\ for sidebar toggle (except while typing in input, textarea, or contenteditable)
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash')) {
        const target = e.target as HTMLElement | null;
        const isTyping =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            Boolean(target.closest?.('[contenteditable="true"]')));
        if (!isTyping) {
          e.preventDefault();
          handleToggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleSidebar]);

  const perms = usePermissions();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';

  const eff = user?.effective_access;
  const canSeeMarketing = eff ? !!eff.ads : perms.can('ads', 'view');
  const canSeeFinance = isAdmin || isOperations;
  const canSeeAdmin = isAdmin || isHR || isOperations;
  const canSeeExceptions = perms.can('exceptions', 'department');
  const canSeeActiveClients = user?.needs_setup ? false : perms.can('active_clients', 'view');
  const canSeeCrm = eff ? !!eff.sales : perms.can('sales', 'own');
  const canSeeWonDealApprovals = perms.canSeeWonDealApprovals;
  const canSeeContentCalendar = eff ? !!eff.content_calendar : perms.can('content_calendar', 'view');
  const canSeeWebsitePipeline = eff ? !!eff.website : perms.can('website', 'view');
  const canSeeAttendance = !isClient && (isAdmin || (eff ? !!eff.attendance : perms.canAccessAttendance));
  const canSeeDailyLog = !isClient && (isAdmin || (eff ? !!eff.daily_log : perms.canAccessDailyLog));
  const canAssign = perms.can('sales', 'all') && !perms.isViewOnly;
  const isManagementRole = isAdmin || isHR || isOperations;
  const adminLabel = isAdmin ? 'Admin panel' : isHR ? 'HR panel' : 'Operations panel';

  const v1Views: ViewType[] = [
    'dashboard',
    'active-clients',
    'marketing',
    'admin',
    'daily-log',
    'attendance',
    'exceptions',
    'crm',
    'won-deal-approvals',
    'content-calendar',
    'website-pipeline',
    'finance',
    'portal',
    'settings',
    'owner',
  ];

  const getDefaultViewForUser = useCallback((): ViewType => {
    if (isClient) return 'portal';
    return 'dashboard';
  }, [isClient]);

  const [currentView, setCurrentView] = useState<ViewType>(() => {
    if (isClient) return 'portal';
    const saved = localStorage.getItem('reamarc_active_view') as ViewType;
    if (saved === 'profile') return 'settings';
    return saved && v1Views.includes(saved)
      ? saved
      : 'dashboard';
  });

  const [activeCrmSection, setActiveCrmSection] = useState<CrmSubSection>('board');
  const [activeAttendanceSection, setActiveAttendanceSection] = useState<AttendanceSubSection>(() => {
    return isAdmin || isHR || isOperations ? 'daily-matrix' : 'timesheet';
  });
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionType>('directory');
  const [activeWebsiteSection, setActiveWebsiteSection] = useState<'board' | 'tasks' | 'table'>('board');
  const [activePortalTab, setActivePortalTab] = useState<'content' | 'website'>('content');
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionSlug>('profile');
  const [lastNonSettingsView, setLastNonSettingsView] = useState<ViewType>(() => getDefaultViewForUser());
  const [clientPage, setClientPage] = useState<ClientPageState | null>(null);
  const [clientFormSeed, setClientFormSeed] = useState<WorkspaceFormSeed | null>(null);
  const unsavedGuardRef = useRef<(() => Promise<boolean>) | null>(null);

  // Route guard effect to enforce V1.0 module boundaries & URL path redirects
  useEffect(() => {
    if (!user) return;

    const enforceRouteLockdown = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
      const hash = window.location.hash.toLowerCase().replace(/^#\/*/, '');
      const currentPath = pathname || hash;
      const currentSaved = localStorage.getItem('reamarc_active_view') as ViewType;

      if (
        currentPath.startsWith('book') ||
        currentPath.startsWith('schedule') ||
        currentPath.startsWith('review') ||
        currentPath.startsWith('client-review') ||
        new URLSearchParams(window.location.search).get('embed') === 'true'
      ) {
        return;
      }

      const nonV1Routes = ['matrix', 'inbox', 'campaigns', 'knowledge', 'obsidian'];

      if (user?.needs_setup && currentPath !== 'dashboard' && currentPath !== 'settings') {
        window.history.replaceState(null, '', '/dashboard');
        setCurrentView('dashboard');
        localStorage.setItem('reamarc_active_view', 'dashboard');
        return;
      }

      if (nonV1Routes.includes(currentPath)) {
        const fallback = getDefaultViewForUser();
        window.history.replaceState(null, '', `/${fallback}`);
        setCurrentView(fallback);
        localStorage.setItem('reamarc_active_view', fallback);
      } else if (currentPath === 'dashboard') {
        if (isClient) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else {
          setCurrentView('dashboard');
          localStorage.setItem('reamarc_active_view', 'dashboard');
        }
      } else if (currentPath === 'admin' || currentPath.startsWith('admin/')) {
        const segments = currentPath.split('/');
        const sub = segments[1];
        if (sub && ['directory', 'compliance', 'workspaces', 'companies'].includes(sub)) {
          setActiveAdminSection(sub as AdminSectionType);
        }
        setCurrentView('admin');
        localStorage.setItem('reamarc_active_view', 'admin');
      } else if (currentPath === 'portal' || currentPath === 'client-portal' || currentPath === 'client_portal') {
        if (isClient) {
          window.history.replaceState(null, '', '/portal');
          setCurrentView('portal');
          localStorage.setItem('reamarc_active_view', 'portal');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'attendance' || currentPath.startsWith('attendance/')) {
        if (isClient || !canSeeAttendance) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else {
          const segments = currentPath.split('/');
          const sub = segments[1];
          if (sub && ['daily-matrix', 'punctuality-hub', 'employee-timesheets', 'approvals', 'timesheet', 'requests'].includes(sub)) {
            setActiveAttendanceSection(sub as AttendanceSubSection);
          }
          setCurrentView('attendance');
          localStorage.setItem('reamarc_active_view', 'attendance');
        }
      } else if (currentPath === 'daily-log' || currentPath === 'daily_log') {
        if (isClient || !canSeeDailyLog) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else {
          setCurrentView('daily-log');
          localStorage.setItem('reamarc_active_view', 'daily-log');
        }
      } else if (currentPath === 'clients/new' || /^clients\/[^/]+\/edit$/.test(currentPath)) {
        const params = new URLSearchParams(window.location.search);
        const returnRaw = params.get('return');
        const returnTo = returnRaw === 'admin-workspaces' ? 'admin-workspaces' : params.get('from_lead') ? 'crm' : 'active-clients';
        if (currentPath === 'clients/new') {
          setClientPage({ mode: 'new', fromLead: params.get('from_lead'), returnTo });
        } else {
          setClientPage({ mode: 'edit', id: currentPath.split('/')[1], returnTo: returnRaw === 'admin-workspaces' ? 'admin-workspaces' : 'active-clients' });
        }
        setCurrentView('active-clients');
        localStorage.setItem('reamarc_active_view', 'active-clients');
      } else if (currentPath === 'active-clients' || currentPath === 'active_clients' || currentPath === 'clients') {
        setClientPage(null);
        setClientFormSeed(null);
        setCurrentView('active-clients');
        localStorage.setItem('reamarc_active_view', 'active-clients');
      } else if (currentPath === 'won-deal-approvals' || currentPath === 'won_deal_approvals') {
        setCurrentView('won-deal-approvals');
        localStorage.setItem('reamarc_active_view', 'won-deal-approvals');
      } else if (currentPath === 'crm' || currentPath.startsWith('crm/') || currentPath === 'leads' || currentPath.startsWith('leads/')) {
        const segments = currentPath.split('/');
        const sub = segments[1];
        if (sub && ['board', 'deals', 'list', 'followup'].includes(sub)) {
          setActiveCrmSection(sub as CrmSubSection);
        }
        setCurrentView('crm');
        localStorage.setItem('reamarc_active_view', 'crm');
      } else if (currentPath === 'exceptions') {
        setCurrentView('exceptions');
        localStorage.setItem('reamarc_active_view', 'exceptions');
      } else if (currentPath === 'content-calendar' || currentPath === 'calendar' || currentPath === 'content_calendar') {
        setCurrentView('content-calendar');
        localStorage.setItem('reamarc_active_view', 'content-calendar');
      } else if (
        currentPath === 'website-pipeline' ||
        currentPath.startsWith('website-pipeline/') ||
        currentPath === 'website_pipeline' ||
        currentPath.startsWith('website_pipeline/') ||
        currentPath === 'website' ||
        currentPath.startsWith('website/')
      ) {
        const segments = currentPath.split('/');
        const sub = segments[1];
        if (sub && ['board', 'tasks', 'table'].includes(sub)) {
          setActiveWebsiteSection(sub as 'board' | 'tasks' | 'table');
        }
        setCurrentView('website-pipeline');
        localStorage.setItem('reamarc_active_view', 'website-pipeline');
      } else if (currentPath === 'marketing') {
        if (isClient) {
          window.history.replaceState(null, '', '/portal');
          setCurrentView('portal');
          localStorage.setItem('reamarc_active_view', 'portal');
        } else {
          setCurrentView('marketing');
          localStorage.setItem('reamarc_active_view', 'marketing');
        }
      } else if (currentPath === 'finance' || currentPath.startsWith('finance/')) {
        if (isClient || !canSeeFinance) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else {
          setCurrentView('finance');
          localStorage.setItem('reamarc_active_view', 'finance');
        }
      } else if (currentPath.startsWith('settings')) {
        const segments = currentPath.split('/');
        const requestedSlug = (segments[1] || 'profile') as SettingsSectionSlug;
        if (isSettingsSectionAllowed(requestedSlug, user)) {
          window.history.replaceState(null, '', `/settings/${requestedSlug}`);
          setCurrentView('settings');
          setActiveSettingsSection(requestedSlug);
          localStorage.setItem('reamarc_active_view', 'settings');
        } else {
          window.history.replaceState(null, '', '/settings/profile');
          setCurrentView('settings');
          setActiveSettingsSection('profile');
          localStorage.setItem('reamarc_active_view', 'settings');
        }
      } else if (currentPath === 'profile') {
        window.history.replaceState(null, '', '/settings/profile');
        setCurrentView('settings');
        setActiveSettingsSection('profile');
        localStorage.setItem('reamarc_active_view', 'settings');
      } else if (isOwnerLegacyPath(currentPath)) {
        const dest = ownerPathToCompaniesPath(currentPath);
        window.history.replaceState(null, '', dest);
        setActiveAdminSection('companies');
        setCurrentView('admin');
        localStorage.setItem('reamarc_active_view', 'admin');
      } else {
        // Root / or unknown path
        if (currentSaved === 'owner') {
          window.history.replaceState(null, '', '/admin/companies');
          setActiveAdminSection('companies');
          setCurrentView('admin');
          localStorage.setItem('reamarc_active_view', 'admin');
        } else if (!currentSaved || !v1Views.includes(currentSaved)) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'profile') {
          window.history.replaceState(null, '', '/settings/profile');
          setCurrentView('settings');
          setActiveSettingsSection('profile');
          localStorage.setItem('reamarc_active_view', 'settings');
        } else if (!isClient && (currentPath === '' || currentPath === '/')) {
          // Team lead, team member, hr, operations, admin land on dashboard
          window.history.replaceState(null, '', '/dashboard');
          setCurrentView('dashboard');
          localStorage.setItem('reamarc_active_view', 'dashboard');
        } else if (currentSaved === 'active-clients' && !canSeeActiveClients) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'content-calendar' && !canSeeContentCalendar) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'won-deal-approvals' && !canSeeWonDealApprovals) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'crm' && !canSeeCrm) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'finance' && !canSeeFinance) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'marketing' && !canSeeMarketing) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'admin' && !canSeeAdmin && !user?.is_super_admin) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'exceptions' && !canSeeExceptions) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'attendance' && !canSeeAttendance) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'daily-log' && !canSeeDailyLog) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'dashboard' && isClient) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      }
    };

    enforceRouteLockdown();
    window.addEventListener('popstate', enforceRouteLockdown);
    return () => window.removeEventListener('popstate', enforceRouteLockdown);
  }, [user, canSeeAdmin, canSeeMarketing, canSeeFinance, canSeeExceptions, canSeeActiveClients, canSeeCrm, canSeeWonDealApprovals, canSeeContentCalendar, canSeeAttendance, canSeeDailyLog, isClient, isAdmin, getDefaultViewForUser]);

  const handleSelectView = (view: ViewType, subSection?: string) => {
    void (async () => {
      if (unsavedGuardRef.current) {
        const ok = await unsavedGuardRef.current();
        if (!ok) return;
      }
      setClientPage(null);
      setClientFormSeed(null);
    let allowedViews: ViewType[] = [];
    if (!isClient) {
      allowedViews.push('dashboard');
    }
    if (isClient) allowedViews.push('portal');
    if (canSeeActiveClients) allowedViews.push('active-clients');
    if (canSeeCrm) allowedViews.push('crm');
    if (canSeeWonDealApprovals) allowedViews.push('won-deal-approvals');
    if (canSeeContentCalendar) allowedViews.push('content-calendar');
    if (canSeeWebsitePipeline) allowedViews.push('website-pipeline');
    if (canSeeAttendance) allowedViews.push('attendance');
    if (canSeeDailyLog) allowedViews.push('daily-log');
    if (canSeeExceptions) allowedViews.push('exceptions');
    if (canSeeFinance) allowedViews.push('finance');
    if (canSeeMarketing) allowedViews.push('marketing');
    if (canSeeAdmin || user?.is_super_admin) allowedViews.push('admin');
    allowedViews.push('settings');

    let requestedView = view;
    let requestedSub = subSection;
    if (view === 'owner') {
      requestedView = 'admin';
      requestedSub = 'companies';
    }

    const targetView = allowedViews.includes(requestedView) ? requestedView : getDefaultViewForUser();

    if (targetView !== 'settings') {
      setLastNonSettingsView(targetView);
    }

    if (targetView === 'admin' && requestedSub && ['directory', 'compliance', 'workspaces', 'companies'].includes(requestedSub)) {
      setActiveAdminSection(requestedSub as AdminSectionType);
    }
    if (targetView === 'attendance' && subSection && ['daily-matrix', 'punctuality-hub', 'employee-timesheets', 'approvals', 'timesheet', 'requests'].includes(subSection)) {
      setActiveAttendanceSection(subSection as AttendanceSubSection);
    }
    if (targetView === 'crm' && subSection && ['board', 'deals', 'list', 'followup'].includes(subSection)) {
      setActiveCrmSection(subSection as CrmSubSection);
    }
    if (targetView === 'website-pipeline' && subSection && ['board', 'tasks', 'table'].includes(subSection)) {
      setActiveWebsiteSection(subSection as 'board' | 'tasks' | 'table');
    }

    try {
      if (targetView === 'settings') {
        window.history.pushState(null, '', `/settings/${activeSettingsSection || 'profile'}`);
      } else if (targetView === 'admin' && requestedSub) {
        window.history.pushState(null, '', `/admin/${requestedSub}`);
      } else if (targetView === 'attendance' && subSection) {
        window.history.pushState(null, '', `/attendance/${subSection}`);
      } else if (targetView === 'crm' && subSection) {
        window.history.pushState(null, '', `/crm/${subSection}`);
      } else if (targetView === 'website-pipeline' && subSection) {
        window.history.pushState(null, '', `/website-pipeline/${subSection}`);
      } else {
        window.history.pushState(null, '', `/${targetView}`);
      }
    } catch {
      // Fallback
    }

    setCurrentView(targetView);
    localStorage.setItem('reamarc_active_view', targetView);
    })();
  };

  const handleSelectSettingsSection = (slug: SettingsSectionSlug) => {
    const validSlug = isSettingsSectionAllowed(slug, user) ? slug : 'profile';
    setActiveSettingsSection(validSlug);
    if (currentView !== 'settings') {
      setLastNonSettingsView(currentView);
      setCurrentView('settings');
    }
    try {
      window.history.pushState(null, '', `/settings/${validSlug}`);
    } catch {}
    localStorage.setItem('reamarc_active_view', 'settings');
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'reamarc-navigate') {
        const view = viewFromNotificationPath(String(event.data.path || ''));
        if (view) handleSelectView(view);
      } else if (event.data?.type === 'reamarc-push-received') {
        const title = String(event.data.title || 'Reamarc');
        const body = String(event.data.body || '');
        const tag = typeof event.data.tag === 'string' ? event.data.tag : undefined;
        const displayed = event.data.displayed === true;
        // The service worker already shows the native OS popup. Only trigger fallback if SW failed.
        if (!displayed) {
          void showDesktopPopup(title, body, tag, String(event.data.path || '/'));
        }
        addToast(title, body, 'info');
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [user, isAdmin, isClient, canSeeActiveClients, canSeeCrm, canSeeContentCalendar, canSeeWebsitePipeline, canSeeExceptions, canSeeMarketing, canSeeAdmin, getDefaultViewForUser, addToast]);

  const {
    workspaces,
  } = useWorkspaces(Boolean(user));

  const {
    adAccounts,
    selectedAdAccount,
    setSelectedAdAccount,
  } = useAdAccounts(Boolean(isAdmin || perms.can('ads', 'view')));

  const navigateToClientPage = useCallback((next: ClientPageState, seed?: WorkspaceFormSeed | null) => {
    void (async () => {
      if (unsavedGuardRef.current) {
        const ok = await unsavedGuardRef.current();
        if (!ok) return;
      }
      setClientFormSeed(seed ?? null);
      setClientPage(next);
      setCurrentView('active-clients');
      localStorage.setItem('reamarc_active_view', 'active-clients');
      const path = next.mode === 'new' ? '/clients/new' : `/clients/${next.id}/edit`;
      const qs = new URLSearchParams();
      if (next.returnTo === 'admin-workspaces') qs.set('return', 'admin-workspaces');
      if (next.fromLead) qs.set('from_lead', next.fromLead);
      const q = qs.toString();
      window.history.pushState(null, '', q ? `${path}?${q}` : path);
    })();
  }, []);

  // Theme Mode State ('dark' | 'light' | 'system') — key reamarc-theme survives logout.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    return readThemePreference() ?? 'system';
  });

  const [theme, setTheme] = useState<ThemeMode>(() => resolveTheme(readThemePreference()));

  const setThemePreference = useCallback((pref: ThemePreference) => {
    // Write + apply synchronously so a fast sign-out still keeps the choice across reload.
    persistThemePreference(pref);
    setTheme(resolveTheme(pref));
    setThemePreferenceState(pref);
  }, []);

  useEffect(() => {
    const updateTheme = () => {
      const newTheme = resolveTheme(themePreference);
      setTheme(newTheme);
      applyResolvedTheme(newTheme);
      try {
        localStorage.setItem('reamarc-theme', themePreference);
      } catch {
        /* storage blocked */
      }
    };

    updateTheme();

    if (themePreference === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => updateTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [themePreference]);

  const handleToggleTheme = () => {
    setThemePreference(theme === 'dark' ? 'light' : 'dark');
  };

  const handleOpenCreateWorkspace = useCallback(() => {
    navigateToClientPage({ mode: 'new', returnTo: 'active-clients' });
  }, [navigateToClientPage]);

  const handleEditWorkspace = useCallback((ws: Workspace) => {
    navigateToClientPage({ mode: 'edit', id: ws.id, returnTo: 'active-clients' });
  }, [navigateToClientPage]);

  const handleSelectAdAccount = useCallback((account: any) => {
    setSelectedAdAccount(account);
    setActiveWorkspaceId(account?.id || null);
    if (account) {
      addToast('Account Switched', `Showing active context for ${account.name}`, 'info');
    } else {
      addToast('Account Filter Cleared', 'Showing all account tasks & campaigns.', 'info');
    }
  }, [setSelectedAdAccount, setActiveWorkspaceId, addToast]);

  const handleSignOut = () => {
    logout();
    addToast('Signed Out', `You have been safely signed out of ` + brandNameOf(user?.company) + `.`, 'warning');
  };

  const currentPathLower = window.location.pathname.toLowerCase();
  const isPublicBooking =
    currentPathLower.startsWith('/book') ||
    currentPathLower.startsWith('/schedule');

  if (isPublicBooking) {
    return <PublicSchedulerView theme={theme} />;
  }

  const isPublicReview =
    currentPathLower.startsWith('/review') ||
    currentPathLower.startsWith('/client-review');

  if (isPublicReview) {
    return <PublicClientReviewView theme={theme} />;
  }

  const isPublicInvoice = currentPathLower.startsWith('/invoice/');
  if (isPublicInvoice) {
    return <PublicInvoiceView />;
  }

  if (isAuthLoading) {
    // First boot: keep ONLY the HTML #boot-splash (already on screen). Mounting a
    // second React LoadingScreen under it caused a visible W/spinner swap when
    // splash faded out. Company switch still uses React LoadingScreen (no splash).
    if (pendingBrand) {
      return (
        <LoadingScreen
          fullScreen
          message={`Switching to ${brandNameOf(pendingBrand)}…`}
        />
      );
    }
    return null;
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (user?.company?.status === 'suspended') {
    return <CompanySuspensionGate />;
  }

  return (
    <>
      {/* Real-time prompt when desktop notifications are not yet enabled */}
      <NotificationPromptBanner />

      <AppShell
        moduleClicksBlocked={moduleClicksBlocked}
        isMobileNavOpen={isMobileNavOpen}
        onMobileNavOpenChange={setIsMobileNavOpen}
        sidebar={
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            isMobile={false}
            currentView={currentView}
            onSelectView={handleSelectView}
            onSignOut={handleSignOut}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            themePreference={themePreference}
            onSelectThemePreference={setThemePreference}
            activeCrmSection={activeCrmSection}
            onSelectCrmSection={(section) => {
              setActiveCrmSection(section);
              if (currentView !== 'crm') {
                handleSelectView('crm', section);
              }
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance', section);
              }
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              handleSelectView('admin', section);
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline', section);
              }
            }}
            activePortalTab={activePortalTab}
            onSelectPortalTab={(tab) => {
              setActivePortalTab(tab);
              if (currentView !== 'portal') {
                handleSelectView('portal');
              }
            }}
            activeSettingsSection={activeSettingsSection}
            onSelectSettingsSection={handleSelectSettingsSection}
            lastNonSettingsView={lastNonSettingsView}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        }
        mobileSidebar={
          <Sidebar
            isCollapsed={false}
            isMobile={true}
            currentView={currentView}
            onSelectView={(v) => {
              handleSelectView(v);
              setIsMobileNavOpen(false);
            }}
            onSignOut={handleSignOut}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            themePreference={themePreference}
            onSelectThemePreference={setThemePreference}
            activeCrmSection={activeCrmSection}
            onSelectCrmSection={(section) => {
              setActiveCrmSection(section);
              if (currentView !== 'crm') {
                handleSelectView('crm', section);
              }
              setIsMobileNavOpen(false);
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance', section);
              }
              setIsMobileNavOpen(false);
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              handleSelectView('admin', section);
              setIsMobileNavOpen(false);
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline', section);
              }
              setIsMobileNavOpen(false);
            }}
            activePortalTab={activePortalTab}
            onSelectPortalTab={(tab) => {
              setActivePortalTab(tab);
              if (currentView !== 'portal') {
                handleSelectView('portal');
              }
              setIsMobileNavOpen(false);
            }}
            activeSettingsSection={activeSettingsSection}
            onSelectSettingsSection={(sec) => {
              handleSelectSettingsSection(sec);
              setIsMobileNavOpen(false);
            }}
            lastNonSettingsView={lastNonSettingsView}
            onOpenShortcuts={() => {
              setIsMobileNavOpen(false);
              setIsShortcutsOpen(true);
            }}
          />
        }
        topBar={
          <TopBar
            currentView={currentView}
            onSelectView={handleSelectView}
            activeCrmSection={activeCrmSection}
            onSelectCrmSection={(section) => {
              setActiveCrmSection(section);
              if (currentView !== 'crm') {
                handleSelectView('crm', section);
              }
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance', section);
              }
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              handleSelectView('admin', section);
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline', section);
              }
            }}
            activePortalTab={activePortalTab}
            onSelectPortalTab={(tab) => {
              setActivePortalTab(tab);
              if (currentView !== 'portal') {
                handleSelectView('portal');
              }
            }}
            activeSettingsSection={activeSettingsSection}
            onSelectSettingsSection={handleSelectSettingsSection}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenMobileMenu={() => setIsMobileNavOpen(true)}
          />
        }
      >
        <ErrorBoundary onGoHome={() => handleSelectView(getDefaultViewForUser())}>
          {currentView === 'dashboard' && !isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <DashboardView onNavigateView={handleSelectView} />
            </div>
          )}

          {currentView === 'active-clients' && (
            canSeeActiveClients ? (
            <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden view-enter">
              {clientPage ? (
                <ClientPage
                  page={clientPage}
                  seed={clientFormSeed}
                  registerGuard={(fn) => { unsavedGuardRef.current = fn; }}
                  onNavigate={(path, options) => {
                    if (options?.replace) window.history.replaceState(null, '', path);
                    else window.history.pushState(null, '', path);
                    const normalised = path.split('?')[0].replace(/^\/+|\/+$/g, '');
                    if (normalised.startsWith('clients/') && normalised.endsWith('/edit')) {
                      setClientPage((prev) => ({ mode: 'edit', id: normalised.split('/')[1], returnTo: prev?.returnTo || 'active-clients', fromLead: null }));
                    } else if (normalised.startsWith('admin')) {
                      setClientPage(null); setClientFormSeed(null); setCurrentView('admin'); setActiveAdminSection('workspaces');
                    } else if (normalised.startsWith('crm')) {
                      setClientPage(null); setClientFormSeed(null); setCurrentView('crm');
                    } else if (normalised.startsWith('marketing')) {
                      setClientPage(null); setClientFormSeed(null); setCurrentView('marketing');
                    } else {
                      setClientPage(null); setClientFormSeed(null); setCurrentView('active-clients');
                    }
                  }}
                />
              ) : (
              <ActiveClientsView
                workspaces={workspaces}
                onAddWorkspace={handleOpenCreateWorkspace}
                onEditWorkspace={handleEditWorkspace}
              />
              )}
            </div>
            ) : (
              <AccessDenied module="Active clients" />
            )
          )}

          {currentView === 'won-deal-approvals' && (
            canSeeWonDealApprovals ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <WonDealApprovalsView />
            </div>
            ) : (
              <AccessDenied module="Won-deal approvals" />
            )
          )}

          {currentView === 'crm' && (
            canSeeCrm ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <CrmView
                activeSection={activeCrmSection}
                onSectionChange={setActiveCrmSection}
                onRegisterClient={(lead, seed) => {
                  navigateToClientPage({ mode: 'new', fromLead: lead.id, returnTo: 'crm', crmSection: activeCrmSection }, seed);
                }}
              />
            </div>
            ) : (
              <AccessDenied module="Sales pipeline" />
            )
          )}

          {currentView === 'portal' && isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ClientPortalContainer
                activeTab={activePortalTab}
                onTabChange={setActivePortalTab}
              />
            </div>
          )}

          {currentView === 'marketing' && !isClient && (
            canSeeMarketing ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <PerformanceMarketing
                selectedWorkspace={selectedAdAccount}
                adAccounts={adAccounts}
                workspaces={workspaces}
                onSelectWorkspace={handleSelectAdAccount}
                onOpenCreateAccount={handleOpenCreateWorkspace}
              />
            </div>
            ) : (
              <AccessDenied module="Performance marketing" />
            )
          )}

          {currentView === 'attendance' && !isClient && (
            canSeeAttendance ? (
              <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
                <AttendanceView
                  activeSection={activeAttendanceSection}
                  onSectionChange={setActiveAttendanceSection}
                />
              </div>
            ) : (
              <AccessDenied module="Attendance" />
            )
          )}

          {currentView === 'daily-log' && !isClient && (
            canSeeDailyLog ? (
              <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
                <DailyLogView />
              </div>
            ) : (
              <AccessDenied module="Daily log" />
            )
          )}

          {currentView === 'content-calendar' && (
            canSeeContentCalendar ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ContentCalendarView />
            </div>
            ) : (
              <AccessDenied module="Content calendar" />
            )
          )}

          {currentView === 'finance' && (
            canSeeFinance ? (
              <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
                <FinanceContainer />
              </div>
            ) : (
              <AccessDenied module="Accounts" />
            )
          )}

          {currentView === 'website-pipeline' && (
            canSeeWebsitePipeline ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <WebsitePipelineView
                workspaces={workspaces}
                activeSection={activeWebsiteSection}
                onSectionChange={setActiveWebsiteSection}
              />
            </div>
            ) : (
              <AccessDenied module="Website pipeline" />
            )
          )}

          {currentView === 'exceptions' && (
            canSeeExceptions ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ExceptionInboxView onOpenDailyLog={() => handleSelectView('daily-log')} />
            </div>
            ) : (
              <AccessDenied module="Exceptions" />
            )
          )}

          {currentView === 'admin' && (
            activeAdminSection === 'companies' && !user?.is_super_admin ? (
              <AccessDenied module="Companies" />
            ) : canSeeAdmin || user?.is_super_admin ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <AdminPanel
                activeSection={activeAdminSection}
                onSectionChange={(section) => handleSelectView('admin', section)}
                onAddWorkspace={() => navigateToClientPage({ mode: 'new', returnTo: 'admin-workspaces' })}
                onEditWorkspace={(ws) => navigateToClientPage({ mode: 'edit', id: ws.id, returnTo: 'admin-workspaces' })}
              />
            </div>
            ) : (
              <AccessDenied module="Team directory" />
            )
          )}

          {currentView === 'settings' && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <SettingsView
                currentSection={activeSettingsSection}
                onSelectSection={handleSelectSettingsSection}
                themePreference={themePreference}
                onSelectThemePreference={setThemePreference}
              />
            </div>
          )}

          {currentView === 'owner' && <AccessDenied module="Companies" />}
        </ErrorBoundary>
      </AppShell>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        currentView={currentView}
        onSelectView={handleSelectView}
        onSelectCrmSection={(section) => {
          setActiveCrmSection(section);
          if (currentView !== 'crm') handleSelectView('crm');
        }}
        onSelectAttendanceSection={(section) => {
          setActiveAttendanceSection(section);
          if (currentView !== 'attendance') handleSelectView('attendance');
        }}
        onSelectAdminSection={(section) => {
          handleSelectView('admin', section);
        }}
        onSelectWebsiteSection={(section) => {
          setActiveWebsiteSection(section);
          if (currentView !== 'website-pipeline') handleSelectView('website-pipeline');
        }}
        onSelectPortalTab={(tab) => {
          setActivePortalTab(tab);
          if (currentView !== 'portal') handleSelectView('portal');
        }}
        activeSettingsSection={activeSettingsSection}
        onSelectSettingsSection={handleSelectSettingsSection}
        themePreference={themePreference}
        onSelectThemePreference={setThemePreference}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onSignOut={handleSignOut}
        canSeeActiveClients={canSeeActiveClients}
        canSeeCrm={canSeeCrm}
        canSeeWonDealApprovals={canSeeWonDealApprovals}
        canSeeMarketing={canSeeMarketing}
        canSeeFinance={canSeeFinance}
        canSeeContentCalendar={canSeeContentCalendar}
        canSeeWebsitePipeline={canSeeWebsitePipeline}
        canSeeAttendance={canSeeAttendance}
        canSeeDailyLog={canSeeDailyLog}
        canSeeExceptions={canSeeExceptions}
        canSeeAdmin={canSeeAdmin}
        adminLabel={adminLabel}
        isManagementRole={isManagementRole}
        canAssignCrm={canAssign}
        isClient={isClient}
        isAdmin={isAdmin}
      />

      {/* Global Shortcuts Dialog */}
      <ShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />

    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrandingProvider>
          <ModuleLoadGateProvider>
            <BreadcrumbProvider>
              <AppInner />
            </BreadcrumbProvider>
          </ModuleLoadGateProvider>
        </BrandingProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

