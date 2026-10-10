import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Play,
  Film,
  FileText,
  Image as ImageIcon,
  Link2,
  Clock,
  Paperclip,
  MoreVertical,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';
import type { ContentCalendarItem, PipelineStage } from '../../types/contentCalendar';
import {
  actionsFor,
  getDropTransition,
  getContentCalendarTargetDate,
  getAssetCounts,
  type CalendarActor,
  type StageAction,
} from '../../utils/contentCalendarWorkflow';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../ui/ConfirmProvider';
import { getBackendFileUrl, isRealThumbnailUrl } from '../../utils/fileUrl';
import { renderPlatformIcon } from './ContentCalendarTableView';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';
function parseDateScore(dateStr?: string | null): number {
  if (!dateStr || !dateStr.trim()) return Infinity;
  const time = new Date(dateStr.trim()).getTime();
  return Number.isNaN(time) ? Infinity : time;
}

interface Props {
  items: ContentCalendarItem[];
  stages: PipelineStage[];
  actor?: CalendarActor | null;
  isLoading?: boolean;
  onSelectItem: (item: ContentCalendarItem) => void;
  onTransition: (
    id: string,
    action: StageAction,
    extra?: { note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ) => Promise<void>;
}

export const ContentCalendarPipelineView: React.FC<Props> = ({
  items,
  stages,
  actor,
  isLoading = false,
  onSelectItem,
  onTransition,
}) => {
  const { addToast } = useToast();
  const prompt = usePrompt();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<ContentCalendarItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);


  const byStage = useMemo(() => {
    const map = {} as Record<string, ContentCalendarItem[]>;
    for (const stage of stages) {
      map[stage] = [];
    }
    for (const item of items) {
      if (map[item.stage]) {
        map[item.stage].push(item);
      }
    }
    // Sort cards in pipeline view:
    // In ready to post: show cards whose publish date is due in order
    // In other stages: show content whose design date is most due in order
    for (const stage of stages) {
      if (!map[stage]) continue;
      map[stage].sort((a, b) => {
        if (stage === 'Ready to Post' || stage === 'Posted') {
          const scoreA = parseDateScore(a.publish_date);
          const scoreB = parseDateScore(b.publish_date);
          if (scoreA !== scoreB) return scoreA - scoreB;
          const fallbackA = parseDateScore(a.design_due);
          const fallbackB = parseDateScore(b.design_due);
          if (fallbackA !== fallbackB) return fallbackA - fallbackB;
        } else {
          const scoreA = parseDateScore(a.design_due);
          const scoreB = parseDateScore(b.design_due);
          if (scoreA !== scoreB) return scoreA - scoreB;
          const fallbackA = parseDateScore(a.publish_date);
          const fallbackB = parseDateScore(b.publish_date);
          if (fallbackA !== fallbackB) return fallbackA - fallbackB;
        }
        return (a.serial || '').localeCompare(b.serial || '');
      });
    }
    return map;
  }, [items, stages]);

