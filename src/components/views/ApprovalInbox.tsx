import React, { useState } from 'react';
import type { InboxTask, PlatformType, Workspace } from '../../types';
import { PlatformIcon } from '../../utils/platform';
import { ReviewFeedbackModal } from '../modals/ReviewFeedbackModal';
import {
  Check,
  X,
  Search,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Copy,
  Clock,
  AlertCircle,
  Undo2,
  Inbox as EmptyInboxIcon,
  CheckSquare,
  Square,
  Building2,
  MessageSquare,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { HasPermission } from '../HasPermission';
import { useAuth } from '../../context/AuthContext';

interface ApprovalInboxProps {
  tasks: InboxTask[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBatchApprove?: (ids: string[]) => void;
  onBatchReject?: (ids: string[]) => void;
  onRegenerateFullPost?: (id: string, currentCopy: string) => Promise<string>;
  onRefineWithAI?: (id: string, mode: string, currentCopy: string) => Promise<string>;
  onRefineWithFeedback?: (id: string, feedback: string, presetTags: string[], currentCopy: string) => Promise<string>;
  onUpdateCopy?: (id: string, newCopy: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefetch?: () => void;
  selectedWorkspace: Workspace | null;
  workspaces?: Workspace[];
}

const PLATFORM_LIMITS: Record<PlatformType, number> = {
  Instagram: 2200,
  LinkedIn: 3000,
  Facebook: 5000,
  Twitter: 280,
};

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({
  tasks,
  onApprove,
  onReject,
  onBatchApprove,
  onBatchReject,
  onRegenerateFullPost,
  onRefineWithFeedback,
  onUpdateCopy,
  isLoading = false,
  error = null,
  onRefetch,
  selectedWorkspace,
  workspaces = [],
}) => {
  const { addToast } = useToast();
  const { role } = useAuth();

  const [selectedTaskId, setSelectedTaskId] = useState<string | number | null>(
    tasks[0]?.id ?? null
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const [editedCopy, setEditedCopy] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isRegeneratingFull, setIsRegeneratingFull] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (selectedWorkspace && t.workspaceId && t.workspaceId !== selectedWorkspace.id) {
      return false;
    }
    const matchesSearch =
      t.campaign.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.copy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform =
      platformFilter === 'all' || t.platform.toLowerCase() === platformFilter.toLowerCase();
    return matchesSearch && matchesPlatform;
  });

  const displayedTasks = filteredTasks;

  const activeTask = tasks.find((t) => t.id === selectedTaskId) || displayedTasks[0] || null;

  React.useEffect(() => {
    if (activeTask) {
      setEditedCopy(activeTask.copy);
      setHistory([activeTask.copy]);
    } else {
      setEditedCopy('');
      setHistory([]);
    }
  }, [activeTask?.id]);

  const handleCopyChange = (newText: string) => {
    setEditedCopy(newText);
    if (activeTask && onUpdateCopy) {
      onUpdateCopy(String(activeTask.id), newText);
    }
  };

  const handleReviewFeedbackSubmit = async (feedback: string, presetTags: string[]) => {
    if (!activeTask) return;
    setIsPolishing(true);
    try {
      let updatedCopy = editedCopy;
      if (onRefineWithFeedback) {
        updatedCopy = await onRefineWithFeedback(String(activeTask.id), feedback, presetTags, editedCopy);
      } else {
        const tagNote = presetTags.length > 0 ? `\n[Tags: ${presetTags.join(', ')}]` : '';
        updatedCopy = `${editedCopy.trim()}\n\n📝 Reviewer Feedback Incorporated:\n"${feedback}"${tagNote}`;
      }
      setHistory((prev) => [...prev, updatedCopy]);
      handleCopyChange(updatedCopy);
      addToast('AI Script Rewritten ✨', 'Script successfully updated based on your review feedback.', 'success');
    } catch (err: any) {
      addToast('AI Rewrite Failed', err?.message || 'Could not process review feedback.', 'error');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleRegenerateFull = async () => {
    if (!activeTask || isRegeneratingFull) return;
    setIsRegeneratingFull(true);
    try {
      let newCopy = editedCopy;
      if (onRegenerateFullPost) {
        newCopy = await onRegenerateFullPost(String(activeTask.id), editedCopy);
      } else {
        await new Promise((res) => setTimeout(res, 1200));
        newCopy = `[AI Full Rewrite for ${activeTask.platform}]\n\n` + editedCopy;
      }
      setHistory((prev) => [...prev, newCopy]);
      handleCopyChange(newCopy);
      addToast('Full Post Regenerated 🚀', 'Fresh script generated with Gemini AI.', 'success');
    } catch (err: any) {
      addToast('Regeneration Failed', err.message || 'Could not rewrite script.', 'error');
    } finally {
      setIsRegeneratingFull(false);
    }
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    setIsReverting(true);
    setTimeout(() => {
      const newHist = [...history];
      newHist.pop();
      const prevVal = newHist[newHist.length - 1];
      setHistory(newHist);
      handleCopyChange(prevVal);
      setIsReverting(false);
      addToast('Reverted Edit', 'Restored previous text draft.', 'info');
    }, 200);
  };

  const handleCopyClipboard = () => {
    if (!editedCopy) return;
    navigator.clipboard.writeText(editedCopy);
    setCopied(true);
    addToast('Copied to Clipboard! 📋', 'Post draft ready for publishing.', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === displayedTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(displayedTasks.map((t) => String(t.id))));
    }
  };

  const handleBatchApprove = () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    if (onBatchApprove) {
      onBatchApprove(ids);
    } else {
      ids.forEach((id) => onApprove(id));
    }
    setSelectedTaskIds(new Set());
    addToast('Batch Approved! 🎉', `Approved ${ids.length} post drafts.`, 'success');
  };

  const handleBatchReject = () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    if (onBatchReject) {
      onBatchReject(ids);
    } else {
      ids.forEach((id) => onReject(id));
    }
    setSelectedTaskIds(new Set());
    addToast('Batch Rejected', `Rejected ${ids.length} post drafts.`, 'info');
  };

  const isAllSelected =
    displayedTasks.length > 0 && selectedTaskIds.size === displayedTasks.length;
  const isOverLimit = activeTask
    ? editedCopy.length > PLATFORM_LIMITS[activeTask.platform]
    : false;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-100 dark:bg-zinc-950 font-sans text-slate-900 dark:text-zinc-100 select-none">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white dark:bg-zinc-950/80 backdrop-blur-md shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <EmptyInboxIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              Approval Inbox
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                {filteredTasks.length} pending review
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Daily Action Center: Review, tweak, and approve AI-generated post copy.
            </p>
          </div>
        </div>

        {selectedWorkspace ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 font-medium">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-slate-500 dark:text-zinc-500">Workspace:</span>
            <span className="font-bold text-slate-900 dark:text-zinc-100">{selectedWorkspace.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-extrabold">All Workspaces</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-200/60 dark:bg-indigo-900/60 font-bold">{workspaces.length} active</span>
          </div>
        )}
      </header>

      {/* Main Split Screen Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANE: Task List */}
        <div className="w-80 sm:w-96 border-r border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-200 dark:border-zinc-800/60 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search pending tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600 transition-colors shadow-sm"
              />
            </div>

            {/* Platform Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
              {['all', 'instagram', 'linkedin', 'facebook', 'twitter'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors text-[11px] font-bold cursor-pointer ${
                    platformFilter === p
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Select All & Bulk Action Bar */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-zinc-800/40 text-xs">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors text-[11px] font-bold cursor-pointer"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                )}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>

              {selectedTaskIds.size > 0 && (
                <HasPermission allowedRoles={['admin', 'editor']}>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleBatchApprove}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors cursor-pointer shadow-sm"
                    >
                      Approve ({selectedTaskIds.size})
                    </button>
                    <button
                      onClick={handleBatchReject}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-500 transition-colors cursor-pointer shadow-sm"
                    >
                      Reject ({selectedTaskIds.size})
                    </button>
                  </div>
                </HasPermission>
              )}
            </div>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-zinc-400 space-y-3">
                <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <p className="text-xs font-bold">Loading inbox tasks...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                <p className="text-xs text-rose-600 dark:text-rose-300 font-bold">{error}</p>
                {onRefetch && (
                  <button
                    onClick={onRefetch}
                    className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : displayedTasks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-zinc-500">
                <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-300">All Caught Up!</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1 max-w-[200px] font-medium">
                  No pending copy drafts matching your filters.
                </p>
              </div>
            ) : (
              displayedTasks.map((task) => {
                const isSelected = task.id === selectedTaskId;
                const isChecked = selectedTaskIds.has(String(task.id));
                const taskWs = workspaces?.find((w) => w.id === task.workspaceId);
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative group ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-500/60 shadow-md'
                        : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800/80 hover:bg-slate-100/80 dark:hover:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-600 rounded-r" />
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskSelection(String(task.id));
                          }}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 dark:text-zinc-600" />
                          )}
                        </button>

                        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/50 shrink-0">
                          <PlatformIcon platform={task.platform} />
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 truncate">
                          {task.campaign}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-700/50 shrink-0">
                        {task.date}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-2 font-medium">
                      {task.copy}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-500 pt-2 border-t border-slate-200 dark:border-zinc-800/50 font-bold">
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                        <Clock className="w-3 h-3" /> Day {task.dayNumber || 1}
                      </span>
                      {taskWs && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white ${taskWs.brandColor} shadow-xs`}>
                          {taskWs.name}
                        </span>
                      )}
                      <span>
                        {task.copy.length} chars
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Script Editor View */}
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
          {activeTask ? (
            <>
              {/* Editor Header */}
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50/70 dark:bg-zinc-900/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 shadow-sm">
                    <PlatformIcon platform={activeTask.platform} className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">{activeTask.campaign}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                        Day {activeTask.dayNumber || 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 font-medium">
                      <span>Target: {activeTask.targetAudience || 'General Audience'}</span>
                      <span>•</span>
                      <span>Platform: {activeTask.platform}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <HasPermission allowedRoles={['admin', 'editor']}>
                    <button
                      onClick={() => setIsReviewModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/25"
                      title="Provide feedback notes & preset tags to guide AI rewrite"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Review & AI Rewrite</span>
                    </button>

                    {onRegenerateFullPost && (
                      <button
                        onClick={handleRegenerateFull}
                        disabled={isRegeneratingFull}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                        title="AI Rewrite Full Script with Gemini"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRegeneratingFull ? 'animate-spin' : ''}`} />
                        <span>Blind Full Rewrite</span>
                      </button>
                    )}
                  </HasPermission>

                  <button
                    onClick={handleCopyClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-300 transition-colors cursor-pointer shadow-sm"
                    title="Copy text"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Textarea Body */}
              <div className="flex-1 p-6 flex flex-col relative overflow-hidden bg-white dark:bg-zinc-950">
                {(isPolishing || isRegeneratingFull || isReverting) && (
                  <div className="absolute inset-0 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-sm z-20 flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    <Sparkles className="w-5 h-5 animate-spin" />
                    <span>
                      {isRegeneratingFull
                        ? 'Gemini AI is generating a complete rewrite of your script...'
                        : isReverting
                        ? 'Restoring previous version...'
                        : 'AI Copy Director is refining your script...'}
                    </span>
                  </div>
                )}

                <textarea
                  value={editedCopy}
                  onChange={(e) => setEditedCopy(e.target.value)}
                  readOnly={role === 'viewer'}
                  placeholder={role === 'viewer' ? "Read-only mode (Viewer access)" : "Type or edit AI generated copy script here..."}
                  className={`w-full flex-1 bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/80 focus:border-indigo-600 dark:focus:border-indigo-500 rounded-2xl p-5 text-sm sm:text-base text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none resize-none leading-relaxed transition-all font-sans font-medium shadow-sm ${role === 'viewer' ? 'cursor-not-allowed opacity-80' : ''}`}
                />

                {/* Counters */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500 px-1 font-semibold">
                  <div className="flex items-center gap-4">
                    <span>Words: {editedCopy.trim().split(/\s+/).filter(Boolean).length}</span>
                    <span>
                      Chars: {editedCopy.length} / {PLATFORM_LIMITS[activeTask.platform]}
                    </span>
                  </div>

                  {isOverLimit && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                      <AlertCircle className="w-3.5 h-3.5" /> Exceeds {activeTask.platform} limit
                    </span>
                  )}
                </div>
              </div>

              {/* Editor Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-zinc-900/60 flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-500 dark:text-zinc-400 font-medium hidden sm:block">
                  {role === 'viewer' ? 'Read-only mode enabled for Viewers.' : 'Review & approve for automated publishing.'}
                </div>

                <div className="flex items-center gap-2">
                  <HasPermission allowedRoles={['admin', 'editor']}>
                    <button
                      onClick={handleUndo}
                      disabled={history.length <= 1}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-200/80 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                      title="Undo last AI edit"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>

                    <button
                      onClick={() => onReject(String(activeTask.id))}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject</span>
                    </button>

                    <button
                      onClick={() => onApprove(String(activeTask.id))}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/30 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve & Publish</span>
                    </button>
                  </HasPermission>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500 space-y-3">
              <EmptyInboxIcon className="w-12 h-12 text-slate-300 dark:text-zinc-700" />
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">No Post Draft Selected</p>
              <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-xs font-medium">
                Select a pending task from the left pane to view, edit, or approve AI copy drafts.
              </p>
            </div>
          )}
        </div>
      </div>

      {activeTask && (
        <ReviewFeedbackModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmitFeedback={handleReviewFeedbackSubmit}
          currentCopy={editedCopy}
          platform={activeTask.platform}
          campaignTitle={activeTask.campaign}
        />
      )}
    </div>
  );
};
