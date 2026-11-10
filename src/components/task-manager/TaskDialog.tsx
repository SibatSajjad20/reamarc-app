import React, { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { FormDialog, FormDialogHeader, FormDialogBody } from '@/components/ui/FormDialogLayout';
import { FormFooter } from '@/components/ui/FormFooter';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { CustomDateTimePicker } from '@/components/ui/CustomDateTimePicker';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  canAddWatcher,
  canEditChecklist,
  canEditTask,
  canReassign,
  canTransitionTo,
  changedFields,
  isAdmin,
  isViewOnly,
} from '@/utils/taskAccess';
import { TaskStagePill } from './TaskPriorityPill';
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
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    assignee_id: task?.assignee_id || '',
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
  parentId?: string;
  focusAssignee?: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
}

export const TaskDialog: React.FC<Props> = ({
  open,
  task,
  actor,
  assignable,
  defaultDue,
  parentId,
  focusAssignee,
  onClose,
  onSaved,
}) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { workspaces } = useWorkspaces();
  const isCreate = !task;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(task, { due_date: defaultDue, parent_id: parentId }));
  const [baseline, setBaseline] = useState<Draft>(() => draftFrom(task, { due_date: defaultDue, parent_id: parentId }));
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(task?.checklist || []);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [watchers, setWatchers] = useState<string[]>(task?.watcher_ids || []);
  const [subtasks, setSubtasks] = useState<Task[]>(task?.subtasks || []);
  const [pickerUsers, setPickerUsers] = useState<TaskAssignableUser[]>(assignable);
  const [mentionable, setMentionable] = useState<TaskAssignableUser[]>(assignable);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = draftFrom(task, { due_date: defaultDue, parent_id: parentId });
    setDraft(next);
    setBaseline(next);
    setChecklist(task?.checklist || []);
    setWatchers(task?.watcher_ids || []);
    setSubtasks(task?.subtasks || []);
    setServerError(null);
  }, [open, task?.id, defaultDue, parentId]);

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

  const loadSide = async (id: string) => {
    const settle = <T,>(value: Promise<T> | T, fallback: T): Promise<T> =>
      Promise.resolve(value).catch(() => fallback);
    const [c, a, act, full] = await Promise.all([
      settle(taskService.getComments(id), { items: [] as TaskComment[], total: 0 }),
      settle(taskService.getAttachments(id), { items: [] as TaskAttachment[] }),
      settle(taskService.getActivity(id), { items: [] as Activity[] }),
      settle(taskService.getTask(id), null as Task | null),
    ]);
    setComments(c.items || []);
    setAttachments(a.items || []);
    setActivity(act.items || []);
    if (full) {
      setChecklist(full.checklist || []);
      setSubtasks(full.subtasks || []);
      setWatchers(full.watcher_ids || []);
    }
  };

  const viewOnly = Boolean(task && isViewOnly(actor, task));
  const canEdit = isCreate || (task ? canEditTask(actor, task) : false);
  const canChangeAssignee = isCreate || (task ? canReassign(actor, task) : false);
  const canCheck = isCreate || (task ? canEditChecklist(actor, task) : false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const { confirmDiscard } = useUnsavedChangesGuard(dirty && open);

  const selectedAssignee = pickerUsers.find((u) => u.id === draft.assignee_id);
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
      assignee_id: draft.assignee_id || undefined,
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

  const handleClose = async () => {
    const ok = await confirmDiscard();
    if (ok) onClose();
  };

  const validateClient = (): string | null => {
    const title = draft.title.trim();
    if (!title) return 'Title is required';
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
      if (isCreate) {
        const created = await taskService.createTask(payloadFromDraft());
        addToast('Task created', created.serial, 'success');
        onSaved(created);
        return created;
      }
      let current = task;
      if (draft.assignee_id && draft.assignee_id !== task?.assignee_id) {
        const note = await prompt({ title: 'Reassign note (optional)', label: 'Note' });
        const assigned = await taskService.assign(task!.id, draft.assignee_id, note || undefined);
        onSaved(assigned);
        setBaseline(draftFrom(assigned));
        current = assigned;
      }
      const next = payloadFromDraft() as Record<string, unknown>;
      delete next.assignee_id;
      const baselinePayload = payloadFromDraftFromBaseline(baseline, workspaces);
      delete baselinePayload.assignee_id;
      const patch = changedFields(baselinePayload, next);
      if (Object.keys(patch).length) {
        patch.if_updated_at = current?.updated_at;
        const updated = await taskService.patchTask(task!.id, patch);
        onSaved(updated);
        setBaseline(draftFrom(updated));
        return updated;
      }
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
    setBusy(true);
    try {
      const updated = await taskService.changeStage(task.id, to, reason);
      onSaved(updated);
      setDraft((d) => ({ ...d, status: updated.status }));
      setBaseline(draftFrom(updated));
    } catch (err: any) {
      setServerError(err?.message || 'Could not change stage');
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel = isCreate
    ? 'Create task'
    : task?.status === 'todo' && canTransitionTo(actor, task, 'in_progress')
      ? 'Start'
      : task?.status === 'in_progress' && canTransitionTo(actor, task, 'in_review')
        ? 'Submit for review'
        : task?.status === 'in_review' && canTransitionTo(actor, task, 'completed')
          ? 'Approve'
          : canEdit
            ? 'Save'
            : 'Close';

  const onPrimary = async () => {
    if (isCreate) {
      await saveFields();
      return;
    }
    if (primaryLabel === 'Start') {
      if (dirty) await saveFields();
      await runStage('in_progress');
      return;
    }
    if (primaryLabel === 'Submit for review') {
      if (dirty) await saveFields();
      await runStage('in_review');
      return;
    }
    if (primaryLabel === 'Approve') {
      if (dirty) await saveFields();
      await runStage('completed');
      return;
    }
    if (primaryLabel === 'Save') {
      await saveFields();
      return;
    }
    onClose();
  };

  return (
    <FormDialog isOpen={open} onClose={() => void handleClose()} maxWidth="2xl">
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
          </div>
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
                        await taskService.remove(task.id);
                        onClose();
                      }
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </FormDialogHeader>

      <form
        className="flex flex-col flex-1 min-h-0"
        onSubmit={(e) => {
          e.preventDefault();
          void onPrimary();
        }}
      >
        <FormDialogBody className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
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
            <CustomSelect
              label="Assigned person"
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
            <FormField label="Department" hint="From assignee">
              <input
                readOnly
                value={departmentHint || '—'}
                className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg-muted"
              />
            </FormField>
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
                disabled={!canEdit}
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
            <Textarea label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} disabled={!canEdit} rows={4} />
            <TaskChecklist
              items={checklist}
              disabled={!canCheck || isCreate}
              onAdd={async (text) => {
                if (!task) return;
                const updated = await taskService.addChecklist(task.id, text);
                setChecklist(updated.checklist || []);
                onSaved(updated);
              }}
              onToggle={async (item, done) => {
                if (!task) return;
                const updated = await taskService.patchChecklist(task.id, item.id, { done });
                setChecklist(updated.checklist || []);
                onSaved(updated);
              }}
              onRemove={async (item) => {
                if (!task) return;
                const updated = await taskService.deleteChecklist(task.id, item.id);
                setChecklist(updated.checklist || []);
                onSaved(updated);
              }}
            />
            {task && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-fg-muted">Subtasks</label>
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s.id} className="text-sm text-fg flex items-center justify-between">
                      <span>{s.serial} · {s.title}</span>
                      <TaskStagePill status={s.status} />
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const title = await prompt({ title: 'Add subtask', label: 'Title' });
                      if (!title) return;
                      const created = await taskService.createTask({ title, parent_id: task.id, assignee_id: draft.assignee_id });
                      setSubtasks((cur) => [...cur, created]);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add subtask
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 min-h-[280px]">
            <Tabs defaultValue="discussion">
              <TabsList>
                <TabsTrigger value="discussion" count={comments.length || undefined}>Discussion</TabsTrigger>
                <TabsTrigger value="files" count={attachments.length || undefined}>Files</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="discussion">
                {task ? (
                  <TaskDiscussion
                    comments={comments}
                    users={mentionable}
                    disabled={viewOnly}
                    canAddWatchers={canAddWatcher(actor, task)}
                    onSubmit={async (text, opts) => {
                      await taskService.addComment(task.id, text, opts);
                      await loadSide(task.id);
                    }}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">Save the task to start a discussion.</p>
                )}
              </TabsContent>
              <TabsContent value="files">
                {task ? (
                  <TaskAttachments
                    taskId={task.id}
                    attachments={attachments}
                    disabled={viewOnly}
                    onChanged={() => loadSide(task.id)}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">Save the task to attach files.</p>
                )}
              </TabsContent>
              <TabsContent value="activity">
                <TaskActivity items={activity} />
              </TabsContent>
            </Tabs>
          </div>
        </FormDialogBody>
        <FormFooter serverError={serverError || clientError || undefined} uploading={busy}>
          {task?.status === 'in_review' && canTransitionTo(actor, task, 'in_progress', 'x') && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                const reason = await prompt({ title: 'Send back', label: 'Reason' });
                if (reason) await runStage('in_progress', reason);
              }}
            >
              Send back
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void handleClose()}>
            Close
          </Button>
          <Button type="submit" variant="primary" disabled={busy || (isCreate && !draft.title.trim())}>
            {primaryLabel}
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};

function payloadFromDraftFromBaseline(draft: Draft, workspaces: { id: string; name: string }[]): Record<string, unknown> {
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
    watcher_ids: [],
  };
}
