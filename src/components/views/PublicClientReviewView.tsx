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
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Active asset preview
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);

  // Ensure the entire viewport and document scroll background remains a single uniform color with zero splits
  useEffect(() => {
    document.documentElement.classList.add('public-review-page');
    document.body.classList.add('public-review-page');

    const rootEl = document.getElementById('root');
    const isDarkMode =
      _theme === 'dark' || document.documentElement.classList.contains('dark');
    const targetBg = isDarkMode ? '#0c0e14' : '#ffffff';

    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevBodyHeight = document.body.style.height;
    const prevBodyMinHeight = document.body.style.minHeight;
    const prevRootHeight = rootEl ? rootEl.style.height : '';
    const prevRootMinHeight = rootEl ? rootEl.style.minHeight : '';
    const prevRootBg = rootEl ? rootEl.style.backgroundColor : '';

    document.documentElement.style.backgroundColor = targetBg;
    document.body.style.backgroundColor = targetBg;
    document.body.style.height = 'auto';
    document.body.style.minHeight = '100%';
    if (rootEl) {
      rootEl.style.height = 'auto';
      rootEl.style.minHeight = '100%';
      rootEl.style.backgroundColor = targetBg;
    }

    return () => {
      document.documentElement.classList.remove('public-review-page');
      document.body.classList.remove('public-review-page');
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.body.style.height = prevBodyHeight;
      document.body.style.minHeight = prevBodyMinHeight;
      if (rootEl) {
        rootEl.style.height = prevRootHeight;
        rootEl.style.minHeight = prevRootMinHeight;
        rootEl.style.backgroundColor = prevRootBg;
      }
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
      alert('Please enter your feedback or the changes you need.');
      return;
    }
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
      <div className="min-h-screen bg-white dark:bg-[#0d0f15] flex flex-col items-center justify-center p-6 text-zinc-600 dark:text-zinc-300">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium tracking-wide text-zinc-500">Loading campaign review...</p>
      </div>
    );
  }

  if (error && !item) {
    const isApprovedExpired = error.toLowerCase().includes('already been approved');
    const isRevisionExpired =
      error.toLowerCase().includes('changes have already been requested') ||
      error.toLowerCase().includes('changes requested');
    const isExpired = isApprovedExpired || isRevisionExpired || error.toLowerCase().includes('expired');

    return (
      <div className="min-h-screen bg-white dark:bg-[#0d0f15] flex flex-col items-center justify-center p-6 text-zinc-900 dark:text-zinc-100">
        <div className="max-w-md w-full bg-white dark:bg-[#141620] p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center space-y-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
              isApprovedExpired
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80'
                : isRevisionExpired
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80'
                : 'bg-zinc-100 dark:bg-zinc-800 text-rose-500 border border-zinc-200 dark:border-zinc-700'
            }`}
          >
            {isApprovedExpired ? (
              <Check className="w-6 h-6 text-blue-600" />
            ) : isRevisionExpired ? (
              <RotateCcw className="w-6 h-6 text-amber-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-rose-500" />
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isExpired ? 'Review Link Expired' : 'Review Link Not Found'}
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">{error}</p>
          </div>
          {isApprovedExpired && (
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Check className="w-3 h-3 text-blue-600" />
                Status: Approved
              </span>
            </div>
          )}
          {isRevisionExpired && (
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Clock className="w-3 h-3 text-amber-600" />
                Status: Changes Requested
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!item) return null;

  const assets = item.attachments || [];
  const activeAsset = assets[activeAssetIndex];
  const hookLines = parseHookLines(item.headlines_hooks);

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0c0e14] text-zinc-900 dark:text-zinc-100 font-sans antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0c0e14]/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {item.client_name || 'Apex Transfers LLC'}
              </span>
              <span className="text-xs text-zinc-300 dark:text-zinc-600">•</span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                {item.serial}
              </span>
            </div>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-sm sm:max-w-md">
              {item.content_concept}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            {item.stage}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {/* Banner: Action Feedback */}
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 flex items-center gap-3 animate-in fade-in duration-150">
            <Check className="w-4 h-4 shrink-0 text-blue-600" />
            <div className="flex-1 text-xs sm:text-sm font-semibold">{actionSuccess}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Post Details & Deliverables (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Visual Deliverables Preview (Option 2: Hidden during Content stages) */}
            {!isContentStage && assets.length > 0 ? (
              <div className="bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Creative Deliverables ({assets.length})</span>
                  </h3>
                  {item.creative_type && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {item.creative_type}
                    </span>
                  )}
                </div>

                {/* Main Media Preview Frame */}
                {activeAsset && (
                  <div className="relative w-full rounded-xl overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[520px]">
                    {activeAsset.kind === 'video' ? (
                      <video
                        key={activeAsset.url}
                        src={activeAsset.url}
                        controls
                        playsInline
                        className="max-h-[500px] w-auto max-w-full rounded-lg"
                      />
                    ) : activeAsset.kind === 'image' ? (
                      <img
                        key={activeAsset.url}
                        src={activeAsset.url}
                        alt={activeAsset.filename || 'Creative asset'}
                        className="max-h-[500px] w-auto max-w-full object-contain"
                      />
                    ) : (
                      <div className="p-8 text-center text-zinc-400 space-y-3">
                        <FileText className="w-10 h-10 mx-auto text-zinc-500" />
                        <p className="text-xs font-medium">{activeAsset.filename}</p>
                        <a
                          href={activeAsset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-zinc-900 shadow-xs hover:bg-zinc-100 transition"
                        >
                          <span>Open File</span>
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
                        className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border transition cursor-pointer ${
                          activeAssetIndex === idx
                            ? 'border-blue-600 ring-2 ring-blue-500/20'
                            : 'border-zinc-200 dark:border-zinc-700 opacity-70 hover:opacity-100'
                        }`}
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
                                <Play className="w-3.5 h-3.5 text-white fill-white/80 drop-shadow" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-300">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 px-1 rounded text-[8px] font-bold bg-black/70 text-white">
                          #{idx + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Ad Copy & Strategy Card */}
            <div className="bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 space-y-6">
              {/* Primary Text (Ad Copy / Caption) */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Ad Copy / Caption
                </h3>
                <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-zinc-800 dark:text-zinc-200 py-2">
                  {item.primary_text || (item as any).post_copy || (
                    <span className="text-zinc-400 italic">No copy written yet.</span>
                  )}
                </div>
              </div>

              {/* Angles & Hooks (Clean typographic list, no monospace slop) */}
              {hookLines.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Hooks & Opening Headlines
                  </h3>
                  <div className="space-y-2">
                    {hookLines.map((hook, idx) => (
                      <div
                        key={idx}
                        className="py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 flex items-start gap-2.5"
                      >
                        <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs mt-0.5 shrink-0">
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
                <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Copy on Graphic / Video
                  </h3>
                  <div className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 py-1">
                    {item.content_on_creative}
                  </div>
                </div>
              )}

              {/* Offer & CTA */}
              {(item.offer || item.cta) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  {item.offer && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                        Promotional Offer
                      </span>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{item.offer}</p>
                    </div>
                  )}
                  {item.cta && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                        Call to Action
                      </span>
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{item.cta}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Hashtags */}
              {item.captions_hashtags && (
                <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Hashtags & Tags
                  </h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {item.captions_hashtags}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Approval Card & Campaign Info (4 cols) */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-20">
            {/* Approval Decision Card */}
            <div className="bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Client Review
                </span>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {isPendingReview ? 'Review & Decision' : 'Campaign Progress'}
                </h3>
              </div>

              {/* Current Status */}
              <div className="py-2.5 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Stage:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {item.stage}
                </span>
              </div>

              {isApproved && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2 font-medium">
                  <Check className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                  <span>Approved. Moving forward in production.</span>
                </div>
              )}

              {item.publish_date && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 px-0.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Scheduled: <strong className="text-zinc-800 dark:text-zinc-200">{item.publish_date}</strong></span>
                </div>
              )}

              {/* Review Decision Controls (Only active when in Content Client Review or Creative Client Review) */}
              {isPendingReview ? (
                <>
                  {/* Reviewer Name Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                      Your Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Action Buttons (All Blue / Neutral, Zero Green) */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs sm:text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {item.stage === 'Content Client Review'
                          ? 'Approve Content Copy'
                          : 'Approve Creative & Visuals'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsRevisionOpen(!isRevisionOpen)}
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-medium text-xs transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{isRevisionOpen ? 'Close Feedback' : 'Request Changes'}</span>
                    </button>
                  </div>

                  {/* Revision Feedback Box */}
                  {isRevisionOpen && (
                    <div className="space-y-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-150">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                        Describe requested changes:
                      </label>
                      <textarea
                        rows={4}
                        value={revisionNote}
                        onChange={(e) => setRevisionNote(e.target.value)}
                        placeholder={
                          item.stage === 'Content Client Review'
                            ? 'e.g. Please update the headline or adjust the call to action...'
                            : 'e.g. Please update the graphic colors or adjust the logo placement...'
                        }
                        className="w-full p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleRequestRevision}
                        disabled={isSubmitting}
                        className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Feedback</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {item.stage === 'Content Revision' || item.stage === 'Creative Revision' ? (
                    <span>
                      Our team is actively working on revisions for this campaign. Client review decisions are paused until updated deliverables are submitted.
                    </span>
                  ) : item.stage === 'Creative Production' || item.stage === 'Content' ? (
                    <span>
                      This campaign is currently in production. Client review decisions will open once deliverables are submitted.
                    </span>
                  ) : item.stage === 'Content Internal Review' || item.stage === 'Creative Internal Review' ? (
                    <span>
                      This campaign is undergoing internal quality review before client presentation.
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
            <div className="p-5 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 text-xs space-y-2.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Campaign Information
              </span>
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500">Campaign Type</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.campaign_type || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500">Content Pillar</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.content_pillar || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Target Audience</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Public Social</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
