import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LayoutGrid,
  CheckSquare,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CustomSelect } from '../ui/CustomSelect';
import { ErrorState } from '../ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { websiteProjectService } from '../../services/websiteProjectService';
import { canManageWebsiteProject } from '../../utils/websiteProjectAccess';
import type { Workspace } from '../../types';
import type {
  WebsiteProject,
  WebsiteTask,
  WebsiteSummaryMetrics,
  TaskStatus,
} from '../../types/websiteProject';
import {
  WEBSITE_STAGES_CONFIG,
} from '../../types/websiteProject';
import {
  WebsitePipelineBoard,
  WebsitePipelineBoardSkeleton,
} from '../website-pipeline/WebsitePipelineBoard';
import {
  WebsiteTaskBoard,
  WebsiteTaskBoardSkeleton,
} from '../website-pipeline/WebsiteTaskBoard';
import { WebsiteProjectDrawer } from '../website-pipeline/WebsiteProjectDrawer';
import { WebsiteCreateProjectModal } from '../website-pipeline/WebsiteCreateProjectModal';
import { WebsiteTaskModal } from '../website-pipeline/WebsiteTaskModal';

export interface WebsitePipelineViewProps {
  workspaces?: Workspace[];
  activeSection?: string;
  onSectionChange?: (section: any) => void;
}

