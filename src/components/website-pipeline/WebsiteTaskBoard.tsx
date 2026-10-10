import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Globe,
  MessageSquare,
  Plus,
  User,
} from 'lucide-react';
import type {
  WebsiteProject,
  WebsiteTask,
  TaskStatus,
  TaskPriority,
  TaskKind,
} from '../../types/websiteProject';
import {
  TASK_STATUS_COLUMNS,
  WEBSITE_STAGES_CONFIG,
} from '../../types/websiteProject';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';

interface Props {
  tasks: WebsiteTask[];
  projects: WebsiteProject[];
  onSelectTask: (task: WebsiteTask) => void;
  onRefresh?: () => void;
  onUpdateTaskStatus?: (task: WebsiteTask, newStatus: TaskStatus) => Promise<void>;
  onCreateTaskForStatus?: (status: TaskStatus) => void;
  isClientUser?: boolean;
}

function priorityBadge(priority: TaskPriority) {
  switch (priority) {
    case 'urgent':
      return {
        bg: 'bg-danger-bg',
        text: 'text-danger-fg',
        border: 'border-danger-bd',
        label: 'Urgent',
      };
    case 'high':
      return {
        bg: 'bg-warning-bg',
        text: 'text-warning-fg',
        border: 'border-warning-bd',
        label: 'High',
      };
    case 'medium':
      return {
        bg: 'bg-accent-soft',
        text: 'text-accent-text',
        border: 'border-accent-pill-bd',
        label: 'Medium',
      };
    default:
      return {
        bg: 'bg-surface',
        text: 'text-fg-muted',
        border: 'border-border',
        label: 'Low',
      };
  }
}

function kindBadge(kind: TaskKind) {
  switch (kind) {
    case 'bug':
      return {
        bg: 'bg-danger-bg',
        text: 'text-danger-fg',
        border: 'border-danger-bd',
        label: 'Bug Fix',
      };
    case 'revision':
      return {
        bg: 'bg-accent-soft',
        text: 'text-accent-text',
        border: 'border-accent-pill-bd',
        label: 'Revision',
      };
    default:
      return {
        bg: 'bg-surface',
        text: 'text-fg-muted',
        border: 'border-border',
        label: 'Task',
      };
  }
}

function stageLabel(stageId: string): string {
  const cfg = WEBSITE_STAGES_CONFIG.find((s) => s.id === stageId);
  return cfg ? cfg.shortLabel : stageId;
}

