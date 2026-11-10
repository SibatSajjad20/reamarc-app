import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Repeat, Paperclip, MessageSquare } from 'lucide-react';
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  RowActions,
} from '@/components/ui/DataTable';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar } from '@/components/ui/Avatar';
import { Progress } from '@/components/ui/progress';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TASK_STAGES, type Task, type TaskStatus } from '@/types/task';
import { TaskPriorityPill, TaskStagePill, stageBarClass } from './TaskPriorityPill';
import { isOverdue, isDueToday } from '@/utils/taskFollowUp';
import { canReassign, canTransitionTo } from '@/utils/taskAccess';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { cn } from '@/lib/utils';
import type { TaskActor } from '@/types/task';

const PREVIEW = 10;

function formatDue(task: Task): { label: string; className: string } {
  if (!task.due_date) return { label: '—', className: 'text-fg-muted' };
  const d = new Date(`${task.due_date}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (isOverdue(task)) return { label, className: 'text-danger-fg' };
  if (isDueToday(task)) return { label, className: 'text-warning-fg' };
  return { label, className: 'text-fg' };
}

interface Props {
  status: TaskStatus;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
  onViewAll: () => void;
  selected: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onOpen: (task: Task) => void;
  onAction: (task: Task, action: string) => void;
  actor: TaskActor | null;
  limitRows?: boolean;
  headerLabel?: string;
  hideViewAll?: boolean;
  count?: number;
}

export const TaskStageSection: React.FC<Props> = ({
  status,
  tasks,
  collapsed,
  onToggle,
  onViewAll,
  selected,
  onToggleSelect,
  onOpen,
  onAction,
  actor,
  limitRows = true,
  headerLabel,
  hideViewAll = false,
  count,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const label = headerLabel || TASK_STAGES.find((s) => s.value === status)?.label || status;
  const shown = limitRows ? tasks.slice(0, PREVIEW) : tasks;
  const allIds = useMemo(() => shown.map((t) => t.id), [shown]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

  return (
    <TableCard data-testid={`task-stage-${status}`}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border bg-surface">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0">
          <span className={cn('w-1.5 h-5 rounded-sm shrink-0', stageBarClass(status))} />
          {headerLabel ? <span className="text-sm font-medium text-fg">{headerLabel}</span> : <TaskStagePill status={status} />}
          <span className="text-micro font-numeric text-fg-muted bg-subtle px-1.5 py-0.5 rounded-full">{count ?? tasks.length}</span>
          {collapsed ? <ChevronRight className="w-4 h-4 text-fg-muted" /> : <ChevronDown className="w-4 h-4 text-fg-muted" />}
        </button>
        {!hideViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs text-fg-muted hover:text-accent-text inline-flex items-center gap-1">
            View all
          </button>
        )}
      </div>
      {!collapsed && (
        <Table>
          <THead>
            <tr>
              <TH className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(c) => allIds.forEach((id) => onToggleSelect(id, c === true))}
                  aria-label={`Select ${label}`}
                />
              </TH>
              <TH>Task ID</TH>
              <TH>Task Name</TH>
              <TH>Assignee</TH>
              <TH>Project Name</TH>
              <TH>Progress</TH>
              <TH>Deadline</TH>
              <TH>Priority</TH>
              <TH className="w-10">Action</TH>
            </tr>
          </THead>
          <TBody>
            {shown.map((task) => {
              const due = formatDue(task);
              const checklist = task.checklist || [];
              const done = checklist.filter((c) => c.done).length;
              return (
                <TR key={task.id} className="cursor-pointer" onClick={() => onOpen(task)}>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(task.id)}
                      onCheckedChange={(c) => onToggleSelect(task.id, c === true)}
                      aria-label={`Select ${task.serial}`}
                    />
                  </TD>
                  <TD className="text-fg-muted text-xs">{task.serial}</TD>
                  <TD>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-sm text-fg truncate">{task.title}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {task.blocked && <StatusPill variant="danger" label="Blocked" hasDot={false} />}
                        {(task.subtasks_count || 0) > 0 && (
                          <span className="text-micro text-fg-muted">{task.subtasks_count} sub</span>
                        )}
                        {checklist.length > 0 && (
                          <span className="text-micro text-fg-muted">
                            {done}/{checklist.length}
                          </span>
                        )}
                        {task.recurrence && <Repeat className="w-3 h-3 text-fg-muted" />}
                        {(task.comments_count || 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-micro text-fg-muted">
                            <MessageSquare className="w-3 h-3" />
                            {task.comments_count}
                          </span>
                        )}
                        {(task.attachments_count || 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-micro text-fg-muted">
                            <Paperclip className="w-3 h-3" />
                            {task.attachments_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2" title={(task.assignment_chain || []).map((h) => h.to_name).join(' → ')}>
                      {task.assignee_name ? (
                        <>
                          <Avatar name={task.assignee_name} src={getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined} size={24} />
                          <span className="text-sm truncate">{task.assignee_name}</span>
                        </>
                      ) : (
                        <span className="text-fg-muted text-sm">Unassigned</span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-fg truncate">{task.department || '—'}</span>
                      {task.related?.client_name && (
                        <span className="text-micro text-fg-muted truncate">{task.related.client_name}</span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2 min-w-[88px]">
                      <Progress value={task.progress || 0} className="flex-1" />
                      <span className="text-micro font-numeric text-fg-muted w-8 text-right">{task.progress || 0}%</span>
                    </div>
                  </TD>
                  <TD className={cn('text-sm', due.className)}>{due.label}</TD>
                  <TD>
                    <TaskPriorityPill priority={task.priority} />
                  </TD>
                  <RowActions onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:bg-hover"
                          aria-label="Row actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(task)}>Open</DropdownMenuItem>
                        {canTransitionTo(actor, task, 'in_progress') && task.status === 'todo' && (
                          <DropdownMenuItem onClick={() => onAction(task, 'start')}>Start</DropdownMenuItem>
                        )}
                        {canTransitionTo(actor, task, 'in_review') && (
                          <DropdownMenuItem onClick={() => onAction(task, 'submit')}>Submit for review</DropdownMenuItem>
                        )}
                        {canTransitionTo(actor, task, 'completed') && task.status === 'in_review' && (
                          <DropdownMenuItem onClick={() => onAction(task, 'approve')}>Approve</DropdownMenuItem>
                        )}
                        {canReassign(actor, task) && (
                          <DropdownMenuItem onClick={() => onAction(task, 'reassign')}>Reassign</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onAction(task, 'block')}>
                          {task.blocked ? 'Unblock' : 'Mark blocked'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(task, 'cancel')} className="text-danger-fg">
                          Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(task, 'copy')}>Copy link</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </RowActions>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </TableCard>
  );
};
