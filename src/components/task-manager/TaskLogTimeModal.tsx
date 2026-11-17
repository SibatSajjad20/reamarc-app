import React, { useState, useMemo } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { FormDialog, FormDialogBody } from '../ui/FormDialogLayout';
import { FormFooter } from '../ui/FormFooter';
import { Button } from '../ui/button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { useToast } from '@/context/ToastContext';
import { useOffDays } from '@/hooks/useOffDays';
import { dailyLogService } from '@/services/dailyLogService';
import { emitTasksChanged } from '@/services/taskService';
import { formatOffDayReason, nearestPastWorkdayIso } from '@/utils/offDays';
import {
  isLogDateExpired,
  isLogDateNotStarted,
  getOldestOpenLogDate,
  parseDurationToHours,
} from '@/utils/logTimeChecks';
import { TaskDescriptionEditor } from '../daily-log/TaskDescriptionEditor';
import {
  sanitizeTaskHtml,
  htmlToPlainText,
  isTaskDescriptionEmpty,
} from '@/utils/taskDescriptionHtml';
import type { Task } from '@/types/task';
import type { DailyLogEntry } from '@/types/dailyLog';
import { cn } from '@/lib/utils';

interface Props {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (entry: DailyLogEntry) => void;
}

const QUICK_DURATIONS = [
  { label: '30m', value: '0:30' },
  { label: '1h', value: '1.0' },
  { label: '1.5h', value: '1.5' },
  { label: '2h', value: '2.0' },
  { label: '4h', value: '4.0' },
];

const STATUS_OPTIONS: SegmentedOption[] = [
  {
    value: 'Completed',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success-fg shrink-0" />
        <span>Completed</span>
      </span>
    ),
  },
  {
    value: 'Incomplete',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warning-fg shrink-0" />
        <span>In Progress</span>
      </span>
    ),
  },
  {
    value: 'Blocker',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-danger-fg shrink-0" />
        <span>Blocker</span>
      </span>
    ),
  },
];

