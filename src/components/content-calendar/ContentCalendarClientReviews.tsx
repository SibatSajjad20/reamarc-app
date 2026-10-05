import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  RotateCcw,
  LayoutGrid,
  Inbox,
  CheckCircle2,
  ExternalLink,
  Search,
  Sparkles,
  RefreshCw,
  FolderKanban,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Link2,
} from 'lucide-react';
import { contentCalendarService } from '../../services/contentCalendarService';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { PIPELINE_STAGES } from '../../types/contentCalendar';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { ContentCalendarPipelineView } from './ContentCalendarPipelineView';
import { ContentCalendarDrawer } from './ContentCalendarDrawer';
import { CreativeAssetGallery } from './CreativeAssetGallery';
import type { StageAction } from '../../utils/contentCalendarWorkflow';

type PortalTab = 'approvals' | 'pipeline';

function reviewBadgeStyle(stage: string): { bg: string; text: string; border: string; label: string } {
  if (stage === 'Creative Client Review') {
    return {
      bg: 'bg-purple-500/10 dark:bg-purple-500/20',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800',
      label: 'Creative Review',
    };
  }
  return {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    label: 'Content Review',
  };
}

function approveButtonLabel(stage: string): string {
  return stage === 'Creative Client Review' ? 'Approve Creative' : 'Approve Content';
}

const ClientReviewSkeletonCard: React.FC = () => (
  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12141c] p-5 space-y-4 shadow-sm animate-pulse">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
        <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
      </div>
      <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
    </div>

    <div className="space-y-2">
      <div className="h-5 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
      <div className="h-3.5 w-1/2 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
    </div>

    <div className="flex flex-wrap gap-2">
      <div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800/80 rounded-md" />
      <div className="h-5 w-24 bg-zinc-100 dark:bg-zinc-800/80 rounded-md" />
      <div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800/80 rounded-md" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/60">
      <div className="space-y-1">
        <div className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
      <div className="space-y-1">
        <div className="h-3 w-10 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
    </div>

    <div className="space-y-2">
      <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
      <div className="h-14 w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/50 rounded-xl" />
    </div>

    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
      <div className="h-8 w-1/2 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
      <div className="flex items-center gap-2">
        <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
        <div className="h-8 w-32 bg-zinc-300 dark:bg-zinc-700 rounded-xl" />
      </div>
    </div>
  </div>
);

