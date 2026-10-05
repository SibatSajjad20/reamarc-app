import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  FileText,
  MessageCircle,
  Link2,
  ExternalLink,
} from 'lucide-react';
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
    <div className="fixed inset-0 z-60 overflow-hidden flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#0d0f15]/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-numeric font-bold text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {item.serial}
                </span>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-xs">
                  Share Campaign Content
                </h3>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {item.content_concept}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Public Client Review Link Bar (Visible when criteria met) */}
        {showReviewLink && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 shadow-xs">
                <Link2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 block truncate">
                  Client Review Link
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate font-mono">
                  {clientReviewUrl}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyReviewLink}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#141620] text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {copiedReview ? <Check className="w-3.5 h-3.5 text-blue-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedReview ? 'Copied' : 'Copy Link'}</span>
              </button>
              <a
                href={clientReviewUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-white dark:bg-[#141620] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 transition"
                title="Open Review Page in New Tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Format Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/70 text-xs">
            <button
              type="button"
              onClick={() => setFormatMode('whatsapp')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'whatsapp'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
              <span>WhatsApp / Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setFormatMode('full')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'full'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-zinc-600" />
              <span>Full Brief</span>
            </button>
            <button
              type="button"
              onClick={() => setFormatMode('social')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                formatMode === 'social'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Copy className="w-3.5 h-3.5 text-zinc-600" />
              <span>Post Copy Only</span>
            </button>
          </div>
        </div>

        {/* Content Preview Box */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[220px] max-h-[360px]">
          <pre className="text-xs font-sans leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 selection:bg-blue-100">
            {activeContent}
          </pre>
        </div>

        {/* Action Buttons Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#0d0f15]/80 gap-3">
          <div className="flex items-center gap-2">
            {formatMode === 'whatsapp' && (
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Open in WhatsApp</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleNativeShare}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-500" />
              <span>Share...</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy All Text'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
