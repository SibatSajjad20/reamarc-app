import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { Avatar } from '@/components/ui/Avatar';
import type { Task, TaskActor } from '@/types/task';
import { useToast } from '@/context/ToastContext';
import { canEditTask } from '@/utils/taskAccess';
import { isOverdue } from '@/utils/taskFollowUp';
import { TaskPriorityPill, TaskStagePill } from './TaskPriorityPill';
import { cn } from '@/lib/utils';

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKey(value?: string | null): string | null {
  if (!value) return null;
  return value.includes('T') ? value.split('T')[0] : value;
}

function chipTone(task: Task): string {
  if (isOverdue(task)) return 'bg-danger-bg border-danger-bd text-fg';
  if (task.status === 'completed') return 'bg-subtle border-border/50 text-fg-muted';
  if (task.status === 'in_review') return 'bg-info-bg border-info-bd text-fg';
  return 'bg-subtle hover:bg-hover text-fg border-border/50';
}

interface Props {
  tasks: Task[];
  actor: TaskActor | null;
  onOpen: (task: Task) => void;
  onCreateForDate: (iso: string) => void;
  onReschedule: (task: Task, iso: string) => Promise<void> | void;
}

export const TaskCalendarView: React.FC<Props> = ({ tasks, actor, onOpen, onCreateForDate, onReschedule }) => {
  const { addToast } = useToast();
  const { getAvatarUrl } = useMemberAvatars();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [morePopoverDate, setMorePopoverDate] = useState<string | null>(null);
  const todayIso = useMemo(() => toLocalIso(new Date()), []);

  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diff);
    const days: { iso: string; label: string; dayName: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const nextD = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      days.push({
        iso: toLocalIso(nextD),
        label: nextD.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
        dayName: nextD.toLocaleDateString('en-US', { weekday: 'long' }),
      });
    }
    return days;
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDate = new Date(year, month, 1 - startOffset);
    const daysCount = startOffset + new Date(year, month + 1, 0).getDate() > 35 ? 42 : 35;
    const days: { iso: string; dayNum: number; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < daysCount; i++) {
      const cellD = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      days.push({
        iso: toLocalIso(cellD),
        dayNum: cellD.getDate(),
        isCurrentMonth: cellD.getMonth() === month,
      });
    }
    return days;
  }, [currentDate]);

  const byDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      const key = dateKey(task.due_date);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [tasks]);

  const unscheduled = useMemo(() => tasks.filter((t) => !dateKey(t.due_date) && t.status !== 'cancelled').length, [tasks]);

  const shiftDate = (amount: number) => {
    const next = new Date(currentDate);
    if (viewMode === 'week') next.setDate(next.getDate() + amount * 7);
    else next.setMonth(next.getMonth() + amount);
    setCurrentDate(next);
  };

  const handleDrop = async (iso: string, e?: React.DragEvent) => {
    const id = draggingId || e?.dataTransfer.getData('text/plain') || null;
    setDraggingId(null);
    setDragOverDate(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || !canEditTask(actor, task) || dateKey(task.due_date) === iso) return;
    try {
      await onReschedule(task, iso);
    } catch (err: any) {
      addToast('Could not reschedule', err?.message || 'The task was not moved.', 'error');
    }
  };

  const startDrag = (e: React.DragEvent, task: Task) => {
    if (!canEditTask(actor, task)) return;
    e.dataTransfer.setData('text/plain', task.id);
    setDraggingId(task.id);
  };

  const dayHandlers = (iso: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragOverDate !== iso) setDragOverDate(iso);
    },
    onDragLeave: () => setDragOverDate((cur) => (cur === iso ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void handleDrop(iso, e);
    },
  });

  const renderMonthChip = (task: Task) => (
    <button
      key={task.id}
      type="button"
      draggable={canEditTask(actor, task)}
      onDragStart={(e) => startDrag(e, task)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      title={`${task.serial} · ${task.title}`}
      className={cn(
        'w-full px-1.5 py-1 rounded-sm text-xs font-medium truncate cursor-pointer transition flex items-center gap-1.5 border',
        chipTone(task),
        draggingId === task.id && 'opacity-40',
      )}
      data-testid={`task-cal-card-${task.id}`}
    >
      <Avatar
        name={task.assignee_name || task.serial}
        src={getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined}
        size={14}
      />
      <span className="font-numeric text-accent shrink-0">{task.serial}</span>
      <span className="truncate flex-1 text-left">{task.title}</span>
    </button>
  );

  const renderWeekCard = (task: Task) => (
    <button
      key={task.id}
      type="button"
      draggable={canEditTask(actor, task)}
      onDragStart={(e) => startDrag(e, task)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      className={cn(
        'w-full text-left p-3 rounded-md bg-surface border border-border shadow-xs hover:border-border-strong hover:shadow-sm transition cursor-pointer group',
        isOverdue(task) && 'border-danger-bd bg-danger-bg',
        draggingId === task.id && 'opacity-40',
      )}
      data-testid={`task-cal-card-${task.id}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <Avatar
            name={task.assignee_name || 'Unassigned'}
            src={getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined}
            size={20}
          />
          <span className="text-xs font-medium text-fg-2 truncate" title={task.assignee_name || 'Unassigned'}>
            {task.assignee_name || 'Unassigned'}
          </span>
        </div>
        <TaskPriorityPill priority={task.priority} />
      </div>
      <h4 className="text-[13px] font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent transition-colors">
        {task.title}
      </h4>
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="font-numeric font-medium text-xs text-accent shrink-0">{task.serial}</span>
        <TaskStagePill status={task.status} />
      </div>
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden select-none" data-testid="task-calendar-view">
      <div className="px-5 py-2.5 border-b border-border bg-surface flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-subtle border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1.5 rounded-sm text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-fg px-3 min-w-[140px] text-center">
              {viewMode === 'week'
                ? `${weekDays[0].label} — ${weekDays[6].label}`
                : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1.5 rounded-sm text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2.5">
          {unscheduled > 0 && (
            <span className="text-xs text-fg-muted font-medium mr-1 hidden sm:inline-block">
              <strong className="text-fg font-medium">{unscheduled}</strong> unscheduled
            </span>
          )}
          <div className="flex items-center bg-subtle rounded-md p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'px-3 py-1 rounded-sm text-xs font-medium transition cursor-pointer',
                viewMode === 'week' ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
              )}
            >
              Week view
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={cn(
                'px-3 py-1 rounded-sm text-xs font-medium transition cursor-pointer',
                viewMode === 'month' ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
              )}
            >
              Month view
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'week' ? (
        <div className="flex-1 min-h-0 overflow-x-auto p-4 flex gap-3 custom-scrollbar">
          {weekDays.map((day) => {
            const dayItems = byDate[day.iso] || [];
            const isToday = day.iso === todayIso;
            const isOver = dragOverDate === day.iso;
            return (
              <div
                key={day.iso}
                {...dayHandlers(day.iso)}
                onClick={() => onCreateForDate(day.iso)}
                className={cn(
                  'w-[280px] min-w-[280px] max-w-[280px] flex-shrink-0 flex flex-col rounded-lg bg-surface border transition-colors',
                  isToday ? 'border-accent shadow-xs' : 'border-border',
                  isOver && 'ring-2 ring-accent bg-accent-soft/20',
                )}
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-fg">{day.dayName}</h3>
                    <p className="text-[10px] text-fg-muted font-medium">{day.label}</p>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-numeric font-medium px-2 py-0.5 rounded-full',
                      dayItems.length > 0 ? 'bg-subtle text-fg' : 'bg-subtle/50 text-fg-muted',
                    )}
                  >
                    {dayItems.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                  {dayItems.length === 0 ? (
                    <div className="h-36 rounded-md border border-dashed border-border flex flex-col items-center justify-center p-3 text-center">
                      <p className="text-xs font-medium text-fg-muted">No tasks due this day</p>
                      <p className="text-[10px] text-fg-muted mt-1 max-w-[180px]">
                        Click to add a task, or drag one here to reschedule.
                      </p>
                    </div>
                  ) : (
                    dayItems.map(renderWeekCard)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayHeader) => (
              <div key={dayHeader} className="py-1 text-center text-xs font-medium text-fg-muted uppercase tracking-wider">
                {dayHeader}
              </div>
            ))}
            {monthDays.map((cell) => {
              const cellItems = byDate[cell.iso] || [];
              const isToday = cell.iso === todayIso;
              const isOver = dragOverDate === cell.iso;
              const visibleItems = cellItems.slice(0, 3);
              const remainingCount = cellItems.length - 3;
              return (
                <div
                  key={cell.iso}
                  {...dayHandlers(cell.iso)}
                  onClick={() => onCreateForDate(cell.iso)}
                  className={cn(
                    'min-h-[112px] p-2 rounded-lg border flex flex-col transition-all',
                    cell.isCurrentMonth ? 'bg-surface' : 'bg-subtle/40 opacity-70',
                    isToday ? 'border-accent shadow-xs' : 'border-border',
                    isOver && 'ring-2 ring-accent bg-accent-soft/20',
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {isToday ? (
                      <span className="w-[22px] h-[22px] rounded-full bg-accent text-accent-fg flex items-center justify-center text-xs font-medium">
                        {cell.dayNum}
                      </span>
                    ) : (
                      <span className={cn('text-xs font-medium', cell.isCurrentMonth ? 'text-fg' : 'text-fg-muted')}>
                        {cell.dayNum}
                      </span>
                    )}
                    {cellItems.length > 0 && (
                      <span className="text-[10px] font-numeric font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted">
                        {cellItems.length}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {visibleItems.map(renderMonthChip)}
                    {remainingCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMorePopoverDate(cell.iso);
                        }}
                        className="text-xs text-accent hover:underline font-medium text-left pl-1 cursor-pointer block"
                      >
                        +{remainingCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {morePopoverDate && (
        <div
          className="fixed inset-0 z-[var(--z-overlay,50)] flex items-center justify-center p-4 bg-overlay animate-in fade-in duration-100"
          onClick={() => setMorePopoverDate(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-md overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">Tasks due {morePopoverDate}</h3>
              <button
                type="button"
                onClick={() => setMorePopoverDate(null)}
                className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-80 overflow-y-auto space-y-1.5">
              {(byDate[morePopoverDate] || []).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setMorePopoverDate(null);
                    onOpen(task);
                  }}
                  className="w-full p-2 rounded-md bg-subtle hover:bg-hover border border-border cursor-pointer flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Avatar
                      name={task.assignee_name || task.serial}
                      src={getAvatarUrl(task.assignee_id || undefined, task.assignee_name) || undefined}
                      size={20}
                    />
                    <span className="font-numeric text-xs font-medium text-accent shrink-0">{task.serial}</span>
                    <span className="text-xs text-fg truncate">{task.title}</span>
                  </div>
                  <TaskStagePill status={task.status} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
