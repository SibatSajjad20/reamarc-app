import React, { useEffect, useMemo, useState } from 'react';
import { TASK_STAGES, type Task, type TaskActor, type TaskStatus } from '@/types/task';
import { TaskStageSection } from './TaskStageSection';

const STORAGE_KEY = 'reamarc_tasks_collapsed_stages';

interface Props {
  tasks: Task[];
  actor: TaskActor | null;
  onOpen: (task: Task) => void;
  onAction: (task: Task, action: string, origin?: { x: number; y: number }) => void;
  onViewAll: (stage: TaskStatus) => void;
  focusedStage?: TaskStatus | 'all';
  stageCounts?: Partial<Record<TaskStatus, number>>;
  arrivingId?: string | null;
  leavingId?: string | null;
  onDropTask?: (taskId: string, to: TaskStatus) => void;
}

export const TaskListView: React.FC<Props> = ({
  tasks,
  actor,
  onOpen,
  onAction,
  onViewAll,
  focusedStage,
  stageCounts,
  arrivingId,
  leavingId,
  onDropTask,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], in_review: [], completed: [] };
    for (const task of tasks) {
      if (!map[task.status]) map[task.status] = [];
      map[task.status].push(task);
    }
    return map;
  }, [tasks]);

  const stages = focusedStage && focusedStage !== 'all' ? TASK_STAGES.filter((s) => s.value === focusedStage) : TASK_STAGES;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" data-testid="task-list-view">
      {stages.map((stage) => (
        <TaskStageSection
          key={stage.value}
          status={stage.value}
          tasks={grouped[stage.value] || []}
          collapsed={Boolean(collapsed[stage.value])}
          onToggle={() => setCollapsed((c) => ({ ...c, [stage.value]: !c[stage.value] }))}
          onViewAll={() => onViewAll(stage.value)}
          onOpen={onOpen}
          onAction={onAction}
          actor={actor}
          limitRows={focusedStage !== stage.value}
          count={stageCounts?.[stage.value]}
          arrivingId={arrivingId}
          leavingId={leavingId}
          enableDrag={Boolean(onDropTask)}
          onDropTask={onDropTask}
        />
      ))}
    </div>
  );
};
