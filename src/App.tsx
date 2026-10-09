import { useState, useEffect, useCallback } from 'react';
import type { ViewType, Workspace, ThemeMode, ThemePreference } from './types';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/views/DashboardView';
import { PerformanceMarketing } from './components/views/PerformanceMarketing';
import { AdminPanel } from './components/admin/AdminPanel';
import { DailyLogView } from './components/views/DailyLogView';
import { ExceptionInboxView } from './components/views/ExceptionInboxView';
import { AttendanceView } from './components/views/AttendanceView';
import { WorkspaceModal } from './components/modals/WorkspaceModal';
import { SettingsView } from './components/settings/SettingsView';
import { ActiveClientsView } from './components/views/ActiveClientsView';
import { CrmView } from './components/views/CrmView';
import { ContentCalendarView } from './components/views/ContentCalendarView';
import { WebsitePipelineView } from './components/views/WebsitePipelineView';
import { ClientPortalContainer } from './components/portal/ClientPortalContainer';
import type { CrmSubSection } from './types/crm';
import type { AttendanceSubSection } from './types/attendance';
import type { AdminSectionType } from './types/admin';
import type { SettingsSectionSlug } from './types/settings';
import { isSettingsSectionAllowed } from './utils/settingsAccess';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModuleLoadGateProvider, useModuleLoadBlocked } from './context/ModuleLoadGate';
import { AuthScreen } from './components/auth/AuthScreen';
import { useWorkspaces } from './hooks/useWorkspaces';
import { canAccessCrm, canAssignCrmLeads } from './utils/crmAccess';
import { canAccessContentCalendar } from './utils/contentCalendarAccess';
import { canAccessWebsitePipeline } from './utils/websiteProjectAccess';
import { viewFromNotificationPath } from './utils/notificationRoute';
import { showDesktopPopup } from './services/webPushService';
import { useAdAccounts } from './hooks/useAdAccounts';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { PublicSchedulerView } from './components/views/PublicSchedulerView';
import { PublicClientReviewView } from './components/views/PublicClientReviewView';
import { NotificationPromptBanner } from './components/NotificationPromptBanner';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/layout/CommandPalette';
import { ShortcutsDialog } from './components/layout/ShortcutsDialog';
import { BreadcrumbProvider } from './components/layout/BreadcrumbContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

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

  const deptLower = (user?.department || '').toLowerCase().trim();
  const isMarketingOrSEO = deptLower === 'seo' || deptLower === 'performance marketing';
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';
  const isLead = user?.role === 'team_lead';

  const canSeeMarketing =
    isAdmin ||
    ((user?.role === 'team_lead' || user?.role === 'team_member') && isMarketingOrSEO);

  const canSeeAdmin = isAdmin || isHR || isOperations;
  const canSeeExceptions = user?.role === 'team_lead' || isHR;
  const canSeeActiveClients = isLead || isHR || isAdmin || isOperations;
  const canSeeCrm = canAccessCrm(user);
  const canSeeContentCalendar = canAccessContentCalendar(user);
  const canSeeWebsitePipeline = canAccessWebsitePipeline(user);
  const canAssign = canAssignCrmLeads(user);
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
    'content-calendar',
    'website-pipeline',
    'portal',
    'settings',
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
      } else if (currentPath === 'admin') {
        if (canSeeAdmin) {
          setCurrentView('admin');
          localStorage.setItem('reamarc_active_view', 'admin');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
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
      } else if (currentPath === 'attendance') {
        if (isClient) {
          window.history.replaceState(null, '', '/portal');
          setCurrentView('portal');
          localStorage.setItem('reamarc_active_view', 'portal');
        } else {
          setCurrentView('attendance');
          localStorage.setItem('reamarc_active_view', 'attendance');
        }
      } else if (currentPath === 'daily-log' || currentPath === 'daily_log') {
        if (isClient) {
          window.history.replaceState(null, '', '/portal');
          setCurrentView('portal');
          localStorage.setItem('reamarc_active_view', 'portal');
        } else {
          setCurrentView('daily-log');
          localStorage.setItem('reamarc_active_view', 'daily-log');
        }
      } else if (currentPath === 'active-clients' || currentPath === 'active_clients' || currentPath === 'clients') {
        if (canSeeActiveClients) {
          setCurrentView('active-clients');
          localStorage.setItem('reamarc_active_view', 'active-clients');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'crm' || currentPath === 'leads') {
        if (canSeeCrm) {
          setCurrentView('crm');
          localStorage.setItem('reamarc_active_view', 'crm');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'exceptions') {
        if (canSeeExceptions) {
          setCurrentView('exceptions');
          localStorage.setItem('reamarc_active_view', 'exceptions');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'content-calendar' || currentPath === 'calendar' || currentPath === 'content_calendar') {
        if (canSeeContentCalendar) {
          setCurrentView('content-calendar');
          localStorage.setItem('reamarc_active_view', 'content-calendar');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'website-pipeline' || currentPath === 'website_pipeline' || currentPath === 'website') {
        if (canSeeWebsitePipeline) {
          setCurrentView('website-pipeline');
          localStorage.setItem('reamarc_active_view', 'website-pipeline');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else if (currentPath === 'marketing') {
        if (isClient) {
          window.history.replaceState(null, '', '/portal');
          setCurrentView('portal');
          localStorage.setItem('reamarc_active_view', 'portal');
        } else if (canSeeMarketing) {
          setCurrentView('marketing');
          localStorage.setItem('reamarc_active_view', 'marketing');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
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
  }, [user, canSeeAdmin, canSeeMarketing, canSeeExceptions, canSeeActiveClients, canSeeCrm, canSeeContentCalendar, isClient, isAdmin, getDefaultViewForUser]);

  const handleSelectView = (view: ViewType) => {
    let allowedViews: ViewType[] = [];
    if (!isClient) {
      allowedViews.push('dashboard');
    }
    if (isClient) allowedViews.push('portal');
    if (canSeeActiveClients) allowedViews.push('active-clients');
    if (canSeeCrm) allowedViews.push('crm');
    if (canSeeContentCalendar) allowedViews.push('content-calendar');
    if (canSeeWebsitePipeline) allowedViews.push('website-pipeline');
    if (!isClient) {
      allowedViews.push('attendance');
      allowedViews.push('daily-log');
    }
    if (canSeeExceptions) allowedViews.push('exceptions');
    if (canSeeMarketing) allowedViews.push('marketing');
    if (canSeeAdmin) allowedViews.push('admin');
    allowedViews.push('settings');

    const targetView = allowedViews.includes(view) ? view : getDefaultViewForUser();

    if (targetView !== 'settings') {
      setLastNonSettingsView(targetView);
    }

    try {
      if (targetView === 'settings') {
        window.history.pushState(null, '', `/settings/${activeSettingsSection || 'profile'}`);
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
  } = useAdAccounts(Boolean(user));

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
    return <PublicSchedulerView theme={theme} />;
  }

  const isPublicReview =
    currentPathLower.startsWith('/review') ||
    currentPathLower.startsWith('/client-review');

  if (isPublicReview) {
    return <PublicClientReviewView theme={theme} />;
  }

  if (isAuthLoading) {
    return <LoadingScreen fullScreen message="Checking your session…" title="Reamarc" />;
  }

  if (!user) {
    return <AuthScreen />;
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
                handleSelectView('crm');
              }
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance');
              }
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin');
              }
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline');
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
                handleSelectView('crm');
              }
              setIsMobileNavOpen(false);
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance');
              }
              setIsMobileNavOpen(false);
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin');
              }
              setIsMobileNavOpen(false);
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline');
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
                handleSelectView('crm');
              }
            }}
            activeAttendanceSection={activeAttendanceSection}
            onSelectAttendanceSection={(section) => {
              setActiveAttendanceSection(section);
              if (currentView !== 'attendance') {
                handleSelectView('attendance');
              }
            }}
            activeAdminSection={activeAdminSection}
            onSelectAdminSection={(section) => {
              setActiveAdminSection(section);
              if (currentView !== 'admin') {
                handleSelectView('admin');
              }
            }}
            activeWebsiteSection={activeWebsiteSection}
            onSelectWebsiteSection={(section) => {
              setActiveWebsiteSection(section);
              if (currentView !== 'website-pipeline') {
                handleSelectView('website-pipeline');
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

          {currentView === 'active-clients' && canSeeActiveClients && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ActiveClientsView workspaces={workspaces} adAccounts={adAccounts} />
            </div>
          )}

          {currentView === 'crm' && canSeeCrm && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <CrmView
                activeSection={activeCrmSection}
                onSectionChange={setActiveCrmSection}
              />
            </div>
          )}

          {currentView === 'portal' && isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ClientPortalContainer
                activeTab={activePortalTab}
                onTabChange={setActivePortalTab}
              />
            </div>
          )}

          {currentView === 'marketing' && canSeeMarketing && !isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <PerformanceMarketing
                selectedWorkspace={selectedAdAccount}
                adAccounts={adAccounts}
                workspaces={workspaces}
                onSelectWorkspace={handleSelectAdAccount}
                onOpenCreateAccount={handleOpenCreateWorkspace}
              />
            </div>
          )}

          {currentView === 'attendance' && !isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <AttendanceView
                activeSection={activeAttendanceSection}
                onSectionChange={setActiveAttendanceSection}
              />
            </div>
          )}

          {currentView === 'daily-log' && !isClient && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <DailyLogView />
            </div>
          )}

          {currentView === 'content-calendar' && canSeeContentCalendar && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ContentCalendarView />
            </div>
          )}

          {currentView === 'website-pipeline' && canSeeWebsitePipeline && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <WebsitePipelineView
                workspaces={workspaces}
                activeSection={activeWebsiteSection}
                onSectionChange={setActiveWebsiteSection}
              />
            </div>
          )}

          {currentView === 'exceptions' && canSeeExceptions && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <ExceptionInboxView onOpenDailyLog={() => handleSelectView('daily-log')} />
            </div>
          )}

          {currentView === 'admin' && canSeeAdmin && (
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
              <AdminPanel
                activeSection={activeAdminSection}
                onSectionChange={setActiveAdminSection}
              />
            </div>
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
        canSeeMarketing={canSeeMarketing}
        canSeeContentCalendar={canSeeContentCalendar}
        canSeeWebsitePipeline={canSeeWebsitePipeline}
        canSeeAttendance={!isClient}
        canSeeDailyLog={!isClient}
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
        <ModuleLoadGateProvider>
          <BreadcrumbProvider>
            <AppInner />
          </BreadcrumbProvider>
        </ModuleLoadGateProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

