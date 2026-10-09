import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Building2,
  FileText,
  Link2,
  ExternalLink,
  MessageSquare,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { Button, IconButton } from '../ui/button';
import type {
  WebsiteTask,
  WebsiteProject,
  WebsiteStage,
  WebsiteFile,
  TaskComment,
  TaskStatus,
  TaskPriority,
  TaskKind,
  FileFolder,
} from '../../types/websiteProject';
import { WEBSITE_FOLDERS } from '../../types/websiteProject';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../ui/ConfirmProvider';
import { useAuth } from '../../context/AuthContext';
import { websiteProjectService } from '../../services/websiteProjectService';
import { getBackendFileUrl } from '../../utils/fileUrl';
import { getInitials } from '../../utils/badgeStyles';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { cleanLabel } from '../../utils/websiteProjectStyles';

interface Props {
  task?: WebsiteTask | null;
  project: WebsiteProject;
  availableProjects?: WebsiteProject[];
  stage?: WebsiteStage;
  initialStatus?: TaskStatus;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask?: (task: WebsiteTask) => void;
  onCommentsChanged?: (taskId: string, comments: TaskComment[]) => void;
  onTaskCreated?: (task: WebsiteTask) => void;
  onDeleteTask?: (taskId: string) => void;
  teamMembers?: Array<{ id: string; name: string; full_name?: string; department?: string; role?: string }>;
  canManage?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const KIND_OPTIONS = [
  { value: 'task', label: 'Standard Task' },
  { value: 'revision', label: 'Revision' },
  { value: 'bug', label: 'Bug Fix' },
];

const DEPARTMENT_OPTIONS = [
  { value: 'Website / Development', label: 'Website / Development' },
  { value: 'UI/UX Design', label: 'UI/UX Design' },
  { value: 'Content & Copywriting', label: 'Content & Copywriting' },
  { value: 'Creative Assets', label: 'Creative Assets' },
  { value: 'SEO', label: 'SEO' },
  { value: 'QA & Audits', label: 'QA & Audits' },
  { value: 'Performance Marketing', label: 'Performance Marketing' },
  { value: 'Project Management', label: 'Project Management' },
  { value: 'General', label: 'General' },
];

export const WebsiteTaskModal: React.FC<Props> = ({
  task,
  project,
  availableProjects = [],
  stage,
  initialStatus,
  isOpen,
  onClose,
  onUpdateTask,
  onCommentsChanged,
  onTaskCreated,
  onDeleteTask,
  teamMembers = [],
  canManage = false,
}) => {
  const { user } = useAuth();
  const isClient = user?.role === 'client';
  const isCreateMode = !task;

  const [selectedProjectId, setSelectedProjectId] = useState(task?.project_id || project?.id || '');

  const effectiveProject = (isCreateMode && selectedProjectId
    ? availableProjects.find((p) => p.id === selectedProjectId)
    : null) || project;

  const isAssignee = !isClient && !!user?.id && (String(task?.assignee_id) === String(user.id));
  const effectiveCanManage = !isClient && canManage;
  const canEditTask = effectiveCanManage || isAssignee;

  const { addToast } = useToast();
  const confirm = useConfirm();
  const activeStage: WebsiteStage = task?.stage || stage || effectiveProject.stage || 'strategy';

  // Form Fields
  const [name, setName] = useState(task?.name || '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || '');
  const [department, setDepartment] = useState(task?.department || 'Website / Development');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || initialStatus || 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium');
  const [kind, setKind] = useState<TaskKind>(task?.kind || 'task');
  const [description, setDescription] = useState(task?.description || '');
  const [required, setRequired] = useState(task ? task.required : true);

  // Comments
  const [comments, setComments] = useState<TaskComment[]>(task?.comments || []);
  const [commentText, setCommentText] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const commentCooldownRef = useRef(false);

  // Files linked to this task
  const [taskFiles, setTaskFiles] = useState<WebsiteFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isAttachingFile, setIsAttachingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileFolder, setNewFileFolder] = useState<FileFolder>('development');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Submit states & rate limits
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const saveCooldownRef = useRef(false);

  // Synchronize when task prop changes
  useEffect(() => {
    if (task) {
      setSelectedProjectId(task.project_id);
      setName(task.name);
      setAssigneeId(task.assignee_id || '');
      setDepartment(task.department || 'Website / Development');
      setDueDate(task.due_date || '');
      setStatus(task.status);
      setPriority(task.priority);
      setKind(task.kind);
      setDescription(task.description || '');
      setRequired(task.required);
      setComments(task.comments || []);
    } else {
      setSelectedProjectId(project?.id || '');
      setName('');
      setAssigneeId('');
      setDepartment('Website / Development');
      setDueDate('');
      setStatus(initialStatus || 'todo');
      setPriority('medium');
      setKind('task');
      setDescription('');
      setRequired(true);
      setComments([]);
    }
  }, [task, isOpen, initialStatus, project?.id]);

  // Load files for this task
  const fetchTaskFiles = React.useCallback(async () => {
    if (!task?.id) {
      setTaskFiles([]);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const allFiles = await websiteProjectService.getFiles(effectiveProject.id);
      setTaskFiles(allFiles.filter((f) => f.task_id === task.id));
    } catch {
      // silent
    } finally {
      setIsLoadingFiles(false);
    }
  }, [effectiveProject.id, task?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchTaskFiles();
    }
  }, [isOpen, fetchTaskFiles]);

