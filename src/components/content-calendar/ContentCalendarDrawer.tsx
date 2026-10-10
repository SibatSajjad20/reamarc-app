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
import { useConfirm } from '../ui/ConfirmProvider';
import { contentCalendarService } from '../../services/contentCalendarService';
import {
  actionsFor,
  canAccessClientReviewLink,
  canUserEditItem,
  canDeleteItem,
  isAdCreative,
  isPerformance,
  getAssetCounts,
  type CalendarActor,
  type StageAction,
} from '../../utils/contentCalendarWorkflow';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { CreativeAssetGallery } from './CreativeAssetGallery';
import { ContentCalendarShareModal } from './ContentCalendarShareModal';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet';
import { Button } from '../ui/button';

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
  const confirm = useConfirm();
  const [localItem, setLocalItem] = useState<ContentCalendarItem | null>(item);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [isActing, setIsActing] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);

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
  const canEdit = Boolean(currentItem && canUserEditItem(actor, currentItem) && onEdit);
  const canDelete = Boolean(currentItem && canDeleteItem(actor, currentItem) && onDelete);
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
        return 'bg-status-success-soft text-status-success-fg border-status-success-border';
      case 'Changes Requested':
      case 'Rejected':
        return 'bg-status-danger-soft text-status-danger-fg border-status-danger-border';
      case 'Content Draft':
        return 'bg-subtle text-fg-muted border-border';
      default:
        return 'bg-status-warning-soft text-status-warning-fg border-status-warning-border';
    }
  };

  const getSetupStatusClass = (status: string) => {
    switch (status) {
      case 'Live':
        return 'bg-status-success-soft text-status-success-fg border-status-success-border';
      case 'In Setup':
        return 'bg-status-info-soft text-status-info-fg border-status-info-border';
      case 'Paused':
        return 'bg-status-warning-soft text-status-warning-fg border-status-warning-border';
      default:
        return 'bg-subtle text-fg-muted border-border';
    }
  };

  if (!currentItem) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" size="wide" showClose={false} className="p-0 flex flex-col gap-0 select-text overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 bg-surface shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <span className="font-mono font-semibold text-xs px-2 py-0.5 rounded-md bg-accent-soft text-accent shrink-0">
              {currentItem.serial}
            </span>
            <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>
              {currentItem.creative_type}
            </span>
            <span className="text-micro px-1.5 py-0.5 rounded-md font-medium bg-subtle text-fg-muted border border-border shrink-0">
              {currentItem.content_type || 'Scheduled'}
            </span>
            <span className={`text-micro px-1.5 py-0.5 rounded-md font-medium border shrink-0 ${
              isAdCreative(currentItem)
                ? 'bg-status-warning-soft text-status-warning-fg border-status-warning-border'
                : 'bg-status-success-soft text-status-success-fg border-status-success-border'
            }`}>
              {currentItem.creative_category || currentItem.posting_type || 'Organic Creative'}
            </span>
            <SheetTitle className="text-ui font-semibold text-fg truncate">
              {currentItem.content_concept}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Campaign item details and workflow actions
            </SheetDescription>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {showReviewLink && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyClientReviewLink}
                title="Copy client review link"
              >
                <Link2 className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">
                  {reviewCopied ? 'Link copied!' : 'Review link'}
                </span>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsShareModalOpen(true)}
              title="Share entire campaign content"
            >
              <Share2 className="w-3.5 h-3.5 mr-1" />
              <span>Share</span>
            </Button>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit?.(currentItem)}
                title="Edit item"
                className="px-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (isDeleting) return;
                  const ok = await confirm({
                    title: `Delete ${currentItem.serial}?`,
                    confirmLabel: 'Delete item',
                    tone: 'danger',
                  });
                  if (!ok) return;
                  setIsDeleting(true);
                  try {
                    await onDelete?.(currentItem.id);
                    onClose();
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                title="Delete item"
                className="px-2 text-fg-muted hover:text-status-danger-fg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isUploadingAssets}
              className="px-2 text-fg-muted hover:text-fg ml-1 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stage Quick Switch Bar */}
        <div className="px-6 py-3 bg-subtle border-b border-border space-y-2.5 text-xs shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-caption font-medium text-fg-muted shrink-0">
                Pipeline stage:
              </span>
              <span className="text-xs font-semibold text-fg truncate">{currentItem.stage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium border ${getApprovalStatusClass(currentItem.approval_status)}`}>
                {currentItem.approval_status}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium border ${getSetupStatusClass(currentItem.setup_status)}`}>
                {currentItem.setup_status}
              </span>
            </div>
          </div>
          {currentItem.revision_note && (
            <p className="text-caption text-status-danger-fg">Revision note: {currentItem.revision_note}</p>
          )}

          {/* Ownership & Assignment Banner */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-caption font-medium bg-surface text-fg-muted border border-border">
              <User className="w-3 h-3 text-fg-muted" />
              <span>Created: <strong className="text-fg">{currentItem.created_by_name || currentItem.created_by || 'Content Creator'}</strong></span>
            </span>

            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-caption font-medium border ${
              currentItem.assignee_name
                ? 'bg-accent-soft text-accent border-accent/20'
                : 'bg-surface text-fg-muted border-border'
            }`}>
              <UserCheck className="w-3 h-3 text-accent" />
              <span>Assigned: <strong className="text-fg">{currentItem.assignee_name || 'Unassigned'}</strong></span>
            </span>

            {currentItem.design_owner && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium bg-surface text-fg-muted border border-border">
                <span>Dept: <strong className="text-fg">{currentItem.design_owner}</strong></span>
              </span>
            )}
          </div>

          {/* Dedicated Client Review Link Bar */}
          {showReviewLink && (currentItem.stage === 'Content Client Review' || currentItem.stage === 'Creative Client Review') && (
            <div className="flex items-center justify-between p-2.5 rounded-md bg-accent-soft border border-accent/20 text-xs">
              <div className="flex items-center gap-2 text-fg font-medium">
                <Link2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Awaiting client approval</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyClientReviewLink}
                >
                  {reviewCopied ? <Check className="w-3 h-3 text-accent mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  <span>{reviewCopied ? 'Copied' : 'Copy review link'}</span>
                </Button>
                <a
                  href={`/review/${currentItem.share_token || currentItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-md text-accent hover:bg-hover transition"
                  title="Open review page in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
          {(needsNote || needsAssignee || actions.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {isUploadingAssets && (
                <span className="text-small text-fg-muted" aria-live="polite">
                  Wait for upload to finish
                </span>
              )}
              {needsAssignee && (
                <div className="w-48">
                  <CustomSelect
                    size="sm"
                    placeholder={isCreativeStage ? 'Choose creative' : 'Choose content creator'}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={assignees.map((person) => ({ value: person.id, label: person.name }))}
                    disabled={isUploadingAssets}
                  />
                </div>
              )}
              {needsNote && (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={isCreativeStage ? 'Note for creative' : 'Note for writer'}
                  disabled={isUploadingAssets}
                  className="flex-1 min-w-[160px] px-2 py-1 rounded-md bg-surface border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden disabled:opacity-50"
                />
              )}
              {actions.map((action) => (
                <Button
                  key={action.action}
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isActing || isUploadingAssets || (action.action === 'assign' && !assigneeId)}
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
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-md bg-subtle border border-border text-xs">
            <div>
              <span className="text-caption text-fg-muted font-medium block">Client</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.client_name || 'Apex Transfers LLC'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Content type</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.content_type || 'Scheduled'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Creative category</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.creative_category || currentItem.posting_type || 'Organic Creative'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Campaign type</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.campaign_type || '—'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Content pillar / theme</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.content_pillar || '—'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Offer</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.offer || '—'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">CTA</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.cta || '—'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Created by</span>
              <span className="font-medium text-fg block truncate mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3 text-fg-muted shrink-0" />
                <span className="truncate">{currentItem.created_by_name || currentItem.created_by || 'Content Creator'}</span>
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Current assignee</span>
              <span className="font-medium text-fg block truncate mt-0.5 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-accent shrink-0" />
                <span className="truncate">{currentItem.assignee_name || 'Unassigned'}</span>
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Department owner</span>
              <span className="font-medium text-fg block truncate mt-0.5">
                {currentItem.design_owner || 'Content'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Production due</span>
              <span className="font-medium text-fg font-mono block truncate mt-0.5">
                {currentItem.design_due || 'No due date'}
              </span>
            </div>
            <div>
              <span className="text-caption text-fg-muted font-medium block">Scheduled publish date</span>
              <span className="font-medium text-fg font-mono block truncate mt-0.5">
                {currentItem.publish_date || 'Unscheduled'}
              </span>
            </div>
            <div className="col-span-2 pt-2 border-t border-border">
              <span className="text-caption text-fg-muted font-medium block mb-1.5">Deliverable assets</span>
              {(() => {
                if (isContentStage) {
                  return (
                    <span className="text-xs text-fg-muted italic">
                      Creative production begins after content approval
                    </span>
                  );
                }
                const counts = getAssetCounts(currentItem.attachments);
                if (counts.total === 0) {
                  return (
                    <span className="text-xs text-fg-muted italic">No assets attached yet</span>
                  );
                }
                return (
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-surface border border-border text-fg">
                      <Paperclip className="w-3 h-3" />
                      <span>{counts.total} total</span>
                    </span>
                    {counts.images > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-soft text-accent border border-accent/20">
                        <ImageIcon className="w-3 h-3" />
                        <span>{counts.images} {counts.images === 1 ? 'image' : 'images'}</span>
                      </span>
                    )}
                    {counts.videos > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-soft text-accent border border-accent/20">
                        <Film className="w-3 h-3" />
                        <span>{counts.videos} {counts.videos === 1 ? 'video' : 'videos'}</span>
                      </span>
                    )}
                    {counts.links > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-status-success-soft text-status-success-fg border border-status-success-border">
                        <Link2 className="w-3 h-3" />
                        <span>{counts.links} {counts.links === 1 ? 'link' : 'links'}</span>
                      </span>
                    )}
                    {counts.docs > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-status-warning-soft text-status-warning-fg border border-status-warning-border">
                        <FileText className="w-3 h-3" />
                        <span>{counts.docs} {counts.docs === 1 ? 'doc' : 'docs'}</span>
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
                readOnly={isClient || isPerformance(actor)}
                onAssetsUpdated={handleAssetsUpdated}
                onUploadingChange={setIsUploadingAssets}
              />

              {/* External Asset Links */}
              {(currentItem.draft_preview_link || currentItem.final_asset_link) && (
                <div className="space-y-2">
                  <h3 className="text-caption font-medium text-fg-muted">
                    External deliverables & links
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {currentItem.draft_preview_link && safeHttpUrl(currentItem.draft_preview_link) && (
                      <a
                        href={safeHttpUrl(currentItem.draft_preview_link) || undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle text-fg hover:text-accent border border-border transition"
                      >
                        <span>Draft preview</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {currentItem.final_asset_link && safeHttpUrl(currentItem.final_asset_link) && (
                      <a
                        href={safeHttpUrl(currentItem.final_asset_link) || undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-status-success-soft text-status-success-fg border border-status-success-border transition font-medium"
                      >
                        <span>Final asset</span>
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
                <h3 className="text-caption font-medium text-fg-muted">
                  Primary text (ad copy)
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.primary_text || '', 'primary_text')}
                  className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-accent transition cursor-pointer"
                >
                  {copiedKey === 'primary_text' ? <Check className="w-3 h-3 text-status-success-fg" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'primary_text' ? 'Copied' : 'Copy text'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-md bg-subtle border border-border text-xs font-sans text-fg whitespace-pre-wrap leading-relaxed">
                {currentItem.primary_text}
              </div>
            </div>
          )}

          {/* Headlines & Hooks */}
          {currentItem.headlines_hooks && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-caption font-medium text-fg-muted">
                  Headlines & hooks library
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.headlines_hooks || '', 'hooks')}
                  className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-accent transition cursor-pointer"
                >
                  {copiedKey === 'hooks' ? <Check className="w-3 h-3 text-status-success-fg" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'hooks' ? 'Copied' : 'Copy hooks'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-md bg-subtle border border-border text-xs font-sans text-fg whitespace-pre-wrap leading-relaxed">
                {currentItem.headlines_hooks}
              </div>
            </div>
          )}

          {/* Content On Creative (Scenes/Overlay script) */}
          {currentItem.content_on_creative && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-caption font-medium text-fg-muted">
                  Content on creative (overlay & script)
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.content_on_creative || '', 'creative_text')}
                  className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-accent transition cursor-pointer"
                >
                  {copiedKey === 'creative_text' ? <Check className="w-3 h-3 text-status-success-fg" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'creative_text' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-md bg-subtle border border-border text-xs font-sans text-fg whitespace-pre-wrap leading-relaxed">
                {currentItem.content_on_creative}
              </div>
            </div>
          )}

          {/* Production Direction */}
          {currentItem.production_direction && (
            <div className="space-y-2">
              <h3 className="text-caption font-medium text-fg-muted">
                Production direction
              </h3>
              <div className="p-3.5 rounded-md bg-subtle border border-border text-xs text-fg leading-relaxed">
                {currentItem.production_direction}
              </div>
            </div>
          )}

          {/* Captions & Hashtags */}
          {currentItem.captions_hashtags && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-caption font-medium text-fg-muted">
                  Captions, hashtags & keywords
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentItem.captions_hashtags || '', 'hashtags')}
                  className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-accent transition cursor-pointer"
                >
                  {copiedKey === 'hashtags' ? <Check className="w-3 h-3 text-status-success-fg" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'hashtags' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-3 rounded-md bg-subtle border border-border text-xs text-accent font-sans font-medium">
                {currentItem.captions_hashtags}
              </div>
            </div>
          )}

          {/* Comments */}
          {currentItem.notes && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-caption font-medium text-fg-muted">
                  Comments
                </h3>
                <span className="text-caption text-fg-muted flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-fg-muted" />
                  <span>
                    By <strong className="text-fg">{currentItem.notes_author || currentItem.created_by_name || 'Team Member'}</strong>
                  </span>
                  {currentItem.notes_updated_at && (
                    <span className="text-fg-muted">· {new Date(currentItem.notes_updated_at).toLocaleDateString()}</span>
                  )}
                </span>
              </div>
              <div className="p-3.5 rounded-md bg-subtle border border-border text-xs text-fg leading-relaxed whitespace-pre-wrap">
                {currentItem.notes}
              </div>
            </div>
          )}
        </div>
      </SheetContent>

      {/* Share Campaign Content Modal */}
      <ContentCalendarShareModal
        item={currentItem}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        actor={actor}
      />
    </Sheet>
  );
};
