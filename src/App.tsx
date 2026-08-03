import { useState, useEffect, useMemo } from 'react';
import type { ViewType, Workspace, InboxTask, Campaign, KnowledgeSource, ThemeMode } from './types';
import { Sidebar } from './components/Sidebar';
import { ApprovalInbox } from './components/views/ApprovalInbox';
import { CampaignManager } from './components/views/CampaignManager';
import { KnowledgeBase } from './components/views/KnowledgeBase';
import { SettingsView } from './components/views/SettingsView';
import { WorkspaceModal } from './components/modals/WorkspaceModal';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { workspaceService } from './services/workspaceService';
import { campaignService } from './services/campaignService';
import { postService } from './services/postService';
import { knowledgeService } from './services/knowledgeService';
import { Sparkles } from 'lucide-react';

function AppInner() {
  const { addToast } = useToast();
  const { user, logout, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('inbox');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);

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

  const handleSetTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  const [inboxTasks, setInboxTasks] = useState<InboxTask[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);

  // Fetch workspaces
  const refreshWorkspaces = async () => {
    if (!user) return;
    try {
      const liveWs = await workspaceService.getWorkspaces();
      setWorkspaces(liveWs || []);
    } catch {
      setWorkspaces([]);
    }
  };

  // Fetch live backend database data
  const refreshBackendData = async () => {
    if (!user) return;
    try {
      const livePosts = await postService.getInboxTasks(selectedWorkspace?.id);
      setInboxTasks(livePosts || []);
    } catch {
      setInboxTasks([]);
    }

    try {
      const liveCampaigns = await campaignService.getCampaigns(selectedWorkspace?.id);
      setCampaigns(liveCampaigns || []);
    } catch {
      setCampaigns([]);
    }

    try {
      const liveKnowledge = await knowledgeService.getKnowledgeSources(selectedWorkspace?.id);
      setKnowledgeSources(liveKnowledge || []);
    } catch {
      setKnowledgeSources([]);
    }
  };

  useEffect(() => {
    if (user) {
      refreshWorkspaces();
      refreshBackendData();
    }
  }, [selectedWorkspace, user]);

  // Workspace CRUD Handlers
  const handleOpenCreateWorkspace = () => {
    setWorkspaceToEdit(null);
    setIsWorkspaceModalOpen(true);
  };

  const handleOpenEditWorkspace = (ws: Workspace) => {
    setWorkspaceToEdit(ws);
    setIsWorkspaceModalOpen(true);
  };

  const handleSaveWorkspace = async (data: { name: string; initials?: string; brandColor?: string; industry?: string }) => {
    if (workspaceToEdit) {
      const updated = await workspaceService.updateWorkspace(workspaceToEdit.id, data);
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      if (selectedWorkspace?.id === updated.id) {
        setSelectedWorkspace(updated);
      }
      addToast('Workspace Updated', `"${updated.name}" updated successfully.`, 'success');
    } else {
      const created = await workspaceService.createWorkspace(data);
      setWorkspaces((prev) => [...prev, created]);
      setSelectedWorkspace(created);
      addToast('Workspace Created 🎉', `Switched to new workspace "${created.name}".`, 'success');
    }
    refreshWorkspaces();
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      await workspaceService.deleteWorkspace(workspaceId);
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
      if (selectedWorkspace?.id === workspaceId) {
        setSelectedWorkspace(null);
      }
      addToast('Workspace Deleted', 'Workspace removed from account.', 'info');
      refreshBackendData();
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Could not delete workspace.', 'warning');
    }
  };

  // Approval Inbox Handlers
  const handleApproveTask = async (taskId: number | string) => {
    setInboxTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await postService.approvePost(taskId);
      addToast(
        'Content Approved! 🚀',
        'Post has been queued for auto-publishing.',
        'success'
      );
    } catch {
      addToast('Approval Failed', 'Could not sync approval with database.', 'warning');
      refreshBackendData();
    }
  };

  const handleSaveDraft = async (taskId: number | string, updatedCopy: string) => {
    setInboxTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, copy: updatedCopy, lastModified: 'Just now' }
          : task
      )
    );

    try {
      await postService.saveDraft(taskId, updatedCopy);
      addToast(
        'Draft Updated',
        'Your copy modifications were saved to database.',
        'info'
      );
    } catch {
      addToast('Draft Save Failed', 'Could not persist modifications.', 'warning');
      refreshBackendData();
    }
  };

  const handleRegenerateFullPost = async (taskId: number | string): Promise<InboxTask | null> => {
    try {
      const res = await postService.regenerateFullPost(taskId);
      setInboxTasks((prev) =>
        prev.map((t) => (t.id === taskId ? res.post : t))
      );
      return res.post;
    } catch (err: any) {
      addToast('Regeneration Failed', err.message || 'Could not rewrite full script.', 'warning');
      return null;
    }
  };

  // Campaign Handlers
  const handleAddCampaign = async (newCampData: {
    title: string;
    targetAudience: string;
    tone: any;
    workspaceId: string;
    platforms: any[];
  }) => {
    try {
      addToast('Generating Campaign...', 'Gemini AI is crafting your 7-day strategy.', 'info');
      const created = await campaignService.createCampaign({
        title: newCampData.title,
        target_audience: newCampData.targetAudience,
        tone: newCampData.tone,
        workspace_id: newCampData.workspaceId,
        platforms: newCampData.platforms,
      });
      setCampaigns((prev) => [created, ...prev]);
      addToast('Campaign Launched! 🎉', `Strategy generated for ${created.title}`, 'success');
      refreshBackendData();
    } catch (err: any) {
      addToast('Campaign Creation Failed', err.message || 'Could not generate campaign.', 'warning');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    await campaignService.deleteCampaign(campaignId);
    setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
    refreshBackendData();
  };

  const handleUpdateCampaign = (updated: Campaign) => {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  // Knowledge Base Handlers
  const handleAddKnowledgeSource = async (newSourceData: {
    name: string;
    type: 'pdf' | 'url';
    sizeOrTokens: string;
    workspaceId: string;
  }) => {
    try {
      const created = await knowledgeService.createKnowledgeSource({
        name: newSourceData.name,
        type: newSourceData.type,
        sizeOrTokens: newSourceData.sizeOrTokens,
        workspaceId: newSourceData.workspaceId,
      });

      setKnowledgeSources((prev) => [created, ...prev]);
      addToast(
        'Knowledge Asset Indexed',
        `'${created.name}' has been parsed for AI context.`,
        'success'
      );
    } catch {
      addToast('Indexing Failed', 'Could not store knowledge asset.', 'warning');
    }
  };

  const handleDeleteKnowledgeSource = async (id: string) => {
    setKnowledgeSources((prev) => prev.filter((s) => s.id !== id));
    try {
      await knowledgeService.deleteKnowledgeSource(id);
      addToast('Source Removed', 'Asset removed from active RAG pipeline.', 'info');
    } catch {
      addToast('Deletion Failed', 'Could not remove source from database.', 'warning');
      refreshBackendData();
    }
  };

  // Workspace Switching
  const handleSelectWorkspace = (workspace: Workspace | null) => {
    setSelectedWorkspace(workspace);
    if (workspace) {
      addToast(
        'Workspace Switched',
        `Showing active context for ${workspace.name}`,
        'info'
      );
    } else {
      addToast('Workspace Filter Cleared', 'Showing all account tasks & campaigns.', 'info');
    }
  };

  const handleSignOut = () => {
    logout();
    addToast('Signed Out', 'You have been safely signed out of Reamarc AI.', 'warning');
  };

  const activePendingCount = useMemo(() => {
    return selectedWorkspace
      ? inboxTasks.filter((t) => t.workspaceId === selectedWorkspace.id).length
      : inboxTasks.length;
  }, [inboxTasks, selectedWorkspace]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 space-y-4 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 animate-pulse">
          <Sparkles className="w-6 h-6 text-white animate-spin" />
        </div>
        <p className="text-xs font-semibold text-zinc-400">Verifying Reamarc AI session...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden antialiased">
      {/* Persistent Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        pendingCount={activePendingCount}
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onAddWorkspace={handleOpenCreateWorkspace}
      />

      {/* Main View Display Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
        {currentView === 'inbox' && (
          <ApprovalInbox
            tasks={inboxTasks}
            onApproveTask={handleApproveTask}
            onSaveDraft={handleSaveDraft}
            onRegenerateFullPost={handleRegenerateFullPost}
            selectedWorkspace={selectedWorkspace}
          />
        )}

        {currentView === 'campaigns' && (
          <CampaignManager
            campaigns={campaigns}
            onAddCampaign={handleAddCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            selectedWorkspace={selectedWorkspace}
          />
        )}

        {currentView === 'knowledge' && (
          <KnowledgeBase
            sources={knowledgeSources}
            onAddSource={handleAddKnowledgeSource}
            onDeleteSource={handleDeleteKnowledgeSource}
            selectedWorkspace={selectedWorkspace}
          />
        )}

        {currentView === 'settings' && (
          <SettingsView
            selectedWorkspace={selectedWorkspace}
            workspaces={workspaces}
            theme={theme}
            onSetTheme={handleSetTheme}
            onAddWorkspace={handleOpenCreateWorkspace}
            onEditWorkspace={handleOpenEditWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
          />
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