  const runAction = useCallback(async (
    item: ContentCalendarItem,
    action: StageAction,
    extra?: { note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ) => {
    setBusyId(item.id);
    try {
      await onTransition(item.id, action, extra);
    } finally {
      setBusyId(null);
    }
  }, [onTransition]);

  const handleDropOnStage = useCallback(async (targetStage: PipelineStage) => {
    if (!draggingItem) return;
    const currentItem = draggingItem;
    setDraggingItem(null);
    setDragOverStage(null);

    if (currentItem.stage === targetStage) return;

    const transition = getDropTransition(currentItem, targetStage, actor);
    if (!transition.allowed || !transition.action) {
      addToast(
        'Action not allowed',
        transition.reason || `Cannot move ${currentItem.serial} from ${currentItem.stage} to ${targetStage}`,
        'warning',
      );
      return;
    }

    let note: string | undefined = undefined;
    if (transition.needsNote) {
      const input = await prompt({
        title: 'Revision note required',
        label: `Please enter a revision note for ${currentItem.serial} (moving to ${targetStage}):`,
      });
      if (input === null) return; // User cancelled prompt
      if (!input.trim()) {
        addToast('Note required', 'A revision note is required to move this item.', 'warning');
        return;
      }
      note = input.trim();
    }

    await runAction(currentItem, transition.action, {
      note,
      target_stage: transition.target_stage,
    });
  }, [draggingItem, actor, runAction, addToast, prompt]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none custom-scrollbar">
      {stages.map((stage, stageIdx) => {
        const stageItems = byStage[stage] || [];
        const isColumnOver = dragOverStage === stage && draggingItem && draggingItem.stage !== stage;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverStage !== stage) {
                setDragOverStage(stage);
              }
            }}
            onDragLeave={(e) => {
              // Only clear if mouse truly left the column container
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (dragOverStage === stage) setDragOverStage(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              void handleDropOnStage(stage);
            }}
            className={`w-[280px] min-w-[280px] max-w-[280px] flex-shrink-0 flex flex-col rounded-lg h-full min-h-0 transition-colors ${
              isColumnOver
                ? 'bg-accent-soft/30 border-2 border-dashed border-accent shadow-xs'
                : 'bg-surface border border-border'
            }`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0 bg-accent" />
                <h3 className="text-xs font-semibold text-fg truncate" title={stage}>
                  {stage}
                </h3>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted">
                {stageItems.length}
              </span>
            </div>

            {/* Droppable Card List Area */}
            <StageCardList
              items={stageItems}
              stageIndex={stageIdx}
              isLoading={isLoading}
              busyId={busyId}
              draggingId={draggingItem?.id ?? null}
              isColumnOver={Boolean(isColumnOver)}
              actor={actor}
              onSelectItem={onSelectItem}
              onAction={(item, action) => void runAction(item, action)}
              onCardDragStart={(item) => setDraggingItem(item)}
              onCardDragEnd={() => {
                setDraggingItem(null);
                setDragOverStage(null);
              }}
            />
          </div>
        );
      })}
    </div>
    </div>
  );
};

interface StageCardListProps {
  items: ContentCalendarItem[];
  stageIndex: number;
  isLoading: boolean;
  busyId: string | null;
  draggingId: string | null;
  isColumnOver: boolean;
  actor?: CalendarActor | null;
  onSelectItem: (item: ContentCalendarItem) => void;
  onAction: (item: ContentCalendarItem, action: StageAction) => void;
  onCardDragStart: (item: ContentCalendarItem) => void;
  onCardDragEnd: () => void;
}

// Realistic skeleton count that fills viewport height
const SKELETON_CARD_COUNT = 6;