export const WebsiteTaskBoardSkeleton: React.FC = () => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none custom-scrollbar">
        {TASK_STATUS_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="min-w-[300px] w-[310px] max-w-[310px] flex-shrink-0 flex flex-col rounded-xl bg-surface border border-border p-3.5 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="h-4 w-28 bg-skel rounded-md" />
              <div className="h-4 w-6 bg-skel rounded-full" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((card) => (
                <div
                  key={card}
                  className="rounded-xl border border-border bg-subtle p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-24 bg-skel rounded" />
                    <div className="h-3 w-16 bg-skel rounded" />
                  </div>
                  <div className="h-4 w-40 bg-skel rounded" />
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div className="h-4 w-20 bg-skel rounded" />
                    <div className="h-5 w-5 bg-skel rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const WebsiteTaskBoard: React.FC<Props> = ({
  tasks,
  projects,
  onSelectTask,
  onUpdateTaskStatus,
  onCreateTaskForStatus,
  isClientUser = false,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const { user } = useAuth();
  const effectiveIsClient = isClientUser || user?.role === 'client';
  const { addToast } = useToast();
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  const projectMap = React.useMemo(() => {
    const map = new Map<string, WebsiteProject>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const tasksByStatus: Record<TaskStatus, WebsiteTask[]> = React.useMemo(() => {
    const map: Record<TaskStatus, WebsiteTask[]> = {
      todo: [],
      in_progress: [],
      review: [],
      completed: [],
    };
    for (const t of tasks) {
      if (map[t.status]) {
        map[t.status].push(t);
      } else {
        map.todo.push(t);
      }
    }
    return map;
  }, [tasks]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (effectiveIsClient) return;
    e.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, statusId: TaskStatus) => {
    if (effectiveIsClient) return;
    e.preventDefault();
    if (overStatus !== statusId) {
      setOverStatus(statusId);
    }
  };

  const handleDragLeave = () => {
    setOverStatus(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    if (effectiveIsClient) return;
    e.preventDefault();
    setOverStatus(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    if (onUpdateTaskStatus) {
      try {
        await onUpdateTaskStatus(task, targetStatus);
      } catch (err: any) {
        addToast('Status Update Failed', err?.message || 'Could not move task', 'error');
      }
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none custom-scrollbar">
        {TASK_STATUS_COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.id] || [];
          const isOver = overStatus === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`min-w-[300px] w-[310px] max-w-[310px] flex-shrink-0 flex flex-col rounded-xl bg-surface border transition-all duration-200 ${
                isOver
                  ? 'border-accent ring-2 ring-accent/30 bg-accent-soft'
                  : 'border-border'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 pb-2.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                  <span className="font-semibold text-sm text-fg truncate">
                    {col.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-subtle text-fg-muted border border-border shadow-2xs font-numeric">
                    {colTasks.length}
                  </span>
                </div>

                {!effectiveIsClient && onCreateTaskForStatus && (
                  <button
                    type="button"
                    onClick={() => onCreateTaskForStatus(col.id)}
                    className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-hover border border-border transition cursor-pointer"
                    title={`Add task to ${col.title}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Task Cards Container */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto custom-scrollbar">
                {colTasks.map((task) => {
                  const p = projectMap.get(task.project_id);
                  const projectName = task.project_name || p?.name || 'Website';
                  const pBadge = priorityBadge(task.priority);
                  const kBadge = kindBadge(task.kind);
                  const isDragging = draggingTaskId === task.id;
                  const isOverdue =
                    task.due_date &&
                    task.due_date < todayStr &&
                    task.status !== 'completed';

                  return (
                    <div
                      key={task.id}
                      draggable={!effectiveIsClient}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => onSelectTask(task)}
                      className={`group relative rounded-xl p-3.5 bg-subtle border border-border shadow-2xs hover:border-border-strong hover:bg-hover transition-all ${
                        !effectiveIsClient ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}`}
                    >
                      {/* Top Chips: Project Name + Stage */}
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-surface text-fg-muted truncate max-w-[160px] border border-border"
                          title={projectName}
                        >
                          <Globe className="w-3 h-3 text-accent shrink-0" />
                          <span className="truncate">{projectName}</span>
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-soft text-accent-text border border-accent-pill-bd">
                          {stageLabel(task.stage)}
                        </span>
                      </div>

                      {/* Task Title */}
                      <h4 className="font-semibold text-sm text-fg group-hover:text-accent-text transition-colors line-clamp-2 mb-2">
                        {task.name}
                      </h4>

                      {/* Badges Row: Priority, Kind, Required */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pBadge.bg} ${pBadge.text} ${pBadge.border}`}
                        >
                          {pBadge.label}
                        </span>

                        {task.kind !== 'task' && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${kBadge.bg} ${kBadge.text} ${kBadge.border}`}
                          >
                            {kBadge.label}
                          </span>
                        )}

                        {task.required && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning-fg bg-warning-bg px-1.5 py-0.5 rounded-md border border-warning-bd">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Required
                          </span>
                        )}
                      </div>

                      {/* Bottom Footer: Assignee, Due Date, Comments */}
                      <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-fg-muted">
                        {/* Assignee */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          {task.assignee_name ? (
                            <div className="flex items-center gap-1.5 truncate">
                              <Avatar
                                name={task.assignee_name}
                                src={getAvatarUrl(task.assignee_id, task.assignee_name)}
                                size={20}
                                className="rounded-full shrink-0 text-[10px]"
                              />
                              <span className="truncate max-w-[90px]">{task.assignee_name}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-fg-muted">
                              <User className="w-3.5 h-3.5" />
                              <span>Unassigned</span>
                            </div>
                          )}
                        </div>

                        {/* Due Date & Comments */}
                        <div className="flex items-center gap-2 shrink-0">
                          {task.comments && task.comments.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-fg-muted">
                              <MessageSquare className="w-3 h-3" />
                              <span>{task.comments.length}</span>
                            </span>
                          )}

                          {task.due_date && (
                            <span
                              className={`flex items-center gap-1 text-xs font-medium ${
                                isOverdue
                                  ? 'text-danger-fg font-semibold'
                                  : 'text-fg-muted'
                              }`}
                            >
                              {isOverdue ? (
                                <AlertCircle className="w-3 h-3 text-danger-fg" />
                              ) : (
                                <Calendar className="w-3 h-3 text-fg-muted" />
                              )}
                              <span>{task.due_date}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="py-8 text-center text-xs text-fg-muted italic">
                    No tasks in {col.title}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
