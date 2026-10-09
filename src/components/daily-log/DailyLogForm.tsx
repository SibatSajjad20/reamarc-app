import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  User,
  Briefcase,
  FolderGit2,
  Clock,
  Link2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Plus,
  Trash2,
  Paperclip,
  Upload,
  ExternalLink,
} from 'lucide-react';
import { dailyLogService } from '../../services/dailyLogService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { useOffDays } from '../../hooks/useOffDays';
import { Button } from '../ui/button';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import type { DailyLogEntry, DailyLogColumn } from '../../types/dailyLog';
import {
  findDuplicate,
  formatHours,
  isLogDateExpired,
  isLogDateNotStarted,
  getOldestOpenLogDate,
} from '../../utils/logTimeChecks';
import { cn } from '../../lib/utils';

export interface DailyLogFormProps {
  mode: 'create' | 'edit';
  initialData?: DailyLogEntry | null;
  prefilledDate?: string;
  columns?: DailyLogColumn[];
  activeSheet: string;
  currentUser?: { name?: string; role?: string; full_name?: string; department?: string } | null;
  existingEntries?: DailyLogEntry[];
  onClose?: () => void;
  onSaved: (entry: DailyLogEntry) => void;
  onRefreshRequired?: () => void;
  layout?: 'card' | 'dialog';
}

const QUICK_DURATIONS = [
  { label: '30m', value: '0:30' },
  { label: '1h', value: '1.0' },
  { label: '1.5h', value: '1.5' },
  { label: '2h', value: '2.0' },
  { label: '4h', value: '4.0' },
];

const TASK_TYPE_OPTIONS: SegmentedOption[] = [
  { value: 'Scheduled Task', label: 'Scheduled' },
  { value: 'Runtime Task', label: 'Runtime' },
];

const TASK_STATUS_OPTIONS: SegmentedOption[] = [
  {
    value: 'Completed',
    label: (
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-success-fg shrink-0" aria-hidden="true" />
        <span>Completed</span>
      </span>
    ),
  },
  {
    value: 'Incomplete',
    label: (
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-warning-fg shrink-0" aria-hidden="true" />
        <span>Incomplete</span>
      </span>
    ),
  },
  {
    value: 'Blocker',
    label: (
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-danger-fg shrink-0" aria-hidden="true" />
        <span>Blocker</span>
      </span>
    ),
  },
];

