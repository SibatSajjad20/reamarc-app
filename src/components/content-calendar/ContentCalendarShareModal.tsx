import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  FileText,
  MessageCircle,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import {
  canAccessClientReviewLink,
  type CalendarActor,
} from '../../utils/contentCalendarWorkflow';

interface Props {
  item: ContentCalendarItem | null;
  isOpen: boolean;
  onClose: () => void;
  actor?: CalendarActor | null;
}

type FormatMode = 'whatsapp' | 'full' | 'social';

export const ContentCalendarShareModal: React.FC<Props> = ({ item, isOpen, onClose, actor }) => {
  const [formatMode, setFormatMode] = useState<FormatMode>('whatsapp');
  const [copied, setCopied] = useState(false);
  const [copiedReview, setCopiedReview] = useState(false);

  if (!isOpen || !item) return null;

  const reviewToken = item.share_token || item.id;
  const clientReviewUrl = `${window.location.origin}/review/${reviewToken}`;
  const showReviewLink = canAccessClientReviewLink(item.stage, actor);

  const handleCopyReviewLink = async () => {
    await navigator.clipboard.writeText(clientReviewUrl);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 2000);
  };

  const buildWhatsAppText = (): string => {
    let t = `📢 *${item.serial || 'CAMPAIGN'} - ${item.content_concept}*\n`;
    t += `🏢 *Client:* ${item.client_name || 'Apex Transfers LLC'}\n`;
    t += `📊 *Stage:* ${item.stage} | *Type:* ${item.creative_type}\n`;
    if (item.publish_date) t += `📅 *Scheduled:* ${item.publish_date}\n`;
    if (item.assignee_name) t += `👤 *Assignee:* ${item.assignee_name}\n`;
    if (showReviewLink) {
      t += `🔗 *Client Review Link:* ${clientReviewUrl}\n\n`;
    } else {
      t += `\n`;
    }

    if (item.headlines_hooks?.trim()) {
      t += `🎣 *Hooks & Angles:*\n${item.headlines_hooks.trim()}\n\n`;
    }
    if (item.primary_text?.trim()) {
      t += `📝 *Ad Copy / Caption:*\n${item.primary_text.trim()}\n\n`;
    }
    if (item.content_on_creative?.trim()) {
      t += `🎨 *Copy on Creative:*\n${item.content_on_creative.trim()}\n\n`;
    }
    if (item.offer?.trim() || item.cta?.trim()) {
      t += `🎯 *Offer & CTA:*\n`;
      if (item.offer?.trim()) t += `• Offer: ${item.offer.trim()}\n`;
      if (item.cta?.trim()) t += `• CTA: ${item.cta.trim()}\n`;
      t += `\n`;
    }
    if (item.captions_hashtags?.trim()) {
      t += `🏷️ *Hashtags:*\n${item.captions_hashtags.trim()}\n\n`;
    }
    if (item.attachments && item.attachments.length > 0) {
      t += `🔗 *Deliverables & Assets (${item.attachments.length}):*\n`;
      item.attachments.forEach((att, idx) => {
        const fullUrl = att.url?.startsWith('http')
          ? att.url
          : `${window.location.origin}${att.url}`;
        t += `${idx + 1}. ${att.filename || 'Asset'}: ${fullUrl}\n`;
      });
    }
    return t.trim();
  };

  const buildFullBriefText = (): string => {
    let t = `========================================================\n`;
    t += `CAMPAIGN BRIEF: [${item.serial}] ${item.content_concept}\n`;
    t += `========================================================\n\n`;
    t += `CLIENT: ${item.client_name || 'Apex Transfers LLC'}\n`;
    t += `STAGE: ${item.stage}\n`;
    t += `APPROVAL STATUS: ${item.approval_status}\n`;
    t += `CREATIVE TYPE: ${item.creative_type}\n`;
    t += `CONTENT PILLAR: ${item.content_pillar || '—'}\n`;
    t += `CAMPAIGN TYPE: ${item.campaign_type || '—'}\n`;
    t += `SCHEDULED PUBLISH: ${item.publish_date || 'Unscheduled'}\n`;
    t += `CREATED BY: ${item.created_by_name || item.created_by || 'Content Team'}\n`;
    t += `ASSIGNED TO: ${item.assignee_name || 'Unassigned'}\n`;
    t += `DEPARTMENT OWNER: ${item.design_owner || 'Content'}\n`;
    if (showReviewLink) {
      t += `CLIENT REVIEW LINK: ${clientReviewUrl}\n\n`;
    } else {
      t += `\n`;
    }

    if (item.headlines_hooks?.trim()) {
      t += `--- HOOKS & HEADLINES ---\n${item.headlines_hooks.trim()}\n\n`;
    }
    if (item.primary_text?.trim()) {
      t += `--- PRIMARY TEXT / AD COPY ---\n${item.primary_text.trim()}\n\n`;
    }
    if (item.content_on_creative?.trim()) {
      t += `--- VISUAL COPY ON CREATIVE ---\n${item.content_on_creative.trim()}\n\n`;
    }
    if (item.offer?.trim()) {
      t += `OFFER: ${item.offer.trim()}\n`;
    }
    if (item.cta?.trim()) {
      t += `CALL TO ACTION (CTA): ${item.cta.trim()}\n\n`;
    }
    if (item.captions_hashtags?.trim()) {
      t += `--- CAPTIONS & HASHTAGS ---\n${item.captions_hashtags.trim()}\n\n`;
    }
    if (item.attachments && item.attachments.length > 0) {
      t += `--- ATTACHED ASSETS ---\n`;
      item.attachments.forEach((att, idx) => {
        const fullUrl = att.url?.startsWith('http')
          ? att.url
          : `${window.location.origin}${att.url}`;
        t += `${idx + 1}. [${att.kind || 'file'}] ${att.filename || 'Asset'}: ${fullUrl}\n`;
      });
      t += `\n`;
    }
    t += `========================================================`;
    return t.trim();
  };

  const buildSocialPostText = (): string => {
    let t = '';
    if (item.primary_text?.trim()) {
      t += `${item.primary_text.trim()}\n\n`;
    }
    if (item.cta?.trim()) {
      t += `👉 ${item.cta.trim()}\n\n`;
    }
    if (item.captions_hashtags?.trim()) {
      t += `${item.captions_hashtags.trim()}`;
    }
    return t.trim() || 'No post copy available.';
  };

  const activeContent =
    formatMode === 'whatsapp'
      ? buildWhatsAppText()
      : formatMode === 'full'
      ? buildFullBriefText()
      : buildSocialPostText();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `[${item.serial}] ${item.content_concept}`,
          text: activeContent,
        });
      } catch (e) {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(activeContent);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent maxWidth="md" className="p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-accent-soft text-accent">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-numeric font-medium text-caption px-2 py-0.5 rounded bg-subtle text-fg border border-border">
                  {item.serial}
                </span>
                <DialogTitle className="text-ui font-semibold text-fg truncate max-w-xs">
                  Share campaign content
                </DialogTitle>
              </div>
              <DialogDescription className="text-caption text-fg-muted mt-0.5 truncate">
                {item.content_concept}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Public Client Review Link Bar (Visible when criteria met) */}
        {showReviewLink && (
          <div className="mx-6 mt-4 p-3 rounded-md bg-subtle border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-1.5 rounded-md bg-accent-soft text-accent shrink-0">
                <Link2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-caption font-medium text-fg block truncate">
                  Client review link
                </span>
                <span className="text-caption text-fg-muted block truncate font-mono">
                  {clientReviewUrl}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyReviewLink}
              >
                {copiedReview ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedReview ? 'Copied' : 'Copy link'}</span>
              </Button>
              <a
                href={clientReviewUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md border border-border hover:bg-hover text-fg-muted transition inline-flex items-center justify-center"
                title="Open review page in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Format Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-border bg-subtle flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-surface border border-border text-xs">
            <button
              type="button"
              onClick={() => setFormatMode('whatsapp')}
              className={`px-3 py-1.5 rounded-sm font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'whatsapp'
                  ? 'bg-subtle text-fg font-semibold shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setFormatMode('full')}
              className={`px-3 py-1.5 rounded-sm font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'full'
                  ? 'bg-subtle text-fg font-semibold shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Full brief</span>
            </button>
            <button
              type="button"
              onClick={() => setFormatMode('social')}
              className={`px-3 py-1.5 rounded-sm font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'social'
                  ? 'bg-subtle text-fg font-semibold shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy only</span>
            </button>
          </div>
        </div>

        {/* Content Preview Box */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[220px] max-h-[360px]">
          <pre className="text-small font-sans leading-relaxed whitespace-pre-wrap text-fg bg-subtle p-4 rounded-md border border-border">
            {activeContent}
          </pre>
        </div>

        {/* Action Buttons Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface gap-3">
          <div className="flex items-center gap-2">
            {formatMode === 'whatsapp' && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleWhatsAppShare}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                <span>Open in WhatsApp</span>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleNativeShare}
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              <span>Share…</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              <span>{copied ? 'Copied' : 'Copy all text'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
