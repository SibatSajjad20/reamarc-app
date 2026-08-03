import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { InboxTask, Workspace } from '../../types';
import { PlatformIcon, PLATFORM_LIMITS } from '../../utils/platform';
import { useToast } from '../../context/ToastContext';
import {
  CheckCircle2,
  Save,
  Sparkles,
  Search,
  Copy,
  Check,
  Zap,
  Wand2,
  Clock,
  Send,
  AlertCircle,
  Inbox as EmptyInboxIcon,
  Layers,
  RefreshCw,
} from 'lucide-react';

interface ApprovalInboxProps {
  tasks: InboxTask[];
  onApproveTask: (taskId: number | string) => void;
  onSaveDraft: (taskId: number | string, updatedCopy: string) => void;
  onRegenerateFullPost?: (taskId: number | string) => Promise<InboxTask | null>;
  selectedWorkspace: Workspace | null;
}

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({
  tasks,
  onApproveTask,
  onSaveDraft,
  onRegenerateFullPost,
  selectedWorkspace,
}) => {
  const { addToast } = useToast();

  const filteredTasks = useMemo(() => {
    return selectedWorkspace
      ? tasks.filter((t) => t.workspaceId === selectedWorkspace.id)
      : tasks;
  }, [tasks, selectedWorkspace]);

  const [selectedTaskId, setSelectedTaskId] = useState<number | string | null>(
    filteredTasks.length > 0 ? filteredTasks[0].id : null
  );
  const [editedCopy, setEditedCopy] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isRegeneratingFull, setIsRegeneratingFull] = useState(false);

  useEffect(() => {
    if (filteredTasks.length > 0) {
      const exists = filteredTasks.some((t) => t.id === selectedTaskId);
      if (!exists) {
        setSelectedTaskId(filteredTasks[0].id);
      }
    } else {
      setSelectedTaskId(null);
    }
  }, [filteredTasks, selectedTaskId]);

  const activeTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    if (activeTask) {
      setEditedCopy(activeTask.copy);
    } else {
      setEditedCopy('');
    }
  }, [selectedTaskId, activeTask]);

  const handleApprove = () => {
    if (!activeTask) return;
    onSaveDraft(activeTask.id, editedCopy);
    onApproveTask(activeTask.id);
    addToast(
      'Copy Approved & Scheduled! 🚀',
      `"${activeTask.campaign}" script for ${activeTask.platform} has been sent to post queue.`,
      'success'
    );
  };

  const stateRef = useRef({ activeTask, editedCopy, handleApprove });
  useEffect(() => {
    stateRef.current = { activeTask, editedCopy, handleApprove };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (stateRef.current.activeTask) {
          e.preventDefault();
          stateRef.current.handleApprove();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSave = () => {
    if (!activeTask) return;
    onSaveDraft(activeTask.id, editedCopy);
    addToast(
      'Draft Saved',
      `Changes saved for ${activeTask.campaign} (${activeTask.platform}).`,
      'info'
    );
  };

  const handleCopyClipboard = () => {
    if (!editedCopy) return;
    navigator.clipboard.writeText(editedCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('Copied to Clipboard', 'Copy content copied to system clipboard.', 'info');
  };

  const applyAIPolish = (actionType: 'punchy' | 'emojis' | 'hashtags' | 'fix') => {
    if (!activeTask || !editedCopy) return;
    setIsPolishing(true);

    setTimeout(() => {
      let updated = editedCopy;
      if (actionType === 'punchy') {
        updated = editedCopy
          .replace(/\n\n/g, ' ⚡\n')
          .replace(/check/gi, 'master')
          .replace(/Step into/gi, 'Unlock ultimate');
        addToast('AI Polish Applied', 'Rephrased copy for high engagement & conversion punchiness.', 'success');
      } else if (actionType === 'emojis') {
        updated = `🔥 ${editedCopy} 🎯✨`;
        addToast('Emojis Enhanced', 'Added visual emphasis and expressive emojis.', 'success');
      } else if (actionType === 'hashtags') {
        if (!updated.includes('#')) {
          updated += `\n\n#B2BGrowth #ReamarcAI #ContentStrategy #${activeTask.platform}`;
        }
        addToast('Hashtags Generated', 'Appended optimized trending hashtags.', 'info');
      } else if (actionType === 'fix') {
        updated = updated.trim();
        addToast('Grammar & Tone Checked', 'Cleaned up syntax, line breaks, and punctuation.', 'success');
      }

      setEditedCopy(updated);
      setIsPolishing(false);
    }, 600);
  };

  const handleRegenerateFull = async () => {
    if (!activeTask || !onRegenerateFullPost) return;
    setIsRegeneratingFull(true);
    try {
      const updatedPost = await onRegenerateFullPost(activeTask.id);
      if (updatedPost) {
        setEditedCopy(updatedPost.copy);
        addToast('Full Script Regenerated 🪄', 'Gemini AI has rewritten the full post from scratch.', 'success');
      }
    } catch (err: any) {
      addToast('Regeneration Failed', err.message || 'Could not regenerate full script.', 'warning');
    } finally {
      setIsRegeneratingFull(false);
    }
  };

  const displayedTasks = useMemo(() => {
    return filteredTasks.filter((t) => {
      const matchesSearch =
        t.campaign.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.copy.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform =
        platformFilter === 'all' || t.platform.toLowerCase() === platformFilter.toLowerCase();
      return matchesSearch && matchesPlatform;
    });
  }, [filteredTasks, searchQuery, platformFilter]);

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden select-none">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <EmptyInboxIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Approval Inbox
              <span className="text-xs font-normal text-zinc-400">
                ({filteredTasks.length} pending review)
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Daily Action Center: Review, tweak, and publish AI-generated copy.
            </p>
          </div>
        </div>

        {selectedWorkspace && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <span className="text-zinc-500">Filtered by:</span>
            <span className="font-semibold text-zinc-100">{selectedWorkspace.name}</span>
          </div>
        )}
      </header>

      {/* Main Split Screen Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANE: Task List */}
        <div className="w-80 sm:w-96 border-r border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0">
          <div className="p-3 border-b border-zinc-800/60 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search pending tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
              {['all', 'instagram', 'linkedin', 'facebook', 'twitter'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors text-[11px] font-medium ${
                    platformFilter === p
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {displayedTasks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-500/60" />
                <p className="text-sm font-semibold text-zinc-300">All Caught Up!</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">
                  No pending copy drafts matching your filters.
                </p>
              </div>
            ) : (
              displayedTasks.map((task) => {
                const isSelected = task.id === selectedTaskId;
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer relative group ${
                      isSelected
                        ? 'bg-indigo-950/30 border-indigo-500/60 shadow-lg shadow-indigo-950/20'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r" />
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                          <PlatformIcon platform={task.platform} />
                        </div>
                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate max-w-[140px]">
                          {task.campaign}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                        {task.date}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-2 font-normal">
                      {task.copy}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/50">
                      <span className="flex items-center gap-1 text-indigo-400 font-medium">
                        <Clock className="w-3 h-3" /> Day {task.dayNumber || 1}
                      </span>
                      <span className="text-zinc-500">
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
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
          {activeTask ? (
            <>
              {/* Editor Header */}
              <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700/60">
                    <PlatformIcon platform={activeTask.platform} className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-zinc-100">{activeTask.campaign}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                        Day {activeTask.dayNumber || 1} of 7
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                      <span>Target: {activeTask.targetAudience || 'General Audience'}</span>
                      <span>•</span>
                      <span>Platform: {activeTask.platform}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onRegenerateFullPost && (
                    <button
                      onClick={handleRegenerateFull}
                      disabled={isRegeneratingFull}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                      title="AI Rewrite Full Script with Gemini"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingFull ? 'animate-spin' : ''}`} />
                      <span>Regenerate Full Script</span>
                    </button>
                  )}

                  <button
                    onClick={handleCopyClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-medium text-zinc-300 transition-colors"
                    title="Copy text"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* AI Quick Polish Toolbar */}
              <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/60 flex items-center gap-2 overflow-x-auto shrink-0">
                <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1 shrink-0 mr-1">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" /> AI Refine:
                </span>
                <button
                  onClick={() => applyAIPolish('punchy')}
                  disabled={isPolishing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-zinc-700/60 text-[11px] text-zinc-300 transition-colors shrink-0"
                >
                  <Zap className="w-3 h-3 text-amber-400" /> Make Punchy
                </button>
                <button
                  onClick={() => applyAIPolish('emojis')}
                  disabled={isPolishing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-zinc-700/60 text-[11px] text-zinc-300 transition-colors shrink-0"
                >
                  <Sparkles className="w-3 h-3 text-pink-400" /> Add Emojis
                </button>
                <button
                  onClick={() => applyAIPolish('hashtags')}
                  disabled={isPolishing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-zinc-700/60 text-[11px] text-zinc-300 transition-colors shrink-0"
                >
                  <span>#</span> Smart Hashtags
                </button>
                <button
                  onClick={() => applyAIPolish('fix')}
                  disabled={isPolishing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-zinc-700/60 text-[11px] text-zinc-300 transition-colors shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Fix Grammar
                </button>
              </div>

              {/* Textarea Body */}
              <div className="flex-1 p-6 flex flex-col relative overflow-hidden bg-zinc-950">
                {(isPolishing || isRegeneratingFull) && (
                  <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm z-20 flex items-center justify-center gap-2 text-indigo-400 font-medium text-xs">
                    <Sparkles className="w-5 h-5 animate-spin" />
                    <span>
                      {isRegeneratingFull
                        ? 'Gemini AI is generating a complete rewrite of your script...'
                        : 'AI Copy Director is refining your script...'}
                    </span>
                  </div>
                )}

                <textarea
                  value={editedCopy}
                  onChange={(e) => setEditedCopy(e.target.value)}
                  placeholder="Type or edit AI generated copy script here..."
                  className="w-full flex-1 bg-zinc-900/40 border border-zinc-800/80 focus:border-indigo-500 rounded-2xl p-5 text-sm sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none leading-relaxed transition-all font-sans font-normal shadow-inner"
                />

                {/* Character & Word Counters */}
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 px-1">
                  <div className="flex items-center gap-4">
                    <span>Words: {editedCopy.trim().split(/\s+/).filter(Boolean).length}</span>
                    <span>
                      Chars: {editedCopy.length} / {PLATFORM_LIMITS[activeTask.platform]}
                    </span>
                  </div>

                  {editedCopy.length > PLATFORM_LIMITS[activeTask.platform] && (
                    <span className="flex items-center gap-1 text-amber-400 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> Exceeds {activeTask.platform} limit
                    </span>
                  )}
                </div>
              </div>

              {/* Editor Footer Actions */}
              <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
                <div className="text-xs text-zinc-500 hidden sm:block">
                  Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300 font-mono text-[10px]">Ctrl+Enter</kbd> to Approve & Publish
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors"
                  >
                    <Save className="w-4 h-4 text-zinc-400" />
                    Save Draft
                  </button>

                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all duration-200 transform hover:scale-[1.02]"
                  >
                    <Send className="w-4 h-4" />
                    Approve & Publish
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                <Layers className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-base font-bold text-zinc-300">No Task Selected</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                Select a pending copy task from the left list view to open the AI editor and approve or polish your post.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