export const TaskLogTimeModal: React.FC<Props> = ({
  task,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const { holidays, workingSaturdays, isOffDay, getOffDay } = useOffDays();

  const getTodayIso = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayIso = useMemo(() => getTodayIso(), []);
  const minOpenDate = useMemo(
    () => getOldestOpenLogDate(holidays, workingSaturdays),
    [holidays, workingSaturdays]
  );

  const [date, setDate] = useState<string>(() => {
    const today = getTodayIso();
    const candidate = nearestPastWorkdayIso(today);
    return candidate;
  });
  const [hoursUtilized, setHoursUtilized] = useState<string>('1.0');
  const [taskStatus, setTaskStatus] = useState<string>('Incomplete');
  const [syncTaskStage, setSyncTaskStage] = useState<boolean>(true);
  const [description, setDescription] = useState<string>('');
  const [remarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial description and bounds when task changes
  React.useEffect(() => {
    if (task) {
      setDescription(task.title || '');
      setTaskStatus(task.status === 'completed' ? 'Completed' : 'Incomplete');
      setError(null);
      const today = getTodayIso();
      const candidate = nearestPastWorkdayIso(today);
      setDate(candidate);
    }
  }, [task]);

  const isExpired = useMemo(
    () => isLogDateExpired(date, holidays, workingSaturdays),
    [date, holidays, workingSaturdays]
  );
  const isFuture = useMemo(() => isLogDateNotStarted(date), [date]);
  const offDayReason = useMemo(() => {
    if (!isOffDay(date)) return null;
    const info = getOffDay(date);
    return info ? formatOffDayReason(info, date) : 'Scheduled non-working day';
  }, [date, isOffDay, getOffDay]);

  if (!task) return null;

  const clientName = task.related?.client_name || 'General';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setError('Daily log submission window (48 working hours) is expired for this date.');
      return;
    }
    if (isFuture) {
      setError('Cannot submit daily logs for future dates.');
      return;
    }
    if (offDayReason) {
      setError(offDayReason);
      return;
    }

    const durationVal = parseDurationToHours(hoursUtilized);
    if (!hoursUtilized || durationVal === null || durationVal <= 0) {
      setError('Please provide a valid time utilized (e.g. 1.5 or 0:30).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Compute desired task stage sync
    let sync_task_status: string | null = null;
    if (syncTaskStage) {
      if (taskStatus === 'Completed') {
        sync_task_status = 'completed';
      } else if (taskStatus === 'Incomplete') {
        sync_task_status = 'in_progress';
      }
    }

    const finalDescription = isTaskDescriptionEmpty(description)
      ? task.title
      : sanitizeTaskHtml(description) || htmlToPlainText(description) || task.title;

    try {
      const entry = await dailyLogService.createEntry({
        date,
        client_project: clientName,
        task_description: finalDescription,
        task_type: 'Scheduled Task',
        task_status: taskStatus,
        revisions_done: '',
        deliverables: '',
        hours_utilized: hoursUtilized.trim(),
        remarks: remarks.trim() || undefined,
        task_id: task.id,
        task_serial: task.serial,
        sync_task_status: sync_task_status || undefined,
      });

      addToast(
        'Time logged successfully',
        `${durationVal}h logged against ${task.serial}`,
        'success',
      );

      emitTasksChanged();
      onSuccess?.(entry);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to submit log entry';
      setError(msg);
      addToast(
        'Log submission failed',
        msg,
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      className="sm:max-w-[620px]"
      title={`Log Time: ${task.serial}`}
      subtitle={task.title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <FormDialogBody className="space-y-5 px-6 py-5 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="p-3 bg-danger-subtle border border-danger-border rounded-lg text-xs text-danger-fg flex items-start gap-2.5 shadow-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Task Info Summary Panel */}
          <div className="p-3.5 bg-subtle/70 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-fg-muted font-normal text-micro uppercase tracking-wider">
                Client / Project
              </span>
              <span className="font-semibold text-fg truncate" title={clientName}>
                {clientName}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-fg-muted font-normal text-micro uppercase tracking-wider">
                Logged vs Estimate
              </span>
              <div className="font-medium text-fg">
                <span className="font-semibold text-accent font-numeric">
                  {task.logged_hours || 0}h
                </span>
                {task.estimate_hours ? (
                  <span className="text-fg-muted font-numeric"> / {task.estimate_hours}h estimated</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-fg-muted font-normal text-micro uppercase tracking-wider">
                Current Stage
              </span>
              <span className="font-medium text-fg capitalize flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                {task.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* 2-Column Grid: Date Picker and Time Utilized */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            {/* Date picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg flex items-center justify-between">
                <span>Date</span>
                {offDayReason && (
                  <span className="text-micro text-warning-fg font-normal truncate max-w-[170px]" title={offDayReason}>
                    {offDayReason}
                  </span>
                )}
              </label>
              <CustomDatePicker
                value={date}
                onChange={(d) => {
                  setDate(d);
                  setError(null);
                }}
                minDate={minOpenDate}
                maxDate={todayIso}
                offDayMode="disable"
                isDateDisabled={(iso) =>
                  isLogDateExpired(iso, holidays, workingSaturdays) ||
                  isLogDateNotStarted(iso)
                }
                clearable={false}
              />
            </div>

            {/* Time Utilized */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg flex items-center justify-between">
                <span>Time Utilized</span>
                <span className="text-micro text-fg-muted">Hours</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={hoursUtilized}
                  onChange={(e) => {
                    setHoursUtilized(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. 1.0 or 0:30"
                  className="w-full h-9 pl-3 pr-8 py-1.5 text-sm bg-surface border border-border-strong rounded-md text-fg font-numeric tabular-nums focus:outline-none focus:border-focus"
                />
                <Clock className="w-4 h-4 text-fg-muted absolute right-2.5 top-2.5 pointer-events-none" />
              </div>

              {/* Quick Pick Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-micro text-fg-muted mr-0.5">Quick pick:</span>
                {QUICK_DURATIONS.map((dur) => (
                  <button
                    key={dur.value}
                    type="button"
                    onClick={() => {
                      setHoursUtilized(dur.value);
                      if (error) setError(null);
                    }}
                    className={cn(
                      'px-2.5 py-0.5 text-micro font-medium rounded-xs border transition-all cursor-pointer',
                      hoursUtilized === dur.value
                        ? 'bg-accent text-accent-fg border-accent shadow-xs'
                        : 'bg-subtle text-fg-2 border-border hover:bg-hover hover:border-fg-muted/40'
                    )}
                  >
                    {dur.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Work Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="log-work-details" className="text-xs font-medium text-fg">
              Work Done / Details
            </label>
            <TaskDescriptionEditor
              id="log-work-details"
              value={description}
              onChange={setDescription}
              placeholder="Describe what was accomplished during this session..."
              minRows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Task Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fg">Status in Daily Log</label>
            <SegmentedControl
              size="sm"
              options={STATUS_OPTIONS}
              value={taskStatus}
              onValueChange={setTaskStatus}
            />
          </div>

          {/* Sync Stage Toggle */}
          <div className="flex items-center gap-2.5 pt-0.5">
            <input
              type="checkbox"
              id="sync-stage"
              checked={syncTaskStage}
              onChange={(e) => setSyncTaskStage(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
            />
            <label htmlFor="sync-stage" className="text-xs text-fg cursor-pointer select-none">
              Update Task Manager status to{' '}
              <strong className="capitalize font-semibold text-fg">
                {taskStatus === 'Completed' ? 'Completed' : 'In Progress'}
              </strong>
            </label>
          </div>
        </FormDialogBody>

        {/* Modal Footer */}
        <FormFooter className="shrink-0 px-6 py-3.5 border-t border-border bg-surface">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || Boolean(offDayReason) || isExpired || isFuture}
          >
            {isSubmitting ? 'Logging...' : 'Save Log Entry'}
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};