export const WebsitePipelineView: React.FC<WebsitePipelineViewProps> = ({
  workspaces = [],
  activeSection,
  onSectionChange,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // View mode: 'board' | 'tasks'
  const [viewMode, setViewMode] = useState<'board' | 'tasks'>(() => {
    if (activeSection === 'tasks') return 'tasks';
    return 'board';
  });

  useEffect(() => {
    if (activeSection === 'tasks') {
      setViewMode('tasks');
    } else if (activeSection === 'board' || activeSection === 'table') {
      setViewMode('board');
    }
  }, [activeSection]);

  const handleViewModeChange = (mode: string) => {
    const nextMode = mode === 'tasks' ? 'tasks' : 'board';
    setViewMode(nextMode);
    onSectionChange?.(nextMode);
  };

  // Data states
  const cachedProjects = websiteProjectService.getCachedProjects();
  const cachedTasks = websiteProjectService.getCachedTasks();
  const hasCache = Boolean(cachedProjects || cachedTasks);

  const [projects, setProjects] = useState<WebsiteProject[]>(() => cachedProjects?.data?.items || []);
  const [tasks, setTasks] = useState<WebsiteTask[]>(() => cachedTasks?.data || []);
  const [, setMetrics] = useState<WebsiteSummaryMetrics | null>(null);
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; name: string; full_name?: string; email?: string; role?: string; department?: string }>
  >([]);

  const [isLoading, setIsLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);
  const [isGateReady, setIsGateReady] = useState(hasCache);
  useModuleLoadGate(!isGateReady);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedHealth, setSelectedHealth] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'active' | 'live' | 'archived'>('all');

  // Modals & Drawer
  const [selectedProject, setSelectedProject] = useState<WebsiteProject | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<WebsiteTask | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialStatus, setTaskModalInitialStatus] = useState<TaskStatus | undefined>(undefined);

  // Data loading
  const loadAllData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !websiteProjectService.getCachedProjects()) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [pRes, tRes, mRes, tmRes] = await Promise.allSettled([
        websiteProjectService.getProjects(),
        websiteProjectService.getAllTasks(),
        websiteProjectService.getSummaryMetrics(),
        websiteProjectService.getTeamMembers(),
      ]);

      if (pRes.status === 'fulfilled') {
        setProjects(pRes.value.items || []);
      } else {
        throw new Error(pRes.reason?.message || 'Failed to load website projects');
      }

      if (tRes.status === 'fulfilled') {
        setTasks(tRes.value || []);
      }

      if (mRes.status === 'fulfilled') {
        setMetrics(mRes.value);
      }

      if (tmRes.status === 'fulfilled') {
        setTeamMembers(tmRes.value || []);
      }
    } catch (err: any) {
      if (!websiteProjectService.getCachedProjects()) {
        setError(err?.message || 'Failed to load website pipeline');
      }
    } finally {
      setIsLoading(false);
      setIsGateReady(true);
    }
  }, []);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  useCacheInvalidation(['website-pipeline'], () => {
    void loadAllData({ silent: true });
  });

  // Permissions
  const canManage = useMemo(() => canManageWebsiteProject(user), [user]);

  // Filtering
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesClient = p.client_name?.toLowerCase().includes(q);
        const matchesDesc = p.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesClient && !matchesDesc) return false;
      }

      // Stage
      if (selectedStage !== 'all' && p.stage !== selectedStage) {
        return false;
      }

      // Health
      if (selectedHealth !== 'all' && p.health !== selectedHealth) {
        return false;
      }

      // Category
      if (selectedCategory === 'active') {
        if (p.stage === 'completed' || Boolean(p.live_url)) return false;
      } else if (selectedCategory === 'live') {
        if (!p.live_url && p.stage !== 'production') return false;
      } else if (selectedCategory === 'archived') {
        if (p.stage !== 'completed') return false;
      }

      return true;
    });
  }, [projects, searchQuery, selectedStage, selectedHealth, selectedCategory]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        const matchesProject = t.project_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesProject) return false;
      }

      if (selectedStage !== 'all' && t.stage !== selectedStage) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, selectedStage]);

  const hasActiveFilters = searchQuery || selectedStage !== 'all' || selectedHealth !== 'all' || selectedCategory !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStage('all');
    setSelectedHealth('all');
    setSelectedCategory('all');
  };

  // Task status drag/change mutation
  const handleUpdateTaskStatus = async (task: WebsiteTask, newStatus: TaskStatus) => {
    const previousTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    try {
      await websiteProjectService.updateTask(task.project_id, task.id, { status: newStatus });
      addToast('Task Updated', `Moved to ${newStatus.replace('_', ' ')}.`, 'success');
    } catch (err: any) {
      setTasks(previousTasks);
      addToast('Update Failed', err?.message || 'Could not update task status', 'error');
    }
  };

  // Open Drawer for a project
  const handleSelectProject = (project: WebsiteProject) => {
    setSelectedProject(project);
    setIsDrawerOpen(true);
  };

  // Open Task Modal
  const handleSelectTask = (task: WebsiteTask) => {
    const parentProj = projects.find((p) => p.id === task.project_id) || projects[0];
    if (!parentProj) return;
    setSelectedProject(parentProj);
    setSelectedTask(task);
    setTaskModalInitialStatus(undefined);
    setIsTaskModalOpen(true);
  };

  const handleCreateTaskForStatus = (status: TaskStatus) => {
    if (projects.length === 0) {
      addToast('No Projects', 'Create a website project first before adding tasks.', 'warning');
      return;
    }
    setSelectedTask(null);
    setTaskModalInitialStatus(status);
    setSelectedProject(projects[0]);
    setIsTaskModalOpen(true);
  };

  // Options for filter selects
  const stageOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Stages' },
      ...WEBSITE_STAGES_CONFIG.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, []);

  const healthOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Health' },
      { value: 'on_track', label: 'On Track' },
      { value: 'waiting_on_client', label: 'Waiting on Client' },
      { value: 'on_hold', label: 'On Hold' },
      { value: 'at_risk', label: 'At Risk' },
      { value: 'completed', label: 'Completed' },
    ];
  }, []);

  const categoryOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Categories' },
      { value: 'active', label: 'Active Projects' },
      { value: 'live', label: 'Live Projects' },
      { value: 'archived', label: 'Archived / Done' },
    ];
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas overflow-hidden">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Website Pipeline
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-subtle text-fg-muted font-numeric">
              {projects.length}
            </span>
          </span>
        }
        description="Delivery stages, client review gates, and production tasks for web projects."
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={viewMode}
              onValueChange={handleViewModeChange}
              options={[
                { value: 'board', label: 'Pipeline Board', icon: LayoutGrid },
                { value: 'tasks', label: 'Task Board', icon: CheckSquare },
              ]}
              size="default"
            />
            {canManage && (
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsCreateProjectOpen(true)}
                icon={Plus}
              >
                New Project
              </Button>
            )}
            {viewMode === 'tasks' && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => handleCreateTaskForStatus('todo')}
                icon={Plus}
              >
                New Task
              </Button>
            )}
          </div>
        }
      />

      {/* Toolbar / Filters */}
      <div className="px-6 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-2.5 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={viewMode === 'board' ? 'Search projects or clients…' : 'Search tasks…'}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-subtle border border-border text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="w-44">
          <CustomSelect
            value={selectedStage}
            onChange={setSelectedStage}
            options={stageOptions}
            placeholder="Filter stage…"
            size="sm"
          />
        </div>

        {viewMode === 'board' && (
          <>
            <div className="w-40">
              <CustomSelect
                value={selectedHealth}
                onChange={setSelectedHealth}
                options={healthOptions}
                placeholder="Filter health…"
                size="sm"
              />
            </div>
            <div className="w-40">
              <CustomSelect
                value={selectedCategory}
                onChange={(v) => setSelectedCategory(v as any)}
                options={categoryOptions}
                placeholder="Filter status…"
                size="sm"
              />
            </div>
          </>
        )}

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs text-fg-muted hover:text-fg h-8"
            icon={X}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isLoading && projects.length === 0 ? (
          viewMode === 'board' ? (
            <WebsitePipelineBoardSkeleton />
          ) : (
            <WebsiteTaskBoardSkeleton />
          )
        ) : error && projects.length === 0 ? (
          <div className="p-8 flex items-center justify-center flex-1">
            <ErrorState
              title="Failed to load website pipeline"
              message={error}
              onRetry={loadAllData}
              retryLabel="Retry loading"
            />
          </div>
        ) : viewMode === 'board' ? (
          <WebsitePipelineBoard
            projects={filteredProjects}
            onSelectProject={handleSelectProject}
            onRefresh={loadAllData}
          />
        ) : (
          <WebsiteTaskBoard
            tasks={filteredTasks}
            projects={projects}
            onSelectTask={handleSelectTask}
            onRefresh={loadAllData}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onCreateTaskForStatus={handleCreateTaskForStatus}
          />
        )}
      </div>

      {/* Modals & Drawers */}
      {selectedProject && (
        <WebsiteProjectDrawer
          project={selectedProject}
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedProject(null);
          }}
          onRefresh={loadAllData}
          onProjectUpdated={(updated) => {
            setSelectedProject(updated);
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
          workspaces={workspaces}
        />
      )}

      {isCreateProjectOpen && (
        <WebsiteCreateProjectModal
          isOpen={isCreateProjectOpen}
          onClose={() => setIsCreateProjectOpen(false)}
          onCreated={() => {
            setIsCreateProjectOpen(false);
            void loadAllData();
          }}
          workspaces={workspaces}
        />
      )}

      {isTaskModalOpen && selectedProject && (
        <WebsiteTaskModal
          task={selectedTask}
          project={selectedProject}
          availableProjects={projects}
          initialStatus={taskModalInitialStatus}
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setSelectedTask(null);
          }}
          teamMembers={teamMembers}
          canManage={canManage}
          onTaskCreated={() => {
            setIsTaskModalOpen(false);
            void loadAllData();
          }}
          onUpdateTask={() => {
            setIsTaskModalOpen(false);
            void loadAllData();
          }}
          onDeleteTask={() => {
            setIsTaskModalOpen(false);
            void loadAllData();
          }}
        />
      )}
    </div>
  );
};
