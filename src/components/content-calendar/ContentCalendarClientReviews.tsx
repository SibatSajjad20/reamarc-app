import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  RotateCcw,
  LayoutGrid,
  Inbox,
  Search,
  RefreshCw,
  Image as ImageIcon,
  Play,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { contentCalendarService } from '../../services/contentCalendarService';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { PIPELINE_STAGES } from '../../types/contentCalendar';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useBreadcrumb } from '../layout/BreadcrumbContext';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { StatusPill } from '../ui/StatusPill';
import { EmptyState } from '../ui/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { InstagramIcon, FacebookIcon, GoogleIcon } from '../ui/brand-icons';
import { ContentCalendarPipelineView } from './ContentCalendarPipelineView';
import { ContentCalendarDrawer } from './ContentCalendarDrawer';
import { CreativeAssetGallery } from './CreativeAssetGallery';
import type { StageAction } from '../../utils/contentCalendarWorkflow';
import { cn } from '../../lib/utils';

type ViewMode = 'approvals' | 'pipeline';
type ReviewFilter = 'pending' | 'approved' | 'revision';

function renderChannelIcons(channels?: string[]) {
  if (!channels || channels.length === 0) {
    return <InstagramIcon size={14} className="text-fg-muted" />;
  }
  return (
    <div className="flex items-center gap-1.5">
      {channels.map((ch) => {
        const lower = ch.toLowerCase();
        if (lower.includes('insta')) return <InstagramIcon key={ch} size={14} className="text-fg-muted" />;
        if (lower.includes('fb') || lower.includes('face')) return <FacebookIcon key={ch} size={14} className="text-fg-muted" />;
        if (lower.includes('google')) return <GoogleIcon key={ch} size={14} className="text-fg-muted" />;
        return <span key={ch} className="text-[10px] text-fg-muted uppercase font-mono">{ch}</span>;
      })}
    </div>
  );
}

