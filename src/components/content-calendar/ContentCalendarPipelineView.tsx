import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Film, FileText, Image as ImageIcon, Link2, Clock, Paperclip } from 'lucide-react';
import type { ContentCalendarItem, PipelineStage } from '../../types/contentCalendar';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../utils/badgeStyles';
import {
  actionsFor,
  getDropTransition,
  getContentCalendarTargetDate,
  getAssetCounts,
  type CalendarActor,
  type StageAction,
} from '../../utils/contentCalendarWorkflow';
import { useToast } from '../../context/ToastContext';
import { getBackendFileUrl } from '../../utils/fileUrl';

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
      const input = window.prompt(
        `Please enter a revision note for ${currentItem.serial} (moving to ${targetStage}):`,
      );
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
  }, [draggingItem, actor, runAction, addToast]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/60 dark:bg-[#090a0f]">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none">
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
            className={`w-[260px] min-w-[260px] max-w-[260px] flex-shrink-0 flex flex-col rounded-2xl transition-all duration-150 ${
              isColumnOver
                ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-2 border-dashed border-indigo-500 shadow-md scale-[1.01]'
                : 'bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80'
            }`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isColumnOver ? 'bg-indigo-600 motion-safe:animate-ping' : 'bg-indigo-500'}`} />
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate" title={stage}>
                  {stage}
                </h3>
              </div>
              <span className={`text-[11px] font-numeric font-bold px-2 py-0.5 rounded-full transition-colors ${
                isColumnOver
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}>
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
  const parentRef = useRef<HTMLDivElement>(null);
  const count = isLoading ? SKELETON_CARD_COUNT : items.length;

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
        <div className={`h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-3 text-center transition-colors ${
          isColumnOver
            ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
            : 'border-zinc-300/80 dark:border-zinc-800/80'
        }`}>
          <span className="text-[11px] text-zinc-400 font-medium">
            {isColumnOver ? 'Drop card here' : 'Nothing in this stage'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-2.5 min-h-[150px]">
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
          const primary = actionsFor(actor, item).find(
            (action) => action.action === 'submit' || action.action === 'approve' || action.action === 'post',
          );

          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full pb-2.5"
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
                className={`p-3 rounded-xl bg-white dark:bg-[#141620] border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-grab active:cursor-grabbing group relative select-none ${
                  isBusy ? 'opacity-50 pointer-events-none' : ''
                } ${isDragging ? 'opacity-30 scale-95 border-indigo-400 ring-2 ring-indigo-400/40' : 'hover:shadow-xs'}`}
              >
                {/* Card Header: Serial & Format */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <span className="font-numeric font-bold text-[10px] text-indigo-600 dark:text-indigo-400 shrink-0">
                      {item.serial}
                    </span>
                    {item.client_name && (
                      <span
                        className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[110px]"
                        title={item.client_name}
                      >
                        • {item.client_name}
                      </span>
                    )}
                  </div>
                  <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} shrink-0 text-[10px]`}>
                    {item.creative_type}
                  </span>
                </div>

                {/* Concept Title */}
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.content_concept}
                </h4>

                {/* Creative Deliverable Media Preview */}
                {item.attachments && item.attachments.length > 0 && (() => {
                  const primaryMedia =
                    item.attachments.find((a) => a.kind === 'image') ||
                    item.attachments.find((a) => a.kind === 'video') ||
                    item.attachments.find((a) => a.kind === 'link') ||
                    item.attachments[0];
                  const imageCount = item.attachments.filter((a) => a.kind === 'image').length;

                  if (primaryMedia.kind === 'image') {
                    return (
                      <div className="relative mb-2 rounded-lg overflow-hidden bg-zinc-950 aspect-[16/9] max-h-32 w-full flex items-center justify-center">
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
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[9px] font-bold flex items-center gap-1 backdrop-blur-xs">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>+{imageCount - 1}</span>
                          </span>
                        )}
                      </div>
                    );
                  }

                  if (primaryMedia.kind === 'video') {
                    return (
                      <div className="relative mb-2 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 aspect-[16/9] max-h-32 w-full flex items-center justify-center group/vid">
                        {primaryMedia.thumbnail_url ? (
                          <img
                            src={getBackendFileUrl(primaryMedia.thumbnail_url) || primaryMedia.thumbnail_url}
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
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                          <div className="p-2 rounded-full bg-white/20 backdrop-blur-xs text-white group-hover/vid:bg-indigo-600 transition-colors">
                            <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[9px] font-bold flex items-center gap-1 backdrop-blur-xs">
                          <Film className="w-2.5 h-2.5 text-indigo-400" />
                          <span>Video</span>
                        </span>
                      </div>
                    );
                  }

                  if (primaryMedia.kind === 'link') {
                    return (
                      <div className="mb-2 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                            {primaryMedia.filename || 'Deliverable link'}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 shrink-0">
                          Link
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className="mb-2 p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
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
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        title={`${counts.total} Total Deliverable Asset${counts.total > 1 ? 's' : ''}`}
                      >
                        <Paperclip className="w-2.5 h-2.5" />
                        <span>{counts.total} {counts.total === 1 ? 'asset' : 'assets'}</span>
                      </span>
                      {counts.images > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40"
                          title={`${counts.images} Image${counts.images > 1 ? 's' : ''}`}
                        >
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>{counts.images} img</span>
                        </span>
                      )}
                      {counts.videos > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40"
                          title={`${counts.videos} Video${counts.videos > 1 ? 's' : ''}`}
                        >
                          <Film className="w-2.5 h-2.5" />
                          <span>{counts.videos} vid</span>
                        </span>
                      )}
                      {counts.links > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40"
                          title={`${counts.links} Link${counts.links > 1 ? 's' : ''}`}
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          <span>{counts.links} link</span>
                        </span>
                      )}
                      {counts.docs > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40"
                          title={`${counts.docs} Document${counts.docs > 1 ? 's' : ''}`}
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
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col gap-1.5 text-[11px] text-zinc-400">
                      <div className="flex items-center justify-between gap-1.5 w-full">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {dateStr ? (
                            <span
                              className={`font-numeric text-[10px] inline-flex items-center gap-1 font-semibold shrink-0 ${
                                isOverdue
                                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded'
                                  : isToday
                                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded'
                                  : 'text-zinc-600 dark:text-zinc-300'
                              }`}
                              title={`${label}: ${formattedDate}${isOverdue ? ' (Overdue)' : isToday ? ' (Due Today)' : ''}`}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{label}: {formattedDate}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-medium">No date</span>
                          )}

                          {item.assignee_name && (
                            <span
                              className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate"
                              title={`Assigned to ${item.assignee_name}`}
                            >
                              • {item.assignee_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {primary && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(item, primary.action);
                          }}
                          className="w-full py-1 px-2 rounded-md text-[10px] font-bold text-center text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer disabled:opacity-50 transition-colors"
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
    <div className="p-3 rounded-xl bg-white dark:bg-[#141620] border border-zinc-200/80 dark:border-zinc-800/80 animate-pulse space-y-2.5">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-12 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-2.5 w-16 rounded bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
        <div className="h-4 w-12 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>

      {/* Title Lines */}
      <div className="space-y-1.5 pt-0.5">
        <div className="h-3.5 w-full rounded bg-zinc-200/90 dark:bg-zinc-800" />
        <div className={`h-3 ${secondWidth} rounded bg-zinc-150 dark:bg-zinc-800/60`} />
      </div>

      {/* Footer Row */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between gap-2">
        <div className="h-3 w-16 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="h-4 w-14 rounded-md bg-indigo-100/70 dark:bg-indigo-950/40" />
      </div>
    </div>
  );
}
