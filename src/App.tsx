import { Suspense, useState, useEffect, useCallback } from 'react';
import type { ViewType, Workspace, ThemeMode, ThemePreference } from './types';
import { Sidebar } from './components/Sidebar';
import {
  DashboardView,
  PerformanceMarketing,
  AdminPanel,
  DailyLogView,
  ExceptionInboxView,
  AttendanceView,
  SettingsView,
  ActiveClientsView,
  CrmView,
  WonDealApprovalsView,
  ContentCalendarView,
  WebsitePipelineView,
  OwnerView,
  ClientPortalContainer,
  PublicSchedulerView,
  PublicClientReviewView,
  prefetchView,
} from './viewLoaders';
import { WorkspaceModal } from './components/modals/WorkspaceModal';
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
import { NotificationPromptBanner } from './components/NotificationPromptBanner';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/layout/CommandPalette';
import { ShortcutsDialog } from './components/layout/ShortcutsDialog';
import { BreadcrumbProvider } from './components/layout/BreadcrumbContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AccessDenied } from './components/ui/AccessDenied';
import { CompanySuspensionGate } from './components/ui/CompanySuspensionGate';

function AppInner() {
  const { addToast } = useToast();
  const { user, logout, setActiveWorkspaceId, isLoading: isAuthLoading } = useAuth();
  const moduleClicksBlocked = useModuleLoadBlocked();

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

  const canSeeMarketing = perms.can('ads', 'view');
  const canSeeAdmin = isAdmin || isHR || isOperations;
  const canSeeExceptions = perms.can('exceptions', 'department');
  const canSeeActiveClients = perms.can('active_clients', 'view');
  const canSeeCrm = perms.can('sales', 'own');
  const canSeeWonDealApprovals = perms.canSeeWonDealApprovals;
  const canSeeContentCalendar = perms.can('content_calendar', 'view');
  const canSeeWebsitePipeline = perms.can('website', 'view');
  const canSeeAttendance = !isClient && perms.canAccessAttendance;
  const canSeeDailyLog = !isClient && perms.canAccessDailyLog;
  const canAssign = perms.can('sales', 'all') && !perms.isViewOnly;
  const isManagementRole = isAdmin || isHR || isOperations;
  const adminLabel = isAdmin ? 'Admin panel' : isHR ? 'HR panel' : 'Operations panel';

  useEffect(() => {
    if (!user) return;
    const run = () => {
      prefetchView(isClient ? 'portal' : 'dashboard');
      const extras: ViewType[] = [];
      if (canSeeCrm) extras.push('crm');
      if (canSeeContentCalendar) extras.push('content-calendar');
      if (canSeeDailyLog) extras.push('daily-log');
      extras.slice(0, 2).forEach((view) => prefetchView(view));
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, 1);
    return () => window.clearTimeout(id);
  }, [user, isClient, canSeeCrm, canSeeContentCalendar, canSeeDailyLog]);

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
    try {
      const path = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
      const hash = window.location.hash.toLowerCase().replace(/^#\/*/, '');
      const queryView = new URLSearchParams(window.location.search).get('view');
      const first = (path.split('/')[0] || hash.split('/')[0] || queryView || '').trim();
      const aliases: Record<string, ViewType> = {
        'client-portal': 'portal',
        client_portal: 'portal',
        profile: 'settings',
      };
      const fromUrl = (aliases[first] || first) as ViewType;
      if (fromUrl === 'profile') return 'settings';
      if (fromUrl && v1Views.includes(fromUrl)) return fromUrl;
    } catch {
      // fall through to localStorage
    }
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

  // Route guard effect to enforce V1.0 module boundaries & URL path redirects
  useEffect(() => {
    if (!user) return;

    const enforceRouteLockdown = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
      const hash = window.location.hash.toLowerCase().replace(/^#\/*/, '');
      const currentPath = pathname || hash;

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
        if (sub && ['directory', 'compliance', 'workspaces'].includes(sub)) {
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
      } else if (currentPath === 'active-clients' || currentPath === 'active_clients' || currentPath === 'clients') {
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
      } else if (currentPath === 'owner' || currentPath.startsWith('owner/')) {
        if (user?.is_super_admin) {
          window.history.replaceState(null, '', '/owner');
          setCurrentView('owner');
          localStorage.setItem('reamarc_active_view', 'owner');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else {
        // Root / or unknown path
        const currentSaved = localStorage.getItem('reamarc_active_view') as ViewType;
        if (!currentSaved || !v1Views.includes(currentSaved)) {
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
        } else if (currentSaved === 'marketing' && !canSeeMarketing) {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'admin' && !canSeeAdmin) {
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
  }, [user, canSeeAdmin, canSeeMarketing, canSeeExceptions, canSeeActiveClients, canSeeCrm, canSeeWonDealApprovals, canSeeContentCalendar, canSeeAttendance, canSeeDailyLog, isClient, isAdmin, getDefaultViewForUser]);

  const handleSelectView = (view: ViewType, subSection?: string) => {
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
    if (canSeeMarketing) allowedViews.push('marketing');
    if (canSeeAdmin) allowedViews.push('admin');
    if (user?.is_super_admin) allowedViews.push('owner');
    allowedViews.push('settings');

    const targetView = allowedViews.includes(view) ? view : getDefaultViewForUser();

    if (targetView !== 'settings') {
      setLastNonSettingsView(targetView);
    }

    if (targetView === 'admin' && subSection && ['directory', 'compliance', 'workspaces'].includes(subSection)) {
      setActiveAdminSection(subSection as AdminSectionType);
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
      } else if (targetView === 'admin' && subSection) {
        window.history.pushState(null, '', `/admin/${subSection}`);
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
    saveWorkspace,
  } = useWorkspaces(Boolean(user));

  const {
    adAccounts,
    selectedAdAccount,
    setSelectedAdAccount,
  } = useAdAccounts(Boolean(isAdmin || perms.can('ads', 'view')));

  // Modal State for Workspaces
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);

  // Theme Mode State ('dark' | 'light' | 'system')
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('reamarc-theme') as ThemePreference | null;
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('reamarc-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const updateTheme = () => {
      let isDark = false;
      if (themePreference === 'dark') {
        isDark = true;
      } else if (themePreference === 'light') {
        isDark = false;
      } else {
        isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      const newTheme: ThemeMode = isDark ? 'dark' : 'light';
      setTheme(newTheme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(newTheme);
      document.documentElement.style.colorScheme = newTheme;
      document.body.classList.remove('dark', 'light');
      document.body.classList.add(newTheme);
      localStorage.setItem('reamarc-theme', themePreference);
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
    setThemePreference(() => {
      return theme === 'dark' ? 'light' : 'dark';
    });
  };

  // Workspace CRUD Handlers
  const handleOpenCreateWorkspace = useCallback(() => {
    setWorkspaceToEdit(null);
    setIsWorkspaceModalOpen(true);
  }, []);

  const handleEditWorkspace = useCallback((ws: Workspace) => {
    setWorkspaceToEdit(ws);
    setIsWorkspaceModalOpen(true);
  }, []);

  const handleSaveWorkspace = async (data: any) => {
    try {
      const res = await saveWorkspace(workspaceToEdit, data);
      if (res.isNew) {
        addToast('Workspace created', `Switched to new workspace "${res.workspace.name}".`, 'success');
      } else {
        addToast('Workspace updated', `"${res.workspace.name}" updated successfully.`, 'success');
      }
    } catch (err: any) {
      addToast('Workspace Save Failed', err.message || 'Could not save workspace.', 'error');
    }
  };

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
    addToast('Signed Out', 'You have been safely signed out of Reamarc.', 'warning');
  };

  const currentPathLower = window.location.pathname.toLowerCase();
  const isPublicBooking =
    currentPathLower.startsWith('/book') ||
    currentPathLower.startsWith('/schedule');

  if (isPublicBooking) {
    return (
      <Suspense fallback={<LoadingScreen fullScreen message="Loading…" title="Reamarc" />}>
        <PublicSchedulerView theme={theme} />
      </Suspense>
    );
  }

  const isPublicReview =
    currentPathLower.startsWith('/review') ||
    currentPathLower.startsWith('/client-review');

  if (isPublicReview) {
    return (
      <Suspense fallback={<LoadingScreen fullScreen message="Loading…" title="Reamarc" />}>
        <PublicClientReviewView theme={theme} />
      </Suspense>
    );
  }

  if (isAuthLoading) {
    return <LoadingScreen fullScreen message="Checking your session…" title="Reamarc" />;
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
            onPrefetchView={prefetchView}
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
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin', section);
              }
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
            onPrefetchView={prefetchView}
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
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin', section);
              }
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
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin', section);
              }
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
          <Suspense fallback={<LoadingScreen message="Loading…" title="Reamarc" />}>
          {currentView === 'dashboard' && !isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <DashboardView onNavigateView={handleSelectView} />
            </div>
          )}

          {currentView === 'active-clients' && (
            canSeeActiveClients ? (
            <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden view-enter">
              <ActiveClientsView
                workspaces={workspaces}
                onAddWorkspace={handleOpenCreateWorkspace}
                onEditWorkspace={handleEditWorkspace}
              />
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
            canSeeAdmin ? (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <AdminPanel
                activeSection={activeAdminSection}
                onSectionChange={setActiveAdminSection}
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

          {currentView === 'owner' && (
            user?.is_super_admin ? (
              <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
                <OwnerView onNavigateView={handleSelectView} />
              </div>
            ) : (
              <AccessDenied module="Owner Console" />
            )
          )}
          </Suspense>
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
          setActiveAdminSection(section);
          if (currentView !== 'admin') handleSelectView('admin');
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

      {/* Workspace Create/Edit Modal */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleSaveWorkspace}
        workspaceToEdit={workspaceToEdit}
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