export const ContentCalendarClientReviews: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { setTrail } = useBreadcrumb();

  const [viewMode, setViewMode] = useState<ViewMode>('approvals');
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('pending');
  const [items, setItems] = useState<ContentCalendarItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Detail Dialog state (880px)
  const [detailItem, setDetailItem] = useState<ContentCalendarItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [dialogNote, setDialogNote] = useState('');
  const [isRevisionMode, setIsRevisionMode] = useState(false);

  // Fallback drawer
  const [drawerItem, setDrawerItem] = useState<ContentCalendarItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    setTrail([
      { label: user?.name || 'Client portal' },
      { label: 'Approvals' },
    ]);
    return () => setTrail(null);
  }, [setTrail, user?.name]);

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

  // Categorize items
  const pendingItems = useMemo(() => {
    return items.filter(
      (item) => item.stage === 'Content Client Review' || item.stage === 'Creative Client Review',
    );
  }, [items]);

  const approvedItems = useMemo(() => {
    return items.filter((item) =>
      ['Creative Production', 'Creative Internal Review', 'Ready to Post', 'Posted'].includes(item.stage),
    );
  }, [items]);

  const revisionItems = useMemo(() => {
    return items.filter(
      (item) => item.stage === 'Content Revision' || item.stage === 'Creative Revision',
    );
  }, [items]);

  // Items to display based on active filter
  const currentTabItems = useMemo(() => {
    if (activeFilter === 'approved') return approvedItems;
    if (activeFilter === 'revision') return revisionItems;
    return pendingItems;
  }, [activeFilter, pendingItems, approvedItems, revisionItems]);

  // Filtered by search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return currentTabItems;
    const q = search.trim().toLowerCase();
    return currentTabItems.filter(
      (item) =>
        item.serial?.toLowerCase().includes(q) ||
        item.content_concept?.toLowerCase().includes(q) ||
        item.primary_text?.toLowerCase().includes(q) ||
        item.headlines_hooks?.toLowerCase().includes(q) ||
        item.offer?.toLowerCase().includes(q) ||
        item.campaign_type?.toLowerCase().includes(q) ||
        item.content_pillar?.toLowerCase().includes(q),
    );
  }, [currentTabItems, search]);

  // Recently reviewed items for the table (approved or revision requested)
  const recentlyReviewed = useMemo(() => {
    const list = [...approvedItems, ...revisionItems];
    return list.slice(0, 5);
  }, [approvedItems, revisionItems]);

  const handleAction = async (
    item: ContentCalendarItem,
    action: 'approve' | 'request_revision',
    noteText?: string,
  ) => {
    const note = (noteText || '').trim();
    if (action === 'request_revision' && !note) {
      addToast('Revision note required', 'Please describe what changes the team should make.', 'error');
      return;
    }
    setBusyId(item.id);

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
              revision_note: action === 'request_revision' ? note : i.revision_note,
            }
          : i,
      ),
    );

    try {
      await contentCalendarService.transition(item.id, {
        action,
        note: action === 'request_revision' ? note : undefined,
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

      if (detailItem?.id === item.id) {
        setIsDetailOpen(false);
        setDetailItem(null);
        setDialogNote('');
        setIsRevisionMode(false);
      }

      await loadData({ silent: true });
    } catch (err: any) {
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

  const openDetail = (item: ContentCalendarItem, revision = false) => {
    setDetailItem(item);
    setIsRevisionMode(revision);
    setDialogNote(item.revision_note || '');
    setIsDetailOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-canvas">
      {/* Page Header */}
      <div className="px-6 py-5 border-b border-border bg-surface shrink-0">
        <PageHeader
          title="Content approvals"
          description="Review posts from Reamarc before they go live."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode((prev) => (prev === 'approvals' ? 'pipeline' : 'approvals'))}
                icon={viewMode === 'approvals' ? LayoutGrid : Inbox}
              >
                {viewMode === 'approvals' ? 'View campaign pipeline' : 'View approvals'}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void loadData()}
                disabled={isLoading}
                title="Refresh campaigns"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin text-accent')} />
              </Button>
            </div>
          }
        />
      </div>

      {/* Main View Area */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="p-3.5 rounded-lg bg-danger-bg border border-danger-bd text-danger-fg text-xs flex items-center gap-2">
              <span>{error}</span>
            </div>
          </div>
        )}

        {viewMode === 'approvals' ? (
          <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
            {/* Filter Bar with Tabs and Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
              <Tabs
                value={activeFilter}
                onValueChange={(val) => setActiveFilter(val as ReviewFilter)}
              >
                <TabsList className="mb-0 border-b-0">
                  <TabsTrigger value="pending" count={pendingItems.length}>
                    Pending
                  </TabsTrigger>
                  <TabsTrigger value="approved" count={approvedItems.length}>
                    Approved
                  </TabsTrigger>
                  <TabsTrigger value="revision" count={revisionItems.length}>
                    Revision requested
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="w-full sm:w-72">
                <Input
                  inputSize="sm"
                  icon={Search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reviews..."
                  clearable
                  onClear={() => setSearch('')}
                />
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="rounded-lg border border-border bg-surface p-4 space-y-4 animate-pulse"
                  >
                    <div className="aspect-[4/5] bg-subtle rounded-md" />
                    <div className="h-4 bg-subtle rounded-sm w-3/4" />
                    <div className="h-3 bg-subtle rounded-sm w-1/2" />
                    <div className="h-8 bg-subtle rounded-md" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredItems.length === 0 && (
              <EmptyState
                icon={Inbox}
                title={
                  activeFilter === 'pending'
                    ? 'All caught up! No reviews pending'
                    : `No ${activeFilter} campaigns found`
                }
                description={
                  activeFilter === 'pending'
                    ? 'There are currently no campaigns waiting for your approval. When content copy or creative drafts are ready, they will appear here.'
                    : 'No campaigns match this status filter or search query.'
                }
                action={
                  activeFilter === 'pending' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode('pipeline')}
                      icon={LayoutGrid}
                    >
                      View campaign pipeline
                    </Button>
                  ) : undefined
                }
              />
            )}

            {/* Review Cards Grid (3 columns matching mock 13) */}
            {!isLoading && filteredItems.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredItems.map((item) => {
                  const previewAsset = item.attachments?.[0];
                  const isPending =
                    item.stage === 'Content Client Review' || item.stage === 'Creative Client Review';
                  const isItemBusy = busyId === item.id;

                  return (
                    <article
                      key={item.id}
                      className="rounded-lg border border-border bg-surface shadow-xs hover:border-border-strong hover:shadow-sm transition-all flex flex-col overflow-hidden"
                    >
                      {/* Asset Preview Frame 4:5 */}
                      <div
                        className="aspect-[4/5] w-full bg-subtle relative flex items-center justify-center border-b border-border overflow-hidden cursor-pointer group select-none"
                        onClick={() => openDetail(item)}
                      >
                        {previewAsset ? (
                          previewAsset.kind === 'video' ? (
                            <div className="relative w-full h-full">
                              <video
                                src={previewAsset.url}
                                className="w-full h-full object-cover"
                                preload="metadata"
                              />
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                                <div className="w-11 h-11 rounded-full bg-black/70 text-white flex items-center justify-center">
                                  <Play className="w-5 h-5 fill-white ml-0.5" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={previewAsset.thumbnail_url || previewAsset.url}
                              alt={item.content_concept || 'Campaign asset'}
                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                            />
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center text-fg-faint p-6 text-center">
                            <ImageIcon className="w-12 h-12 stroke-[1.25] text-fg-muted/50 mb-2" />
                            <span className="text-xs text-fg-muted font-medium">Awaiting visual asset</span>
                          </div>
                        )}
                        <span className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded text-xs font-medium bg-black/80 text-white">
                          Inspect
                        </span>
                      </div>

                      {/* Card Content */}
                      <div className="p-4.5 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          {/* Top Meta Line: Serial + Stage Status */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-medium text-fg-muted">
                              {item.serial}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium leading-tight',
                                item.stage === 'Creative Client Review'
                                  ? 'bg-accent-soft text-accent-text border border-accent/20'
                                  : item.stage === 'Content Client Review'
                                  ? 'bg-warning-bg text-warning-fg border border-warning-bd'
                                  : 'bg-subtle text-fg-muted border border-border'
                              )}
                            >
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full shrink-0',
                                  item.stage === 'Creative Client Review'
                                    ? 'bg-accent'
                                    : item.stage === 'Content Client Review'
                                    ? 'bg-warning-dot'
                                    : 'bg-fg-muted'
                                )}
                              />
                              {item.stage === 'Creative Client Review'
                                ? 'Creative review'
                                : item.stage === 'Content Client Review'
                                ? 'Content review'
                                : item.stage}
                            </span>
                          </div>

                          {/* Title */}
                          <h3
                            className="text-sm font-semibold text-fg mt-2 line-clamp-2 leading-snug cursor-pointer hover:text-accent transition-colors"
                            onClick={() => openDetail(item)}
                          >
                            {item.content_concept || item.headlines_hooks || item.serial}
                          </h3>

                          {/* Subtitle / Format & Publish date */}
                          <p className="text-xs text-fg-muted mt-1 line-clamp-1">
                            {[
                              item.creative_type || item.campaign_type || 'Post',
                              item.publish_date ? `Publishing ${item.publish_date}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>

                          {/* Key-Value Details */}
                          <dl className="mt-3.5 space-y-1.5 text-xs border-t border-border/60 pt-3">
                            <div className="flex items-start justify-between gap-2">
                              <dt className="text-fg-muted text-xs shrink-0">Offer</dt>
                              <dd className="font-medium text-fg text-right truncate">
                                {item.offer || '—'}
                              </dd>
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <dt className="text-fg-muted text-xs shrink-0">CTA</dt>
                              <dd className="font-medium text-fg text-right truncate">
                                {item.cta || '—'}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-fg-muted text-xs shrink-0">Channels</dt>
                              <dd className="flex items-center gap-1.5 text-fg-muted">
                                {renderChannelIcons(item.channels)}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Card Actions Footer */}
                        {isPending && (
                          <div className="pt-3 border-t border-border flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              block
                              disabled={isItemBusy}
                              onClick={() => openDetail(item, true)}
                            >
                              Request revision
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              block
                              disabled={isItemBusy}
                              loading={isItemBusy}
                              onClick={() => void handleAction(item, 'approve')}
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Recently Reviewed Section (matching mock 13) */}
            {activeFilter === 'pending' && recentlyReviewed.length > 0 && (
              <section className="pt-6 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">Recently reviewed</h3>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('approved')}
                    className="text-xs text-accent-text hover:underline font-medium cursor-pointer"
                  >
                    View all
                  </button>
                </div>

                <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-subtle text-fg-muted font-medium">
                        <th className="py-2.5 px-4 font-medium">Serial</th>
                        <th className="py-2.5 px-4 font-medium">Content</th>
                        <th className="py-2.5 px-4 font-medium">Decision</th>
                        <th className="py-2.5 px-4 font-medium">Stage</th>
                        <th className="py-2.5 px-4 font-medium text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentlyReviewed.map((item) => {
                        const isApproved = [
                          'Creative Production',
                          'Creative Internal Review',
                          'Ready to Post',
                          'Posted',
                        ].includes(item.stage);

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-subtle/50 transition-colors cursor-pointer"
                            onClick={() => openDetail(item)}
                          >
                            <td className="py-2.5 px-4 font-mono font-medium text-fg-muted">
                              {item.serial}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-fg max-w-xs truncate">
                              {item.content_concept || item.headlines_hooks || item.serial}
                            </td>
                            <td className="py-2.5 px-4">
                              <StatusPill
                                variant={isApproved ? 'success' : 'warning'}
                                dot
                                label={isApproved ? 'Approved' : 'Revision requested'}
                              />
                            </td>
                            <td className="py-2.5 px-4 text-fg-muted">
                              {item.stage}
                            </td>
                            <td className="py-2.5 px-4 text-right text-fg-muted font-numeric">
                              {item.publish_date || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        ) : (
          /* Full Production Pipeline View */
          <div className="h-full flex flex-col min-w-0">
            <div className="px-6 py-2 bg-subtle border-b border-border text-xs text-fg-muted flex items-center justify-between">
              <span>
                Viewing full campaign production pipeline across all {PIPELINE_STAGES.length} stages. Click any card to inspect specs.
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <ContentCalendarPipelineView
                items={items}
                stages={[...PIPELINE_STAGES]}
                actor={user}
                isLoading={isLoading}
                onSelectItem={(item) => {
                  setDrawerItem(item);
                  setIsDrawerOpen(true);
                }}
                onTransition={handlePipelineTransition}
              />
            </div>
          </div>
        )}
      </main>

      {/* Detail Review Dialog (880px / maxWidth="xl" per §13.17) */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent maxWidth="xl" className="p-0 overflow-hidden">
          {detailItem && (
            <div>
              <DialogHeader className="p-5 border-b border-border">
                <div className="flex items-center justify-between gap-3 pr-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-fg-muted">
                        {detailItem.serial}
                      </span>
                      <StatusPill status={detailItem.stage} />
                    </div>
                    <DialogTitle className="mt-1 text-base">
                      {detailItem.content_concept}
                    </DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      {[
                        detailItem.creative_type || detailItem.campaign_type || 'Campaign Post',
                        detailItem.publish_date ? `Target Publish: ${detailItem.publish_date}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Two-Column Detail Body */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[calc(80vh-140px)] overflow-y-auto">
                {/* Left Column: Media Deliverables Preview */}
                <div className="md:col-span-6 space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                      Creative Deliverables
                    </span>
                    {detailItem.attachments && detailItem.attachments.length > 0 ? (
                      <CreativeAssetGallery
                        itemId={detailItem.id}
                        attachments={detailItem.attachments}
                        readOnly={true}
                        compact={false}
                      />
                    ) : (
                      <div className="aspect-video w-full rounded-lg bg-subtle border border-border flex flex-col items-center justify-center text-fg-muted p-6 text-center">
                        <ImageIcon className="w-10 h-10 text-fg-faint mb-2" />
                        <span className="text-xs">Visual asset pending from creative team</span>
                      </div>
                    )}
                  </div>

                  {/* External Asset Links */}
                  {(detailItem.draft_preview_link || detailItem.final_asset_link) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                      {detailItem.draft_preview_link && safeHttpUrl(detailItem.draft_preview_link) && (
                        <a
                          href={safeHttpUrl(detailItem.draft_preview_link) || undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-subtle hover:bg-hover border border-border text-fg transition-colors"
                        >
                          <span>Draft preview link</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {detailItem.final_asset_link && safeHttpUrl(detailItem.final_asset_link) && (
                        <a
                          href={safeHttpUrl(detailItem.final_asset_link) || undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent-soft hover:bg-accent-soft-2 border border-accent/20 text-accent-text transition-colors"
                        >
                          <span>Final asset file</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* On-Graphic Text */}
                  {detailItem.content_on_creative && (
                    <div className="space-y-1 pt-2">
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                        Copy on Graphic / Video
                      </span>
                      <p className="p-3 rounded-md bg-subtle border border-border text-xs leading-relaxed text-fg whitespace-pre-wrap">
                        {detailItem.content_on_creative}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Column: Copy, Strategy Details & Feedback Form */}
                <div className="md:col-span-6 space-y-4">
                  {/* Ad Copy */}
                  {detailItem.primary_text && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                        Ad Copy / Caption
                      </span>
                      <p className="p-3.5 rounded-md bg-subtle border border-border text-xs leading-relaxed text-fg whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {detailItem.primary_text}
                      </p>
                    </div>
                  )}

                  {/* Headlines & Hooks */}
                  {detailItem.headlines_hooks && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                        Headlines & Hooks
                      </span>
                      <p className="p-3 rounded-md bg-subtle border border-border text-xs leading-relaxed text-fg whitespace-pre-wrap font-mono">
                        {detailItem.headlines_hooks}
                      </p>
                    </div>
                  )}

                  {/* Strategy Info Grid */}
                  <dl className="grid grid-cols-2 gap-3 p-3 rounded-md bg-subtle border border-border text-xs">
                    <div>
                      <dt className="text-fg-muted text-xs">Campaign Type</dt>
                      <dd className="font-semibold text-fg mt-0.5">{detailItem.campaign_type || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted text-xs">Content Pillar</dt>
                      <dd className="font-semibold text-fg mt-0.5">{detailItem.content_pillar || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted text-xs">Offer</dt>
                      <dd className="font-semibold text-fg mt-0.5">{detailItem.offer || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted text-xs">Call to Action</dt>
                      <dd className="font-semibold text-fg mt-0.5">{detailItem.cta || '—'}</dd>
                    </div>
                  </dl>

                  {/* Revision Feedback Form */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <label
                      htmlFor="dialog-revision-feedback"
                      className="text-xs font-medium text-fg flex items-center justify-between"
                    >
                      <span>Revision Feedback</span>
                      {isRevisionMode && (
                        <span className="text-xs text-danger-fg font-medium">Required for revision</span>
                      )}
                    </label>
                    <Textarea
                      id="dialog-revision-feedback"
                      rows={3}
                      value={dialogNote}
                      onChange={(e) => setDialogNote(e.target.value)}
                      placeholder="Specify requested changes or adjustments to the copy or creative..."
                    />
                  </div>
                </div>
              </div>

              {/* Dialog Footer Actions */}
              <div className="px-6 py-4 border-t border-border bg-subtle/50 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDrawerItem(detailItem);
                    setIsDrawerOpen(true);
                  }}
                  icon={Eye}
                >
                  Inspect all specs
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === detailItem.id}
                    onClick={() => {
                      if (!isRevisionMode) {
                        setIsRevisionMode(true);
                      } else {
                        void handleAction(detailItem, 'request_revision', dialogNote);
                      }
                    }}
                    icon={RotateCcw}
                  >
                    Request revision
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busyId === detailItem.id}
                    loading={busyId === detailItem.id}
                    onClick={() => void handleAction(detailItem, 'approve', dialogNote)}
                    icon={Check}
                  >
                    {detailItem.stage === 'Creative Client Review' ? 'Approve creative' : 'Approve content'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Campaign Details Drawer (Specs inspection) */}
      <ContentCalendarDrawer
        item={drawerItem}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        actor={user}
        onTransition={handlePipelineTransition}
        onItemUpdated={(updated) => {
          setDrawerItem(updated);
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />
    </div>
  );
};