  if (!isOpen) return null;

  // Assignee options with 'Unassigned'
  const assigneeOptions = [
    { value: '', label: 'Unassigned', description: 'No team member assigned' },
    ...teamMembers.map((m) => ({
      value: m.id,
      label: m.full_name || m.name,
      description: m.department || m.role,
    })),
  ];

  // If department isn't in predefined options, add it
  const deptOptions = DEPARTMENT_OPTIONS.some((d) => d.value === department)
    ? DEPARTMENT_OPTIONS
    : [{ value: department, label: department }, ...DEPARTMENT_OPTIONS];

  // Save Task Form Handler with rate limiting
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isCreateMode ? !effectiveCanManage : !canEditTask) return;
    if (saveCooldownRef.current || isSaving) return;
    if (!name.trim()) {
      addToast('Validation', 'Task title cannot be empty', 'warning');
      return;
    }

    saveCooldownRef.current = true;
    setIsSaving(true);

    try {
      const chosenAssignee = teamMembers.find((m) => m.id === assigneeId);
      const assigneeName = chosenAssignee ? chosenAssignee.full_name || chosenAssignee.name : null;

      if (isCreateMode) {
        const created = await websiteProjectService.createTask(effectiveProject.id, {
          name: name.trim(),
          stage: activeStage,
          assignee_id: assigneeId || null,
          assignee_name: assigneeName,
          department: department || null,
          due_date: dueDate || null,
          status,
          priority,
          kind,
          description: description.trim() || null,
          required,
        });

        addToast('Task Created', `Added "${name.trim()}" to ${cleanLabel(activeStage)}`, 'success');
        if (onTaskCreated) {
          onTaskCreated(created);
        } else if (onUpdateTask) {
          onUpdateTask(created);
        }
        onClose();
      } else if (task) {
        const updated = await websiteProjectService.updateTask(effectiveProject.id, task.id, {
          name: name.trim(),
          assignee_id: assigneeId || null,
          assignee_name: assigneeName,
          department: department || null,
          due_date: dueDate || null,
          status,
          priority,
          kind,
          description: description.trim() || null,
          required,
        });

        addToast('Task Updated', `"${name.trim()}" saved successfully`, 'success');
        onUpdateTask?.(updated);
        onClose();
      }
    } catch (err: any) {
      addToast('Save Failed', err.message || 'Failed to save task', 'error');
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        saveCooldownRef.current = false;
      }, 500);
    }
  };

  // Add Comment with rate limiting & INSTANT UI UPDATE
  const handleAddComment = async () => {
    if (!task?.id) return;
    if (commentCooldownRef.current || isSendingComment) return;
    if (!commentText.trim()) return;

    commentCooldownRef.current = true;
    setIsSendingComment(true);
    const textToSend = commentText.trim();

    try {
      const updatedCommentsList = await websiteProjectService.addTaskComment(
        effectiveProject.id,
        task.id,
        textToSend,
      );

      // Instantly update local comments state
      setComments(updatedCommentsList);
      setCommentText('');

      // Instantly notify parent comments updated WITHOUT closing modal or pushing unsaved form fields
      if (onCommentsChanged) {
        onCommentsChanged(task.id, updatedCommentsList);
      } else if (onUpdateTask) {
        onUpdateTask({
          ...task,
          comments: updatedCommentsList,
        });
      }
    } catch (err: any) {
      addToast('Comment Failed', err.message || 'Failed to add comment', 'error');
    } finally {
      setIsSendingComment(false);
      setTimeout(() => {
        commentCooldownRef.current = false;
      }, 400);
    }
  };

  // Attach File to Task
  const handleAttachFile = async () => {
    if (!task?.id) return;
    if (!newFileName.trim()) {
      addToast('Validation', 'Deliverable name is required', 'warning');
      return;
    }
    setIsSavingFile(true);
    try {
      await websiteProjectService.createFile(effectiveProject.id, {
        name: newFileName.trim(),
        folder: newFileFolder,
        external_url: newFileUrl.trim() || undefined,
        task_id: task.id,
      });
      addToast('File Attached', `Attached "${newFileName.trim()}" to this task`, 'success');
      setNewFileName('');
      setNewFileUrl('');
      setIsAttachingFile(false);
      fetchTaskFiles();
    } catch (err: any) {
      addToast('Attach Failed', err.message || 'Failed to attach file', 'error');
    } finally {
      setIsSavingFile(false);
    }
  };

  // Delete attached file
  const handleDeleteFile = async (fileId: string) => {
    const ok = await confirm({
      title: 'Delete attached file?',
      confirmLabel: 'Delete file',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await websiteProjectService.deleteFile(effectiveProject.id, fileId);
      addToast('File Removed', 'Attached file record deleted', 'info');
      fetchTaskFiles();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete file', 'error');
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!task?.id || !onDeleteTask) return;
    const ok = await confirm({
      title: `Delete task "${name}"?`,
      confirmLabel: 'Delete task',
      tone: 'danger',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await websiteProjectService.deleteTask(effectiveProject.id, task.id);
      addToast('Task Deleted', 'Task removed from project', 'info');
      onDeleteTask(task.id);
      onClose();
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Failed to delete task', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[92vh] bg-surface rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 bg-subtle">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-accent-subtle text-accent-text border border-accent-border">
              {cleanLabel(activeStage)}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface text-fg-muted border border-border">
              {effectiveProject.name}
            </span>
            <span className="text-xs font-semibold text-fg">
              {isCreateMode ? '• Add New Card / Task' : '• Task Details'}
            </span>
            {!canEditTask && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface text-fg-muted border border-border">
                View Only
              </span>
            )}
            {required && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-fg">
                <AlertCircle className="w-3.5 h-3.5" /> Blocks Stage
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isCreateMode && effectiveCanManage && onDeleteTask && (
              <IconButton
                icon={Trash2}
                size="sm"
                variant="ghost"
                onClick={handleDeleteTask}
                loading={isDeleting}
                label="Delete task"
                className="text-fg-muted hover:text-danger-fg hover:bg-danger-subtle"
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
              title="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body - 2 Columns (Left: Task Details, Right: Files & Comments) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 custom-scrollbar">
          {/* LEFT COLUMN: Metadata & Description (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Project Picker (Create mode with multiple available projects) */}
            {isCreateMode && availableProjects.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Project *
                </label>
                <CustomSelect
                  value={selectedProjectId}
                  onChange={(val) => setSelectedProjectId(val)}
                  options={availableProjects.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Select project..."
                  disabled={!effectiveCanManage}
                />
              </div>
            )}

            {/* Task Title */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                Task Title *
              </label>
              <input
                type="text"
                value={name}
                disabled={isCreateMode ? !effectiveCanManage : !canEditTask}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sitemap & Information Architecture..."
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none focus:border-border-strong transition-all shadow-2xs disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted"
              />
            </div>

            {/* Grid of 4 Selectors: Status, Priority, Assigned Person, Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Status Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Status
                </label>
                <CustomSelect
                  value={status}
                  onChange={(v) => setStatus(v as TaskStatus)}
                  options={STATUS_OPTIONS}
                  size="sm"
                  placeholder="Select status..."
                  disabled={!canEditTask}
                />
              </div>

              {/* Priority Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Priority
                </label>
                <CustomSelect
                  value={priority}
                  onChange={(v) => setPriority(v as TaskPriority)}
                  options={PRIORITY_OPTIONS}
                  size="sm"
                  placeholder="Select priority..."
                  disabled={!canEditTask}
                />
              </div>

              {/* Assigned Person */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Assigned Person
                </label>
                <CustomSelect
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={assigneeOptions}
                  size="sm"
                  placeholder="Assign a member..."
                  icon={User}
                  disabled={!effectiveCanManage}
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Department
                </label>
                <CustomSelect
                  value={department}
                  onChange={setDepartment}
                  options={deptOptions}
                  size="sm"
                  placeholder="Select department..."
                  icon={Building2}
                  disabled={!effectiveCanManage}
                />
              </div>
            </div>

            {/* Second row: Due Date, Kind, Blocks Stage */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Due Date
                </label>
                <CustomDatePicker
                  value={dueDate}
                  onChange={(iso) => setDueDate(iso)}
                  disabled={isCreateMode ? !effectiveCanManage : !canEditTask}
                  placeholder="Select due date..."
                  clearable
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1">
                  Task Kind
                </label>
                <CustomSelect
                  value={kind}
                  onChange={(v) => setKind(v as TaskKind)}
                  options={KIND_OPTIONS}
                  size="sm"
                  disabled={!effectiveCanManage}
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className={`flex items-center gap-2 h-9 px-2.5 rounded-lg border border-border bg-subtle text-xs font-medium text-fg select-none ${
                  !effectiveCanManage ? 'cursor-default opacity-80' : 'cursor-pointer'
                }`}>
                  <input
                    type="checkbox"
                    checked={required}
                    disabled={!effectiveCanManage}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-0 outline-none disabled:cursor-not-allowed"
                  />
                  <span>Required Gate</span>
                </label>
              </div>
            </div>

            {/* Description Textarea */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                Description & Notes
              </label>
              <textarea
                rows={4}
                value={description}
                disabled={!canEditTask}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add task description, acceptance criteria, Figma links, or instructions..."
                className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none focus:border-border-strong custom-scrollbar shadow-2xs disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted"
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Files & Comments (5 Cols) */}
          <div className="lg:col-span-5 space-y-5 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-border lg:pl-6">
            {isCreateMode ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-border bg-subtle my-auto">
                <div className="w-12 h-12 rounded-xl bg-accent-subtle flex items-center justify-center text-accent mb-3 shadow-2xs">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-fg mb-1.5">
                  Deliverables & Discussion
                </h4>
                <p className="text-xs text-fg-muted max-w-xs leading-relaxed">
                  Once this task is created, you can attach deliverable files (Figma, Google Drive, Loom), add feedback notes, and collaborate in real-time.
                </p>
              </div>
            ) : (
              <>
                {/* Task Files & Links Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-accent" />
                      <span>Deliverables ({taskFiles.length})</span>
                    </h4>
                    {effectiveCanManage && (
                      <button
                        type="button"
                        onClick={() => setIsAttachingFile(!isAttachingFile)}
                        className="text-xs font-semibold text-accent-text hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Attach
                      </button>
                    )}
                  </div>

                  {/* Attach File Inline Form */}
                  {isAttachingFile && (
                    <div className="p-3 rounded-xl border border-accent-border bg-accent-subtle space-y-2.5 animate-in fade-in duration-100">
                      <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="File or link label (e.g. Wireframe v2)..."
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-border bg-surface text-fg placeholder:text-fg-subtle outline-none"
                      />
                      <input
                        type="url"
                        value={newFileUrl}
                        onChange={(e) => setNewFileUrl(e.target.value)}
                        placeholder="URL (Figma, Loom, Google Drive)..."
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-border bg-surface text-fg placeholder:text-fg-subtle outline-none"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="w-36">
                          <CustomSelect
                            value={newFileFolder}
                            onChange={(v) => setNewFileFolder(v as FileFolder)}
                            options={WEBSITE_FOLDERS.map((f) => ({ value: f.id, label: f.label }))}
                            size="xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsAttachingFile(false)}
                            className="px-2.5 py-1 rounded-lg text-xs text-fg-muted hover:bg-hover"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleAttachFile}
                            disabled={isSavingFile}
                            className="px-3 py-1 rounded-lg bg-accent text-accent-fg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
                          >
                            {isSavingFile ? 'Saving...' : 'Add'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Files List */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {isLoadingFiles ? (
                      <div className="py-2 text-center text-xs text-fg-muted">Loading files...</div>
                    ) : taskFiles.length > 0 ? (
                      taskFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-2 rounded-lg bg-subtle border border-border flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {file.external_url ? (
                              <Link2 className="w-3.5 h-3.5 text-accent shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                            )}
                            <span className="truncate font-medium text-fg">
                              {file.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.external_url ? (
                              <a
                                href={safeHttpUrl(file.external_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded text-accent-text hover:underline"
                                title="Open external link"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : file.storage_key ? (
                              <a
                                href={getBackendFileUrl(file.storage_key)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded text-accent-text hover:underline"
                                title="Download file"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : null}

                            {effectiveCanManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.id)}
                                className="p-1 rounded text-fg-muted hover:text-danger-fg cursor-pointer"
                                title="Delete file link"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-fg-subtle italic py-1">No files or links attached yet.</p>
                    )}
                  </div>
                </div>

                {/* Task Comments Section */}
                <div className="flex-1 flex flex-col min-h-[220px] space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-accent" />
                      <span>Discussion ({comments.length})</span>
                    </h4>
                  </div>

                  {/* Comments Feed */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-56">
                    {comments.length > 0 ? (
                      comments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2.5 rounded-xl bg-subtle border border-border text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-fg">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-accent-subtle text-accent-text font-semibold text-xs flex items-center justify-center border border-accent-border">
                                {getInitials(c.user_name)}
                              </div>
                              <span className="font-semibold text-fg">{c.user_name}</span>
                            </div>
                            <span className="text-xs text-fg-subtle">
                              {c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="text-fg-muted pl-6 whitespace-pre-wrap">{c.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-fg-subtle italic py-3 text-center">No comments yet. Start the conversation!</p>
                    )}
                  </div>

                  {/* Add Comment Box */}
                  <div className="pt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none focus:border-border-strong shadow-2xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                      loading={isSendingComment}
                      loadingText="Sending…"
                      icon={Send}
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-subtle">
          <div className="text-xs text-fg-muted flex items-center gap-2">
            <span>Stage: <strong className="text-fg uppercase">{cleanLabel(activeStage)}</strong></span>
            {task?.updated_at && (
              <>
                <span>•</span>
                <span>Updated: {new Date(task.updated_at).toLocaleDateString()}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!(isCreateMode ? effectiveCanManage : canEditTask) ? (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-hover hover:bg-subtle text-fg text-xs font-semibold transition-colors cursor-pointer border border-border"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-muted hover:bg-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleSave()}
                  loading={isSaving}
                  loadingText={isCreateMode ? 'Creating…' : 'Saving…'}
                  icon={CheckCircle2}
                >
                  {isCreateMode ? 'Create Task' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
