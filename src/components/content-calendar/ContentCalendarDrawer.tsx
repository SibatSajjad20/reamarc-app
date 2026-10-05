import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Paperclip,
  Film,
  FileText,
  Image as ImageIcon,
  Link2,
  Share2,
  User,
  UserCheck,
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../utils/badgeStyles';
import { CustomSelect } from '../ui/CustomSelect';
import { contentCalendarService } from '../../services/contentCalendarService';
import {
  actionsFor,
  canAccessClientReviewLink,
  getAssetCounts,
  type CalendarActor,
  type StageAction,
} from '../../utils/contentCalendarWorkflow';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { CreativeAssetGallery } from './CreativeAssetGallery';
import { ContentCalendarShareModal } from './ContentCalendarShareModal';

interface Props {
  item: ContentCalendarItem | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (item: ContentCalendarItem) => void;
  onDelete?: (id: string) => Promise<void>;
  actor?: CalendarActor | null;
  onTransition: (
    id: string,
    action: StageAction,
    extra?: { note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ) => Promise<void>;
  onItemUpdated?: (item: ContentCalendarItem) => void;
}

export const ContentCalendarDrawer: React.FC<Props> = ({
  item,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  actor,
  onTransition,
  onItemUpdated,
}) => {
  const [localItem, setLocalItem] = useState<ContentCalendarItem | null>(item);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [isActing, setIsActing] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);

  const handleCopyClientReviewLink = async () => {
    if (!currentItem) return;
    const token = currentItem.share_token || currentItem.id;
    const url = `${window.location.origin}/review/${token}`;
    await navigator.clipboard.writeText(url);
    setReviewCopied(true);
    setTimeout(() => setReviewCopied(false), 2000);
  };

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  const currentItem = localItem || item;

  const isClient = actor?.role === 'client';
  const isPerformance = actor?.department?.toLowerCase() === 'performance marketing';
  const canModify = !isClient && !isPerformance && Boolean(onEdit && onDelete);
  const isContentStage = Boolean(
    currentItem &&
      ['Content', 'Content Internal Review', 'Content Client Review', 'Content Revision'].includes(
        currentItem.stage,
      ),
  );
  const showReviewLink = canAccessClientReviewLink(currentItem?.stage, actor);

  const handleAssetsUpdated = (updated: ContentCalendarItem) => {
    setLocalItem(updated);
    if (onItemUpdated) {
      onItemUpdated(updated);
    }
  };

  useEffect(() => {
    setAssigneeId(currentItem?.assignee_id || '');
  }, [currentItem?.assignee_id]);

  const isCreativeStage = Boolean(
    currentItem && ['Creative Production', 'Creative Revision'].includes(currentItem.stage),
  );

