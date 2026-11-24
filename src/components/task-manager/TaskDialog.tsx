import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { Clock, Info, MoreHorizontal, Plus, Users, X } from 'lucide-react';
import { FormDialog, FormDialogHeader, FormDialogBody } from '@/components/ui/FormDialogLayout';
import { FormFooter } from '@/components/ui/FormFooter';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { CustomDateTimePicker } from '@/components/ui/CustomDateTimePicker';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskDescriptionEditor } from '@/components/daily-log/TaskDescriptionEditor';
import { TaskDescriptionHtml } from '@/components/daily-log/TaskDescriptionHtml';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useToast } from '@/context/ToastContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { taskService } from '@/services/taskService';
import { TaskLogTimeModal } from './TaskLogTimeModal';
import { CollectiveSubtaskRows } from './CollectiveSubtaskRows';
import {
  collectiveRowsError,
  isLeadOwnerCandidate,
  newCollectiveRow,
  type CollectiveSubtaskRow,
} from '@/utils/collectiveTask';
import type { DailyLogEntry } from '@/types/dailyLog';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STAGES,
  type Task,
  type TaskActivity as Activity,
  type TaskActor,
  type TaskAssignableUser,
  type TaskAttachment,
  type TaskChecklistItem,
  type TaskComment,
  type TaskStatus,
} from '@/types/task';
import {
  allowedTransitions,
  canAddSubtask,
  canAddWatcher,
  canCreateCollective,
  canEditChecklist,
  canEditTask,
  canReassign,
  canTransitionTo,
  changedFields,
  isAdmin,
  isViewOnly,
  stageChangeNeedsReason,
} from '@/utils/taskAccess';
import { TaskStagePill } from './TaskPriorityPill';
import { assignmentPeers, isGroupedAssignment } from '@/utils/taskAssignmentGroup';
import { TaskChecklist } from './TaskChecklist';
import { TaskDiscussion } from './TaskDiscussion';
import { TaskAttachments } from './TaskAttachments';
import { TaskActivity } from './TaskActivity';

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assignee_id: string;
  assignee_ids: string[];
  start_date: string;
  due_date: string;
  due_time: string;
  estimate_hours: number;
  related_workspace_id: string;
  recurrence_freq: string;
  recurrence_interval: number;
  recurrence_until: string;
  parent_id: string;
}

function draftFrom(task?: Task | null, defaults?: Partial<Draft>): Draft {
  return {
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || defaults?.status || 'todo',
    priority: task?.priority || 'medium',
    assignee_id: task?.assignee_id || '',
    assignee_ids: task?.assignee_id ? [task.assignee_id] : [],
    start_date: task?.start_date || '',
    due_date: task?.due_date || defaults?.due_date || '',
    due_time: task?.due_time || '',
    estimate_hours: task?.estimate_hours || 0,
    related_workspace_id: task?.related?.workspace_id || '',
    recurrence_freq: task?.recurrence?.freq || '',
    recurrence_interval: task?.recurrence?.interval || 1,
    recurrence_until: task?.recurrence?.until || '',
    parent_id: task?.parent_id || defaults?.parent_id || '',
  };
}

interface Props {
  open: boolean;
  task?: Task | null;
  actor: TaskActor | null;
  assignable: TaskAssignableUser[];
  defaultDue?: string;
  defaultStage?: TaskStatus;
  parentId?: string;
  focusAssignee?: boolean;
  onClose: () => void;
  onSaved: (task: Task, opts?: { refreshList?: boolean }) => void;
  onDeleted?: (task: Task) => void;
  onOpenTask?: (task: Task) => void;
}

