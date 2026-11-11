import React from 'react';
import { Calendar, ListChecks, MessageSquare, Paperclip, SquareCheckBig } from 'lucide-react';
import { KanbanCard } from '@/components/ui/Kanban';
import { Avatar } from '@/components/ui/Avatar';
import { Progress } from '@/components/ui/progress';
import { StatusPill } from '@/components/ui/StatusPill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/task';
import { formatPktDate } from '@/utils/datetime';
import { isOverdue } from '@/utils/taskFollowUp';
import { TaskPriorityPill } from './TaskPriorityPill';

export type BoardDensity = 'comfortable' | 'compact';

interface Props {
  task: Task;
  density?: BoardDensity;
  isDragging?: boolean;
  onOpen: (task: Task) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
}

function checklistProgress(task: Task): { done: number; total: number } | null {
  const items = task.checklist || [];
  if (!items.length) return null;
  return { done: items.filter((i) => i.done).length, total: items.length };
}

function DepartmentChip({ name }: { name: string }) {
  return (
    <span
      data-testid="task-pipeline-department"
      className="text-micro font-medium text-fg-2 bg-subtle border border-border rounded-xs px-1.5 min-w-0 max-w-full whitespace-normal break-words"
    >
      {name}
    </span>
  );
}

export const TaskPipelineCard: React.FC<Props> = ({
  task,
  density = 'comfortable',
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const overdue = isOverdue(task);
  const assigneeName = task.assignee_name || 'Unassigned';
  const avatarSrc = getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined;
  const dueText = task.due_date ? formatPktDate(task.due_date) : '';

  const open = () => onOpen(task);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  if (density === 'compact') {
    const showFlags = Boolean(task.blocked || overdue || task.status === 'in_review');
    return (
      <KanbanCard
        isDragging={isDragging}
        draggable
        tabIndex={0}
        onDragStart={(e) => onDragStart(e, task)}
        onDragEnd={onDragEnd}
        onClick={open}
        onKeyDown={onKeyDown}
        className="p-2.5 transition-colors duration-150 hover:border-border-strong focus-visible:focus-ring"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
            <span className="font-sans font-numeric tabular-nums text-micro text-fg-muted shrink-0">{task.serial}</span>
            {task.department ? <DepartmentChip name={task.department} /> : null}
          </div>
          <div className="shrink-0">
            <TaskPriorityPill priority={task.priority} />
          </div>
        </div>
        <p className="mt-1.5 text-ui font-medium text-fg line-clamp-2" title={task.title}>
          {task.title}
        </p>
        {showFlags && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {task.blocked && <StatusPill variant="danger" label="Blocked" hasDot={false} />}
            {overdue && <span className="text-micro text-danger-fg">Overdue</span>}
            {task.status === 'in_review' && (
              <StatusPill variant="info" label="Awaiting approval" hasDot={false} />
            )}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar name={assigneeName} src={avatarSrc} size={20} />
            <span className="text-micro text-fg-muted truncate">{assigneeName}</span>
          </div>
          {task.due_date && (
            <span className={cn('text-micro font-numeric', overdue ? 'text-danger-fg' : 'text-fg-muted')}>
              {dueText}
            </span>
          )}
        </div>
      </KanbanCard>
    );
  }

  const chips = [];
  if (task.status === 'in_review') {
    chips.push(<StatusPill key="review" variant="info" label="Awaiting approval" hasDot />);
  }
  if (task.blocked) {
    chips.push(<StatusPill key="blocked" variant="danger" label="Blocked" hasDot />);
  }
  if (overdue) {
    chips.push(<StatusPill key="overdue" variant="danger" label="Overdue" hasDot={false} />);
  }

  const checklist = (task.subtasks_count || 0) > 0 ? null : checklistProgress(task);
  const meta: { key: string; icon: React.ReactNode; text: string; label: string }[] = [];
  if ((task.subtasks_count || 0) > 0) {
    const done = task.subtasks_done ?? 0;
    const total = task.subtasks_count || 0;
    meta.push({
      key: 'subtasks',
      icon: <ListChecks size={13} />,
      text: `${done}/${total}`,
      label: `${done}/${total} subtasks`,
    });
  } else if (checklist) {
    meta.push({
      key: 'checklist',
      icon: <SquareCheckBig size={13} />,
      text: `${checklist.done}/${checklist.total}`,
      label: `${checklist.done}/${checklist.total} checklist`,
    });
  }
  if ((task.comments_count || 0) > 0) {
    meta.push({
      key: 'comments',
      icon: <MessageSquare size={13} />,
      text: String(task.comments_count),
      label: `${task.comments_count} comments`,
    });
  }
  if ((task.attachments_count || 0) > 0) {
    meta.push({
      key: 'attachments',
      icon: <Paperclip size={13} />,
      text: String(task.attachments_count),
      label: `${task.attachments_count} attachments`,
    });
  }

  return (
    <KanbanCard
      isDragging={isDragging}
      draggable
      tabIndex={0}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={open}
      onKeyDown={onKeyDown}
      className="p-3 pb-0 transition-colors duration-150 hover:border-border-strong focus-visible:focus-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          <span className="font-sans font-numeric tabular-nums text-micro text-fg-muted shrink-0">{task.serial}</span>
          {task.department ? <DepartmentChip name={task.department} /> : null}
        </div>
        <div className="shrink-0">
          <TaskPriorityPill priority={task.priority} />
        </div>
      </div>
      <p className="mt-2 text-body font-medium text-fg line-clamp-2" title={task.title}>
        {task.title}
      </p>
      {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}
      {meta.length > 0 && (
        <div className="mt-2.5 flex items-center gap-3 text-small font-numeric text-fg-muted">
          {meta.map((item) => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1" aria-label={item.label}>
                  {item.icon}
                  {item.text}
                </span>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
      {(task.progress || 0) > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <Progress value={task.progress || 0} className="flex-1" />
          <span className="text-micro font-numeric text-fg-muted">{task.progress}%</span>
        </div>
      )}
      <div className="mt-3 -mx-3 px-3 py-2 border-t border-border flex justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar name={assigneeName} src={avatarSrc} size={20} />
          <span className="text-small font-medium text-fg-2 truncate">{assigneeName}</span>
        </div>
        {task.due_date && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-small font-numeric shrink-0',
              overdue ? 'text-danger-fg' : 'text-fg-muted',
            )}
          >
            <Calendar size={12} />
            {dueText}
          </span>
        )}
      </div>
    </KanbanCard>
  );
};