export const ContentCalendarClientReviews: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('approvals');
  const [items, setItems] = useState<ContentCalendarItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDrawerItem, setSelectedDrawerItem] = useState<ContentCalendarItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setIsLoading(true);
      }
      const res = await contentCalendarService.getItems();
      setItems(res.items || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load campaigns');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Items waiting for client approval
  const waitingItems = useMemo(() => {
    return items.filter(
      (item) => item.stage === 'Content Client Review' || item.stage === 'Creative Client Review',
    );
  }, [items]);

  // Filtered waiting items based on search
  const filteredWaitingItems = useMemo(() => {
    if (!search.trim()) return waitingItems;
    const q = search.trim().toLowerCase();
    return waitingItems.filter(
      (item) =>
        item.serial?.toLowerCase().includes(q) ||
        item.content_concept?.toLowerCase().includes(q) ||
        item.primary_text?.toLowerCase().includes(q) ||
        item.headlines_hooks?.toLowerCase().includes(q) ||
        item.offer?.toLowerCase().includes(q) ||
        item.campaign_type?.toLowerCase().includes(q) ||
        item.content_pillar?.toLowerCase().includes(q),
    );
  }, [waitingItems, search]);

  // Collapsible cards state: track which items are expanded
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isAllExpanded = useMemo(() => {
    if (filteredWaitingItems.length === 0) return false;
    return filteredWaitingItems.every((item) => expandedIds[item.id]);
  }, [filteredWaitingItems, expandedIds]);

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredWaitingItems.forEach((item) => {
        next[item.id] = true;
      });
      setExpandedIds(next);
    }
  };

  const handleAction = async (item: ContentCalendarItem, action: 'approve' | 'request_revision') => {
    const noteText = (notes[item.id] || '').trim();
    if (action === 'request_revision' && !noteText) {
      addToast('Revision note required', 'Please describe what changes the team should make.', 'error');
      return;
    }
    setBusyId(item.id);

    // Optimistic local state update
    const nextStage =
      action === 'approve'
        ? item.stage === 'Content Client Review'
          ? 'Creative Production'
          : 'Ready to Post'
        : item.stage === 'Content Client Review'
        ? 'Content Revision'
        : 'Creative Revision';

    const previousItems = items;
    setItems((curr) =>
      curr.map((i) =>
        i.id === item.id
          ? {
              ...i,
              stage: nextStage,
              revision_note: action === 'request_revision' ? noteText : i.revision_note,
            }
          : i,
      ),
    );

    try {
      await contentCalendarService.transition(item.id, {
        action,
        note: action === 'request_revision' ? noteText : undefined,
      });

      addToast(
        action === 'approve' ? 'Approved' : 'Revision requested',
        action === 'approve'
          ? item.stage === 'Creative Client Review'
            ? 'Creative approved and ready for publishing.'
            : 'Content approved and passed to creative production.'
          : 'Revision instructions delivered to the team.',
        'success',
      );

      // Clear the revision note for this item
      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      // Background silent sync
      await loadData({ silent: true });
    } catch (err: any) {
      // Revert optimistic update
      setItems(previousItems);
      addToast('Could not process review', err?.message || 'Please try again', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePipelineTransition = async (
    id: string,
    action: StageAction,
    extra?: { note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ) => {
    try {
      await contentCalendarService.transition(id, {
        action,
        note: extra?.note,
        assignee_id: extra?.assignee_id,
        assignee_name: extra?.assignee_name,
        target_stage: extra?.target_stage,
      });
      addToast('Stage updated', 'Campaign moved successfully.', 'success');
      await loadData({ silent: true });
    } catch (err: any) {
      addToast('Action not allowed', err?.message || 'Could not move campaign.', 'error');
      throw err;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-50 dark:bg-[#090a0f]">
      {/* Client Portal Header */}
      <header className="px-6 py-4 bg-white dark:bg-[#12141c] border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/60">
                <FolderKanban className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Client Portal</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                {items.length} campaigns
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Review and approve content & creative drafts, or explore all campaigns across the production pipeline.
            </p>
          </div>

          {/* Navigation Mode Switcher */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveTab('approvals')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'approvals'
                    ? 'bg-white dark:bg-[#181a24] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Pending Approvals</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    waitingItems.length > 0
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {waitingItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pipeline')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'pipeline'
                    ? 'bg-white dark:bg-[#181a24] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Campaign Pipeline</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {PIPELINE_STAGES.length}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              title="Refresh campaigns"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="max-w-4xl mx-auto px-6 pt-4">
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {activeTab === 'approvals' ? (
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
            {/* Search and summary bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {waitingItems.length === 1
                    ? '1 Campaign Needs Your Review'
                    : `${waitingItems.length} Campaigns Need Your Review`}
                </span>
                {waitingItems.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <Sparkles className="w-3 h-3" />
                    <span>Action Required</span>
                  </span>
                )}
              </div>

              {waitingItems.length > 0 && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search pending reviews..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleExpandAll}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-2xs transition cursor-pointer shrink-0"
                    title={isAllExpanded ? "Collapse all campaigns" : "Expand all campaigns"}
                  >
                    {isAllExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="hidden sm:inline">Collapse All</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="hidden sm:inline">Expand All</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Skeleton Loading States */}
            {isLoading && (
              <div className="space-y-4">
                <ClientReviewSkeletonCard />
                <ClientReviewSkeletonCard />
              </div>
            )}

            {/* Empty State Placeholder */}
            {!isLoading && waitingItems.length === 0 && (
              <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/70 dark:bg-[#12141c]/50 p-12 text-center space-y-4 shadow-xs">
                <div className="inline-flex p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    All caught up! No reviews pending
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    There are currently no campaigns waiting for your approval. When content copy or creative drafts are
                    ready, they will appear here.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pipeline')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/20 cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>View Campaign Pipeline</span>
                  </button>
                </div>
              </div>
            )}

            {/* No match for search */}
            {!isLoading && waitingItems.length > 0 && filteredWaitingItems.length === 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12141c] p-8 text-center text-xs text-zinc-500">
                No pending campaigns match "{search}".
              </div>
            )}

            {/* Review Cards List */}
            {!isLoading &&
              filteredWaitingItems.map((item) => {
                const badge = reviewBadgeStyle(item.stage);
                const isItemBusy = busyId === item.id;
                const isExpanded = !!expandedIds[item.id];
                const attachmentsCount = item.attachments?.length || 0;

                return (
                  <article
                    key={item.id}
                    className={`rounded-2xl border transition-all ${
                      isExpanded
                        ? 'border-indigo-300 dark:border-indigo-800/80 bg-white dark:bg-[#12141c] shadow-sm'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12141c] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs'
                    }`}
                  >
                    {/* Collapsible Card Header: Clickable banner to toggle expand */}
                    <div
                      onClick={() => toggleExpanded(item.id)}
                      className={`p-4 sm:p-5 flex items-start justify-between gap-3 cursor-pointer select-none rounded-2xl ${
                        isExpanded
                          ? 'border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20'
                          : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400">
                            {item.serial}
                          </span>
                          {item.publish_date && (
                            <span className="text-[11px] text-zinc-400">
                              Target Publish: {item.publish_date}
                            </span>
                          )}
                          {attachmentsCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80">
                              <ImageIcon className="w-3 h-3 text-indigo-500" />
                              <span>
                                {attachmentsCount} {attachmentsCount === 1 ? 'Asset' : 'Assets'}
                              </span>
                            </span>
                          )}
                        </div>

                        <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 leading-snug">
                          {item.content_concept}
                        </h2>

                        {/* Metadata chips */}
                        <div className="flex flex-wrap gap-1.5 text-[11px] mt-2">
                          {item.campaign_type && (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                              {item.campaign_type}
                            </span>
                          )}
                          {item.content_pillar && (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                              {item.content_pillar}
                            </span>
                          )}
                          {item.creative_type && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800">
                              {item.creative_type}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const token = item.share_token || item.id;
                            const url = `${window.location.origin}/review/${token}`;
                            navigator.clipboard.writeText(url);
                            setCopiedId(item.id);
                            addToast('Review Link Copied', 'Client review link copied to clipboard.', 'success');
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                          title="Copy Client Review Link"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>{copiedId === item.id ? 'Copied!' : 'Review Link'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDrawerItem(item);
                            setIsDrawerOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2.5 py-1.5 rounded-xl transition cursor-pointer border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                          title="View Full Item Specs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Inspect Specs</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(item.id);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            isExpanded
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                              : 'bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                          }`}
                        >
                          <span>{isExpanded ? 'Collapse' : 'Expand Content'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Body */}
                    {isExpanded && (
                      <div className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-4 animate-in fade-in-50 duration-200">
                        {/* Dedicated Client Review Link Bar */}
                        <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>Client Review Link</span>
                            </div>
                            <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80 truncate">
                              Shareable approval link (no login required)
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const token = item.share_token || item.id;
                                const url = `${window.location.origin}/review/${token}`;
                                navigator.clipboard.writeText(url);
                                setCopiedId(item.id);
                                addToast('Review Link Copied', 'Client review link copied to clipboard.', 'success');
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-xs"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>{copiedId === item.id ? 'Copied!' : 'Copy Link'}</span>
                            </button>
                            <a
                              href={`/review/${item.share_token || item.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:text-blue-600 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                              title="Open Review Page in New Tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {/* Offer & CTA Box */}
                        {(item.offer || item.cta) && (
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/80 text-xs">
                            <div>
                              <dt className="text-[11px] font-medium text-zinc-400">Offer / Angle</dt>
                              <dd className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                                {item.offer || '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[11px] font-medium text-zinc-400">Call to Action (CTA)</dt>
                              <dd className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                                {item.cta || '—'}
                              </dd>
                            </div>
                          </dl>
                        )}

                        {/* Primary Text */}
                        {item.primary_text && (
                          <section className="space-y-1">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              Ad Copy / Caption
                            </h3>
                            <p className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 max-h-48 overflow-y-auto leading-relaxed">
                              {item.primary_text}
                            </p>
                          </section>
                        )}

                        {/* Headlines / Hooks */}
                        {item.headlines_hooks && (
                          <section className="space-y-1">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              Headlines & Hook Variations
                            </h3>
                            <p className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 max-h-32 overflow-y-auto font-mono">
                              {item.headlines_hooks}
                            </p>
                          </section>
                        )}

                        {/* Copy on Creative */}
                        {item.content_on_creative && (
                          <section className="space-y-1">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              On-Graphic / Video Text
                            </h3>
                            <p className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 max-h-32 overflow-y-auto leading-relaxed">
                              {item.content_on_creative}
                            </p>
                          </section>
                        )}

                        {/* Creative Media Deliverables */}
                        {item.attachments && item.attachments.length > 0 && (
                          <div className="pt-1">
                            <CreativeAssetGallery
                              itemId={item.id}
                              attachments={item.attachments}
                              readOnly={true}
                              compact={true}
                            />
                          </div>
                        )}

                        {/* Deliverables / Preview Links */}
                        {(item.draft_preview_link || item.final_asset_link) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {item.draft_preview_link && safeHttpUrl(item.draft_preview_link) && (
                              <a
                                href={safeHttpUrl(item.draft_preview_link) || undefined}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold hover:bg-indigo-100 transition"
                              >
                                <span>Open Draft Preview</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {item.final_asset_link && safeHttpUrl(item.final_asset_link) && (
                              <a
                                href={safeHttpUrl(item.final_asset_link) || undefined}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition"
                              >
                                <span>Open Final Asset</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Actions and Feedback Form */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-zinc-500">
                              Revision Feedback (Optional for approval, required for revision requests)
                            </label>
                            <textarea
                              rows={2}
                              value={notes[item.id] || ''}
                              onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Provide detailed revision feedback here if requesting changes..."
                              className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              disabled={isItemBusy}
                              onClick={() => void handleAction(item, 'request_revision')}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition cursor-pointer"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isItemBusy ? 'animate-spin' : ''}`} />
                              <span>Request Revision</span>
                            </button>
                            <button
                              type="button"
                              disabled={isItemBusy}
                              onClick={() => void handleAction(item, 'approve')}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm shadow-indigo-600/20 cursor-pointer"
                            >
                              <Check className={`w-3.5 h-3.5 ${isItemBusy ? 'animate-spin' : ''}`} />
                              <span>{approveButtonLabel(item.stage)}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        ) : (
          /* Pipeline Kanban View across All 11 Stages */
          <div className="h-full flex flex-col min-w-0">
            <div className="px-6 py-2 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Viewing your full production pipeline. Click any campaign card to inspect copy, media links, and status.
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <ContentCalendarPipelineView
                items={items}
                stages={[...PIPELINE_STAGES]}
                actor={user}
                isLoading={isLoading}
                onSelectItem={(item) => {
                  setSelectedDrawerItem(item);
                  setIsDrawerOpen(true);
                }}
                onTransition={handlePipelineTransition}
              />
            </div>
          </div>
        )}
      </main>

      {/* Campaign Details Drawer */}
      <ContentCalendarDrawer
        item={selectedDrawerItem}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        actor={user}
        onTransition={handlePipelineTransition}
        onItemUpdated={(updated) => {
          setSelectedDrawerItem(updated);
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />
    </div>
  );
};
