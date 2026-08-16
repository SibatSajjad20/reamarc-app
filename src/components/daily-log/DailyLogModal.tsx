import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  User,
  Briefcase,
  FolderGit2,
  Clock,
  FileText,
  Link2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { dailyLogService } from '../../services/dailyLogService';
import type { DailyLogEntry, DailyLogColumn } from '../../types/dailyLog';

interface DailyLogModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: DailyLogEntry | null;
  prefilledDate?: string;
  columns?: DailyLogColumn[];
  activeSheet: string;
  currentUser?: { name?: string; role?: string; designation?: string; full_name?: string } | null;
  onClose: () => void;
  onSaved: (entry: DailyLogEntry) => void;
  onRefreshRequired?: () => void;
}

const QUICK_DURATIONS = [
  { label: '30m', value: '0:30' },
  { label: '1h', value: '1.0' },
  { label: '1.5h', value: '1.5' },
  { label: '2h', value: '2.0' },
  { label: '4h', value: '4.0' },
  { label: '8h', value: '8.0' },
];

export const DailyLogModal: React.FC<DailyLogModalProps> = ({
  isOpen,
  mode,
  initialData,
  prefilledDate,
  columns = [],
  activeSheet,
  currentUser,
  onClose,
  onSaved,
  onRefreshRequired,
}) => {
  const getTodayIso = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState<string>(getTodayIso());
  const [resourceName, setResourceName] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [clientProject, setClientProject] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [taskType, setTaskType] = useState<string>('Scheduled Task');
  const [taskStatus, setTaskStatus] = useState<string>('Incomplete');
  const [revisionsDone, setRevisionsDone] = useState<string>('');
  const [deliverables, setDeliverables] = useState<string>('');
  const [hoursUtilized, setHoursUtilized] = useState<string>('1.0');
  const [remarks, setRemarks] = useState<string>('');
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOccConflict, setIsOccConflict] = useState<boolean>(false);

  // Sync form state when modal opens or initialData changes
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setIsOccConflict(false);

    if (mode === 'edit' && initialData) {
      setDate(initialData.date || getTodayIso());
      setResourceName(initialData.resource_name || '');
      setRole(initialData.role || '');
      setClientProject(initialData.client_project || '');
      setTaskDescription(initialData.task_description || '');
      setTaskType(initialData.task_type || 'Scheduled Task');
      setTaskStatus(initialData.task_status || 'Incomplete');
      setRevisionsDone(initialData.revisions_done || '');
      setDeliverables(initialData.deliverables || '');
      setHoursUtilized(
        initialData.hours_utilized !== undefined && initialData.hours_utilized !== null
          ? String(initialData.hours_utilized)
          : '1.0'
      );
      setRemarks(initialData.remarks || '');
      setCustomFields(initialData.custom_fields || {});
    } else {
      // Create mode defaults: autofill resource name and designation (e.g. Web Development)
      const defaultRoleOrDesignation =
        currentUser?.designation ||
        (currentUser?.role && currentUser.role !== 'member' ? currentUser.role : 'Web Development');

      setDate(prefilledDate || getTodayIso());
      setResourceName(currentUser?.full_name || currentUser?.name || '');
      setRole(defaultRoleOrDesignation);
      setClientProject('');
      setTaskDescription('');
      setTaskType('Scheduled Task');
      setTaskStatus('Incomplete');
      setRevisionsDone('');
      setDeliverables('');
      setHoursUtilized('1.0');
      setRemarks('');
      setCustomFields({});
    }
  }, [isOpen, mode, initialData, currentUser, prefilledDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!date.trim()) {
      setErrorMessage('Please provide a valid date.');
      return;
    }

    if (!taskDescription.trim()) {
      setErrorMessage('Task description is required.');
      return;
    }

    setErrorMessage(null);
    setIsOccConflict(false);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        const payload = {
          date: date.trim(),
          resource_name: resourceName.trim(),
          role: role.trim(),
          client_project: clientProject.trim(),
          task_description: taskDescription.trim(),
          task_type: taskType,
          task_status: taskStatus,
          revisions_done: revisionsDone.trim(),
          deliverables: deliverables.trim(),
          hours_utilized: hoursUtilized.trim(),
          remarks: remarks.trim(),
          month_sheet: activeSheet,
          custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        };

        const created = await dailyLogService.createEntry(payload);
        onSaved(created);
        onClose();
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
          revisions_done: revisionsDone.trim(),
          deliverables: deliverables.trim(),
          hours_utilized: hoursUtilized.trim(),
          remarks: remarks.trim(),
          month_sheet: initialData.month_sheet || activeSheet,
          custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        };

        const updated = await dailyLogService.updateEntry(initialData.id, payload);
        onSaved(updated);
        onClose();
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
            'Failed to save daily log entry. Please check your inputs and try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {mode === 'create' ? 'Add Daily Log Entry' : 'Edit Daily Log Entry'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {mode === 'create'
                  ? `Logging for sheet: ${activeSheet}`
                  : `Updating entry (v${initialData?.version || 1}) • ${initialData?.month_sheet || activeSheet}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Error Banner */}
          {errorMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                isOccConflict
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {isOccConflict && onRefreshRequired && (
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshRequired();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-amber-700 dark:text-amber-200 underline hover:no-underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh table to load latest version</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Row 1: Date & Resource Name & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Date</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Resource Name</span>
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>Role / Designation</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Web Development, Team Lead"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Row 2: Client / Project */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Client / Project</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Corp - Brand Campaign"
              value={clientProject}
              onChange={(e) => setClientProject(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Row 3: Task Type & Task Status Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Task Type */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Task Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Scheduled Task', label: 'Scheduled Task', theme: 'border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-500/10' },
                  { id: 'Runtime Task', label: 'Runtime Task', theme: 'border-purple-500/40 text-purple-700 dark:text-purple-300 bg-purple-500/10' },
                ].map((t) => {
                  const isSelected = taskType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTaskType(t.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        isSelected
                          ? `${t.theme} ring-2 ring-indigo-500/20 shadow-xs`
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Task Status */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Task Status
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'Completed', label: 'Completed', color: 'bg-emerald-500', theme: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' },
                  { id: 'Incomplete', label: 'Incomplete', color: 'bg-amber-500', theme: 'border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10' },
                  { id: 'Blocker', label: 'Blocker', color: 'bg-rose-500', theme: 'border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-500/10' },
                ].map((s) => {
                  const isSelected = taskStatus === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTaskStatus(s.id)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? `${s.theme} ring-2 ring-indigo-500/20 shadow-xs`
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 4: Task Description */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Task Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe the objectives and work executed in detail..."
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Row 5: Revisions & Deliverables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Revisions / Updates Done
              </label>
              <textarea
                rows={2}
                placeholder="Notes on client feedback or revisions..."
                value={revisionsDone}
                onChange={(e) => setRevisionsDone(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Deliverables Submitted (Links / Files)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Google Drive, Figma, or GitHub URLs..."
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Row 6: Hours Utilized with Quick Selector Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Hours Utilized</span>
              </label>
              <span className="text-[11px] text-zinc-400">
                Supports flexible input: <code className="font-mono text-indigo-500">1.5</code>, <code className="font-mono text-indigo-500">2 hrs</code>, <code className="font-mono text-indigo-500">0:30</code>, <code className="font-mono text-indigo-500">45m</code>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. 1.5, 2 hrs, 0:30, 45m"
                value={hoursUtilized}
                onChange={(e) => setHoursUtilized(e.target.value)}
                className="w-40 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />

              {/* Quick Duration Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {QUICK_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setHoursUtilized(d.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      hoursUtilized === d.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 7: Remarks */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="Any additional notes or references..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Custom Columns (if configured by workspace admin) */}
          {columns
            .filter(
              (c) =>
                ![
                  'date',
                  'resource_name',
                  'role',
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
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  {c.label}
                </label>
                {c.type === 'select' && c.options ? (
                  <select
                    value={customFields[c.key] || ''}
                    onChange={(e) =>
                      setCustomFields((prev) => ({ ...prev, [c.key]: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                )}
              </div>
            ))}
        </form>

        {/* Modal Footer with Single Atomic Dispatch & Double-Click Prevention */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer disabled:cursor-not-allowed select-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{mode === 'create' ? 'Adding Log...' : 'Saving Changes...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{mode === 'create' ? 'Add Log Entry' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
