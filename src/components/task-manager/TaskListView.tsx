import React, { useEffect, useMemo, useState } from 'react';
import { BulkBar } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { TASK_STAGES, type Task, type TaskActor, type TaskStatus } from '@/types/task';
import { TaskStageSection } from './TaskStageSection';

const STORAGE_KEY = 'reamarc_tasks_collapsed_stages';

interface Props {
  tasks: Task[];
  actor: TaskActor | null;
  onOpen: (task: Task) => void;
  onAction: (task: Task, action: string) => void;
  onViewAll: (stage: TaskStatus) => void;
  onBulk: (ids: string[], patch: { stage?: string; priority?: string; cancel?: boolean }) => void;
  focusedStage?: TaskStatus | 'all';
  stageCounts?: Partial<Record<TaskStatus, number>>;
}

export const TaskListView: React.FC<Props> = ({
  tasks,
  actor,
  onOpen,
  onAction,
  onViewAll,
  onBulk,
  focusedStage,
  stageCounts,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      {selected.size > 0 && (
        <BulkBar selectedCount={selected.size} onClear={() => setSelected(new Set())}>
          <CustomSelect
            size="xs"
            value=""
            onChange={(v) => {
              if (v) onBulk([...selected], { stage: v });
            }}
            options={[{ value: '', label: 'Status' }, ...TASK_STAGES]}
          />
          <CustomSelect
            size="xs"
            value=""
            onChange={(v) => {
              if (v) onBulk([...selected], { priority: v });
            }}
            options={[
              { value: '', label: 'Priority' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={() => onBulk([...selected], { cancel: true })}>
            Cancel
          </Button>
        </BulkBar>
      )}
      {stages.map((stage) => (
        <TaskStageSection
          key={stage.value}
          status={stage.value}
          tasks={grouped[stage.value] || []}
          collapsed={Boolean(collapsed[stage.value])}
          onToggle={() => setCollapsed((c) => ({ ...c, [stage.value]: !c[stage.value] }))}
          onViewAll={() => onViewAll(stage.value)}
          selected={selected}
          onToggleSelect={(id, checked) => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (checked) next.add(id);
              else next.delete(id);
              return next;
            });
          }}
          onOpen={onOpen}
          onAction={onAction}
          actor={actor}
          limitRows={focusedStage !== stage.value}
          count={stageCounts?.[stage.value]}
        />
      ))}
    </div>
  );
};
