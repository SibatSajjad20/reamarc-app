import { StatusPill } from '@/components/ui/StatusPill';
import type { TaskPriority, TaskStatus } from '@/types/task';

const PRIORITY_VARIANT: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function TaskPriorityPill({ priority }: { priority?: string | null }) {
  const key = (priority || 'medium').toLowerCase() as TaskPriority;
  return (
    <StatusPill
      variant={PRIORITY_VARIANT[key] || 'neutral'}
      label={PRIORITY_LABEL[key] || 'Medium'}
      hasDot={false}
    />
  );
}

const STAGE_VARIANT: Record<TaskStatus, 'accent' | 'warning' | 'info' | 'success' | 'neutral'> = {
  todo: 'accent',
  in_progress: 'warning',
  in_review: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

const STAGE_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STAGE_BAR: Record<TaskStatus, string> = {
  todo: 'bg-accent',
  in_progress: 'bg-warning-dot',
  in_review: 'bg-info-dot',
  completed: 'bg-success-dot',
  cancelled: 'bg-fg-muted',
};

export function TaskStagePill({ status }: { status?: string | null }) {
  const key = (status || 'todo').toLowerCase() as TaskStatus;
  return (
    <StatusPill
      variant={STAGE_VARIANT[key] || 'neutral'}
      label={STAGE_LABEL[key] || 'To Do'}
      hasDot={false}
    />
  );
}

export function stageBarClass(status: string): string {
  return STAGE_BAR[(status as TaskStatus)] || 'bg-accent';
}

export { STAGE_LABEL };
