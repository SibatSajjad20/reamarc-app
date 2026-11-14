import React, { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/context/ToastContext';
import { TASK_STAGES, type Task, type TaskActor, type TaskStatus } from '@/types/task';
import { canTransitionTo, stageChangeNeedsReason } from '@/utils/taskAccess';
import { cn } from '@/lib/utils';
import { stageBarClass } from './TaskPriorityPill';
import { TaskPipelineCard, type BoardDensity } from './TaskPipelineCard';

const ADDABLE_STAGES: TaskStatus[] = ['todo', 'in_progress', 'in_review'];

interface Props {
  tasks: Task[];
  stageCounts?: Partial<Record<TaskStatus, number>>;
  actor: TaskActor | null;
  density?: BoardDensity;
  onOpen: (task: Task) => void;
  onStageChange: (task: Task, to: TaskStatus) => Promise<void> | void;
  onAddToStage?: (stage: TaskStatus) => void;
}

function groupedFrom(tasks: Task[]): Record<TaskStatus, Task[]> {
  const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], completed: [], cancelled: [] };
  for (const task of tasks) {
    if (task.status !== 'cancelled') map[task.status]?.push(task);
  }
  return map;
}

function canAddToStage(actor: TaskActor | null, stage: TaskStatus): boolean {
  if (!ADDABLE_STAGES.includes(stage) || !actor?.id) return false;
  const stub = {
    status: 'todo',
    creator_id: actor.id,
    assigner_id: actor.id,
    assignee_id: actor.id,
  } as Task;
  return canTransitionTo(actor, stub, stage);
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const TaskKanbanView: React.FC<Props> = ({
  tasks,
  actor,
  density = 'comfortable',
  onOpen,
  onStageChange,
  onAddToStage,
}) => {
  const { addToast } = useToast();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Task[] | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupedFrom(tasks), [tasks]);
  const display = snapshot ? groupedFrom(snapshot) : grouped;
  const activeStage = TASK_STAGES[mobileIndex] || TASK_STAGES[0];

  const scrollToStage = (index: number) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
    setMobileIndex(index);
  };

  const onBoardScroll = () => {
    const el = boardRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(TASK_STAGES.length - 1, next));
    setMobileIndex(clamped);
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = Math.max(0, Math.min(TASK_STAGES.length - 1, mobileIndex + delta));
    scrollToStage(next);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4" data-testid="task-kanban-view">
      <div
        className="md:hidden shrink-0 z-20 bg-surface border-b border-border -mx-4 px-4"
        role="tablist"
        aria-label="Task pipeline stages"
        onKeyDown={onTabKeyDown}
      >
        <div className="flex overflow-x-auto">
          {TASK_STAGES.map((stage, index) => {
            const selected = index === mobileIndex;
            const count = (display[stage.value] || []).length;
            return (
              <button
                key={stage.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  'relative shrink-0 px-3 py-2 text-ui',
                  selected ? 'text-fg' : 'text-fg-muted',
                )}
                onClick={() => scrollToStage(index)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {stage.label}
                  <span className="text-micro font-sans font-numeric tabular-nums text-fg-muted bg-subtle border border-border rounded-full px-1.5">
                    {count}
                  </span>
                </span>
                {selected && (
                  <span className={cn('absolute bottom-0 left-0 right-0 h-0.5 rounded', stageBarClass(stage.value))} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {canAddToStage(actor, activeStage.value) && (
        <div className="md:hidden mt-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-fg-muted hover:text-fg"
            onClick={() => onAddToStage?.(activeStage.value)}
          >
            <Plus size={13} />
            Add to {activeStage.label}
          </Button>
        </div>
      )}
      <div
        ref={boardRef}
        role="region"
        aria-label="Task pipeline"
        onScroll={onBoardScroll}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory gap-3 items-stretch min-w-0 md:grid md:grid-cols-[repeat(4,minmax(240px,1fr))] md:overflow-hidden md:snap-none"
      >
        {TASK_STAGES.map((stage) => {
          const column = display[stage.value] || [];
          const count = column.length;
          const showAdd = canAddToStage(actor, stage.value);
          const emptyLabel = showAdd ? 'Drop a task here or add one' : 'Drop a task here';
          return (
            <div
              key={stage.value}
              className="flex flex-col min-w-0 min-h-0 h-full overflow-hidden max-md:w-full max-md:shrink-0 max-md:snap-start"
              data-testid={`task-kanban-${stage.value}`}
            >
              <div
                data-testid={`task-kanban-header-${stage.value}`}
                className="hidden md:block shrink-0 isolate bg-surface relative z-10"
              >
                <div className="relative flex h-11 px-1 items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-h3 text-fg">{stage.label}</span>
                    <span
                      data-testid={`task-kanban-count-${stage.value}`}
                      className="text-micro font-sans font-numeric tabular-nums text-fg-muted bg-subtle border border-border rounded-full px-1.5"
                    >
                      {count}
                    </span>
                  </div>
                  {showAdd && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-fg-muted hover:text-fg"
                          aria-label={`Add task to ${stage.label}`}
                          onClick={() => onAddToStage?.(stage.value)}
                        >
                          <Plus size={15} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{`Add task to ${stage.label}`}</TooltipContent>
                    </Tooltip>
                  )}
                  <span className={cn('absolute bottom-0 left-0 right-0 h-0.5 rounded', stageBarClass(stage.value))} />
                </div>
                <div className="h-1.5 bg-surface" aria-hidden />
              </div>
              <div
                data-testid={`task-kanban-body-${stage.value}`}
                className={cn(
                  'relative z-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col transition-colors',
                  over === stage.value && 'bg-accent-soft outline-1 outline-dashed outline-accent-200',
                )}
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
                  const needsReason = stageChangeNeedsReason(task.status, stage.value);
                  if (!canTransitionTo(actor, task, stage.value, needsReason ? 'x' : undefined)) {
                    addToast('Cannot move task', 'That stage change is not allowed.', 'error');
                    return;
                  }
                  if (!needsReason) {
                    setSnapshot(tasks.map((t) => (t.id === id ? { ...t, status: stage.value } : t)));
                  }
                  try {
                    await onStageChange(task, stage.value);
                    setSnapshot(null);
                  } catch (err: any) {
                    addToast('Move failed', err?.message || 'Could not change stage', 'error');
                    setSnapshot(null);
                  }
                }}
              >
                <div className="bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-0">
                  {column.length === 0 && (
                    <div className="h-[72px] border border-dashed border-border-strong rounded-lg flex items-center justify-center gap-1.5 text-small text-fg-muted select-none">
                      <Plus size={13} />
                      {emptyLabel}
                    </div>
                  )}
                  {column.map((task) => (
                    <TaskPipelineCard
                      key={task.id}
                      task={task}
                      density={density}
                      isDragging={draggingId === task.id}
                      onOpen={onOpen}
                      onDragStart={(e, t) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        requestAnimationFrame(() => setDraggingId(t.id));
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOver(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
