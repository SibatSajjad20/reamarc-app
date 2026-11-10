import React, { useMemo, useState } from 'react';
import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanColumnBody,
  KanbanColumnHeader,
  KanbanEmptyColumn,
  KanbanStatsStrip,
} from '@/components/ui/Kanban';
import { Avatar } from '@/components/ui/Avatar';
import { Progress } from '@/components/ui/progress';
import { StatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/context/ToastContext';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { TASK_STAGES, type Task, type TaskActor, type TaskCounts, type TaskStatus } from '@/types/task';
import { canTransitionTo } from '@/utils/taskAccess';
import { isOverdue } from '@/utils/taskFollowUp';
import { TaskPriorityPill } from './TaskPriorityPill';
import { cn } from '@/lib/utils';

interface Props {
  tasks: Task[];
  counts?: TaskCounts | null;
  stageCounts?: Partial<Record<TaskStatus, number>>;
  actor: TaskActor | null;
  onOpen: (task: Task) => void;
  onStageChange: (task: Task, to: TaskStatus) => Promise<void> | void;
}

export const TaskKanbanView: React.FC<Props> = ({ tasks, counts, stageCounts, actor, onOpen, onStageChange }) => {
  const { addToast } = useToast();
  const { getAvatarUrl } = useMemberAvatars();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Task[] | null>(null);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], completed: [], cancelled: [] };
    for (const task of tasks) {
      if (task.status !== 'cancelled') map[task.status]?.push(task);
    }
    return map;
  }, [tasks]);

  const open = counts?.open ?? 0;
  const overdue = counts?.overdue ?? 0;
  const blocked = counts?.blocked ?? 0;
  const inReview = counts?.in_review ?? stageCounts?.in_review ?? 0;

  return (
    <div className="flex-1 min-h-0 overflow-x-auto p-4" data-testid="task-kanban-view">
      <KanbanStatsStrip
        items={[
          `${open} open`,
          `${overdue} overdue`,
          `${blocked} blocked`,
          `${inReview} in review`,
        ]}
      />
      <KanbanBoard>
        {TASK_STAGES.map((stage) => {
          const column = grouped[stage.value] || [];
          return (
            <KanbanColumn key={stage.value} width="w-[220px]" data-testid={`task-kanban-${stage.value}`}>
              <KanbanColumnHeader label={stage.label} count={stageCounts?.[stage.value] ?? column.length} />
              <KanbanColumnBody
                data-testid={`task-kanban-body-${stage.value}`}
                isDropTarget={over === stage.value}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(stage.value);
                }}
                onDragLeave={() => setOver((cur) => (cur === stage.value ? null : cur))}
                onDrop={async (e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData('text/plain') || draggingId || '';
                  setDraggingId(null);
                  const task = tasks.find((t) => t.id === id);
                  if (!task || task.status === stage.value) return;
                  if (!canTransitionTo(actor, task, stage.value, stage.value === 'in_progress' ? 'Returned' : undefined)) {
                    addToast('Cannot move task', 'That stage change is not allowed.', 'error');
                    return;
                  }
                  const prev = tasks.map((t) => ({ ...t }));
                  setSnapshot(prev);
                  try {
                    await onStageChange(task, stage.value);
                    setSnapshot(null);
                  } catch (err: any) {
                    addToast('Move failed', err?.message || 'Could not change stage', 'error');
                    setSnapshot(null);
                  }
                }}
              >
                {column.length === 0 && <KanbanEmptyColumn label="Nothing in this stage" />}
                {(snapshot ? groupedFrom(snapshot)[stage.value] : column).map((task) => (
                  <KanbanCard
                    key={task.id}
                    isDragging={draggingId === task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOver(null);
                    }}
                    onClick={() => onOpen(task)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-micro text-fg-muted">{task.serial}</span>
                      <TaskPriorityPill priority={task.priority} />
                    </div>
                    <p className="text-sm font-medium text-fg leading-5 line-clamp-2">{task.title}</p>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {task.blocked && <StatusPill variant="danger" label="Blocked" hasDot={false} />}
                      {isOverdue(task) && <span className="text-micro text-danger-fg">Overdue</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {task.assignee_name && (
                          <Avatar
                            name={task.assignee_name}
                            src={getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined}
                            size={20}
                          />
                        )}
                        <span className="text-micro text-fg-muted truncate">{task.assignee_name || 'Unassigned'}</span>
                      </div>
                      {task.due_date && (
                        <span className={cn('text-micro', isOverdue(task) ? 'text-danger-fg' : 'text-fg-muted')}>
                          {task.due_date.slice(5)}
                        </span>
                      )}
                    </div>
                    {(task.progress || 0) > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={task.progress || 0} className="flex-1" />
                        <span className="text-micro font-numeric text-fg-muted">{task.progress}%</span>
                      </div>
                    )}
                  </KanbanCard>
                ))}
              </KanbanColumnBody>
            </KanbanColumn>
          );
        })}
      </KanbanBoard>
    </div>
  );
};

function groupedFrom(tasks: Task[]): Record<TaskStatus, Task[]> {
  const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], completed: [], cancelled: [] };
  for (const task of tasks) {
    if (task.status !== 'cancelled') map[task.status]?.push(task);
  }
  return map;
}
