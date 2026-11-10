import React from 'react';
import type { Task, TaskActor, TaskFollowUpBucket, TaskStatus } from '@/types/task';
import { taskFollowUpBucket } from '@/utils/taskFollowUp';
import { TaskStageSection } from './TaskStageSection';

const BUCKETS: { id: TaskFollowUpBucket; label: string; status: TaskStatus }[] = [
  { id: 'overdue', label: 'Overdue', status: 'todo' },
  { id: 'today', label: 'Due today', status: 'in_progress' },
  { id: 'upcoming', label: 'Upcoming', status: 'in_review' },
  { id: 'no_due', label: 'No due date', status: 'completed' },
];

interface Props {
  tasks: Task[];
  buckets?: Record<string, Task[]>;
  actor: TaskActor | null;
  onOpen: (task: Task) => void;
  onAction: (task: Task, action: string) => void;
}

export const TaskFollowUpView: React.FC<Props> = ({ tasks, buckets, actor, onOpen, onAction }) => {
  const grouped: Record<string, Task[]> = {
    overdue: buckets?.overdue || [],
    today: buckets?.today || [],
    upcoming: buckets?.upcoming || [],
    no_due: buckets?.no_due || buckets?.no_due_date || [],
  };

  if (!buckets) {
    grouped.overdue = [];
    grouped.today = [];
    grouped.upcoming = [];
    grouped.no_due = [];
    for (const task of tasks) {
      const bucket = taskFollowUpBucket(task);
      if (bucket) grouped[bucket].push(task);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" data-testid="task-follow-up-view">
      {BUCKETS.map((bucket) => (
        <TaskStageSection
          key={bucket.id}
          status={bucket.status}
          headerLabel={bucket.label}
          hideViewAll
          tasks={grouped[bucket.id] || []}
          collapsed={false}
          onToggle={() => undefined}
          onViewAll={() => undefined}
          selected={new Set()}
          onToggleSelect={() => undefined}
          onOpen={onOpen}
          onAction={onAction}
          actor={actor}
          limitRows={false}
        />
      ))}
    </div>
  );
};
