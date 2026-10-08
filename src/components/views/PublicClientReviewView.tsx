import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  AlertCircle,
  FileText,
  Send,
  MessageSquare,
  ExternalLink,
  Layers,
  RotateCcw,
  Play,
  CheckCircle2,
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { StatusPill } from '../ui/StatusPill';
import { EmptyState } from '../ui/EmptyState';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { cn } from '../../lib/utils';

interface Props {
  theme?: 'dark' | 'light';
}

function parseHookLines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      const stripped = l.replace(/^[-*#\s_]+|[-*#\s_]+$/g, '').trim();
      if (!stripped) return false;
      if (/^(?:hooks?|headlines?|angles?)$/i.test(stripped)) return false;
      return true;
    });
}

export const PublicClientReviewView: React.FC<Props> = ({ theme: _theme = 'light' }) => {
  const [token, setToken] = useState<string>('');
  const [item, setItem] = useState<ContentCalendarItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review action state
  const [reviewerName, setReviewerName] = useState('');
  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Active asset preview
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);

  // Uniform canvas styling
  useEffect(() => {
    document.documentElement.classList.add('public-review-page');
    document.body.classList.add('public-review-page');

    return () => {
      document.documentElement.classList.remove('public-review-page');
      document.body.classList.remove('public-review-page');
    };
  }, [_theme]);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/(?:review|client-review)\/([^/?#]+)/i);
    const searchToken = new URLSearchParams(window.location.search).get('token');
    const resolved = (match ? match[1] : searchToken) || '';
    setToken(resolved);

    if (!resolved) {
      setError('Invalid or missing review link. Please verify the URL.');
      setIsLoading(false);
      return;
    }

    const fetchReviewData = async () => {
      try {
        const res = await fetch(`/api/v1/content-calendar/public/review/${encodeURIComponent(resolved)}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Campaign not found or link has expired.');
        }
        const data = await res.json();
        setItem(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load campaign review.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchReviewData();
  }, []);

  const handleApprove = async () => {
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/content-calendar/public/review/${encodeURIComponent(token)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          reviewer_name: reviewerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to submit approval.');
      }
      const data = await res.json();
      setActionSuccess(data.message || 'Campaign approved successfully!');
      if (data.item) {
        setItem(data.item);
      } else if (data.new_stage) {
        setItem((prev) => (prev ? { ...prev, stage: data.new_stage } : prev));
      }
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!token) return;
    if (!revisionNote.trim()) {
      setRevisionError('Add your feedback or the changes you need.');
      return;
    }
    setRevisionError(null);
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/content-calendar/public/review/${encodeURIComponent(token)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_revision',
          reviewer_name: reviewerName.trim() || undefined,
          note: revisionNote.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to submit revision request.');
      }
      const data = await res.json();
      setActionSuccess(data.message || 'Revision requested. Our team has received your notes.');
      setIsRevisionOpen(false);
      setRevisionNote('');
      if (data.item) {
        setItem(data.item);
      } else if (data.new_stage) {
        setItem((prev) => (prev ? { ...prev, stage: data.new_stage } : prev));
      }
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isContentStage = Boolean(
    item &&
      ['Content', 'Content Internal Review', 'Content Client Review', 'Content Revision'].includes(
        item.stage,
      ),
  );

  const isPendingReview = Boolean(
    item && (item.stage === 'Content Client Review' || item.stage === 'Creative Client Review'),
  );

  const isApproved = Boolean(
    item && ['Creative Production', 'Creative Internal Review', 'Ready to Post', 'Posted'].includes(item.stage),
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-fg-muted">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium text-fg-muted">Loading campaign review...</p>
      </div>
    );
  }

  // Error and Expired States (using EmptyState per §13.17)
  if (error && !item) {
    const isApprovedExpired = error.toLowerCase().includes('already been approved');
    const isRevisionExpired =
      error.toLowerCase().includes('changes have already been requested') ||
      error.toLowerCase().includes('changes requested');

    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-fg">
        <div className="max-w-md w-full bg-surface p-8 rounded-xl border border-border shadow-xs text-center space-y-4">
          <EmptyState
            icon={isApprovedExpired ? CheckCircle2 : isRevisionExpired ? RotateCcw : AlertCircle}
            title={
              isApprovedExpired
                ? 'Everything here is approved'
                : isRevisionExpired
                ? 'This link has expired'
                : 'Review link not found'
            }
            description={error}
            action={
              isApprovedExpired ? (
                <StatusPill variant="success" dot label="Approved" />
              ) : isRevisionExpired ? (
                <StatusPill variant="warning" dot label="Revision requested" />
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  if (!item) return null;

  const assets = item.attachments || [];
  const activeAsset = assets[activeAssetIndex];
  const hookLines = parseHookLines(item.headlines_hooks);

  return (
    <div className="min-h-screen w-full bg-canvas text-fg font-sans antialiased">
      {/* Top Navbar 56px per §13.17 */}
      <header className="sticky top-0 z-40 h-14 bg-surface border-b border-border px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark size={28} />
          <div className="flex items-center gap-2 truncate">
            <span className="text-sm font-semibold text-fg tracking-tight">Reamarc</span>
            <span className="text-fg-faint">•</span>
            <span className="text-xs text-fg-muted truncate">
              {item.client_name || 'Client review'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-medium text-fg-muted hidden sm:inline">
            {item.serial}
          </span>
          <StatusPill status={item.stage} />
        </div>
      </header>

      {/* Main Content Area: Centred 960px column per §13.17 */}
      <main className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 space-y-6 pb-24 md:pb-8">
        {/* Banner: Action Feedback */}
        {actionSuccess && (
          <div className="p-4 rounded-lg bg-success-bg border border-success-bd text-success-fg flex items-center gap-3">
            <Check className="w-4 h-4 shrink-0" />
            <div className="flex-1 text-xs font-medium">{actionSuccess}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Post Details & Deliverables (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Visual Deliverables Preview Frame (4:5) */}
            {!isContentStage && assets.length > 0 && (
              <div className="bg-surface rounded-xl border border-border p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-accent" />
                    <span>Creative deliverables ({assets.length})</span>
                  </span>
                  {item.creative_type && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-subtle text-fg-muted border border-border">
                      {item.creative_type}
                    </span>
                  )}
                </div>

                {/* Main Media Preview Frame */}
                {activeAsset && (
                  <div className="relative w-full rounded-lg overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[500px]">
                    {activeAsset.kind === 'video' ? (
                      <video
                        key={activeAsset.url}
                        src={activeAsset.url}
                        controls
                        playsInline
                        className="max-h-[480px] w-auto max-w-full rounded-md"
                      />
                    ) : activeAsset.kind === 'image' ? (
                      <img
                        key={activeAsset.url}
                        src={activeAsset.url}
                        alt={activeAsset.filename || 'Creative asset'}
                        className="max-h-[480px] w-auto max-w-full object-contain"
                      />
                    ) : (
                      <div className="p-8 text-center text-fg-muted space-y-3">
                        <FileText className="w-10 h-10 mx-auto text-fg-muted" />
                        <p className="text-xs font-medium text-fg">{activeAsset.filename}</p>
                        <a
                          href={activeAsset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-surface text-fg border border-border shadow-xs hover:bg-hover transition-colors"
                        >
                          <span>Open file</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Thumbnail Strip */}
                {assets.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                    {assets.map((asset, idx) => (
                      <button
                        key={asset.id || idx}
                        type="button"
                        onClick={() => setActiveAssetIndex(idx)}
                        className={cn(
                          'relative w-14 h-14 rounded-md overflow-hidden shrink-0 border transition-all cursor-pointer',
                          activeAssetIndex === idx
                            ? 'border-accent shadow-[0_0_0_2px_var(--ring)]'
                            : 'border-border opacity-70 hover:opacity-100'
                        )}
                      >
                        {asset.thumbnail_url || asset.kind === 'image' ? (
                          <>
                            <img
                              src={asset.thumbnail_url || asset.url}
                              alt={asset.filename || `Asset ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {asset.kind === 'video' && (
                              <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                <Play className="w-3.5 h-3.5 text-white fill-white/80" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-subtle flex items-center justify-center text-fg-muted">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ad Copy & Strategy Card */}
            <div className="bg-surface rounded-xl border border-border p-6 sm:p-7 space-y-5 shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-mono font-medium text-fg-muted">
                  {item.serial}
                </span>
                <h2 className="text-base font-semibold text-fg">
                  {item.content_concept}
                </h2>
              </div>

              {/* Primary Text (Ad Copy / Caption) */}
              <div className="space-y-1.5 pt-3 border-t border-border">
                <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                  Ad copy / Caption
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-fg py-1">
                  {item.primary_text || (item as any).post_copy || (
                    <span className="text-fg-faint italic">No copy written yet.</span>
                  )}
                </p>
              </div>

              {/* Angles & Hooks */}
              {hookLines.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-border">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                    Hooks & Opening headlines
                  </span>
                  <div className="space-y-2">
                    {hookLines.map((hook, idx) => (
                      <div
                        key={idx}
                        className="py-2 px-3 rounded-md bg-subtle border border-border text-xs sm:text-sm text-fg flex items-start gap-2.5"
                      >
                        <span className="text-accent font-semibold text-xs mt-0.5 shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="leading-relaxed">{hook}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Visual Copy (Copy On Creative) */}
              {item.content_on_creative && (
                <div className="space-y-1.5 pt-4 border-t border-border">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                    Copy on graphic / video
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-fg py-1">
                    {item.content_on_creative}
                  </p>
                </div>
              )}

              {/* Offer & CTA */}
              {(item.offer || item.cta) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
                  {item.offer && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                        Promotional offer
                      </span>
                      <p className="text-sm font-semibold text-fg">{item.offer}</p>
                    </div>
                  )}
                  {item.cta && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                        Call to action
                      </span>
                      <p className="text-sm font-semibold text-accent-text">{item.cta}</p>
                    </div>
                  )}
                </div>
              )}

              {/* External Deliverable Links */}
              {(item.draft_preview_link || item.final_asset_link) && (
                <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                  {item.draft_preview_link && safeHttpUrl(item.draft_preview_link) && (
                    <a
                      href={safeHttpUrl(item.draft_preview_link) || undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-subtle hover:bg-hover border border-border text-fg transition-colors"
                    >
                      <span>Draft preview link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {item.final_asset_link && safeHttpUrl(item.final_asset_link) && (
                    <a
                      href={safeHttpUrl(item.final_asset_link) || undefined}
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
            </div>
          </div>

          {/* Right Column: Approval Card & Campaign Info (5 cols) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-20">
            {/* Approval Decision Card */}
            <div className="bg-surface rounded-xl border border-border p-6 space-y-4 shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent-text">
                  Client review
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-fg">
                  {isPendingReview ? 'Review & decision' : 'Campaign status'}
                </h3>
              </div>

              {/* Current Status */}
              <div className="py-2 px-3 rounded-md bg-subtle border border-border flex items-center justify-between text-xs">
                <span className="text-fg-muted">Current stage:</span>
                <StatusPill status={item.stage} />
              </div>

              {isApproved && (
                <div className="p-3 rounded-md bg-success-bg border border-success-bd text-success-fg text-xs flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Approved and advancing in production.</span>
                </div>
              )}

              {item.publish_date && (
                <div className="flex items-center gap-2 text-xs text-fg-muted px-0.5">
                  <Clock className="w-3.5 h-3.5 text-fg-faint" />
                  <span>Scheduled date: <strong className="text-fg font-medium">{item.publish_date}</strong></span>
                </div>
              )}

              {/* Review Decision Controls */}
              {isPendingReview ? (
                <>
                  {/* Reviewer Name Input */}
                  <div className="pt-1">
                    <label
                      htmlFor="public-reviewer-name"
                      className="text-xs font-medium text-fg block mb-1.5"
                    >
                      Your name (optional)
                    </label>
                    <Input
                      id="public-reviewer-name"
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      inputSize="sm"
                    />
                  </div>

                  {/* Split Action Buttons (Sentence Case per §13.17) */}
                  <div className="space-y-2 pt-2">
                    <Button
                      variant="primary"
                      size="md"
                      block
                      disabled={isSubmitting}
                      loading={isSubmitting}
                      onClick={handleApprove}
                      icon={Check}
                    >
                      {item.stage === 'Content Client Review'
                        ? 'Approve content copy'
                        : 'Approve creative'}
                    </Button>

                    <Button
                      variant="outline"
                      size="md"
                      block
                      disabled={isSubmitting}
                      onClick={() => setIsRevisionOpen(!isRevisionOpen)}
                      icon={MessageSquare}
                    >
                      {isRevisionOpen ? 'Close feedback' : 'Request changes'}
                    </Button>
                  </div>

                  {/* Revision Feedback Box (with 13px helper per §13.17) */}
                  {isRevisionOpen && (
                    <div className="space-y-2 pt-3 border-t border-border animate-in fade-in duration-150">
                      <label
                        htmlFor="public-revision-feedback"
                        className="text-xs font-medium text-fg block"
                      >
                        Feedback
                      </label>
                      <p className="text-[13px] text-fg-muted">
                        Please specify the changes or adjustments needed.
                      </p>
                      <Textarea
                        id="public-revision-feedback"
                        rows={4}
                        value={revisionNote}
                        onChange={(e) => {
                          setRevisionNote(e.target.value);
                          if (revisionError) setRevisionError(null);
                        }}
                        placeholder={
                          item.stage === 'Content Client Review'
                            ? 'e.g. Please update the headline or adjust the call to action...'
                            : 'e.g. Please update the graphic colors or adjust the logo placement...'
                        }
                        error={revisionError}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        block
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        onClick={handleRequestRevision}
                        icon={Send}
                      >
                        Submit changes
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3.5 rounded-md bg-subtle border border-border text-xs text-fg-muted leading-relaxed">
                  {item.stage === 'Content Revision' || item.stage === 'Creative Revision' ? (
                    <span>
                      Our team is actively working on revisions for this campaign. Client review decisions will reopen once updated deliverables are submitted.
                    </span>
                  ) : item.stage === 'Creative Production' || item.stage === 'Content' ? (
                    <span>
                      This campaign is currently in production. Client review decisions will open once deliverables are submitted.
                    </span>
                  ) : (
                    <span>
                      This campaign is currently in <strong>{item.stage}</strong> and is not awaiting client review.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Campaign Metadata Details */}
            <div className="p-5 rounded-xl bg-surface border border-border text-xs space-y-2.5 shadow-xs">
              <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                Campaign details
              </span>
              <dl className="space-y-2">
                <div className="flex justify-between py-1 border-b border-border">
                  <dt className="text-fg-muted">Campaign type</dt>
                  <dd className="font-medium text-fg">{item.campaign_type || '—'}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <dt className="text-fg-muted">Content pillar</dt>
                  <dd className="font-medium text-fg">{item.content_pillar || '—'}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <dt className="text-fg-muted">Target audience</dt>
                  <dd className="font-medium text-fg">Public social</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-fg-muted">Format</dt>
                  <dd className="font-medium text-fg">{item.creative_type || 'Post'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Action Bar at 375px (< 768px) per §13.17 */}
      {isPendingReview && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-surface border-t border-border flex items-center gap-2 z-40 shadow-lg">
          <Button
            variant="outline"
            size="sm"
            block
            disabled={isSubmitting}
            onClick={() => setIsRevisionOpen(true)}
            icon={MessageSquare}
          >
            Request changes
          </Button>
          <Button
            variant="primary"
            size="sm"
            block
            disabled={isSubmitting}
            loading={isSubmitting}
            onClick={handleApprove}
            icon={Check}
          >
            {item.stage === 'Content Client Review' ? 'Approve copy' : 'Approve creative'}
          </Button>
        </div>
      )}
    </div>
  );
};
