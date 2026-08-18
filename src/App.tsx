import { useState, useEffect, useCallback } from 'react';
import type { ViewType, Workspace, ThemeMode } from './types';
import { Sidebar } from './components/Sidebar';
import { PerformanceMarketing } from './components/views/PerformanceMarketing';
import { AdminPanel } from './components/admin/AdminPanel';
import { DailyLogView } from './components/views/DailyLogView';
import { WorkspaceModal } from './components/modals/WorkspaceModal';
import { ProfileSettingsModal } from './components/modals/ProfileSettingsModal';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { useWorkspaces } from './hooks/useWorkspaces';
import { useAdAccounts } from './hooks/useAdAccounts';
import { Sparkles } from 'lucide-react';

function AppInner() {
  const { addToast } = useToast();
  const { user, logout, setActiveWorkspaceId, isLoading: isAuthLoading } = useAuth();

  const deptLower = (user?.department || '').toLowerCase().trim();
  const isMarketingOrSEO = deptLower === 'seo' || deptLower === 'performance marketing';
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';

  const canSeeMarketing =
    isAdmin ||
    isClient ||
    ((user?.role === 'team_lead' || user?.role === 'team_member') && isMarketingOrSEO);

  const canSeeAdmin = isAdmin || isHR || isOperations;

  const getDefaultViewForUser = useCallback((): ViewType => {
    if (isClient) return 'marketing';
    if (canSeeMarketing) return 'marketing';
    if (canSeeAdmin) return 'admin';
    return 'daily-log';
  }, [isClient, canSeeMarketing, canSeeAdmin]);

  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = localStorage.getItem('reamarc_active_view') as ViewType;
    return saved && ['marketing', 'admin', 'daily-log'].includes(saved)
      ? saved
      : 'daily-log';
  });

  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);

  // Route guard effect to enforce V1.0 module boundaries & URL path redirects
  useEffect(() => {
    if (!user) return;

    const enforceRouteLockdown = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
      const hash = window.location.hash.toLowerCase().replace(/^#\/*/, '');
      const currentPath = pathname || hash;

      const nonV1Routes = ['dashboard', 'matrix', 'inbox', 'campaigns', 'knowledge', 'obsidian', 'settings'];

      if (nonV1Routes.includes(currentPath)) {
        const fallback = getDefaultViewForUser();
        window.history.replaceState(null, '', `/${fallback}`);
        setCurrentView(fallback);
        localStorage.setItem('reamarc_active_view', fallback);
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
      } else if (currentPath === 'daily-log' || currentPath === 'daily_log') {
        if (isClient) {
          window.history.replaceState(null, '', '/marketing');
          setCurrentView('marketing');
          localStorage.setItem('reamarc_active_view', 'marketing');
        } else {
          setCurrentView('daily-log');
          localStorage.setItem('reamarc_active_view', 'daily-log');
        }
      } else if (currentPath === 'marketing') {
        if (canSeeMarketing) {
          setCurrentView('marketing');
          localStorage.setItem('reamarc_active_view', 'marketing');
        } else {
          const fallback = getDefaultViewForUser();
          window.history.replaceState(null, '', `/${fallback}`);
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      } else {
        // Root / or unknown path
        const currentSaved = localStorage.getItem('reamarc_active_view') as ViewType;
        if (currentSaved === 'marketing' && !canSeeMarketing) {
          const fallback = getDefaultViewForUser();
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        } else if (currentSaved === 'admin' && !canSeeAdmin) {
          const fallback = getDefaultViewForUser();
          setCurrentView(fallback);
          localStorage.setItem('reamarc_active_view', fallback);
        }
      }
    };

    enforceRouteLockdown();
    window.addEventListener('popstate', enforceRouteLockdown);
    return () => window.removeEventListener('popstate', enforceRouteLockdown);
  }, [user, canSeeAdmin, canSeeMarketing, isClient, getDefaultViewForUser]);

  const handleSelectView = (view: ViewType) => {
    let allowedViews: ViewType[] = [];
    if (canSeeMarketing) allowedViews.push('marketing');
    if (!isClient) allowedViews.push('daily-log');
    if (canSeeAdmin) allowedViews.push('admin');

    const targetView = allowedViews.includes(view) ? view : getDefaultViewForUser();

    try {
      window.history.pushState(null, '', `/${targetView}`);
    } catch (e) {
      // Fallback
    }

    setCurrentView(targetView);
    localStorage.setItem('reamarc_active_view', targetView);
  };

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

  // Theme Mode State ('dark' | 'light')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('reamarc-theme') as ThemeMode;
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(theme);
    localStorage.setItem('reamarc-theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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
        addToast('Workspace Created 🎉', `Switched to new workspace "${res.workspace.name}".`, 'success');
      } else {
        addToast('Workspace Updated', `"${res.workspace.name}" updated successfully.`, 'success');
      }
    } catch (err: any) {
      addToast('Workspace Save Failed', err.message || 'Could not save workspace.', 'warning');
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
    addToast('Signed Out', 'You have been safely signed out of Reamarc AI.', 'warning');
  };

  if (isAuthLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 space-y-4 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 animate-pulse">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-slate-900 dark:text-zinc-200">Reamarc AI</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 overflow-hidden antialiased">
      {/* Persistent Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenProfileSettings={() => setIsProfileSettingsOpen(true)}
      />

      {/* Main View Display Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-50 dark:bg-[#0f1117]">
        {currentView === 'marketing' && canSeeMarketing && (
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

        {currentView === 'daily-log' && !isClient && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
            <DailyLogView />
          </div>
        )}

        {currentView === 'admin' && canSeeAdmin && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 view-enter">
            <AdminPanel />
          </div>
        )}
      </main>

      {/* Workspace Create/Edit Modal */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleSaveWorkspace}
        workspaceToEdit={workspaceToEdit}
      />

      {/* Self-service Profile & Password Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileSettingsOpen}
        onClose={() => setIsProfileSettingsOpen(false)}
        onSuccess={() => {
          addToast('Profile Updated', 'Your profile information and credentials were saved.', 'success');
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