const ALLOWED_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.doc', '.txt', '.zip', '.xlsx', '.csv'];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export const DailyLogForm: React.FC<DailyLogFormProps> = ({
  mode,
  initialData,
  prefilledDate,
  columns = [],
  activeSheet,
  currentUser,
  existingEntries = [],
  onClose,
  onSaved,
  onRefreshRequired,
  layout = 'card',
}) => {
  const { workspaces } = useWorkspaces();
  const { addToast } = useToast();
  const { isOffDay, lastWorkday, getOffDay, holidays, workingSaturdays } = useOffDays();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskDescRef = useRef<HTMLTextAreaElement>(null);

  const getTodayIso = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const minOpenDate = useMemo(() => {
    return getOldestOpenLogDate(holidays, workingSaturdays);
  }, [holidays, workingSaturdays]);

  const [date, setDate] = useState<string>(getTodayIso());

  const isCurrentDateExpired = useMemo(() => {
    return isLogDateExpired(date, holidays, workingSaturdays);
  }, [date, holidays, workingSaturdays]);

  const isCurrentDateNotStarted = useMemo(() => {
    return isLogDateNotStarted(date);
  }, [date]);

  const isDateInvalid = isCurrentDateExpired || isCurrentDateNotStarted;

  const [resourceName, setResourceName] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [clientProject, setClientProject] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [taskType, setTaskType] = useState<string>('Scheduled Task');
  const [taskStatus, setTaskStatus] = useState<string>('Incomplete');

  // Itemized Revisions List
  const [revisionPoints, setRevisionPoints] = useState<string[]>(['']);

  // Deliverables: Attached files + external URLs
  const [attachedFiles, setAttachedFiles] = useState<{ file_url: string; file_name: string; file_size?: number }[]>([]);
  const [deliverableUrl, setDeliverableUrl] = useState<string>('');
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [hoursUtilized, setHoursUtilized] = useState<string>('1.0');
  const [remarks, setRemarks] = useState<string>('');
  const [showRemarksInput, setShowRemarksInput] = useState<boolean>(false);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmittingAnother, setIsSubmittingAnother] = useState<boolean>(false);
  const isBusy = isSubmitting || isSubmittingAnother || isUploadingFile;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOccConflict, setIsOccConflict] = useState<boolean>(false);

  // Parse active workspaces for client selector
  const activeWorkspaces = useMemo(() => {
    return workspaces.filter((w) => w.status !== 'inactive');
  }, [workspaces]);

  const workspaceOptions = useMemo(() => {
    if (activeWorkspaces.length === 0) {
      return [
        { value: 'Internal Agency Work', label: 'Internal Agency Work' },
        { value: 'General Client Operations', label: 'General Client Operations' },
      ];
    }
    return activeWorkspaces.map((w) => ({
      value: w.name,
      label: w.name,
    }));
  }, [activeWorkspaces]);

  const parseRevisionsToPoints = (raw: string): string[] => {
    if (!raw) return [''];
    const lines = raw
      .split('\n')
      .map((l) => l.replace(/^[\s•\-\*]+/, '').trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : [''];
  };

  const hydrateSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionKey =
      mode === 'edit' && initialData?.id
        ? `edit:${initialData.id}:v${initialData.version ?? 0}`
        : `create:${prefilledDate || ''}`;

    if (hydrateSessionRef.current === sessionKey) return;
    hydrateSessionRef.current = sessionKey;

    setErrorMessage(null);
    setUploadError(null);
    setIsOccConflict(false);

    if (mode === 'edit' && initialData) {
      setDate(initialData.date || getTodayIso());
      setResourceName(initialData.resource_name || '');
      setRole(initialData.role || '');
      setDepartment(initialData.department || '');
      setClientProject(initialData.client_project || (workspaces[0]?.name || 'Internal Agency Work'));
      setTaskDescription(initialData.task_description || '');
      setTaskType(initialData.task_type || 'Scheduled Task');
      setTaskStatus(initialData.task_status || 'Incomplete');

      setRevisionPoints(parseRevisionsToPoints(initialData.revisions_done || ''));

      const rawDeliverables = initialData.deliverables || '';
      if (rawDeliverables.startsWith('/uploads/')) {
        const parts = rawDeliverables.split('|').map((p) => p.trim());
        const files: { file_url: string; file_name: string }[] = [];
        let urlText = '';
        parts.forEach((p) => {
          if (p.startsWith('/uploads/')) {
            const fileName = p.split('/').pop() || 'Attachment';
            files.push({ file_url: p, file_name: fileName });
          } else if (p) {
            urlText = p;
          }
        });
        setAttachedFiles(files);
        setDeliverableUrl(urlText);
      } else {
        setAttachedFiles([]);
        setDeliverableUrl(rawDeliverables);
      }

      const storedHours = Number(initialData.hours_utilized);
      setHoursUtilized(
        initialData.hours_utilized !== undefined &&
          initialData.hours_utilized !== null &&
          Number.isFinite(storedHours) &&
          storedHours > 0
          ? formatHours(storedHours)
          : '1.0'
      );
      setRemarks(initialData.remarks || '');
      if (initialData.remarks) setShowRemarksInput(true);
      setCustomFields(initialData.custom_fields || {});
    } else {
      const roleTitleMap: Record<string, string> = {
        admin: 'Admin',
        hr: 'HR',
        team_lead: 'Team Lead',
        team_member: 'Team Member',
        member: 'Team Member',
        client: 'Client',
      };
      const rawRole = currentUser?.role || 'team_member';
      const formattedRole = roleTitleMap[rawRole.toLowerCase()] || rawRole.replace('_', ' ');

      const resolvedDept =
        currentUser?.role === 'hr'
          ? currentUser?.department && currentUser.department !== 'All'
            ? currentUser.department
            : 'HR'
          : currentUser?.department || '';

      setDate(prefilledDate || lastWorkday(getTodayIso(), '2026-08-19'));
      setResourceName(currentUser?.full_name || currentUser?.name || 'User');
      setRole(formattedRole);
      setDepartment(resolvedDept);
      setClientProject(workspaces[0]?.name || 'Internal Agency Work');
      setTaskDescription('');
      setTaskType('Scheduled Task');
      setTaskStatus('Incomplete');
      setRevisionPoints(['']);
      setAttachedFiles([]);
      setDeliverableUrl('');
      setHoursUtilized('1.0');
      setRemarks('');
      setShowRemarksInput(false);
      setCustomFields({});
    }
  }, [mode, initialData, currentUser, prefilledDate, workspaces, lastWorkday]);

  const sameDayEntries = useMemo(
    () => existingEntries.filter((e) => e.date === date),
    [existingEntries, date]
  );

  const duplicateHit = useMemo(
    () =>
      findDuplicate(
        {
          id: initialData?.id,
          date,
          task_description: taskDescription,
          hours_utilized: hoursUtilized,
        },
        sameDayEntries
      ),
    [initialData?.id, date, taskDescription, hoursUtilized, sameDayEntries]
  );

  const derivedMonthSheet = useMemo(() => {
    if (date) {
      const parts = date.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        if (month >= 1 && month <= 12 && !isNaN(year)) {
          return `${monthNames[month - 1]} - ${year}`;
        }
      }
    }
    return activeSheet;
  }, [date, activeSheet]);

  const handleAddRevisionPoint = () => {
    setRevisionPoints((prev) => [...prev, '']);
  };

  const handleUpdateRevisionPoint = (index: number, val: string) => {
    setRevisionPoints((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveRevisionPoint = (index: number) => {
    setRevisionPoints((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_UPLOAD_EXTS.includes(ext)) {
      setUploadError(`Unsupported format '${ext}'. Allowed: PDF, PNG, JPG, DOCX, TXT, ZIP, XLSX, CSV.`);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File exceeds maximum allowed size of 25MB.');
      return;
    }

    setUploadError(null);
    setIsUploadingFile(true);

    try {
      const res = await dailyLogService.uploadDeliverableFile(file);
      setAttachedFiles((prev) => [
        ...prev,
        {
          file_url: res.file_url,
          file_name: res.file_name || file.name,
          file_size: res.file_size || file.size,
        },
      ]);
    } catch (err: any) {
      console.error('File upload error:', err);
      setUploadError(err.message || 'Failed to upload attachment. Please try again.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRemoveAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSave = async (addAnother: boolean = false) => {
    if (isBusy) return;

    if (!date.trim()) {
      setErrorMessage('Please provide a valid date.');
      return;
    }

    if (date > getTodayIso()) {
      setErrorMessage('Future dates are not permitted. Please log for today or a missed date.');
      return;
    }
    if (isOffDay(date)) {
      setErrorMessage(`${getOffDay(date).label}. Daily logs cannot be submitted on rest days.`);
      return;
    }

    if (isDateInvalid) {
      if (isCurrentDateExpired) {
        setErrorMessage(`The 48 working-hour submission window for ${date} has expired.`);
      } else {
        setErrorMessage(`Daily logs for ${date} cannot be entered before your shift starts.`);
      }
      return;
    }

    if (!taskDescription.trim()) {
      setErrorMessage('Task description is required.');
      return;
    }

    if (date.trim() < '2026-08-19') {
      setErrorMessage('Daily log entries cannot be logged for dates before 2026-08-19.');
      return;
    }

    if (duplicateHit) {
      addToast(
        'Similar entry exists',
        'You already have a log with this task and duration today. Saving anyway.',
        'info'
      );
    }

    setErrorMessage(null);
    setIsOccConflict(false);
    if (addAnother) {
      setIsSubmittingAnother(true);
    } else {
      setIsSubmitting(true);
    }

    try {
      const cleanPoints = revisionPoints.map((p) => p.trim()).filter(Boolean);
      const formattedRevisions = cleanPoints.length > 0 ? cleanPoints.map((p) => `• ${p}`).join('\n') : '';

      const deliverableParts: string[] = [];
      attachedFiles.forEach((f) => deliverableParts.push(f.file_url));
      if (deliverableUrl.trim()) {
        deliverableParts.push(deliverableUrl.trim());
      }
      const formattedDeliverables = deliverableParts.join(' | ');

      if (mode === 'create') {
        const payload = {
          date: date.trim(),
          resource_name: resourceName.trim(),
          role: role.trim(),
          client_project: clientProject.trim(),
          task_description: taskDescription.trim(),
          task_type: taskType,
          task_status: taskStatus,
          revisions_done: formattedRevisions,
          deliverables: formattedDeliverables,
          hours_utilized: hoursUtilized.trim(),
          remarks: remarks.trim(),
          month_sheet: derivedMonthSheet,
          custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        };

        const created = await dailyLogService.createEntry(payload);
        onSaved(created);

        if (addAnother) {
          addToast('Log added', 'Task saved! You can now log your next task.', 'success');
          setTaskDescription('');
          setRevisionPoints(['']);
          setAttachedFiles([]);
          setDeliverableUrl('');
          setHoursUtilized('1.0');
          setRemarks('');
          setShowRemarksInput(false);
          setCustomFields({});
          setTaskStatus('Incomplete');
          setErrorMessage(null);

          setTimeout(() => {
            taskDescRef.current?.focus();
          }, 50);
        } else if (onClose) {
          onClose();
        } else {
          addToast('Log added', 'Task saved successfully.', 'success');
          setTaskDescription('');
          setRevisionPoints(['']);
          setAttachedFiles([]);
          setDeliverableUrl('');
          setHoursUtilized('1.0');
          setRemarks('');
          setShowRemarksInput(false);
          setCustomFields({});
          setTaskStatus('Incomplete');
          setErrorMessage(null);
        }
      } else if (mode === 'edit' && initialData) {
        const payload = {
          version: initialData.version,
          date: date.trim(),
          resource_name: resourceName.trim(),
          role: role.trim(),
          client_project: clientProject.trim(),
          task_description: taskDescription.trim(),
          task_type: taskType,
          task_status: taskStatus,
          revisions_done: formattedRevisions,
          deliverables: formattedDeliverables,
          hours_utilized: hoursUtilized.trim(),
          remarks: remarks.trim(),
          month_sheet: initialData.month_sheet || derivedMonthSheet,
          custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        };

        const updated = await dailyLogService.updateEntry(initialData.id, payload);
        onSaved(updated);
        addToast('Changes saved', 'Daily log entry updated.', 'success');
        if (onClose) onClose();
      }
    } catch (err: any) {
      console.error('Failed to submit daily log entry:', err);
      if (err.status === 409) {
        setIsOccConflict(true);
        setErrorMessage(
          err.message || 'This record was modified by another session. Please refresh and try again.'
        );
      } else {
        setErrorMessage(
          err.message ||
            err.details?.detail ||
            "Couldn't save entry. Please check your inputs and try again."
        );
      }
    } finally {
      setIsSubmitting(false);
      setIsSubmittingAnother(false);
    }
  };

  const isCard = layout === 'card';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave(false);
      }}
      className={cn('space-y-3.5 text-ui text-fg', isCard ? 'text-xs' : 'text-sm')}
    >
      {/* Error Banner */}
      {errorMessage && (
        <div
          className={cn(
            'p-3 rounded-md border flex items-start gap-2.5 text-xs select-none',
            isOccConflict
              ? 'bg-warning-bg border-warning-bd text-warning-fg'
              : 'bg-danger-bg border-danger-bd text-danger-fg'
          )}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{errorMessage}</p>
            {isOccConflict && onRefreshRequired && (
              <button
                type="button"
                onClick={() => {
                  onRefreshRequired();
                  if (onClose) onClose();
                }}
                className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-warning-fg underline hover:no-underline cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh view to load latest version</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Date Expiry Warnings */}
      {isCurrentDateExpired && (
        <div className="p-2.5 bg-danger-bg border border-danger-bd rounded-md text-small text-danger-fg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>The 48 working-hour submission window for {date} has expired. Logs for this date are locked.</span>
        </div>
      )}
      {isCurrentDateNotStarted && (
        <div className="p-2.5 bg-warning-bg border border-warning-bd rounded-md text-small text-warning-fg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Daily logs for {date} cannot be entered before your shift starts.</span>
        </div>
      )}

      {/* Resource & Role Info (only displayed in Dialog mode) */}
      {!isCard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
          <div>
            <label className="text-label text-fg mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={14} className="text-fg-muted" />
                <span>Resource name</span>
              </span>
              <span className="inline-flex items-center gap-1 text-micro text-fg-muted">
                <Lock size={11} /> Locked
              </span>
            </label>
            <div className="w-full px-3 py-1.5 bg-subtle border border-border rounded-md text-ui text-fg font-medium flex items-center justify-between select-none">
              <span className="truncate">{resourceName || 'User'}</span>
            </div>
          </div>

          <div>
            <label className="text-label text-fg mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Briefcase size={14} className="text-fg-muted" />
                <span>Role & department</span>
              </span>
              <span className="inline-flex items-center gap-1 text-micro text-fg-muted">
                <Lock size={11} /> Locked
              </span>
            </label>
            <div className="w-full px-3 py-1.5 bg-subtle border border-border rounded-md text-ui text-fg font-medium flex items-center justify-between select-none">
              <span className="truncate">
                {role || 'Team Member'}
                {department ? ` · ${department}` : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Row: Date & Client / project */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-label text-fg mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CalendarIcon size={14} className="text-fg-muted" />
              <span>Date</span>
            </span>
          </label>
          <CustomDatePicker
            value={date}
            onChange={(val) => setDate(val || lastWorkday(getTodayIso(), minOpenDate))}
            minDate={minOpenDate}
            maxDate={getTodayIso()}
            placeholder="Select date..."
            offDayMode="disable"
          />
        </div>

        <div>
          <label className="block text-label text-fg mb-1 flex items-center gap-1.5">
            <FolderGit2 size={14} className="text-fg-muted" />
            <span>Client / project</span>
          </label>
          <CustomSelect
            value={clientProject}
            onChange={setClientProject}
            options={workspaceOptions}
            icon={FolderGit2}
            placeholder="Select client or project..."
          />
        </div>
      </div>

      {/* Task Description */}
      <div>
        <label className="block text-label text-fg mb-1">
          Task description
        </label>
        <textarea
          ref={taskDescRef}
          required
          rows={isCard ? 2 : 3}
          placeholder="Describe what you worked on..."
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-md text-ui text-fg placeholder:text-fg-faint focus-visible:focus-ring resize-none leading-relaxed transition-colors"
        />
      </div>

      {/* Task Type */}
      <div className="sm:w-1/2">
        <label className="block text-label text-fg mb-1.5">
          Task type
        </label>
        <SegmentedControl
          size="sm"
          value={taskType}
          onValueChange={setTaskType}
          options={TASK_TYPE_OPTIONS}
        />
      </div>

      {/* Task Status */}
      <div>
        <label className="block text-label text-fg mb-1.5">
          Task status
        </label>
        {TASK_STATUS_OPTIONS.length > 3 ? (
          <CustomSelect
            size="sm"
            value={taskStatus}
            onChange={setTaskStatus}
            options={TASK_STATUS_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.value,
            }))}
          />
        ) : (
          <SegmentedControl
            block
            size="sm"
            value={taskStatus}
            onValueChange={setTaskStatus}
            options={TASK_STATUS_OPTIONS}
          />
        )}
      </div>

      {/* Hours Utilized */}
      <div>
        <label className="text-label text-fg mb-1.5 flex items-center gap-1.5">
          <Clock size={14} className="text-fg-muted" />
          <span>Hours utilized</span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="1.0"
            value={hoursUtilized}
            onChange={(e) => setHoursUtilized(e.target.value)}
            className="w-24 px-2.5 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-ui font-numeric tabular-nums text-fg focus-visible:focus-ring"
          />

          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_DURATIONS.map((d) => {
              const isSelected = hoursUtilized === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setHoursUtilized(d.value)}
                  className={cn(
                    'h-7 px-2.5 rounded-sm border text-small font-medium transition-colors cursor-pointer select-none',
                    isSelected
                      ? 'border-accent text-accent-text bg-accent-soft'
                      : 'border-border bg-surface text-fg-2 hover:bg-hover'
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Deliverables (Upload & Links) */}
      <div className="space-y-2">
        <label className="block text-label text-fg flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Paperclip size={14} className="text-fg-muted" />
            <span>Deliverables</span>
            <span className="text-fg-muted font-normal text-small">· links or files</span>
          </span>
        </label>

        {uploadError && (
          <div className="p-2 rounded-md bg-danger-bg border border-danger-bd text-danger-fg text-small">
            {uploadError}
          </div>
        )}

        {/* Deliverables Dropzone / Upload button */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            loading={isUploadingFile}
            loadingText="Uploading…"
            icon={Upload}
            className="flex-1 border-dashed"
          >
            Drop files or click to upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.txt,.zip,.xlsx,.csv"
            onChange={handleFileSelect}
          />
        </div>

        {/* Attached Files List */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {attachedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-subtle border border-border text-small text-fg"
              >
                <Paperclip size={12} className="text-fg-muted shrink-0" />
                <span className="font-medium truncate max-w-[140px]">{file.file_name}</span>
                {file.file_size ? (
                  <span className="text-micro text-fg-muted font-numeric">({formatFileSize(file.file_size)})</span>
                ) : null}
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-text hover:underline p-0.5"
                  title="Open file"
                >
                  <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachedFile(idx)}
                  className="text-fg-muted hover:text-danger-fg p-0.5 cursor-pointer"
                  title="Remove file"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Link Input */}
        <div className="relative">
          <Link2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Paste Figma, Drive, or GitHub link..."
            value={deliverableUrl}
            onChange={(e) => setDeliverableUrl(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-small text-fg placeholder:text-fg-faint focus-visible:focus-ring transition-colors"
          />
        </div>
      </div>

      {/* Remarks (collapsible in card mode, expanded if content exists) */}
      <div>
        {!showRemarksInput && !remarks ? (
          <button
            type="button"
            onClick={() => setShowRemarksInput(true)}
            className="inline-flex items-center gap-1 text-small font-medium text-accent-text hover:underline cursor-pointer select-none"
          >
            <Plus size={14} />
            <span>Add remarks</span>
          </button>
        ) : (
          <div>
            <label className="block text-label text-fg mb-1">
              Remarks (optional)
            </label>
            <input
              type="text"
              placeholder="Any additional notes or references..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-small text-fg placeholder:text-fg-faint focus-visible:focus-ring transition-colors"
            />
          </div>
        )}
      </div>

      {/* Revisions list in Dialog mode */}
      {!isCard && (
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-label text-fg">
              Revisions / updates done (points)
            </label>
            <button
              type="button"
              onClick={handleAddRevisionPoint}
              className="inline-flex items-center gap-1 text-small font-medium text-accent-text hover:underline cursor-pointer"
            >
              <Plus size={12} />
              <span>Add point</span>
            </button>
          </div>

          <div className="space-y-1.5">
            {revisionPoints.map((pt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-3 text-center text-fg-muted select-none">•</span>
                <input
                  type="text"
                  placeholder={`Point ${idx + 1}...`}
                  value={pt}
                  onChange={(e) => handleUpdateRevisionPoint(idx, e.target.value)}
                  className="flex-1 px-3 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-small text-fg placeholder:text-fg-faint focus-visible:focus-ring"
                />
                {revisionPoints.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRevisionPoint(idx)}
                    className="p-1 text-fg-muted hover:text-danger-fg cursor-pointer rounded"
                    title="Remove point"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Fields (if configured) */}
      {columns
        .filter(
          (c) =>
            ![
              'date',
              'resource_name',
              'role',
              'department',
              'client_project',
              'task_description',
              'task_type',
              'task_status',
              'revisions_done',
              'deliverables',
              'hours_utilized',
              'remarks',
            ].includes(c.key)
        )
        .map((c) => (
          <div key={c.key}>
            <label className="block text-label text-fg mb-1">
              {c.label}
            </label>
            {c.type === 'select' && c.options ? (
              <select
                value={customFields[c.key] || ''}
                onChange={(e) =>
                  setCustomFields((prev) => ({ ...prev, [c.key]: e.target.value }))
                }
                className="w-full px-3 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-small text-fg focus-visible:focus-ring"
              >
                <option value="">Select...</option>
                {c.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                placeholder={`Enter ${c.label}...`}
                value={customFields[c.key] || ''}
                onChange={(e) =>
                  setCustomFields((prev) => ({ ...prev, [c.key]: e.target.value }))
                }
                className="w-full px-3 py-1.5 h-8 bg-surface border border-border-strong rounded-md text-small text-fg focus-visible:focus-ring"
              />
            )}
          </div>
        ))}

      {/* Form Action Buttons */}
      <div className={cn('pt-3 border-t border-border flex items-center gap-2 justify-end', isCard ? 'mt-4' : 'mt-6')}>
        {!isCard && onClose && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </Button>
        )}

        {mode === 'create' && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => handleSave(true)}
            disabled={isBusy || isDateInvalid}
            loading={isSubmittingAnother}
            loadingText="Saving…"
          >
            Save & add another
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => handleSave(false)}
          disabled={isBusy || isDateInvalid}
          loading={isSubmitting || isUploadingFile}
          loadingText="Saving…"
          icon={CheckCircle2}
        >
          {mode === 'create' ? 'Save entry' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};
