import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Link2,
  MessageSquare,
  PauseCircle,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  User,
  X,
  Info,
} from 'lucide-react';
import { Button } from '../ui/button';
import type { Workspace } from '../../types';
import type {
  WebsiteActivity,
  WebsiteFile,
  WebsiteGate,
  WebsiteProject,
  WebsiteStage,
  WebsiteTask,
  TaskStatus,
  FileFolder,
} from '../../types/websiteProject';
import {
  WEBSITE_FOLDERS,
  WEBSITE_STAGES_CONFIG,
} from '../../types/websiteProject';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../ui/ConfirmProvider';
import { canManageWebsiteProject, canEditWebsiteTask } from '../../utils/websiteProjectAccess';
import { websiteProjectService } from '../../services/websiteProjectService';
import { getBackendFileUrl } from '../../utils/fileUrl';
import { CustomSelect } from '../ui/CustomSelect';
import { Modal } from '../ui/Modal';
import { healthBadge, cleanLabel } from '../../utils/websiteProjectStyles';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { WebsiteTaskModal } from './WebsiteTaskModal';
import { WebsiteCreateProjectModal } from './WebsiteCreateProjectModal';

interface Props {
  project: WebsiteProject;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onProjectUpdated?: (project: WebsiteProject) => void;
  workspaces?: Workspace[];
  isClientUser?: boolean;
}

type TabType = 'tasks' | 'gates' | 'files' | 'activity';

const DrawerTasksSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3].map((idx) => (
      <div
        key={idx}
        className="rounded-xl border border-border bg-subtle overflow-hidden"
      >
        <div className="p-3.5 bg-surface flex items-center justify-between border-b border-border">
          <div className="h-4 w-32 bg-skel rounded" />
          <div className="h-3 w-16 bg-skel rounded" />
        </div>
        <div className="p-2 space-y-2">
          {[1, 2].map((r) => (
            <div
              key={r}
              className="p-2.5 rounded-lg bg-surface border border-border flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded bg-skel" />
                <div className="h-3.5 w-48 bg-skel rounded" />
              </div>
              <div className="h-4 w-12 bg-skel rounded" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const DrawerGatesSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3].map((idx) => (
      <div
        key={idx}
        className="rounded-xl border border-border bg-surface p-4 space-y-3"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="h-4 w-40 bg-skel rounded" />
            <div className="h-3 w-20 bg-skel rounded" />
          </div>
          <div className="h-5 w-24 bg-skel rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

const DrawerFilesSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
    {[1, 2, 3, 4].map((idx) => (
      <div
        key={idx}
        className="rounded-xl border border-border p-4 bg-subtle space-y-2.5"
      >
        <div className="h-4 w-32 bg-skel rounded" />
        <div className="h-10 bg-skel rounded-lg" />
      </div>
    ))}
  </div>
);

const DrawerActivitySkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((idx) => (
      <div
        key={idx}
        className="p-3 rounded-xl border border-border bg-subtle flex items-center justify-between"
      >
        <div className="h-3.5 w-64 bg-skel rounded" />
        <div className="h-3 w-16 bg-skel rounded" />
      </div>
    ))}
  </div>
);

export const WebsiteProjectDrawer: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onRefresh,
  onProjectUpdated,
  workspaces,
  isClientUser,
}) => {
  const { user } = useAuth();
  const isClient = isClientUser ?? (user?.role === 'client');
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);
  const [tasks, setTasks] = useState<WebsiteTask[]>([]);
  const [gates, setGates] = useState<WebsiteGate[]>([]);
  const [files, setFiles] = useState<WebsiteFile[]>([]);
  const [activities, setActivities] = useState<WebsiteActivity[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; full_name?: string; department?: string; role?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Optimistic On-Hold state
  const [isOnHold, setIsOnHold] = useState(project.on_hold);
  const [isUpdatingHold, setIsUpdatingHold] = useState(false);

  useEffect(() => {
    setIsOnHold(project.on_hold);
  }, [project.on_hold]);

  // Filters & Task Creation
  const [filterMyTasks, setFilterMyTasks] = useState(false);
  const [filterKind, setFilterKind] = useState<string>('all');
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [createTaskStage, setCreateTaskStage] = useState<WebsiteStage>(project.stage || 'strategy');

  // Selected Task Dialogue Box Modal
  const [selectedTask, setSelectedTask] = useState<WebsiteTask | null>(null);

  // Gate Submit / Decision Modals
  const [submitGateKey, setSubmitGateKey] = useState<string | null>(null);
  const [submitNotes, setSubmitNotes] = useState('');
  const [isSubmittingGate, setIsSubmittingGate] = useState(false);

  const [revisionGateKey, setRevisionGateKey] = useState<string | null>(null);
  const [revisionAssigneeId, setRevisionAssigneeId] = useState('');
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  // File Upload / Link Modal
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [fileFolder, setFileFolder] = useState<FileFolder>('strategy');
  const [fileName, setFileName] = useState('');
  const [fileLinkUrl, setFileLinkUrl] = useState('');
  const [isAddingFile, setIsAddingFile] = useState(false);

  const canManage = !isClient && canManageWebsiteProject(user, project);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [tList, gList, fList, aList, members] = await Promise.all([
        websiteProjectService.getTasks(project.id),
        websiteProjectService.getGates(project.id),
        websiteProjectService.getFiles(project.id),
        websiteProjectService.getActivities(project.id, 50),
        isClient ? Promise.resolve([]) : websiteProjectService.getTeamMembers().catch(() => []),
      ]);
      setTasks(tList);
      setGates(gList);
      setFiles(fList);
      setActivities(aList);
      if (Array.isArray(members) && members.length > 0) {
        setTeamMembers(members);
      }
    } catch {
      addToast('Error', 'Failed to load project details', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [project.id, isClient, addToast]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  // Toggle on-hold project
  const handleToggleOnHold = async () => {
    const nextHold = !isOnHold;
    setIsOnHold(nextHold);
    setIsUpdatingHold(true);

    try {
      const updated = await websiteProjectService.updateProject(project.id, {
        on_hold: nextHold,
      });
      addToast(
        nextHold ? 'Project Paused' : 'Project Resumed',
        nextHold ? 'Auto-advance paused' : 'Auto-advance re-enabled',
        'info',
      );
      if (onProjectUpdated) {
        onProjectUpdated(updated);
      }
      onRefresh();
    } catch (err: any) {
      setIsOnHold(!nextHold);
      addToast('Error', err.message || 'Failed to update hold state', 'error');
    } finally {
      setIsUpdatingHold(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask || !canEditWebsiteTask(user, project, currentTask) || isClient) {
      return;
    }

    const originalStatus = currentTask.status;
    const nextStatus: TaskStatus = originalStatus === 'completed' ? 'todo' : 'completed';

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));

    try {
      await websiteProjectService.updateTask(project.id, taskId, {
        status: nextStatus,
      });
      onRefresh();
    } catch (err: any) {
      // Revert to exact original status on error
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: originalStatus } : t))
      );
      addToast('Error', err.message || 'Failed to update task status', 'error');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // Instant optimistic removal
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);

    try {
      await websiteProjectService.deleteTask(project.id, taskId);
      onRefresh();
    } catch (err: any) {
      loadData();
      addToast('Error', err.message || 'Failed to delete task', 'error');
    }
  };

  const handleUpdateTaskFromModal = (updated: WebsiteTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask(updated);
    onRefresh();
  };

  const handleSubmitGateForReview = async (gateKey: string) => {
    if (isSubmittingGate) return;
    setIsSubmittingGate(true);
    try {
      await websiteProjectService.submitGate(project.id, gateKey, {
        notes: submitNotes.trim() || undefined,
      });
      addToast('Gate Submitted', 'Deliverable sent to client for review', 'success');
      setSubmitGateKey(null);
      setSubmitNotes('');
      loadData();
      onRefresh();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to submit gate', 'error');
    } finally {
      setIsSubmittingGate(false);
    }
  };

  const handleCreateRevisionTask = async (gateKey: string) => {
    if (isCreatingRevision) return;
    setIsCreatingRevision(true);
    try {
      await websiteProjectService.createRevisionTask(project.id, gateKey, {
        assignee_id: revisionAssigneeId || undefined,
      });
      addToast('Revision Task Created', 'Task added and gate round bumped', 'success');
      setRevisionGateKey(null);
      setRevisionAssigneeId('');
      loadData();
      onRefresh();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to create revision task', 'error');
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const handleAddFileOrLink = async () => {
    if (!fileName.trim() || isAddingFile) return;
    setIsAddingFile(true);
    try {
      await websiteProjectService.createFile(project.id, {
        name: fileName.trim(),
        folder: fileFolder,
        external_url: fileLinkUrl.trim() || undefined,
      });
      addToast('Added Deliverable', 'File or link attached successfully', 'success');
      setIsFileModalOpen(false);
      setFileName('');
      setFileLinkUrl('');
      loadData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to attach file or link', 'error');
    } finally {
      setIsAddingFile(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const ok = await confirm({
      title: 'Delete this file record?',
      confirmLabel: 'Delete file',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await websiteProjectService.deleteFile(project.id, fileId);
      loadData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete file', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-surface border-l border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header Bar */}
        <div className="p-5 border-b border-border flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-subtle text-fg-muted border border-border">
                  {project.client_name}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-accent-soft text-accent-text border border-accent-pill-bd">
                  {cleanLabel(project.website_type)}
                </span>
                {(() => {
                  const hb = healthBadge(project.health);
                  return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${hb.bg} ${hb.text} ${hb.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hb.dot}`} />
                      {hb.label}
                    </span>
                  );
                })()}
                {isOnHold && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-fg-muted border border-border flex items-center gap-1">
                    <PauseCircle className="w-3.5 h-3.5" /> On Hold
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-fg truncate">
                {project.name}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsOverviewModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-border hover:bg-hover transition-colors flex items-center gap-1.5 cursor-pointer text-fg"
                title={canManage ? 'View project overview and edit details' : 'View project overview'}
              >
                <Info className="w-3.5 h-3.5 text-accent" />
                <span>Overview</span>
              </button>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={isUpdatingHold}
                  loadingText={isOnHold ? 'Resuming…' : 'Holding…'}
                  icon={PauseCircle}
                  onClick={handleToggleOnHold}
                >
                  {isOnHold ? 'Resume Auto-Advance' : 'Hold Project'}
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-fg-muted hover:text-fg hover:bg-hover cursor-pointer"
                title="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Metrics & Quick Links Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-fg-muted border-t border-border">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-fg">Stage:</span>
                <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-text font-semibold border border-accent-pill-bd">
                  {cleanLabel(project.stage).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>Progress:</span>
                <div className="w-24 h-1.5 bg-subtle border border-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <span className="font-semibold text-fg">
                  {project.progress}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {project.staging_url && safeHttpUrl(project.staging_url) && (
                <a
                  href={safeHttpUrl(project.staging_url)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent-text hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Staging Preview
                </a>
              )}
              {project.live_url && safeHttpUrl(project.live_url) && (
                <a
                  href={safeHttpUrl(project.live_url)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-success-fg hover:underline font-medium"
                >
                  <Globe className="w-3.5 h-3.5" /> Live Site
                </a>
              )}
            </div>
          </div>

          {/* Tabs Switcher */}
          <div className="flex gap-2 pt-2">
            {[
              { id: 'tasks', label: `Tasks (${tasks.length})` },
              { id: 'gates', label: `Approval Gates (${gates.length || 5})` },
              { id: 'files', label: `Files & Links (${files.length})` },
              { id: 'activity', label: 'Activity' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-fg-muted hover:bg-hover hover:text-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* TAB 1: TASKS */}
          {activeTab === 'tasks' && (
            isLoading ? (
              <DrawerTasksSkeleton />
            ) : (
              <div className="space-y-6">
                {/* Filter controls & Add Task button */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    {!isClient && (
                      <button
                        type="button"
                        onClick={() => setFilterMyTasks(!filterMyTasks)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          filterMyTasks
                            ? 'bg-accent-soft border-accent-pill-bd text-accent-text font-semibold'
                            : 'border-border text-fg-muted hover:bg-hover'
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>My Work</span>
                      </button>
                    )}

                    <div className="w-28">
                      <CustomSelect
                        value={filterKind}
                        onChange={setFilterKind}
                        options={[
                          { value: 'all', label: 'All Kinds' },
                          { value: 'task', label: 'Tasks' },
                          { value: 'revision', label: 'Revisions' },
                          { value: 'bug', label: 'Bugs' },
                        ]}
                        size="xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted">
                      {tasks.filter((t) => t.status === 'completed').length} of {tasks.length} completed
                    </span>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreateTaskStage(project.stage || 'strategy');
                          setIsCreateTaskModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/90 text-accent-fg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Task</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Stages Checklist Sections */}
                {WEBSITE_STAGES_CONFIG.filter((s) => s.id !== 'completed').map((stageConf) => {
                  let stageTasks = tasks.filter((t) => t.stage === stageConf.id);
                  if (filterMyTasks && user?.id) {
                    stageTasks = stageTasks.filter((t) => String(t.assignee_id) === String(user.id));
                  }
                  if (filterKind !== 'all') {
                    stageTasks = stageTasks.filter((t) => t.kind === filterKind);
                  }

                  const completedCount = stageTasks.filter((t) => t.status === 'completed').length;
                  const progressPct = stageTasks.length
                    ? Math.round((completedCount / stageTasks.length) * 100)
                    : 0;

                  return (
                    <div
                      key={stageConf.id}
                      className="rounded-xl border border-border bg-subtle overflow-hidden"
                    >
                      {/* Stage Header */}
                      <div className="p-3.5 bg-surface flex items-center justify-between border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-fg">
                            {stageConf.name}
                          </span>
                          {stageConf.id === project.stage && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-accent-fg">
                              Active Stage
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-muted font-medium">
                            {completedCount}/{stageTasks.length} ({progressPct}%)
                          </span>
                          <div className="w-16 h-1.5 bg-canvas border border-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success-fg rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Task Rows */}
                      <div className="divide-y divide-border p-1">
                        {stageTasks.map((t) => {
                          const isDone = t.status === 'completed';
                          const commentCount = (t.comments || []).length;
                          const canEditThisTask = !isClient && canEditWebsiteTask(user, project, t);

                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedTask(t)}
                              className={`flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-surface transition-colors group cursor-pointer ${
                                isDone ? 'opacity-60' : 'opacity-100'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                {/* 1-Click Fast 0ms Optimistic Checkbox (interactive only if user has task edit permission) */}
                                {canEditThisTask ? (
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleTaskStatus(t.id, e)}
                                    className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                                      isDone
                                        ? 'bg-success-fg border-success-fg text-white'
                                        : 'border-border hover:border-border-strong bg-surface'
                                    }`}
                                    title={isDone ? 'Mark as incomplete' : 'Mark as done'}
                                  >
                                    {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  </button>
                                ) : (
                                  <div
                                    className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-default select-none ${
                                      isDone
                                        ? 'bg-success-fg/80 border-success-fg/80 text-white'
                                        : 'border-border bg-surface'
                                    }`}
                                    title={isDone ? 'Completed' : 'Pending'}
                                    aria-disabled="true"
                                  >
                                    {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  {/* Task title */}
                                  <p
                                    className={`text-xs font-medium hover:text-accent-text transition-colors ${
                                      isDone ? 'line-through text-fg-muted' : 'text-fg'
                                    }`}
                                    title="Click to view/edit task details"
                                  >
                                    {t.name}
                                  </p>

                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-fg-muted">
                                    {/* Task Status Badge */}
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                        t.status === 'completed'
                                          ? 'bg-success-bg text-success-fg border-success-bd'
                                          : t.status === 'in_progress'
                                          ? 'bg-accent-soft text-accent-text border-accent-pill-bd'
                                          : t.status === 'review'
                                          ? 'bg-warning-bg text-warning-fg border-warning-bd'
                                          : 'bg-surface text-fg-muted border-border'
                                      }`}
                                    >
                                      {t.status === 'in_progress'
                                        ? 'In Progress'
                                        : t.status === 'review'
                                        ? 'Review'
                                        : t.status === 'completed'
                                        ? 'Completed'
                                        : 'To Do'}
                                    </span>

                                    {t.kind === 'revision' && (
                                      <span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent-text font-semibold text-[10px] border border-accent-pill-bd">
                                        Revision
                                      </span>
                                    )}
                                    {t.kind === 'bug' && (
                                      <span className="px-1.5 py-0.5 rounded bg-danger-bg text-danger-fg font-semibold text-[10px] border border-danger-bd">
                                        Bug
                                      </span>
                                    )}
                                    {t.required && (
                                      <span className="text-warning-fg font-semibold">
                                        *Required
                                      </span>
                                    )}
                                    {t.assignee_name && (
                                      <span className="flex items-center gap-1 text-fg-muted">
                                        <User className="w-3 h-3" /> {t.assignee_name}
                                      </span>
                                    )}
                                    {t.due_date && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> {t.due_date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Task Action Buttons with Comment Count on the icon */}
                              <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(t);
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-fg-muted hover:text-accent-text hover:bg-hover transition-colors cursor-pointer"
                                  title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span className="text-xs font-semibold font-numeric">
                                    {commentCount}
                                  </span>
                                </button>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const ok = await confirm({
                                        title: `Delete task "${t.name}"?`,
                                        confirmLabel: 'Delete task',
                                        tone: 'danger',
                                      });
                                      if (ok) {
                                        handleDeleteTask(t.id);
                                      }
                                    }}
                                    className="p-1 rounded text-fg-muted hover:text-danger-fg hover:bg-danger-bg transition-colors cursor-pointer"
                                    title="Delete task"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Add a card / task Button - Opens Task Dialog Box */}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setCreateTaskStage(stageConf.id);
                              setIsCreateTaskModalOpen(true);
                            }}
                            className="w-full text-left p-2.5 rounded-xl text-xs font-semibold text-fg-muted hover:text-accent-text hover:bg-hover flex items-center gap-2 transition-colors cursor-pointer border border-dashed border-border mt-1"
                          >
                            <Plus className="w-3.5 h-3.5 text-accent" />
                            <span>Add a card / task to {stageConf.name}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* TAB 2: APPROVAL GATES */}
          {activeTab === 'gates' && (
            isLoading ? (
              <DrawerGatesSkeleton />
            ) : (
              <div className="space-y-5">
                <p className="text-xs text-fg-muted">
                  The 5 unified approval gates ensure formal sign-off from the client. When a gate is in review, project health automatically switches to Waiting on Client.
                </p>

                <div className="grid grid-cols-1 gap-4">
                  {[...gates]
                    .sort((a, b) => {
                      const order: Record<string, number> = {
                        sitemap: 1,
                        content: 2,
                        design: 3,
                        staging: 4,
                        final: 5,
                      };
                      return (order[a.gate_key] || 99) - (order[b.gate_key] || 99);
                    })
                    .map((g) => {
                      const gateLabels: Record<string, string> = {
                        sitemap: 'Sitemap',
                        content: 'Content',
                        design: 'Design',
                        staging: 'Staging Website',
                        final: 'Final Website',
                      };
                      const statusColors: Record<string, string> = {
                        approved: 'bg-success-bg text-success-fg border-success-bd',
                        in_review: 'bg-warning-bg text-warning-fg border-warning-bd',
                        changes_requested: 'bg-danger-bg text-danger-fg border-danger-bd',
                        draft: 'bg-subtle text-fg-muted border-border',
                      };

                      return (
                        <div
                          key={g.id}
                          className="rounded-xl border border-border bg-surface p-4 space-y-3 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-sm text-fg">
                                {gateLabels[g.gate_key] || g.name}
                              </h4>
                              <p className="text-xs text-fg-muted capitalize">
                                Stage: {g.stage}
                              </p>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                statusColors[g.status] || statusColors.draft
                              }`}
                            >
                              {g.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>

                        {/* Action buttons with rate limiting */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                          {canManage && g.status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => setSubmitGateKey(g.gate_key)}
                              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-fg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" /> Submit to Client
                            </button>
                          )}

                          {g.status === 'changes_requested' && canManage && (
                            <button
                              type="button"
                              onClick={() => setRevisionGateKey(g.gate_key)}
                              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-fg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Convert to Revision Task
                            </button>
                          )}
                        </div>

                        {/* History Log */}
                        {g.history && g.history.length > 0 && (
                          <div className="pt-2 text-xs space-y-1.5">
                            <span className="font-semibold text-fg-muted text-xs">
                              Decision History:
                            </span>
                            <div className="space-y-1">
                              {g.history.map((h, i) => (
                                <div
                                  key={i}
                                  className="p-2 rounded-lg bg-subtle border border-border flex items-start justify-between text-fg"
                                >
                                  <div>
                                    <span className="font-semibold capitalize text-accent-text">
                                      {h.decision.replace('_', ' ')}
                                    </span>{' '}
                                    by {h.actor_name} (Round {h.round})
                                    {h.comment && (
                                      <p className="mt-1 text-fg-muted italic">
                                        "{h.comment}"
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-fg-muted">
                                    {h.timestamp?.slice(0, 10)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* TAB 3: FILES & DELIVERABLES */}
          {activeTab === 'files' && (
            isLoading ? (
              <DrawerFilesSkeleton />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-fg-muted">
                    Folder-organized deliverables and external links (Figma, Loom, Staging).
                  </p>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setIsFileModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-semibold hover:bg-accent/90 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add File or Link
                    </button>
                  )}
                </div>

                {/* Folders List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {WEBSITE_FOLDERS.map((folder) => {
                    const folderFiles = files.filter((f) => f.folder === folder.id);
                    return (
                      <div
                        key={folder.id}
                        className="rounded-xl border border-border p-4 bg-subtle space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-fg flex items-center gap-1.5">
                            <FolderKanban className="w-4 h-4 text-accent" />
                            {folder.label}
                          </span>
                          <span className="text-xs text-fg-muted">
                            {folderFiles.length} items
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {folderFiles.map((file) => (
                            <div
                              key={file.id}
                              className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between gap-2 text-xs"
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
                                    href={file.external_url}
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

                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFile(file.id)}
                                    className="p-1 rounded text-fg-muted hover:text-danger-fg cursor-pointer"
                                    title="Delete file"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {folderFiles.length === 0 && (
                            <p className="text-xs text-fg-muted italic py-1">
                              No files attached
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* TAB 4: ACTIVITY STREAM */}
          {activeTab === 'activity' && (
            isLoading ? (
              <DrawerActivitySkeleton />
            ) : (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-xl border border-border bg-subtle flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-fg">
                        {act.actor_name || 'System'}:
                      </span>{' '}
                      <span className="text-fg-muted">{act.body}</span>
                    </div>
                    <span className="text-[10px] text-fg-muted whitespace-nowrap">
                      {act.created_at ? new Date(act.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}

                {activities.length === 0 && (
                  <p className="text-xs text-fg-muted text-center py-8">
                    No activity recorded yet.
                  </p>
                )}
              </div>
            )
          )}
        </div>

        {/* Modal: Comprehensive Task Dialogue Box */}
        {selectedTask && (
          <WebsiteTaskModal
            task={selectedTask}
            project={project}
            isOpen={!!selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdateTask={handleUpdateTaskFromModal}
            onDeleteTask={handleDeleteTask}
            teamMembers={teamMembers}
            canManage={canManage}
          />
        )}

        {/* Modal: Add New Task / Card Dialogue Box */}
        {isCreateTaskModalOpen && (
          <WebsiteTaskModal
            task={null}
            stage={createTaskStage}
            project={project}
            isOpen={isCreateTaskModalOpen}
            onClose={() => setIsCreateTaskModalOpen(false)}
            onTaskCreated={(newTask) => {
              setTasks((prev) => [...prev, newTask]);
              onRefresh();
            }}
            teamMembers={teamMembers}
            canManage={canManage}
          />
        )}

        {/* Modal: Submit Gate */}
        <Modal
          isOpen={!!submitGateKey}
          onClose={() => setSubmitGateKey(null)}
          title="Submit Gate for Client Review"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-fg-muted">
              This deliverable will be submitted to the client. The project status will switch to Waiting on Client.
            </p>
            <textarea
              placeholder="Optional notes or walkthrough guidance for client..."
              value={submitNotes}
              onChange={(e) => setSubmitNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-muted outline-none focus:border-border-strong"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSubmitGateKey(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-hover cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={isSubmittingGate}
                loadingText="Submitting…"
                onClick={() => submitGateKey && handleSubmitGateForReview(submitGateKey)}
              >
                Confirm & Submit
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Create Revision Task from Gate */}
        <Modal
          isOpen={!!revisionGateKey}
          onClose={() => setRevisionGateKey(null)}
          title="Create Revision Task from Feedback"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-fg-muted">
              Converts the latest client requested changes into a revision task and bumps the review round.
            </p>
            <div>
              <label className="block text-xs font-semibold text-fg mb-1">
                Assignee
              </label>
              <CustomSelect
                value={revisionAssigneeId}
                onChange={setRevisionAssigneeId}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...teamMembers.map((m) => ({
                    value: m.id,
                    label: m.full_name || m.name,
                    description: m.department || m.role,
                  })),
                ]}
                placeholder="Select assignee..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevisionGateKey(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-hover cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={isCreatingRevision}
                loadingText="Creating…"
                onClick={() => revisionGateKey && handleCreateRevisionTask(revisionGateKey)}
              >
                Create Revision Task
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Add File or External Link */}
        <Modal
          isOpen={isFileModalOpen}
          onClose={() => setIsFileModalOpen(false)}
          title="Attach File or Link"
          maxWidth="md"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-fg mb-1">
                Folder
              </label>
              <CustomSelect
                value={fileFolder}
                onChange={(v) => setFileFolder(v as FileFolder)}
                options={WEBSITE_FOLDERS.map((f) => ({ value: f.id, label: f.label }))}
                placeholder="Select folder..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg mb-1">
                Deliverable Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Sitemap Architecture v1 or Figma Prototype..."
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-muted outline-none focus:border-border-strong shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg mb-1">
                External Link URL (Figma, Loom, Google Drive)
              </label>
              <input
                type="url"
                placeholder="https://figma.com/file/..."
                value={fileLinkUrl}
                onChange={(e) => setFileLinkUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-muted outline-none focus:border-border-strong shadow-2xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsFileModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-hover cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={isAddingFile}
                loadingText="Saving…"
                onClick={handleAddFileOrLink}
              >
                Save Attachment
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Project Overview & Settings */}
        {isOverviewModalOpen && (
          <WebsiteCreateProjectModal
            isOpen={isOverviewModalOpen}
            onClose={() => setIsOverviewModalOpen(false)}
            onCreated={onRefresh}
            project={project}
            readOnly={!canManage}
            onUpdated={(updated) => {
              onProjectUpdated?.(updated);
              onRefresh();
              setIsOverviewModalOpen(false);
            }}
            workspaces={workspaces || []}
          />
        )}
      </div>
    </div>
  );
};