  useEffect(() => {
    if (!isOpen || !currentItem) return;
    if (!actionsFor(actor, currentItem).some((action) => action.needsAssignee)) return;
    let cancelled = false;
    const isCreative = ['Creative Production', 'Creative Revision'].includes(currentItem.stage);
    const fetcher = isCreative
      ? contentCalendarService.getCreativeAssignees()
      : contentCalendarService.getContentAssignees();
    fetcher
      .then((res) => {
        if (!cancelled) setAssignees(res.assignees || []);
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentItem?.stage, currentItem?.id, actor]);

  if (!isOpen || !currentItem) return null;

  const actions = actionsFor(actor, currentItem);
  const needsAssignee = actions.some((action) => action.needsAssignee);
  const needsNote = actions.some((action) => action.needsNote);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getApprovalStatusClass = (status: string) => {
    switch (status) {
      case 'Approved for Campaign':
      case 'Creative Approved':
      case 'Content Approved':
      case 'Posted':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Changes Requested':
      case 'Rejected':
        return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'Content Draft':
        return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
      default:
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  const getSetupStatusClass = (status: string) => {
    switch (status) {
      case 'Live':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'In Setup':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Paused':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white dark:bg-[#12141c] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50/70 dark:bg-[#0d0f15]/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-numeric font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
              {currentItem.serial}
            </span>
            <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>
              {currentItem.creative_type}
            </span>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {currentItem.content_concept}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {showReviewLink && (
              <button
                type="button"
                onClick={handleCopyClientReviewLink}
                className="px-2.5 py-1.5 rounded-lg text-zinc-700 dark:text-zinc-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-zinc-200 dark:border-zinc-700/80 transition cursor-pointer flex items-center gap-1.5 shadow-2xs mr-1"
                title="Copy Client Review Link"
              >
                <Link2 className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-semibold hidden sm:inline">
                  {reviewCopied ? 'Link Copied!' : 'Review Link'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-zinc-200 dark:border-zinc-700/80 transition cursor-pointer flex items-center gap-1.5 shadow-2xs mr-1"
              title="Share entire campaign content"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-semibold">Share</span>
            </button>
            {canModify && onEdit && onDelete && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(currentItem)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Edit Item"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete ${currentItem.serial}?`)) {
                      setIsDeleting(true);
                      try {
                        await onDelete(currentItem.id);
                        onClose();
                      } finally {
                        setIsDeleting(false);
                      }
                    }
                  }}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                  title="Delete Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stage Quick Switch Bar */}
        <div className="px-6 py-2.5 bg-zinc-100/60 dark:bg-[#161822] border-b border-zinc-200 dark:border-zinc-800/80 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider shrink-0">
                Pipeline Stage:
              </span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">{currentItem.stage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getApprovalStatusClass(currentItem.approval_status)}`}>
                {currentItem.approval_status}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getSetupStatusClass(currentItem.setup_status)}`}>
                {currentItem.setup_status}
              </span>
            </div>
          </div>
          {currentItem.revision_note && (
            <p className="text-[11px] text-rose-700 dark:text-rose-300">Revision note: {currentItem.revision_note}</p>
          )}

          {/* Ownership & Assignment Banner */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/60">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-200/60 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
              <User className="w-3 h-3 text-zinc-500" />
              <span>Created: <strong>{currentItem.created_by_name || currentItem.created_by || 'Content Creator'}</strong></span>
            </span>

            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${
              currentItem.assignee_name
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500'
            }`}>
              <UserCheck className="w-3 h-3 text-indigo-500" />
              <span>Assigned: <strong>{currentItem.assignee_name || 'Unassigned'}</strong></span>
            </span>

            {currentItem.design_owner && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400">
                <span>Dept: <strong>{currentItem.design_owner}</strong></span>
              </span>
            )}
          </div>

          {/* Dedicated Client Review Link Bar (when in review stage and permitted) */}
          {showReviewLink && (currentItem.stage === 'Content Client Review' || currentItem.stage === 'Creative Client Review') && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/60 text-xs">
              <div className="flex items-center gap-2 text-blue-950 dark:text-blue-200 font-medium">
                <Link2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Awaiting client approval</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyClientReviewLink}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/40 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  {reviewCopied ? <Check className="w-3 h-3 text-blue-600" /> : <Copy className="w-3 h-3" />}
                  <span>{reviewCopied ? 'Copied' : 'Copy Review Link'}</span>
                </button>
                <a
                  href={`/review/${currentItem.share_token || currentItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 transition"
                  title="Open Review Page in New Tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
          {(needsNote || needsAssignee || actions.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {needsAssignee && (
                <div className="w-48">
                  <CustomSelect
                    size="sm"
                    placeholder={isCreativeStage ? 'Choose creative' : 'Choose content creator'}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={assignees.map((person) => ({ value: person.id, label: person.name }))}
                  />
                </div>
              )}
              {needsNote && (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={isCreativeStage ? 'Note for creative' : 'Note for writer'}
                  className="flex-1 min-w-[160px] px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700"
                />
              )}
              {actions.map((action) => (
                <button
                  key={action.action}
                  type="button"
                  disabled={isActing || (action.action === 'assign' && !assigneeId)}
                  onClick={async () => {
                    setIsActing(true);
                    try {
                      const chosen = assignees.find((person) => person.id === assigneeId);
                      await onTransition(currentItem.id, action.action, {
                        note: action.needsNote ? note : undefined,
                        assignee_id: action.needsAssignee ? assigneeId : undefined,
                        assignee_name: action.needsAssignee ? chosen?.name : undefined,
                      });
                      setNote('');
                    } finally {
                      setIsActing(false);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800/80 text-xs">
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Client</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.client_name || 'Apex Transfers LLC'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Campaign Type</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.campaign_type || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Content Pillar / Theme</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.content_pillar || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Offer</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.offer || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">CTA</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.cta || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Created By</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3 text-zinc-400 shrink-0" />
                <span className="truncate">{currentItem.created_by_name || currentItem.created_by || 'Content Creator'}</span>
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Current Assignee</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate">{currentItem.assignee_name || 'Unassigned'}</span>
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Department Owner</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.design_owner || 'Content'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Production Due</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.design_due || 'No due date'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 font-medium block">Scheduled Publish Date</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate mt-0.5">
                {currentItem.publish_date || 'Unscheduled'}
              </span>
            </div>
            <div className="col-span-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <span className="text-[11px] text-zinc-400 font-medium block mb-1.5">Deliverable Assets</span>
              {(() => {
                if (isContentStage) {
                  return (
                    <span className="text-xs text-zinc-400 italic">
                      Creative production begins after content approval
                    </span>
                  );
                }
                const counts = getAssetCounts(currentItem.attachments);
                if (counts.total === 0) {
                  return (
                    <span className="text-xs text-zinc-400 italic">No assets attached yet</span>
                  );
                }
                return (
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                      <Paperclip className="w-3 h-3" />
                      <span>{counts.total} Total</span>
                    </span>
                    {counts.images > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                        <ImageIcon className="w-3 h-3" />
                        <span>{counts.images} {counts.images === 1 ? 'Image' : 'Images'}</span>
                      </span>
                    )}
                    {counts.videos > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
                        <Film className="w-3 h-3" />
                        <span>{counts.videos} {counts.videos === 1 ? 'Video' : 'Videos'}</span>
                      </span>
                    )}
                    {counts.links > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                        <Link2 className="w-3 h-3" />
                        <span>{counts.links} {counts.links === 1 ? 'Link' : 'Links'}</span>
                      </span>
                    )}
                    {counts.docs > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                        <FileText className="w-3 h-3" />
                        <span>{counts.docs} {counts.docs === 1 ? 'Doc' : 'Docs'}</span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Creative Media Deliverables - Hidden during Content stages */}
          {!isContentStage && (
            <>
              <CreativeAssetGallery
                itemId={currentItem.id}
                attachments={currentItem.attachments || []}
                readOnly={isClient || isPerformance}
                onAssetsUpdated={handleAssetsUpdated}
              />

              {/* External Asset Links */}
              {(currentItem.draft_preview_link || currentItem.final_asset_link) && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    External Deliverables & Links
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {currentItem.draft_preview_link && safeHttpUrl(currentItem.draft_preview_link) && (
                      <a
                        href={safeHttpUrl(currentItem.draft_preview_link) || undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition"
                      >
                        <span>Draft Preview</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {currentItem.final_asset_link && safeHttpUrl(currentItem.final_asset_link) && (
                      <a
                        href={safeHttpUrl(currentItem.final_asset_link) || undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition font-semibold"
                      >
                        <span>Final Asset</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Primary Text / Ad Copy */}
          {currentItem.primary_text && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Primary Text (Ad Copy)
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.primary_text || '', 'primary_text')}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-600 transition cursor-pointer"
                >
                  {copiedKey === 'primary_text' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'primary_text' ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs font-sans text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {currentItem.primary_text}
              </div>
            </div>
          )}

          {/* Headlines & Hooks */}
          {currentItem.headlines_hooks && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Headlines & Hooks Library
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.headlines_hooks || '', 'hooks')}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-600 transition cursor-pointer"
                >
                  {copiedKey === 'hooks' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'hooks' ? 'Copied' : 'Copy Hooks'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs font-sans text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {currentItem.headlines_hooks}
              </div>
            </div>
          )}

          {/* Content On Creative (Scenes/Overlay script) */}
          {currentItem.content_on_creative && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Content On Creative (Overlay & Script)
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.content_on_creative || '', 'creative_text')}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-600 transition cursor-pointer"
                >
                  {copiedKey === 'creative_text' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'creative_text' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs font-sans text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {currentItem.content_on_creative}
              </div>
            </div>
          )}

          {/* Production Direction */}
          {currentItem.production_direction && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Production Direction
              </h3>
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {currentItem.production_direction}
              </div>
            </div>
          )}

          {/* Captions & Hashtags */}
          {currentItem.captions_hashtags && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Captions, Hashtags & Keywords
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.captions_hashtags || '', 'hashtags')}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-600 transition cursor-pointer"
                >
                  {copiedKey === 'hashtags' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'hashtags' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs text-blue-600 dark:text-blue-400 font-sans font-medium">
                {currentItem.captions_hashtags}
              </div>
            </div>
          )}

          {/* Comments */}
          {currentItem.notes && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Comments
                </h3>
                <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    By <strong>{currentItem.notes_author || currentItem.created_by_name || 'Team Member'}</strong>
                  </span>
                  {currentItem.notes_updated_at && (
                    <span className="text-zinc-400">· {new Date(currentItem.notes_updated_at).toLocaleDateString()}</span>
                  )}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {currentItem.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share Campaign Content Modal */}
      <ContentCalendarShareModal
        item={currentItem}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        actor={actor}
      />
    </div>
  );
};
