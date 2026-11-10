import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  Kanban,
  LayoutDashboard,
  List,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmProvider';
import { taskService } from '@/services/taskService';
import {
  type Task,
  type TaskActor,
  type TaskAssignableUser,
  type TaskCounts,
  type TaskFilters,
  type TaskOverview,
  type TaskSavedView,
  type TaskScope,
  type TaskStatus,
  type TaskViewMode,
} from '@/types/task';
import { TaskFiltersPopover } from '@/components/task-manager/TaskFiltersPopover';
import { TaskListView } from '@/components/task-manager/TaskListView';
import { TaskKanbanView } from '@/components/task-manager/TaskKanbanView';
import { TaskCalendarView } from '@/components/task-manager/TaskCalendarView';
import { TaskFollowUpView } from '@/components/task-manager/TaskFollowUpView';
import { TaskOverviewTab } from '@/components/task-manager/TaskOverviewTab';
import { TaskDialog } from '@/components/task-manager/TaskDialog';
import { TaskCompanyActivity } from '@/components/task-manager/TaskCompanyActivity';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useTaskCounts } from '@/hooks/useTaskCounts';
import { isAdmin } from '@/utils/taskAccess';

const SCOPE_OPTIONS: { value: TaskScope; label: string }[] = [
  { value: 'mine', label: 'My tasks' },
  { value: 'assigned_by_me', label: 'Assigned by me' },
  { value: 'created_by_me', label: 'Created by me' },
  { value: 'watching', label: 'Watching' },
  { value: 'all', label: 'All visible' },
];

function actorFromUser(user: any): TaskActor | null {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    full_name: user.full_name || user.name,
    name: user.name,
    departments: user.departments,
    primary_department: user.primary_department,
    department: user.department,
    is_active: user.is_active !== false,
  };
}

function readSection(): { view?: TaskViewMode; stage?: TaskStatus | 'all' } {
  try {
    const raw = sessionStorage.getItem('reamarc_tasks_section') || '';
    if (raw === 'follow-up') return { view: 'follow-up' };
    if (raw === 'overview') return { view: 'overview' };
    if (['todo', 'in_progress', 'in_review', 'completed'].includes(raw)) return { stage: raw as TaskStatus };
  } catch {
    /* ignore */
  }
  return {};
}