export const TaskDialog: React.FC<Props> = ({
  open,
  task,
  actor,
  assignable,
  defaultDue,
  defaultStage,
  parentId,
  focusAssignee,
  onClose,
  onSaved,
  onDeleted,
  onOpenTask,
}) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { workspaces } = useWorkspaces();
  const isCreate = !task;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(task, { due_date: defaultDue, status: defaultStage, parent_id: parentId }));
  const [baseline, setBaseline] = useState<Draft>(() => draftFrom(task, { due_date: defaultDue, status: defaultStage, parent_id: parentId }));
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(task?.checklist || []);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [watchers, setWatchers] = useState<string[]>(task?.watcher_ids || []);
  const [watchersBaseline, setWatchersBaseline] = useState<string[]>(task?.watcher_ids || []);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<Task[]>(task?.subtasks || []);
  const [pickerUsers, setPickerUsers] = useState<TaskAssignableUser[]>(assignable);
  const [mentionable, setMentionable] = useState<TaskAssignableUser[]>(assignable);
  const [taskLogs, setTaskLogs] = useState<DailyLogEntry[]>([]);
  const [logTimeOpen, setLogTimeOpen] = useState(false);
  const [loggedHours, setLoggedHours] = useState<number>(task?.logged_hours || 0);
  const [rollup, setRollup] = useState<Pick<Task, 'subtasks_count' | 'subtasks_done' | 'subtask_progress' | 'own_logged_hours' | 'subtasks_logged_hours' | 'parent'>>(() => ({
    subtasks_count: task?.subtasks_count,
    subtasks_done: task?.subtasks_done,
    subtask_progress: task?.subtask_progress,
    own_logged_hours: task?.own_logged_hours,
    subtasks_logged_hours: task?.subtasks_logged_hours,
    parent: task?.parent,
  }));
  const [collective, setCollective] = useState(false);
  const [collectiveRows, setCollectiveRows] = useState<CollectiveSubtaskRow[]>([]);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubAssignee, setNewSubAssignee] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const checklistGen = useRef(0);
  const pendingTempDeletes = useRef(new Set<string>());
  const tempToReal = useRef(new Map<string, string>());

  useEffect(() => {
    if (!open) return;
    const next = draftFrom(task, { due_date: defaultDue, status: defaultStage, parent_id: parentId });
    setDraft(next);
    setBaseline(next);
    setServerError(null);
    setClientError(null);
    setFileBusy(false);
    setComments([]);
    setAttachments([]);
    setActivity([]);
    checklistGen.current = 0;
    pendingTempDeletes.current.clear();
    tempToReal.current.clear();
    setChecklist(task?.checklist || []);
    setWatchers(task?.watcher_ids || []);
    setWatchersBaseline(task?.watcher_ids || []);
    setUnsavedOpen(false);
    setSubtasks(task?.subtasks || []);
    setCollective(false);
    setCollectiveRows([]);
    setNewSubTitle('');
    setNewSubAssignee('');
    setRollup({
      subtasks_count: task?.subtasks_count,
      subtasks_done: task?.subtasks_done,
      subtask_progress: task?.subtask_progress,
      own_logged_hours: task?.own_logged_hours,
      subtasks_logged_hours: task?.subtasks_logged_hours,
      parent: task?.parent,
    });
  }, [open, task?.id, defaultDue, defaultStage, parentId]);

  useEffect(() => {
    if (!open) return;
    if (task?.id) {
      void taskService.getAssignable(task.id).then((r) => setPickerUsers(r.items || [])).catch(() => setPickerUsers(assignable));
      void taskService.getMentionable(task.id).then((r) => setMentionable(r.items || [])).catch(() => setMentionable(assignable));
    } else {
      setPickerUsers(assignable);
      setMentionable(assignable);
    }
  }, [open, task?.id, assignable]);

  useEffect(() => {
    if (!open || !task?.id) return;
    void loadSide(task.id);
  }, [open, task?.id]);

  const loadSide = async (id: string, opts?: { light?: boolean }) => {
    const settle = <T,>(value: Promise<T> | T, fallback: T): Promise<T> =>
      Promise.resolve(value).catch(() => fallback);
    if (opts?.light) {
      const act = await settle(taskService.getActivity(id), { items: [] as Activity[] });
      setActivity(act.items || []);
      return;
    }
    const sideGen = checklistGen.current;
    const [c, a, act, full, logs] = await Promise.all([
      settle(taskService.getComments(id), { items: [] as TaskComment[], total: 0 }),
      settle(taskService.getAttachments(id), { items: [] as TaskAttachment[] }),
      settle(taskService.getActivity(id), { items: [] as Activity[] }),
      settle(taskService.getTask(id), null as Task | null),
      settle(typeof taskService.getTaskLogs === 'function' ? taskService.getTaskLogs(id) : Promise.resolve([]), [] as DailyLogEntry[]),
    ]);
    setComments(c.items || []);
    setAttachments(a.items || []);
    setActivity(act.items || []);
    setTaskLogs(logs || []);
    if (full) {
      if (checklistGen.current === sideGen) {
        setChecklist(full.checklist || []);
      }
      setSubtasks(full.subtasks || []);
      setLoggedHours(full.logged_hours || 0);
      setRollup({
        subtasks_count: full.subtasks_count,
        subtasks_done: full.subtasks_done,
        subtask_progress: full.subtask_progress,
        own_logged_hours: full.own_logged_hours,
        subtasks_logged_hours: full.subtasks_logged_hours,
        parent: full.parent,
      });
      const nextWatchers = full.watcher_ids || [];
      setWatchers(nextWatchers);
      setWatchersBaseline(nextWatchers);
    }
  };

  const viewOnly = Boolean(task && isViewOnly(actor, task));
  const canEdit = isCreate || (task ? canEditTask(actor, task) : false);
  const canChangeAssignee = isCreate || (task ? canReassign(actor, task) : false);
  const canCheck = isCreate || (task ? canEditChecklist(actor, task) : false);
  // Daily-log rule (server-enforced): only the assignee, or an admin, logs time on a task.
  const canLogTime = Boolean(task && actor && (isAdmin(actor) || actor.id === task.assignee_id));
  const allowCollective = isCreate && !parentId && canCreateCollective(actor);
  const isCollective = allowCollective && collective;
  const leadOptions = pickerUsers.filter(isLeadOwnerCandidate);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(baseline) ||
    JSON.stringify(watchers) !== JSON.stringify(watchersBaseline) ||
    (isCollective && collectiveRows.some((r) => r.title.trim() || r.assignee_id));
  const { confirmDiscard } = useUnsavedChangesGuard(dirty && open);
  const showFieldSave = Boolean(!isCreate && dirty && !viewOnly);

  const selectedAssignee = pickerUsers.find((u) => u.id === (isCreate ? draft.assignee_ids[0] : draft.assignee_id));
  const departmentHint = selectedAssignee?.department || task?.department || actor?.primary_department || actor?.department || '';

  const statusOptions = useMemo(() => {
    if (isCreate) return TASK_STAGES;
    if (!task) return TASK_STAGES;
    const allowed = allowedTransitions(actor, task);
    return TASK_STAGES.filter((s) => allowed.includes(s.value) || s.value === task.status);
  }, [actor, task, isCreate]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const payloadFromDraft = () => {
    const related = draft.related_workspace_id
      ? {
          workspace_id: draft.related_workspace_id,
          client_name: workspaces.find((w) => w.id === draft.related_workspace_id)?.name,
        }
      : null;
    const recurrence = draft.recurrence_freq
      ? {
          freq: draft.recurrence_freq,
          interval: draft.recurrence_interval || 1,
          until: draft.recurrence_until || null,
        }
      : null;
    return {
      title: draft.title.trim(),
      description: draft.description,
      priority: draft.priority,
      assignee_id: (isCreate ? draft.assignee_ids[0] : draft.assignee_id) || undefined,
      assignee_ids: isCreate ? draft.assignee_ids : undefined,
      start_date: draft.start_date || null,
      due_date: draft.due_date || null,
      due_time: draft.due_time || null,
      estimate_hours: draft.estimate_hours || null,
      related,
      recurrence,
      parent_id: draft.parent_id || undefined,
      watcher_ids: watchers,
    };
  };

  const markClean = () => {
    setBaseline({ ...draft });
    setWatchersBaseline([...watchers]);
  };

  const handleClose = async () => {
    if (fileBusy) return;
    if (!dirty) {
      onClose();
      return;
    }
    if (!isCreate) {
      setUnsavedOpen(true);
      return;
    }
    const ok = await confirmDiscard();
    if (ok) onClose();
  };

  const handleUnsavedStay = () => setUnsavedOpen(false);

  const handleUnsavedDiscard = () => {
    setUnsavedOpen(false);
    onClose();
  };

  const handleUnsavedSave = async () => {
    setUnsavedOpen(false);
    const saved = await saveFields();
    if (saved) onClose();
  };

  const validateClient = (): string | null => {
    const title = draft.title.trim();
    if (!title) return 'Title is required';
    if (isCreate && !(draft.assignee_ids || []).length) return isCollective ? 'Lead owner is required' : 'Assigned person is required';
    if (isCollective) {
      const rowsErr = collectiveRowsError(collectiveRows);
      if (rowsErr) return rowsErr;
    }
    if (title.length > 200) return 'Title must be 1–200 characters';
    if ((draft.description || '').length > 10000) return 'Description must be 10,000 characters or fewer';
    if (draft.due_time && !draft.due_date) return 'Due time requires a due date';
    if (draft.start_date && draft.due_date && draft.due_date < draft.start_date) return 'Due date must be on or after start date';
    if (draft.recurrence_until && draft.due_date && draft.recurrence_until < draft.due_date) {
      return 'Until date must be on or after due date';
    }
    if (draft.estimate_hours < 0 || draft.estimate_hours > 1000) return 'Estimate must be between 0 and 1000 hours';
    return null;
  };

  const saveFields = async () => {
    const err = validateClient();
    if (err) {
      setClientError(err);
      setServerError(err);
      return null;
    }
    setBusy(true);
    setServerError(null);
    setClientError(null);
    try {
      if (isCreate && isCollective) {
        const main = payloadFromDraft() as Record<string, unknown>;
        delete main.assignee_ids;
        delete main.recurrence;
        delete main.parent_id;
        const created = await taskService.createCollective({
          main: { ...main, assignee_id: draft.assignee_ids[0] },
          subtasks: collectiveRows.map((r) => ({ title: r.title.trim(), assignee_id: r.assignee_id })),
        });
        addToast('Collective task created', `${created.serial} · ${collectiveRows.length} sub-tasks`, 'success');
        onSaved(created);
        return created;
      }
      if (isCreate) {
        const created = await taskService.createTask(payloadFromDraft());
        const peerIds = (created.assignment_group?.peers || []).map((p) => p.id).filter((id) => id && id !== created.id);
        if (defaultStage && defaultStage !== 'todo') {
          try {
            const updated = await taskService.changeStage(created.id, defaultStage);
            await Promise.all(peerIds.map((id) => taskService.changeStage(id, defaultStage).catch(() => null)));
            const people = (updated.assignment_group?.total_count || peerIds.length + 1);
            addToast(people > 1 ? `Task created for ${people} people` : 'Task created', updated.serial, 'success');
            onSaved(updated);
            return updated;
          } catch (err: any) {
            addToast('Created in To Do', err?.message || 'Could not change stage', 'error');
            onSaved(created);
            return created;
          }
        }
        const people = created.assignment_group?.total_count || 1;
        addToast(people > 1 ? `Task created for ${people} people` : 'Task created', created.serial, 'success');
        onSaved(created);
        return created;
      }
      let current = task;
      if (draft.assignee_id && draft.assignee_id !== task?.assignee_id) {
        const note = await prompt({ title: 'Reassign note (optional)', label: 'Note' });
        const assigned = await taskService.assign(task!.id, draft.assignee_id, note || undefined);
        onSaved(assigned, { refreshList: false });
        current = assigned;
      }
      const next = payloadFromDraft() as Record<string, unknown>;
      delete next.assignee_id;
      const baselinePayload = payloadFromDraftFromBaseline(baseline, workspaces, watchersBaseline);
      delete baselinePayload.assignee_id;
      const patch = changedFields(baselinePayload, next);
      if (Object.keys(patch).length) {
        patch.if_updated_at = current?.updated_at;
        const updated = await taskService.patchTask(task!.id, patch);
        onSaved(updated, { refreshList: false });
        markClean();
        return updated;
      }
      markClean();
      return current;
    } catch (err: any) {
      const message = err?.message || 'Could not save task';
      if (String(message).includes('Someone else')) {
        addToast('Reload required', message, 'error');
      }
      setServerError(message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runStage = async (to: TaskStatus, reason?: string) => {
    if (!task) return;
    let note = reason;
    if (stageChangeNeedsReason(task.status, to) && !(note || '').trim()) {
      note = (await prompt({ title: 'Send back', label: 'Reason' })) || undefined;
      if (!(note || '').trim()) {
        setDraft((d) => ({ ...d, status: task.status }));
        return;
      }
    }
    setBusy(true);
    try {
      const updated = await taskService.changeStage(task.id, to, note);
      onSaved(updated);
      setDraft((d) => ({ ...d, status: updated.status }));
      setBaseline(draftFrom(updated));
    } catch (err: any) {
      setDraft((d) => ({ ...d, status: task.status }));
      setServerError(err?.message || 'Could not change stage');
    } finally {
      setBusy(false);
    }
  };

  const stageAction = !isCreate && task
    ? task.status === 'todo' && canTransitionTo(actor, task, 'in_progress')
      ? { label: 'Start', to: 'in_progress' as const }
      : task.status === 'in_progress' && canTransitionTo(actor, task, 'in_review')
        ? { label: 'Submit for review', to: 'in_review' as const }
        : task.status === 'in_review' && canTransitionTo(actor, task, 'completed')
          ? { label: 'Approve', to: 'completed' as const }
          : null
    : null;

  const showPrimary = isCreate || showFieldSave || Boolean(stageAction);
  const primaryLabel = isCreate
    ? 'Create task'
    : showFieldSave
      ? 'Save'
      : stageAction?.label || 'Close';
  const primaryBusyLabel = isCreate
    ? 'Creating…'
    : showFieldSave
      ? 'Saving…'
      : stageAction
        ? `${stageAction.label}…`
        : undefined;
  const footerBusyLabel = deleting
    ? 'Deleting task…'
    : busy
      ? isCreate
        ? 'Creating task…'
        : showFieldSave
          ? 'Saving…'
          : stageAction
            ? `${stageAction.label}…`
            : 'Updating…'
      : false;

  const onPrimary = async () => {
    if (isCreate) {
      await saveFields();
      return;
    }
    if (showFieldSave || primaryLabel === 'Save') {
      await saveFields();
      return;
    }
    if (stageAction) {
      if (dirty) await saveFields();
      await runStage(stageAction.to);
      return;
    }
    onClose();
  };

  return (
    <>
    <FormDialog isOpen={open} onClose={() => void handleClose()} maxWidth="2xl" showClose={false} dismissible={!fileBusy && !unsavedOpen}>
      <FormDialogHeader>
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-fg-muted">{task?.serial || 'New task'}</span>
            <TaskStagePill status={draft.status} />
            {viewOnly && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface text-fg-muted border border-border">
                View only
              </span>
            )}
            {task?.blocked && <StatusPill variant="danger" label="Blocked" hasDot={false} />}
            {task && isGroupedAssignment(task) && (
              <span
                data-testid="task-header-assignees-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 border border-brand-200 dark:border-brand-800/50"
              >
                <Users className="w-3.5 h-3.5" />
                {task.assignment_group?.total_count || 2} Assignees
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
          {task && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:bg-hover" aria-label="Task menu">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/tasks?task=${task.id}`);
                    addToast('Link copied', task.serial, 'success');
                  }}
                >
                  Copy link
                </DropdownMenuItem>
                {task.blocked ? (
                  <DropdownMenuItem onClick={() => void taskService.setBlocked(task.id, false).then(onSaved)}>Unblock</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={async () => {
                      const reason = await prompt({ title: 'Why is this blocked?', label: 'Reason' });
                      if (reason) onSaved(await taskService.setBlocked(task.id, true, reason));
                    }}
                  >
                    Mark blocked
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-danger-fg"
                  onClick={async () => {
                    const reason = await prompt({ title: 'Cancel task', label: 'Reason' });
                    if (reason) onSaved(await taskService.cancel(task.id, reason));
                  }}
                >
                  Cancel task
                </DropdownMenuItem>
                {isAdmin(actor) && (
                  <DropdownMenuItem
                    className="text-danger-fg"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete this task?',
                        description: 'This permanently deletes comments and files.',
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      });
                      if (ok) {
                        setDeleting(true);
                        setBusy(true);
                        try {
                          await taskService.remove(task.id);
                          addToast('Task deleted', `${task.serial} was removed.`, 'success');
                          onDeleted?.(task);
                          onClose();
                        } catch (err: any) {
                          const message = err?.message || 'Could not delete task';
                          setServerError(message);
                          addToast('Delete failed', message, 'error');
                        } finally {
                          setDeleting(false);
                          setBusy(false);
                        }
                      }
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
            <button
              type="button"
              aria-label="Close"
              disabled={fileBusy}
              onClick={() => void handleClose()}
              className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-50 disabled:pointer-events-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </FormDialogHeader>

      <form
        className="flex flex-col flex-1 min-h-0"
        onSubmit={(e) => {
          e.preventDefault();
          void onPrimary();
        }}
      >
        <FormDialogBody className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 lg:items-stretch gap-6 overflow-y-auto lg:overflow-hidden">
          <div className="lg:col-span-7 space-y-4 lg:min-h-0 lg:overflow-y-auto" data-testid="task-dialog-form">
            <FormField label="Title" required error={!draft.title.trim() && serverError ? 'Title is required' : undefined}>
              {(props) => (
                <input
                  {...props}
                  value={draft.title}
                  disabled={!canEdit}
                  onChange={(e) => set({ title: e.target.value })}
                  className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                />
              )}
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomSelect
                label="Status"
                value={draft.status}
                disabled={!task || viewOnly}
                onChange={(v) => {
                  set({ status: v as TaskStatus });
                  if (task && v !== task.status) void runStage(v as TaskStatus);
                }}
                options={statusOptions}
              />
              <CustomSelect
                label="Priority"
                value={draft.priority}
                disabled={!canEdit}
                onChange={(v) => set({ priority: v })}
                options={TASK_PRIORITY_OPTIONS}
              />
            </div>
            {allowCollective && (
              <label className="flex items-center gap-2 text-sm text-fg" data-testid="collective-toggle">
                <input
                  type="checkbox"
                  checked={collective}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setCollective(on);
                    set({ assignee_ids: [], assignee_id: '', recurrence_freq: '' });
                    setCollectiveRows(on ? [newCollectiveRow(), newCollectiveRow()] : []);
                  }}
                />
                Collective task (one main task for a team lead, sub-tasks for team members)
              </label>
            )}
            {isCollective ? (
              <div className="space-y-3">
                <CustomSelect
                  label="Lead owner"
                  required
                  id="task-assignee-picker"
                  searchable
                  value={draft.assignee_ids[0] || ''}
                  onChange={(v) => set({ assignee_ids: v ? [v] : [], assignee_id: v || '' })}
                  error={!draft.assignee_ids.length && serverError ? 'Lead owner is required' : undefined}
                  options={leadOptions.map((u) => ({
                    value: u.id,
                    label: u.name,
                    description: [u.department, u.role].filter(Boolean).join(' · '),
                  }))}
                />
                <CollectiveSubtaskRows rows={collectiveRows} users={pickerUsers} disabled={busy} onChange={setCollectiveRows} />
              </div>
            ) : isCreate ? (
              <div className="space-y-1.5">
                <CustomSelect
                  label="Assigned people"
                  required
                  id="task-assignee-picker"
                  searchable
                  autoOpen={Boolean(focusAssignee && open)}
                  value=""
                  onChange={(v) => {
                    if (!v || draft.assignee_ids.includes(v)) return;
                    set({ assignee_ids: [...draft.assignee_ids, v], assignee_id: draft.assignee_ids[0] || v });
                  }}
                  error={!draft.assignee_ids.length && serverError ? 'Assigned person is required' : undefined}
                  options={pickerUsers
                    .filter((u) => !draft.assignee_ids.includes(u.id))
                    .map((u) => ({
                      value: u.id,
                      label: u.name,
                      description: [u.department, u.role].filter(Boolean).join(' · '),
                    }))}
                />
                {draft.assignee_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.assignee_ids.map((id) => {
                      const u = pickerUsers.find((x) => x.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            const next = draft.assignee_ids.filter((x) => x !== id);
                            set({ assignee_ids: next, assignee_id: next[0] || '' });
                          }}
                          className="h-6 px-2 rounded-full text-micro bg-subtle text-fg-muted"
                        >
                          {u?.name || id} ×
                        </button>
                      );
                    })}
                  </div>
                )}
                {draft.assignee_ids.length > 1 && (
                  <p className="text-micro text-fg-muted">Each person gets their own copy and stage.</p>
                )}
              </div>
            ) : (
              <CustomSelect
                label="Assigned person"
                required
                id="task-assignee-picker"
                searchable
                autoOpen={Boolean(focusAssignee && open)}
                value={draft.assignee_id}
                disabled={!canChangeAssignee}
                onChange={(v) => set({ assignee_id: v })}
                options={pickerUsers.map((u) => ({
                  value: u.id,
                  label: u.name,
                  description: [u.department, u.role].filter(Boolean).join(' · '),
                }))}
              />
            )}
            <FormField label="Department" hint={isCreate && draft.assignee_ids.length > 1 ? 'Set per person' : 'From assignee'}>
              <input
                readOnly
                value={
                  isCreate && draft.assignee_ids.length > 1
                    ? 'Per assignee'
                    : departmentHint || '—'
                }
                className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg-muted"
              />
            </FormField>
            {task && isGroupedAssignment(task) && (
              <div className="rounded-md border border-border bg-subtle p-2.5 space-y-1.5" data-testid="task-assignment-group">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-muted">People on this assignment</span>
                  <span className="text-micro text-fg-muted">
                    {task.assignment_group?.done_count}/{task.assignment_group?.total_count} done
                  </span>
                </div>
                <ul className="space-y-1">
                  {assignmentPeers(task).map((peer) => (
                    <li key={peer.id}>
                      <button
                        type="button"
                        className={`w-full flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left text-xs ${
                          peer.id === task.id ? 'bg-surface border border-border' : 'hover:bg-hover'
                        }`}
                        onClick={async () => {
                          if (peer.id === task.id || !onOpenTask) return;
                          try {
                            const full = await taskService.getTask(peer.id);
                            onOpenTask(full);
                          } catch (err: any) {
                            addToast('Could not open copy', err?.message || 'Try again', 'error');
                          }
                        }}
                      >
                        <span className="text-fg truncate">{peer.assignee_name || peer.serial}</span>
                        <TaskStagePill status={peer.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomDatePicker label="Start date" value={draft.start_date} onChange={(iso) => set({ start_date: iso })} disabled={!canEdit} clearable />
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1.5">Due date</label>
                <CustomDateTimePicker
                  value={draft.due_date ? `${draft.due_date}${draft.due_time ? `T${draft.due_time}` : ''}` : ''}
                  onChange={(v) => {
                    if (!v) {
                      set({ due_date: '', due_time: '' });
                      return;
                    }
                    const [d, t] = v.split('T');
                    set({ due_date: d || '', due_time: (t || '').slice(0, 5) });
                  }}
                  disabled={!canEdit}
                  clearable
                />
              </div>
            </div>
            <NumberStepper label="Estimate (hours)" value={draft.estimate_hours} onChange={(v) => set({ estimate_hours: v })} min={0} max={1000} step={0.5} disabled={!canEdit} />
            {task && (
              <div className="flex items-center justify-between p-2.5 bg-subtle border border-border rounded-md text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-accent" />
                  <div>
                    <span className="font-medium text-fg">{loggedHours}h logged</span>
                    {draft.estimate_hours > 0 ? (
                      <span className="text-fg-muted"> of {draft.estimate_hours}h estimated</span>
                    ) : null}
                    {rollup.subtasks_logged_hours !== undefined && (
                      <span className="block text-micro text-fg-muted" data-testid="task-hours-breakdown">
                        {rollup.own_logged_hours ?? 0}h on this task · {rollup.subtasks_logged_hours}h on sub-tasks
                      </span>
                    )}
                  </div>
                </div>
                {task.status !== 'cancelled' && canLogTime && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setLogTimeOpen(true)}
                    className="h-7 text-xs"
                  >
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    Log Time
                  </Button>
                )}
              </div>
            )}
            <CustomSelect
              label="Related client"
              searchable
              value={draft.related_workspace_id}
              disabled={!canEdit}
              onChange={(v) => set({ related_workspace_id: v })}
              options={[{ value: '', label: 'None' }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]}
            />
            <CustomSelect
              label="Watchers"
              searchable
              value=""
              disabled={!canEdit}
              onChange={(v) => {
                if (v && !watchers.includes(v)) setWatchers((w) => [...w, v]);
              }}
              options={[{ value: '', label: 'Add watcher' }, ...pickerUsers.filter((u) => !watchers.includes(u.id)).map((u) => ({ value: u.id, label: u.name }))]}
            />
            {watchers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {watchers.map((id) => {
                  const u = pickerUsers.find((x) => x.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setWatchers((w) => w.filter((x) => x !== id))}
                      className="h-6 px-2 rounded-full text-micro bg-subtle text-fg-muted"
                    >
                      {u?.name || id} ×
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <CustomSelect
                label="Recurrence"
                value={draft.recurrence_freq}
                disabled={!canEdit || isCollective}
                onChange={(v) => set({ recurrence_freq: v })}
                options={[
                  { value: '', label: 'None' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
              {draft.recurrence_freq && (
                <CustomDatePicker label="Until" value={draft.recurrence_until} onChange={(iso) => set({ recurrence_until: iso })} disabled={!canEdit} clearable />
              )}
            </div>
            <FormField label="Description">
              {({ id }) =>
                canEdit ? (
                  <TaskDescriptionEditor
                    id={id}
                    value={draft.description}
                    onChange={(html) => set({ description: html })}
                    placeholder="Describe the work, use bold and lists…"
                    minRows={4}
                  />
                ) : (
                  <div className="rounded-md border border-border bg-subtle px-3 py-2 text-ui">
                    <TaskDescriptionHtml html={draft.description} />
                  </div>
                )
              }
            </FormField>
            <TaskChecklist
              items={checklist}
              disabled={!canCheck || isCreate}
              onAdd={async (text) => {
                if (!task) return;
                checklistGen.current += 1;
                const temp: TaskChecklistItem = { id: `tmp_${Date.now()}`, text, done: false };
                setChecklist((cur) => [...cur, temp]);
                try {
                  const updated = await taskService.addChecklist(task.id, text);
                  const serverItems = updated.checklist || [];
                  const knownReal = new Set(tempToReal.current.values());
                  const created =
                    serverItems.find((row) => row.text === text && !knownReal.has(row.id)) ||
                    serverItems[serverItems.length - 1];
                  if (created?.id) tempToReal.current.set(temp.id, created.id);
                  if (pendingTempDeletes.current.has(temp.id)) {
                    pendingTempDeletes.current.delete(temp.id);
                    if (created?.id) {
                      const removed = await taskService.deleteChecklist(task.id, created.id);
                      setChecklist(removed.checklist || []);
                      onSaved(removed, { refreshList: false });
                      return;
                    }
                  }
                  setChecklist(serverItems);
                  onSaved(updated, { refreshList: false });
                } catch (err: any) {
                  setChecklist((cur) => cur.filter((item) => item.id !== temp.id));
                  addToast('Could not add item', err?.message || 'Try again', 'error');
                }
              }}
              onToggle={(item, done) => {
                if (!task) return;
                const realId = item.id.startsWith('tmp_') ? tempToReal.current.get(item.id) : item.id;
                if (!realId || realId.startsWith('tmp_')) {
                  setChecklist((cur) => cur.map((row) => (row.id === item.id ? { ...row, done } : row)));
                  return;
                }
                checklistGen.current += 1;
                setChecklist((cur) => cur.map((row) => (row.id === item.id || row.id === realId ? { ...row, done } : row)));
                void taskService
                  .patchChecklist(task.id, realId, { done })
                  .then((updated) => {
                    setChecklist(updated.checklist || []);
                    onSaved(updated, { refreshList: false });
                  })
                  .catch((err: any) => {
                    setChecklist((cur) => cur.map((row) => (row.id === item.id || row.id === realId ? { ...row, done: !done } : row)));
                    addToast('Could not update checklist', err?.message || 'Try again', 'error');
                  });
              }}
              onRename={async (item, text) => {
                if (!task) return;
                const realId = item.id.startsWith('tmp_') ? tempToReal.current.get(item.id) : item.id;
                if (!realId || realId.startsWith('tmp_')) {
                  setChecklist((cur) => cur.map((row) => (row.id === item.id ? { ...row, text } : row)));
                  return;
                }
                checklistGen.current += 1;
                const prev = item.text;
                setChecklist((cur) => cur.map((row) => (row.id === item.id || row.id === realId ? { ...row, text } : row)));
                try {
                  const updated = await taskService.patchChecklist(task.id, realId, { text });
                  setChecklist(updated.checklist || []);
                  onSaved(updated, { refreshList: false });
                } catch (err: any) {
                  setChecklist((cur) => cur.map((row) => (row.id === item.id || row.id === realId ? { ...row, text: prev } : row)));
                  addToast('Could not update checklist', err?.message || 'Try again', 'error');
                }
              }}
              onRemove={async (item) => {
                if (!task) return;
                checklistGen.current += 1;
                setChecklist((cur) => cur.filter((row) => row.id !== item.id));
                if (item.id.startsWith('tmp_')) {
                  pendingTempDeletes.current.add(item.id);
                  const realId = tempToReal.current.get(item.id);
                  if (!realId) return;
                  try {
                    const updated = await taskService.deleteChecklist(task.id, realId);
                    setChecklist(updated.checklist || []);
                    onSaved(updated, { refreshList: false });
                  } catch (err: any) {
                    addToast('Could not remove item', err?.message || 'Try again', 'error');
                  }
                  return;
                }
                try {
                  const updated = await taskService.deleteChecklist(task.id, item.id);
                  setChecklist(updated.checklist || []);
                  onSaved(updated, { refreshList: false });
                } catch (err: any) {
                  setChecklist((cur) => {
                    if (cur.some((row) => row.id === item.id)) return cur;
                    return [...cur, item];
                  });
                  addToast('Could not remove item', err?.message || 'Try again', 'error');
                }
              }}
            />
            {task && rollup.parent && (
              <p className="text-xs text-fg-muted" data-testid="task-parent-link">
                Part of{' '}
                <span className="font-mono text-fg">{rollup.parent.serial}</span>
                {rollup.parent.title ? ` · ${rollup.parent.title}` : ''}
                {rollup.parent.assignee_name ? ` (lead: ${rollup.parent.assignee_name})` : ''}
              </p>
            )}
            {task && !task.parent_id && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-fg-muted">Subtasks of {task.serial}</label>
                  {(rollup.subtasks_count || 0) > 0 && (
                    <span className="text-micro font-numeric text-fg-muted" data-testid="subtask-progress-label">
                      {rollup.subtasks_done || 0}/{rollup.subtasks_count} done · {rollup.subtask_progress ?? 0}%
                    </span>
                  )}
                </div>
                {(rollup.subtasks_count || 0) > 0 && (
                  <Progress value={rollup.subtask_progress ?? 0} aria-label="Sub-task progress" data-testid="subtask-progress" />
                )}
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s.id} className="text-sm text-fg flex items-center justify-between gap-2" data-subtask-id={s.id}>
                      <button
                        type="button"
                        className="text-left min-w-0 truncate hover:underline"
                        disabled={!onOpenTask || s.id.startsWith('tmp_')}
                        onClick={() => onOpenTask?.(s)}
                      >
                        <span className="font-mono text-micro text-fg-muted" data-subtask-serial={s.serial}>
                          {s.serial || s.id}
                        </span>
                        {' · '}
                        {s.title}
                        {s.assignee_name ? <span className="text-fg-muted"> — {s.assignee_name}</span> : null}
                      </button>
                      <TaskStagePill status={s.status} />
                    </li>
                  ))}
                </ul>
                {canAddSubtask(actor, task) && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start" data-testid="add-subtask-row">
                    <input
                      aria-label="New sub-task name"
                      value={newSubTitle}
                      maxLength={200}
                      placeholder="New sub-task"
                      onChange={(e) => setNewSubTitle(e.target.value)}
                      className="sm:col-span-6 w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                    />
                    <div className="sm:col-span-4">
                      <CustomSelect
                        aria-label="New sub-task assignee"
                        searchable
                        value={newSubAssignee}
                        placeholder="Assign to…"
                        onChange={(v) => setNewSubAssignee(v)}
                        options={pickerUsers.map((u) => ({
                          value: u.id,
                          label: u.name,
                          description: [u.department, u.role].filter(Boolean).join(' · '),
                        }))}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="sm:col-span-2 h-9"
                      disabled={!newSubTitle.trim()}
                      onClick={async () => {
                        const title = newSubTitle.trim();
                        if (!title) return;
                        const assignee = newSubAssignee || draft.assignee_id;
                        const temp: Task = {
                          id: `tmp_sub_${Date.now()}`,
                          serial: '…',
                          title,
                          status: 'todo',
                          priority: task.priority || 'medium',
                          parent_id: task.id,
                        };
                        setSubtasks((cur) => [...cur, temp]);
                        try {
                          const created = await taskService.createTask({
                            title,
                            parent_id: task.id,
                            assignee_id: assignee,
                          });
                          setSubtasks((cur) => cur.map((row) => (row.id === temp.id ? created : row)));
                          setNewSubTitle('');
                          setNewSubAssignee('');
                          const count = (rollup.subtasks_count || 0) + 1;
                          const done = rollup.subtasks_done || 0;
                          const progress = Math.round((100 * done) / count);
                          setRollup((r) => ({ ...r, subtasks_count: count, subtasks_done: done, subtask_progress: progress }));
                          onSaved(
                            { ...task, subtasks_count: count, subtasks_done: done, subtask_progress: progress },
                            { refreshList: false },
                          );
                        } catch (err: any) {
                          setSubtasks((cur) => cur.filter((row) => row.id !== temp.id));
                          addToast('Could not add subtask', err?.message || 'Try again', 'error');
                        }
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add subtask
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="lg:col-span-5 min-h-[280px] lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden"
            data-testid="task-dialog-side"
          >
            <Tabs defaultValue="discussion" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
              <TabsList className="shrink-0 bg-surface">
                <TabsTrigger value="discussion" count={comments.length || undefined}>Discussion</TabsTrigger>
                <TabsTrigger value="files" count={attachments.length || undefined}>Files</TabsTrigger>
                <TabsTrigger value="logs" count={taskLogs.length || undefined}>Logs</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="discussion" className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {task ? (
                  <TaskDiscussion
                    comments={comments}
                    users={mentionable}
                    disabled={viewOnly}
                    canAddWatchers={canAddWatcher(actor, task)}
                    onSubmit={async (text, opts) => {
                      const created = await taskService.addComment(task.id, text, opts);
                      // Show the new comment right away; refresh the rest in the background.
                      if (created?.id && typeof created.text === 'string') {
                        setComments((cur) => (cur.some((c) => c.id === created.id) ? cur : [...cur, created]));
                      }
                      void loadSide(task.id).catch(() => undefined);
                    }}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">Save the task to start a discussion.</p>
                )}
              </TabsContent>
              <TabsContent value="files" className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {task ? (
                  <TaskAttachments
                    taskId={task.id}
                    attachments={attachments}
                    disabled={viewOnly}
                    onBusy={setFileBusy}
                    onChanged={(next) => {
                      if (next) setAttachments(next);
                      void loadSide(task.id, { light: true });
                    }}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">Save the task to attach files.</p>
                )}
              </TabsContent>
              <TabsContent value="logs" className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto p-4 space-y-3">
                {task ? (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <div className="text-xs text-fg-muted">
                        Total logged: <strong className="text-fg">{loggedHours}h</strong>
                      </div>
                      {task.status !== 'cancelled' && canLogTime && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setLogTimeOpen(true)}
                          className="h-7 text-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Log Time
                        </Button>
                      )}
                    </div>
                    {taskLogs.length === 0 ? (
                      <p className="text-sm text-fg-muted text-center py-6">No time logged against this task yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {taskLogs.map((log) => (
                          <div key={log.id} className="p-2.5 bg-subtle border border-border rounded-md text-xs space-y-1">
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-fg">{log.resource_name || 'Team Member'}</span>
                              <span className="font-numeric text-accent">{log.hours_utilized}h</span>
                            </div>
                            <div className="text-fg-muted flex items-center justify-between">
                              <span>{log.date}</span>
                              <span className="capitalize text-micro px-1.5 py-0.5 rounded bg-surface border border-border">
                                {log.task_status}
                              </span>
                            </div>
                            {log.task_description && (
                              <TaskDescriptionHtml html={log.task_description} clamp className="text-micro pt-1" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-fg-muted">Save the task to log time.</p>
                )}
              </TabsContent>
              <TabsContent value="activity" className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <TaskActivity items={activity} />
              </TabsContent>
            </Tabs>
          </div>
        </FormDialogBody>
        <FormFooter serverError={serverError || clientError || undefined} uploading={footerBusyLabel}>
          {task?.status === 'in_review' && canTransitionTo(actor, task, 'in_progress', 'x') && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || deleting}
              onClick={async () => {
                const reason = await prompt({ title: 'Send back', label: 'Reason' });
                if (reason) await runStage('in_progress', reason);
              }}
            >
              Send back
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={fileBusy || deleting} onClick={() => void handleClose()}>
            Close
          </Button>
          {showPrimary && (
            <Button
              type="submit"
              variant="primary"
              loading={busy && !deleting}
              loadingText={busy && !deleting ? primaryBusyLabel : undefined}
              disabled={busy || deleting || ((isCreate || showFieldSave) && !draft.title.trim()) || (isCreate && !draft.assignee_ids.length)}
              data-testid={showFieldSave ? 'task-dialog-save' : 'task-dialog-primary'}
            >
              {primaryLabel}
            </Button>
          )}
        </FormFooter>
      </form>
    </FormDialog>
    {task && (
      <TaskLogTimeModal
        task={task}
        isOpen={logTimeOpen}
        onClose={() => setLogTimeOpen(false)}
        onSuccess={async () => {
          if (task?.id) {
            await loadSide(task.id);
          }
        }}
      />
    )}
    <UnsavedChangesDialog
      open={unsavedOpen}
      busy={busy}
      onStay={handleUnsavedStay}
      onDiscard={handleUnsavedDiscard}
      onSave={() => void handleUnsavedSave()}
    />
    </>
  );
};

function UnsavedChangesDialog({
  open,
  busy,
  onStay,
  onDiscard,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onStay(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay,50)] bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />
        <AlertDialogPrimitive.Content
          data-testid="task-unsaved-changes"
          className="fixed left-[50%] top-[50%] z-[var(--z-dialog,51)] grid w-full max-w-[400px] translate-x-[-50%] translate-y-[-50%] bg-surface border border-border rounded-lg shadow-lg p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-none"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-fg-muted shrink-0">
                <Info size={20} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg tracking-tight">
                  Unsaved changes
                </AlertDialogPrimitive.Title>
                <AlertDialogPrimitive.Description className="text-body text-fg-muted mt-1 leading-normal">
                  You have unsaved edits. Save them or discard them.
                </AlertDialogPrimitive.Description>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={onDiscard}>
                Discard changes
              </Button>
              <Button type="button" variant="primary" disabled={busy} onClick={onSave}>
                Save
              </Button>
            </div>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

function payloadFromDraftFromBaseline(
  draft: Draft,
  workspaces: { id: string; name: string }[],
  watcherIds: string[],
): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    description: draft.description,
    priority: draft.priority,
    assignee_id: draft.assignee_id || undefined,
    start_date: draft.start_date || null,
    due_date: draft.due_date || null,
    due_time: draft.due_time || null,
    estimate_hours: draft.estimate_hours || null,
    related: draft.related_workspace_id
      ? { workspace_id: draft.related_workspace_id, client_name: workspaces.find((w) => w.id === draft.related_workspace_id)?.name }
      : null,
    recurrence: draft.recurrence_freq
      ? { freq: draft.recurrence_freq, interval: draft.recurrence_interval || 1, until: draft.recurrence_until || null }
      : null,
    parent_id: draft.parent_id || undefined,
    watcher_ids: watcherIds,
  };
}
