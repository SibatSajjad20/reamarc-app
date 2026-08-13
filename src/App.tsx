import { useState, useEffect } from 'react';
import type { ViewType, Workspace, ThemeMode } from './types';
import { Sidebar } from './components/Sidebar';
import { PerformanceMarketing } from './components/views/PerformanceMarketing';
import { AdminPanel } from './components/admin/AdminPanel';
import { DailyLogView } from './components/views/DailyLogView';
import { WorkspaceModal } from './components/modals/WorkspaceModal';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { ClientPortal } from './components/portal/ClientPortal';
import { useWorkspaces } from './hooks/useWorkspaces';
import { Sparkles } from 'lucide-react';

function AppInner() {
  const { addToast } = useToast();
  const { user, logout, setActiveWorkspaceId, isLoading: isAuthLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = localStorage.getItem('reamarc_active_view') as ViewType;
    return saved && ['marketing', 'admin', 'daily-log'].includes(saved)
      ? saved
      : 'marketing';
  });

  // Route guard effect to enforce V1.0 module boundaries & URL path redirects
  useEffect(() => {
    if (!user) return;

    const enforceRouteLockdown = () => {
      const pathname = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
      const hash = window.location.hash.toLowerCase().replace(/^#\/*/, '');
      const currentPath = pathname || hash;

      const nonV1Routes = ['dashboard', 'matrix', 'inbox', 'campaigns', 'knowledge', 'obsidian', 'settings'];

      if (nonV1Routes.includes(currentPath)) {
        window.history.replaceState(null, '', '/marketing');
        setCurrentView('marketing');
        localStorage.setItem('reamarc_active_view', 'marketing');
      } else if (currentPath === 'admin') {
        if (user.role === 'admin') {
          setCurrentView('admin');
          localStorage.setItem('reamarc_active_view', 'admin');
        } else {
          window.history.replaceState(null, '', '/marketing');
          setCurrentView('marketing');
          localStorage.setItem('reamarc_active_view', 'marketing');
        }
      } else if (currentPath === 'daily-log' || currentPath === 'daily_log') {
        setCurrentView('daily-log');
        localStorage.setItem('reamarc_active_view', 'daily-log');
      } else if (currentPath === 'marketing') {
        setCurrentView('marketing');
        localStorage.setItem('reamarc_active_view', 'marketing');
      }
    };

    enforceRouteLockdown();
    window.addEventListener('popstate', enforceRouteLockdown);
    return () => window.removeEventListener('popstate', enforceRouteLockdown);
  }, [user]);

  const handleSelectView = (view: ViewType) => {
    const allowedViews: ViewType[] = user?.role === 'admin'
      ? ['marketing', 'daily-log', 'admin']
      : ['marketing', 'daily-log'];
    const targetView = allowedViews.includes(view) ? view : 'marketing';

    try {
      window.history.pushState(null, '', `/${targetView}`);
    } catch (e) {
      // Fallback if browser history pushState fails
    }

    setCurrentView(targetView);
    localStorage.setItem('reamarc_active_view', targetView);
  };

  const {
    workspaces,
    selectedWorkspace,
    setSelectedWorkspace,
    saveWorkspace,
  } = useWorkspaces(Boolean(user));

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
  const handleOpenCreateWorkspace = () => {
    setWorkspaceToEdit(null);
    setIsWorkspaceModalOpen(true);
  };

  const handleSaveWorkspace = async (data: { name: string; initials?: string; brandColor?: string; industry?: string }) => {
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

  const handleSelectWorkspace = (workspace: Workspace | null) => {
    setSelectedWorkspace(workspace);
    setActiveWorkspaceId(workspace?.id || null);
    if (workspace) {
      addToast('Workspace Switched', `Showing active context for ${workspace.name}`, 'info');
    } else {
      addToast('Workspace Filter Cleared', 'Showing all account tasks & campaigns.', 'info');
    }
  };

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

  // Client role — isolated portal, no internal app access
  if (user.role === 'client') {
    return <ClientPortal />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 overflow-hidden antialiased">
      {/* Persistent Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onAddWorkspace={handleOpenCreateWorkspace}
      />

      {/* Main View Display Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-50 dark:bg-[#0f1117]">
        {currentView === 'marketing' && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
            <PerformanceMarketing
              selectedWorkspace={selectedWorkspace}
              workspaces={workspaces}
            />
          </div>
        )}

        {currentView === 'daily-log' && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
            <DailyLogView />
          </div>
        )}

        {currentView === 'admin' && user?.role === 'admin' && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 view-enter">
            <AdminPanel />
          </div>
        )}

        {currentView !== 'marketing' && currentView !== 'admin' && currentView !== 'daily-log' && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
            <PerformanceMarketing
              selectedWorkspace={selectedWorkspace}
              workspaces={workspaces}
            />
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