export const TaskManagerView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const actor = actorFromUser(user);
  const { workspaces } = useWorkspaces();
  const { counts: polledCounts } = useTaskCounts();

  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    try {
      const saved = localStorage.getItem('reamarc_tasks_view_mode') as TaskViewMode;
      if (saved && ['list', 'kanban', 'calendar', 'follow-up', 'overview', 'activity'].includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    const section = readSection();
    return section.view || 'list';
  });
  const [filters, setFilters] = useState<TaskFilters>(() => ({
    scope: 'all',
    stage: readSection().stage || 'all',
  }));
  const [searchInput, setSearchInput] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [overview, setOverview] = useState<TaskOverview | null>(null);
  const [followUp, setFollowUp] = useState<Record<string, Task[]> | null>(null);
  const [assignable, setAssignable] = useState<TaskAssignableUser[]>([]);
  const [savedViews, setSavedViews] = useState<TaskSavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [defaultDue, setDefaultDue] = useState<string | undefined>();
  const [focusAssignee, setFocusAssignee] = useState(false);
  const [stageCounts, setStageCounts] = useState<Partial<Record<TaskStatus, number>>>({});
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput || undefined }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, c, a, views] = await Promise.all([
        taskService.getAllTasks(filters),
        taskService.getCounts(),
        taskService.getAssignable(),
        taskService.getSavedViews().catch(() => ({ items: [] as TaskSavedView[] })),
      ]);
      setTasks(list.items || []);
      setCounts(c);
      setStageCounts(list.stage_counts || {});
      setTruncated(Boolean(list.truncated));
      setAssignable(a.items || []);
      setSavedViews(views.items || []);
      if (viewMode === 'overview') {
        setOverview(await taskService.getOverview());
      }
      if (viewMode === 'follow-up') {
        setFollowUp(await taskService.getFollowUp());
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [filters, viewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSection = () => {
      const section = readSection();
      if (section.view) {
        setViewMode(section.view);
      }
      if (section.stage) {
        setFilters((f) => ({ ...f, stage: section.stage }));
        setViewMode('list');
      }
    };
    window.addEventListener('reamarc-tasks-section', onSection);
    onSection();
    return () => window.removeEventListener('reamarc-tasks-section', onSection);
  }, []);

  useEffect(() => {
    const openStored = async () => {
      try {
        const id = sessionStorage.getItem('reamarc_open_task_id');
        if (!id) return;
        sessionStorage.removeItem('reamarc_open_task_id');
        const task = await taskService.getTask(id);
        setActiveTask(task);
        setDialogOpen(true);
      } catch {
        /* ignore */
      }
    };
    void openStored();
    const onOpen = () => void openStored();
    window.addEventListener('reamarc-open-task', onOpen);
    return () => window.removeEventListener('reamarc-open-task', onOpen);
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.department) set.add(t.department);
    for (const u of assignable) if (u.department) set.add(u.department);
    return [...set].sort();
  }, [tasks, assignable]);

  const openTask = (task: Task, opts?: { focusAssignee?: boolean }) => {
    setActiveTask(task);
    setDefaultDue(undefined);
    setFocusAssignee(Boolean(opts?.focusAssignee));
    setDialogOpen(true);
  };

  const openCreate = (due?: string) => {
    setActiveTask(null);
    setDefaultDue(due);
    setFocusAssignee(false);
    setDialogOpen(true);
  };

  const handleAction = async (task: Task, action: string) => {
    try {
      if (action === 'open') return openTask(task);
      if (action === 'start') {
        const updated = await taskService.changeStage(task.id, 'in_progress');
        setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }
      if (action === 'submit') {
        const updated = await taskService.changeStage(task.id, 'in_review');
        setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }
      if (action === 'approve') {
        const updated = await taskService.changeStage(task.id, 'completed');
        setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }
      if (action === 'reassign') {
        openTask(task, { focusAssignee: true });
        return;
      }
      if (action === 'block') {
        if (task.blocked) {
          const updated = await taskService.setBlocked(task.id, false);
          setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        } else {
          const reason = await prompt({ title: 'Mark blocked', label: 'Reason' });
          if (!reason) return;
          const updated = await taskService.setBlocked(task.id, true, reason);
          setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        }
        return;
      }
      if (action === 'cancel') {
        const reason = await prompt({ title: 'Cancel task', label: 'Reason' });
        if (!reason) return;
        const updated = await taskService.cancel(task.id, reason);
        setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }
      if (action === 'copy') {
        await navigator.clipboard.writeText(`${window.location.origin}/tasks?task=${task.id}`);
        addToast('Link copied', task.serial, 'success');
      }
    } catch (err: any) {
      addToast('Action failed', err?.message || 'Could not update task', 'error');
    }
  };

  const handleBulk = async (ids: string[], patch: { stage?: string; priority?: string; cancel?: boolean }) => {
    if (patch.cancel) {
      const ok = await confirm({ title: 'Cancel selected tasks?', confirmLabel: 'Cancel tasks', tone: 'danger' });
      if (!ok) return;
      const reason = await prompt({ title: 'Cancel reason', label: 'Reason' });
      if (!reason) return;
      await taskService.batch(ids.map((id) => ({ id, cancel: true, cancel_reason: reason })));
    } else {
      await taskService.batch(ids.map((id) => ({ id, ...patch })));
    }
    await load();
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-surface overflow-hidden select-none" data-testid="task-manager-view">
      <div className="relative z-40 bg-surface border-b border-border shadow-2xs shrink-0">
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-h1 font-semibold text-fg tracking-tight">Tasks</h1>
          <div className="flex items-center gap-2.5 flex-wrap">
            <SegmentedControl
              size="sm"
              value={viewMode}
              onValueChange={(val) => {
                const mode = val as TaskViewMode;
                setViewMode(mode);
                try {
                  localStorage.setItem('reamarc_tasks_view_mode', mode);
                } catch {
                  /* ignore */
                }
              }}
              options={[
                { value: 'list', label: 'List', icon: List },
                { value: 'kanban', label: 'Kanban', icon: Kanban },
                { value: 'calendar', label: 'Calendar', icon: Calendar },
                { value: 'follow-up', label: 'Follow-up', icon: LayoutDashboard },
                { value: 'overview', label: 'Overview', icon: LayoutDashboard },
                ...(isAdmin(actor) ? [{ value: 'activity', label: 'Activity', icon: Activity }] : []),
              ]}
            />
            <Button type="button" variant="primary" size="sm" onClick={() => openCreate()}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add task
            </Button>
          </div>
        </div>
        {viewMode !== 'overview' && (
          <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search serial or title…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-md bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
                {searchInput && (
                  <button type="button" onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <SegmentedControl
                size="sm"
                value={filters.scope || 'all'}
                onValueChange={(val) => setFilters((f) => ({ ...f, scope: val as TaskScope }))}
                options={SCOPE_OPTIONS}
              />
              <TaskFiltersPopover
                filters={filters}
                onChange={setFilters}
                assignees={assignable}
                departments={departments}
                workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
              />
              {savedViews.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant="secondary">Saved views</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {savedViews.map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        className="flex items-center justify-between gap-3"
                        onSelect={() => setFilters(v.filters || {})}
                      >
                        <span>{v.name}</span>
                        <button
                          type="button"
                          aria-label={`Delete ${v.name}`}
                          className="p-1 rounded-sm text-fg-muted hover:text-danger-fg"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const ok = await confirm({
                              title: `Delete saved view “${v.name}”?`,
                              confirmLabel: 'Delete',
                              tone: 'danger',
                            });
                            if (!ok) return;
                            await taskService.deleteSavedView(v.id);
                            await load();
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                const name = await prompt({ title: 'Save view', label: 'Name' });
                if (!name) return;
                await taskService.createSavedView({ name, view: viewMode, filters });
                addToast('View saved', name, 'success');
                await load();
              }}
            >
              Save view
            </Button>
          </div>
        )}
      </div>

      {truncated && (
        <p className="px-5 py-1.5 text-xs text-fg-muted border-b border-border bg-subtle">Showing first 2000</p>
      )}
      {error ? (
        <ErrorState title="Failed to load tasks" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-fg-muted">Loading tasks…</div>
      ) : viewMode === 'list' ? (
        <TaskListView
          tasks={tasks}
          actor={actor}
          onOpen={openTask}
          onAction={handleAction}
          onViewAll={(stage) => setFilters((f) => ({ ...f, stage }))}
          onBulk={handleBulk}
          focusedStage={filters.stage}
          stageCounts={stageCounts}
        />
      ) : viewMode === 'kanban' ? (
        <TaskKanbanView
          tasks={tasks}
          counts={polledCounts || counts}
          stageCounts={stageCounts}
          actor={actor}
          onOpen={openTask}
          onStageChange={async (task, to) => {
            const updated = await taskService.changeStage(task.id, to);
            setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      ) : viewMode === 'calendar' ? (
        <TaskCalendarView
          tasks={tasks}
          actor={actor}
          onOpen={openTask}
          onCreateForDate={(iso) => openCreate(iso)}
          onReschedule={async (task, iso) => {
            const updated = await taskService.patchTask(task.id, { due_date: iso, if_updated_at: task.updated_at });
            setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      ) : viewMode === 'follow-up' ? (
        <TaskFollowUpView tasks={tasks} buckets={followUp || undefined} actor={actor} onOpen={openTask} onAction={handleAction} />
      ) : viewMode === 'activity' && isAdmin(actor) ? (
        <TaskCompanyActivity
          actors={assignable}
          onOpenTask={async (id) => {
            try {
              const task = await taskService.getTask(id);
              openTask(task);
            } catch {
              /* ignore */
            }
          }}
        />
      ) : (
        <TaskOverviewTab
          overview={overview}
          onSelectPerson={(id) => {
            setFilters((f) => ({ ...f, assignee_id: id, scope: 'all' }));
            setViewMode('list');
          }}
        />
      )}

      <TaskDialog
        open={dialogOpen}
        task={activeTask}
        actor={actor}
        assignable={assignable}
        defaultDue={defaultDue}
        focusAssignee={focusAssignee}
        onClose={() => {
          setDialogOpen(false);
          setActiveTask(null);
          setFocusAssignee(false);
        }}
        onSaved={(task) => {
          setActiveTask(task);
          setTasks((cur) => {
            const idx = cur.findIndex((t) => t.id === task.id);
            if (idx === -1) return [task, ...cur];
            const next = [...cur];
            next[idx] = task;
            return next;
          });
          void load();
        }}
      />
    </div>
  );
};