function StageCardList({
  items,
  stageIndex,
  isLoading,
  busyId,
  draggingId,
  isColumnOver,
  actor,
  onSelectItem,
  onAction,
  onCardDragStart,
  onCardDragEnd,
}: StageCardListProps) {
  const { getAvatarUrl } = useMemberAvatars();
  const parentRef = useRef<HTMLDivElement>(null);
  const count = isLoading ? SKELETON_CARD_COUNT : items.length;
  const { addToast } = useToast();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [copiedReviewId, setCopiedReviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest(`[data-review-menu="${menuOpenId}"]`)) {
        setMenuOpenId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpenId]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const it = items[index];
      if (it?.attachments && it.attachments.length > 0) return 220;
      return 116;
    },
    overscan: 6,
  });

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-2.5 min-h-[150px] flex flex-col justify-center">
        <div className={`h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center p-3 text-center transition-colors ${
          isColumnOver
            ? 'border-accent bg-accent-soft/30'
            : 'border-border'
        }`}>
          <span className="text-xs text-fg-muted font-medium">
            {isColumnOver ? 'Drop card here' : 'Nothing in this stage'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-2.5 min-h-[150px] custom-scrollbar">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          if (isLoading) {
            return (
              <div
                key={`skeleton-${stageIndex}-${virtualRow.index}`}
                className="absolute left-0 top-0 w-full pb-2.5"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <PipelineCardSkeleton index={virtualRow.index} />
              </div>
            );
          }

          const item = items[virtualRow.index];
          if (!item) return null;
          const isBusy = busyId === item.id;
          const isDragging = draggingId === item.id;
          const isClientReviewStage =
            (item.stage === 'Content Client Review' || item.stage === 'Creative Client Review') &&
            actor?.role !== 'client';
          const primary = actionsFor(actor, item).find(
            (action) => action.action === 'submit' || action.action === 'approve' || action.action === 'post',
          );

          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={`absolute left-0 top-0 w-full pb-2.5 ${menuOpenId === item.id ? 'z-30' : 'z-0'}`}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                draggable={!isBusy}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.id);
                  e.dataTransfer.effectAllowed = 'move';
                  onCardDragStart(item);
                }}
                onDragEnd={() => onCardDragEnd()}
                onClick={() => onSelectItem(item)}
                className={`p-3 rounded-lg bg-surface border border-border hover:border-border-strong hover:shadow-xs transition-all cursor-grab active:cursor-grabbing group relative select-none ${
                  isBusy ? 'opacity-50 pointer-events-none' : ''
                } ${isDragging ? 'opacity-30 scale-95 border-accent ring-2 ring-accent/40' : ''}`}
              >
                {/* Card Header: Platform Icon, Serial & Format */}
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    {renderPlatformIcon(item)}
                    <span className="font-mono font-medium text-xs text-accent shrink-0">
                      {item.serial}
                    </span>
                    {item.client_name && (
                      <span
                        className="text-xs font-medium text-fg-muted truncate max-w-[110px]"
                        title={item.client_name}
                      >
                        • {item.client_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-caption font-medium bg-subtle border border-border text-fg-muted shrink-0">
                      {item.creative_type}
                    </span>

                    {isClientReviewStage && (
                      <div className="relative" data-review-menu={item.id}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === item.id ? null : item.id);
                          }}
                          className={`p-1 rounded-sm transition-colors cursor-pointer ${
                            menuOpenId === item.id
                              ? 'bg-accent-soft text-accent'
                              : 'text-fg-muted hover:text-fg hover:bg-hover'
                          }`}
                          title="Share Client Review Link"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {menuOpenId === item.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-7 z-40 w-48 rounded-lg bg-surface border border-border shadow-lg py-1 text-xs animate-in fade-in-50 zoom-in-95 duration-150"
                          >
                            <div className="px-3 py-1.5 border-b border-border">
                              <span className="text-caption font-medium text-fg-muted">
                                Client Review Link
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const token = item.share_token || item.id;
                                const url = `${window.location.origin}/review/${token}`;
                                await navigator.clipboard.writeText(url);
                                setCopiedReviewId(item.id);
                                addToast('Review Link Copied', 'Client review link copied to clipboard.', 'success');
                                setTimeout(() => {
                                  setCopiedReviewId(null);
                                  setMenuOpenId(null);
                                }, 1200);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-fg hover:bg-hover transition cursor-pointer"
                            >
                              {copiedReviewId === item.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-success-fg shrink-0" />
                                  <span className="text-success-fg font-medium">
                                    Link copied!
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                                  <span>Copy review link</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const token = item.share_token || item.id;
                                const url = `${window.location.origin}/review/${token}`;
                                const greeting = item.client_name ? `Hi ${item.client_name} team` : 'Hi';
                                const msg = `${greeting}, please review the draft for "${item.content_concept}" (${item.serial || 'Campaign'}):\n\nReview link: ${url}\n\nPlease submit your feedback or approval when ready!`;
                                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                                setMenuOpenId(null);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-fg hover:bg-hover transition cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-success-fg shrink-0" />
                              <span>Share via WhatsApp</span>
                            </button>

                            <a
                              href={`/review/${item.share_token || item.id}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-fg hover:bg-hover transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-accent shrink-0" />
                              <span>Open review page</span>
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Concept Title */}
                <h4 className="text-[13px] font-medium text-fg line-clamp-2 leading-snug mb-2 group-hover:text-accent transition-colors">
                  {item.content_concept}
                </h4>

                {/* Creative Deliverable Media Preview (100% x 120 rounded-sm) */}
                {item.attachments && item.attachments.length > 0 && (() => {
                  const primaryMedia =
                    item.attachments.find((a) => a.kind === 'image') ||
                    item.attachments.find((a) => a.kind === 'video') ||
                    item.attachments.find((a) => a.kind === 'link') ||
                    item.attachments[0];
                  const imageCount = item.attachments.filter((a) => a.kind === 'image').length;

                  if (primaryMedia.kind === 'image') {
                    return (
                      <div className="relative mb-2 rounded-sm overflow-hidden bg-subtle h-[120px] w-full flex items-center justify-center border border-border">
                        <img
                          src={getBackendFileUrl(primaryMedia.thumbnail_url || primaryMedia.url) || primaryMedia.thumbnail_url || primaryMedia.url}
                          alt={primaryMedia.filename}
                          className="w-full h-full object-cover select-none"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.opacity = '0.5';
                          }}
                        />
                        {imageCount > 1 && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-sm bg-black/80 text-white text-caption font-medium flex items-center gap-1">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>+{imageCount - 1}</span>
                          </span>
                        )}
                      </div>
                    );
                  }

                  if (primaryMedia.kind === 'video') {
                    const hasValidThumb = isRealThumbnailUrl(primaryMedia.thumbnail_url);
                    return (
                      <div className="relative mb-2 rounded-sm overflow-hidden bg-subtle border border-border h-[120px] w-full flex items-center justify-center group/vid">
                        {hasValidThumb ? (
                          <img
                            src={getBackendFileUrl(primaryMedia.thumbnail_url!) || primaryMedia.thumbnail_url!}
                            alt={primaryMedia.filename}
                            className="w-full h-full object-cover select-none"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={`${getBackendFileUrl(primaryMedia.url) || primaryMedia.url}#t=0.001`}
                            preload="metadata"
                            muted
                            playsInline
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                          <div className="p-2 rounded-full bg-black/60 text-white group-hover/vid:bg-accent transition-colors">
                            <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-sm bg-black/80 text-white text-caption font-medium flex items-center gap-1">
                          <Film className="w-2.5 h-2.5 text-white" />
                          <span>Video</span>
                        </span>
                      </div>
                    );
                  }

                  if (primaryMedia.kind === 'link') {
                    return (
                      <div className="mb-2 p-2 rounded-sm bg-subtle border border-border flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="text-caption font-medium text-fg truncate">
                            {primaryMedia.filename || 'Deliverable link'}
                          </span>
                        </div>
                        <span className="text-caption px-1.5 py-0.5 rounded-sm font-mono uppercase font-medium text-fg-muted bg-surface border border-border shrink-0">
                          Link
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className="mb-2 p-1.5 rounded-sm bg-subtle border border-border flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="text-caption font-medium text-fg truncate">
                        {primaryMedia.filename}
                      </span>
                    </div>
                  );
                })()}

                {/* Creative Asset Breakdown Badges */}
                {(() => {
                  const counts = getAssetCounts(item.attachments);
                  if (counts.total === 0) return null;
                  return (
                    <div className="flex items-center flex-wrap gap-1 mb-2">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-caption font-medium bg-subtle text-fg border border-border"
                        title={`${counts.total} Total deliverable asset${counts.total > 1 ? 's' : ''}`}
                      >
                        <Paperclip className="w-2.5 h-2.5 text-fg-muted" />
                        <span>{counts.total} {counts.total === 1 ? 'asset' : 'assets'}</span>
                      </span>
                      {counts.images > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-caption font-mono text-fg-muted bg-subtle border border-border"
                          title={`${counts.images} image${counts.images > 1 ? 's' : ''}`}
                        >
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>{counts.images} img</span>
                        </span>
                      )}
                      {counts.videos > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-caption font-mono text-fg-muted bg-subtle border border-border"
                          title={`${counts.videos} video${counts.videos > 1 ? 's' : ''}`}
                        >
                          <Film className="w-2.5 h-2.5" />
                          <span>{counts.videos} vid</span>
                        </span>
                      )}
                      {counts.links > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-caption font-mono text-fg-muted bg-subtle border border-border"
                          title={`${counts.links} link${counts.links > 1 ? 's' : ''}`}
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          <span>{counts.links} link</span>
                        </span>
                      )}
                      {counts.docs > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-caption font-mono text-fg-muted bg-subtle border border-border"
                          title={`${counts.docs} document${counts.docs > 1 ? 's' : ''}`}
                        >
                          <FileText className="w-2.5 h-2.5" />
                          <span>{counts.docs} doc</span>
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Card Footer: Urgency Date / Assignee & Primary Action */}
                {(() => {
                  const { dateStr, label } = getContentCalendarTargetDate(item);
                  let isOverdue = false;
                  let isToday = false;
                  let formattedDate = dateStr;

                  if (dateStr) {
                    const dateOnly = dateStr.split('T')[0];
                    formattedDate = dateOnly;
                    const parts = dateOnly.split('-');
                    if (parts.length === 3) {
                      const y = parseInt(parts[0], 10);
                      const m = parseInt(parts[1], 10) - 1;
                      const d = parseInt(parts[2], 10);
                      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                        const targetMid = new Date(y, m, d).getTime();
                        const now = new Date();
                        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                        const diff = Math.round((targetMid - todayMid) / (1000 * 60 * 60 * 24));
                        if (diff < 0 && item.stage !== 'Posted' && item.stage !== 'Rejected') {
                          isOverdue = true;
                        } else if (diff === 0) {
                          isToday = true;
                        }
                      }
                    }
                  }

                  return (
                    <div className="pt-2 border-t border-border flex flex-col gap-1.5 text-xs text-fg-muted">
                      <div className="flex items-center justify-between gap-1.5 w-full">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {dateStr ? (
                            <span
                              className={`font-mono text-caption inline-flex items-center gap-1 font-medium shrink-0 ${
                                isOverdue
                                  ? 'text-danger-fg bg-danger-bg px-1.5 py-0.5 rounded-sm'
                                  : isToday
                                  ? 'text-warning-fg bg-warning-bg px-1.5 py-0.5 rounded-sm'
                                  : 'text-fg-muted'
                              }`}
                              title={`${label}: ${formattedDate}${isOverdue ? ' (Overdue)' : isToday ? ' (Due today)' : ''}`}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{label}: {formattedDate}</span>
                            </span>
                          ) : (
                            <span className="text-caption text-fg-muted font-medium">No date</span>
                          )}
                        </div>

                        {item.assignee_name && (
                          <Avatar
                            name={item.assignee_name}
                            src={getAvatarUrl(item.assignee_id, item.assignee_name)}
                            size={20}
                            className="rounded-full shrink-0 text-caption"
                          />
                        )}
                      </div>

                      {primary && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(item, primary.action);
                          }}
                          className="w-full py-1 px-2 rounded-sm text-caption font-medium text-center text-accent bg-accent-soft hover:bg-accent-soft/80 border border-accent/20 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          {primary.label}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Realistic pipeline card skeleton that faithfully replicates the card structure:
 * badge header, multi-line title, divider, and metadata footer with action button placeholder.
 */
function PipelineCardSkeleton({ index }: { index: number }) {
  // Vary title line widths slightly for organic look
  const widthClasses = [
    'w-4/5',
    'w-11/12',
    'w-3/4',
    'w-5/6',
    'w-2/3',
    'w-4/5',
  ];
  const secondWidth = widthClasses[index % widthClasses.length];

  return (
    <div className="p-3 rounded-lg bg-surface border border-border animate-pulse space-y-2.5">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-12 rounded-sm bg-subtle" />
          <div className="h-2.5 w-16 rounded-sm bg-subtle" />
        </div>
        <div className="h-4 w-12 rounded-sm bg-subtle" />
      </div>

      {/* Title Lines */}
      <div className="space-y-1.5 pt-0.5">
        <div className="h-3.5 w-full rounded-sm bg-subtle" />
        <div className={`h-3 ${secondWidth} rounded-sm bg-subtle`} />
      </div>

      {/* Footer Row */}
      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
        <div className="h-3 w-16 rounded-sm bg-subtle" />
        <div className="h-4 w-14 rounded-sm bg-subtle" />
      </div>
    </div>
  );
}
