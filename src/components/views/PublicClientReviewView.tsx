import React, { useEffect, useRef, useState } from 'react';
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
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { BrandMark } from '../ui/BrandMark';
import { ClientAvatar } from '../ui/ClientAvatar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { StatusPill } from '../ui/StatusPill';
import { EmptyState } from '../ui/EmptyState';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { cn } from '../../lib/utils';
import {
  downloadAllPublicAssets,
  downloadPublicAsset,
  formatDownloadSize,
  isMobileDevice,
  type PublicDownloadAsset,
} from '../../utils/publicDownload';

interface Props {
  theme?: 'dark' | 'light';
}

function isVisualAsset(asset: { kind?: string; content_type?: string; url?: string } | null | undefined) {
  if (!asset?.url) return false;
  const kind = String(asset.kind || '').toLowerCase();
  const type = String(asset.content_type || '').toLowerCase();
  return kind === 'image' || kind === 'video' || type.startsWith('image/') || type.startsWith('video/');
}

function waitForMedia(
  asset: { kind?: string; content_type?: string; url?: string },
  signal?: AbortSignal,
  timeoutMs = 45000,
): Promise<void> {
  return new Promise((resolve) => {
    const url = String(asset.url || '').trim();
    if (!url || signal?.aborted) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    signal?.addEventListener('abort', finish, { once: true });

    const isVideo =
      String(asset.kind || '').toLowerCase() === 'video' ||
      String(asset.content_type || '').toLowerCase().startsWith('video/');

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.oncanplaythrough = finish;
      video.onerror = finish;
      video.src = url;
      video.load();
      return;
    }

    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = url;
  });
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
  const [loadingMessage, setLoadingMessage] = useState('Loading campaign review...');
  const [error, setError] = useState<string | null>(null);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const readyMediaUrlRef = useRef<string | null>(null);

  // Review action state
  const [reviewerName, setReviewerName] = useState('');
  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Active asset preview
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadingKeys, setDownloadingKeys] = useState<Set<string>>(() => new Set());
  const [successKeys, setSuccessKeys] = useState<Set<string>>(() => new Set());
  const inFlightDownloadsRef = useRef<Set<string>>(new Set());
  const inFlightDownloadAllRef = useRef<boolean>(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadAllSuccess, setDownloadAllSuccess] = useState(false);
  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current.clear();
    };
  }, []);
  const approvalCardRef = useRef<HTMLDivElement>(null);

  const openRevisionForm = () => {
    setIsRevisionOpen(true);
    requestAnimationFrame(() => {
      approvalCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

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

    const abort = new AbortController();
    const fetchReviewData = async () => {
      try {
        const res = await fetch(`/api/v1/content-calendar/public/review/${encodeURIComponent(resolved)}`, {
          signal: abort.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Campaign not found or link has expired.');
        }
        const data = await res.json();
        setItem(data);

        const contentStages = ['Content', 'Content Internal Review', 'Content Client Review', 'Content Revision'];
        const firstVisual = (data.attachments || []).find((asset: { kind?: string; content_type?: string; url?: string }) =>
          isVisualAsset(asset),
        );
        if (firstVisual && !contentStages.includes(String(data.stage || ''))) {
          setLoadingMessage('Loading creative…');
          await waitForMedia(firstVisual, abort.signal);
          if (!abort.signal.aborted) {
            readyMediaUrlRef.current = String(firstVisual.url || '');
            setIsMediaReady(true);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Failed to load campaign review.');
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    };

    void fetchReviewData();
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const previous = document.title;
    const agencyName = (item as any)?.company_name || (item as any)?.company?.name || 'Campaign Review';
    if (item?.content_concept && item?.client_name) {
      document.title = `${item.content_concept} · ${item.client_name}`;
    } else if (item?.content_concept) {
      document.title = `${item.content_concept} · ${agencyName}`;
    } else if (item?.client_name) {
      document.title = `${item.client_name} campaign review · ${agencyName}`;
    } else {
      document.title = `Campaign review · ${agencyName}`;
    }
    return () => {
      document.title = previous;
    };
  }, [item]);

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

  const downloadOnly = Boolean(item?.read_only || item?.download_only);
  const canDecide = isPendingReview && !downloadOnly;
  const downloadsEnabled = Boolean(item?.download_allowed);

  const activePreviewAsset = item?.attachments?.[activeAssetIndex];
  const activeIsVisual = isVisualAsset(activePreviewAsset);

  useEffect(() => {
    const url = String(activePreviewAsset?.url || '');
    if (!activeIsVisual) {
      setIsMediaReady(true);
      return;
    }
    if (readyMediaUrlRef.current === url) {
      setIsMediaReady(true);
      return;
    }
    setIsMediaReady(false);
  }, [activePreviewAsset?.url, activePreviewAsset?.id, activeIsVisual]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-fg-muted">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium text-fg-muted">{loadingMessage}</p>
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
        <div className="max-w-md w-full bg-surface p-6 sm:p-8 rounded-xl border border-border shadow-xs text-center space-y-4">
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

  if (!item) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-fg">
        <div className="max-w-md w-full bg-surface p-6 sm:p-8 rounded-xl border border-border shadow-xs text-center space-y-4">
          <EmptyState
            icon={AlertCircle}
            title="Review link not found"
            description="This campaign review could not be loaded. Ask the team for a new link."
          />
        </div>
      </div>
    );
  }

  const assets = item.attachments || [];
  const downloadableAssets: PublicDownloadAsset[] = assets
    .filter((asset) => asset.kind !== 'link' && (asset.download_url || asset.url))
    .map((asset) => ({
      id: asset.id,
      downloadUrl: asset.download_url || `${asset.url}${asset.url.includes('?') ? '&' : '?'}download=1`,
      filename: asset.filename || 'download',
      contentType: asset.content_type,
      sizeBytes: asset.size_bytes,
      kind: asset.kind,
    }));
  const activeAsset = assets[activeAssetIndex];
  const activeDownload = activeAsset
    ? downloadableAssets.find(
        (row) => (activeAsset.id != null && row.id === activeAsset.id) || row.downloadUrl.includes(`/assets/${activeAsset.id}`),
      ) ||
      (activeAsset.kind !== 'link'
        ? {
            id: activeAsset.id,
            downloadUrl:
              activeAsset.download_url ||
              `${activeAsset.url}${activeAsset.url.includes('?') ? '&' : '?'}download=1`,
            filename: activeAsset.filename || 'download',
            contentType: activeAsset.content_type,
            sizeBytes: activeAsset.size_bytes,
            kind: activeAsset.kind,
          }
        : null)
    : null;
  const hookLines = parseHookLines(item.headlines_hooks);

  const getAssetKey = (asset: { id?: string | number; downloadUrl?: string; download_url?: string; url?: string }) => {
    return (asset.id != null ? String(asset.id) : null) || asset.downloadUrl || asset.download_url || asset.url || '';
  };

  const handleDownloadAsset = async (asset: PublicDownloadAsset, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const key = getAssetKey(asset);
    if (!key) return;

    if (inFlightDownloadsRef.current.has(key) || inFlightDownloadAllRef.current || isDownloadingAll) {
      return;
    }
    inFlightDownloadsRef.current.add(key);
    if (isMountedRef.current) {
      setDownloadingKeys((prev) => new Set(prev).add(key));
    }

    try {
      await downloadPublicAsset(asset);

      toast.success('Download started');
      if (isMountedRef.current) {
        setDownloadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setSuccessKeys((prev) => new Set(prev).add(key));
      }

      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          timeoutIdsRef.current.delete(timer);
          resolve();
        }, 2000);
        timeoutIdsRef.current.add(timer);
      });
    } catch (_err) {
      toast.error('Download failed, try again');
    } finally {
      if (isMountedRef.current) {
        setDownloadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setSuccessKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      inFlightDownloadsRef.current.delete(key);
    }
  };

  const handleDownloadAll = async () => {
    if (
      inFlightDownloadAllRef.current ||
      inFlightDownloadsRef.current.size > 0 ||
      isDownloadingAll ||
      downloadableAssets.length < 2 ||
      isMobile
    ) {
      return;
    }
    inFlightDownloadAllRef.current = true;
    setIsDownloadingAll(true);
    setDownloadAllProgress({ current: 1, total: downloadableAssets.length });

    try {
      await downloadAllPublicAssets(
        downloadableAssets,
        400,
        undefined,
        (current, total) => {
          if (isMountedRef.current) {
            setDownloadAllProgress({ current, total });
          }
        },
      );

      toast.success('Download started');
      if (isMountedRef.current) {
        setDownloadAllSuccess(true);
        setDownloadAllProgress(null);
      }

      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          timeoutIdsRef.current.delete(timer);
          resolve();
        }, 2000);
        timeoutIdsRef.current.add(timer);
      });
    } catch (_err) {
      toast.error('Download failed, try again');
    } finally {
      if (isMountedRef.current) {
        setIsDownloadingAll(false);
        setDownloadAllSuccess(false);
        setDownloadAllProgress(null);
      }
      inFlightDownloadAllRef.current = false;
    }
  };

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-canvas text-fg font-sans antialiased">
      {/* Top Navbar 56px per §13.17 */}
      <header className="sticky top-0 z-40 min-h-14 bg-surface border-b border-border px-3 sm:px-8 flex items-center justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BrandMark size={28} initial={((item as any)?.company_name || 'C').charAt(0)} />
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-sm font-semibold text-fg tracking-tight shrink-0">
              {(item as any)?.company_name || (item as any)?.company?.name || 'Client Portal'}
            </span>
            <span className="text-fg-faint shrink-0">•</span>
            <ClientAvatar
              name={item.client_name || 'Client'}
              logoUrl={item.client_logo_url}
              size={32}
              decorative
            />
            <span className="text-xs text-fg-muted truncate">
              {item.client_name || 'Client review'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 max-w-[48%]">
          <span className="text-xs font-numeric font-medium text-fg-muted hidden sm:inline">
            {item.serial}
          </span>
          <StatusPill status={item.stage} className="max-w-full [&_span:last-child]:truncate" />
        </div>
      </header>

      {/* Main Content Area: Centred 960px column per §13.17 */}
      <main
        className={cn(
          'max-w-[960px] mx-auto w-full px-3 sm:px-6 py-5 sm:py-8 space-y-4 sm:space-y-6',
          canDecide
            ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8'
            : 'pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-8',
        )}
      >
        {/* Banner: Action Feedback */}
        {actionSuccess && (
          <div className="p-3 sm:p-4 rounded-lg bg-success-bg border border-success-bd text-success-fg flex items-start sm:items-center gap-3">
            <Check className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1 min-w-0 text-xs font-medium leading-relaxed">{actionSuccess}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* Left Column: Post Details & Deliverables (7 cols) */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6 min-w-0">
            {/* Visual Deliverables Preview Frame (4:5) */}
            {!isContentStage && assets.length > 0 && (
              <div className="bg-surface rounded-xl border border-border p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-xs font-medium text-fg-muted flex items-center gap-2 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="truncate">Creative deliverables ({assets.length})</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {downloadsEnabled && downloadableAssets.length >= 2 && !isMobile && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadAll()}
                        disabled={isDownloadingAll || downloadAllSuccess || downloadingKeys.size > 0}
                        className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-medium bg-surface text-fg border border-border shadow-xs hover:bg-hover focus-visible:focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDownloadingAll && downloadAllProgress ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            <span>Downloading {downloadAllProgress.current} of {downloadAllProgress.total}…</span>
                          </>
                        ) : downloadAllSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-success-fg" aria-hidden="true" />
                            <span>Downloaded ✓</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Download all ({downloadableAssets.length})</span>
                          </>
                        )}
                      </button>
                    )}
                    {item.creative_type && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-subtle text-fg-muted border border-border shrink-0">
                        {item.creative_type}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Media Preview Frame */}
                {activeAsset && (activeAsset.kind === 'video' || activeAsset.kind === 'image') ? (
                  <div
                    className={cn(
                      'relative w-full rounded-lg overflow-hidden bg-black flex items-center justify-center',
                      !isMediaReady && 'min-h-[min(70vh,28rem)]',
                    )}
                  >
                    {!isMediaReady && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                        <div className="w-8 h-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-medium text-white/80">Loading creative…</p>
                      </div>
                    )}
                    {activeAsset.kind === 'video' ? (
                      <video
                        key={activeAsset.url}
                        src={activeAsset.url}
                        controls={isMediaReady}
                        playsInline
                        preload="auto"
                        onCanPlayThrough={() => {
                          readyMediaUrlRef.current = activeAsset.url;
                          setIsMediaReady(true);
                        }}
                        onError={() => setIsMediaReady(true)}
                        className={cn(
                          'w-full h-auto max-h-[70vh] object-contain',
                          !isMediaReady && 'opacity-0',
                        )}
                      />
                    ) : (
                      <img
                        key={activeAsset.url}
                        src={activeAsset.url}
                        alt={activeAsset.filename || 'Creative asset'}
                        onLoad={() => {
                          readyMediaUrlRef.current = activeAsset.url;
                          setIsMediaReady(true);
                        }}
                        onError={() => setIsMediaReady(true)}
                        className={cn(
                          'w-full h-auto max-h-[70vh] object-contain',
                          !isMediaReady && 'opacity-0',
                        )}
                      />
                    )}
                    {downloadsEnabled && activeDownload && (() => {
                      const pillKey = getAssetKey(activeDownload);
                      const isPillDownloading = downloadingKeys.has(pillKey);
                      const isPillSuccess = successKeys.has(pillKey);
                      const isPillDisabled = isDownloadingAll || isPillDownloading || isPillSuccess;

                      return (
                        <button
                          type="button"
                          onClick={(e) => void handleDownloadAsset(activeDownload, e)}
                          disabled={isPillDisabled}
                          aria-label={
                            isPillDownloading
                              ? 'Downloading…'
                              : isPillSuccess
                              ? 'Downloaded ✓'
                              : downloadableAssets.length > 1
                              ? `Download slide ${activeAssetIndex + 1} of ${downloadableAssets.length}`
                              : `Download ${activeDownload.filename}`
                          }
                          className="absolute top-2 right-2 z-20 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-medium bg-surface/95 text-fg border border-border shadow-xs hover:bg-hover focus-visible:focus-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isPillDownloading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              <span>Downloading…</span>
                            </>
                          ) : isPillSuccess ? (
                            <>
                              <Check className="w-4 h-4 text-success-fg" aria-hidden="true" />
                              <span>Downloaded ✓</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" aria-hidden="true" />
                              <span>Download</span>
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                ) : activeAsset ? (
                  <div className="rounded-lg border border-border bg-subtle p-5 sm:p-6 text-center text-fg-muted space-y-3">
                    <FileText className="w-8 h-8 mx-auto text-fg-muted" />
                    <p className="text-xs font-medium text-fg break-all px-1">
                      {activeAsset.filename || 'Attached file'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={activeAsset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 py-2 rounded-md text-xs font-medium bg-surface text-fg border border-border shadow-xs hover:bg-hover transition-colors focus-visible:focus-ring"
                      >
                        <span>Open file</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {downloadsEnabled && activeDownload && (() => {
                        const pillKey = getAssetKey(activeDownload);
                        const isPillDownloading = downloadingKeys.has(pillKey);
                        const isPillSuccess = successKeys.has(pillKey);
                        const isPillDisabled = isDownloadingAll || isPillDownloading || isPillSuccess;

                        return (
                          <button
                            type="button"
                            onClick={(e) => void handleDownloadAsset(activeDownload, e)}
                            disabled={isPillDisabled}
                            aria-label={
                              isPillDownloading
                                ? 'Downloading…'
                                : isPillSuccess
                                ? 'Downloaded ✓'
                                : `Download ${activeDownload.filename}`
                            }
                            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 py-2 rounded-md text-xs font-medium bg-surface text-fg border border-border shadow-xs hover:bg-hover focus-visible:focus-ring disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isPillDownloading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                <span>Downloading…</span>
                              </>
                            ) : isPillSuccess ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-success-fg" aria-hidden="true" />
                                <span>Downloaded ✓</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ) : null}

                {activeDownload && (
                  <div className="space-y-1 px-0.5">
                    <p className="text-xs font-medium text-fg break-all">{activeDownload.filename}</p>
                    <p className="text-[13px] text-fg-muted">
                      {[activeDownload.contentType, formatDownloadSize(activeDownload.sizeBytes)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {isMobile && (
                      <p className="text-[13px] text-fg-muted">
                        If it opens instead of saving, tap Share → Save to Files (iPhone) or long-press → Download (Android).
                      </p>
                    )}
                  </div>
                )}

                {/* Thumbnail Strip */}
                {assets.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                    {assets.map((asset, idx) => (
                      <div
                        key={asset.id || idx}
                        className={cn(
                          'relative w-14 h-14 rounded-md overflow-hidden shrink-0 border',
                          activeAssetIndex === idx
                            ? 'border-accent shadow-[0_0_0_2px_var(--ring)]'
                            : 'border-border opacity-70 hover:opacity-100',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveAssetIndex(idx)}
                          className="absolute inset-0 cursor-pointer"
                          aria-label={asset.filename || `Asset ${idx + 1}`}
                        >
                          {asset.thumbnail_url || asset.kind === 'image' ? (
                            <>
                              <img
                                src={asset.thumbnail_url || asset.url}
                                alt=""
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
                        {downloadsEnabled && asset.kind !== 'link' && (asset.download_url || asset.url) && (() => {
                          const downloadAsset: PublicDownloadAsset = {
                            id: asset.id,
                            downloadUrl:
                              asset.download_url ||
                              `${asset.url}${asset.url.includes('?') ? '&' : '?'}download=1`,
                            filename: asset.filename || 'download',
                            contentType: asset.content_type,
                            sizeBytes: asset.size_bytes,
                            kind: asset.kind,
                          };
                          const badgeKey = getAssetKey(downloadAsset);
                          const isBadgeDownloading = downloadingKeys.has(badgeKey);
                          const isBadgeSuccess = successKeys.has(badgeKey);
                          const isBadgeDisabled = isDownloadingAll || isBadgeDownloading || isBadgeSuccess;

                          const badgeAriaLabel = isBadgeDownloading
                            ? 'Downloading…'
                            : isBadgeSuccess
                            ? 'Downloaded ✓'
                            : downloadableAssets.length > 1
                            ? `Download slide ${idx + 1} of ${downloadableAssets.length}`
                            : `Download ${asset.filename || 'file'}`;

                          return (
                            <button
                              type="button"
                              aria-label={badgeAriaLabel}
                              disabled={isBadgeDisabled}
                              onClick={(e) => void handleDownloadAsset(downloadAsset, e)}
                              className="absolute bottom-0 right-0 z-10 w-[44px] h-[44px] flex items-end justify-end p-1 cursor-pointer disabled:cursor-not-allowed group/dl-badge focus:outline-none"
                            >
                              <span
                                className={cn(
                                  'inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface/95 text-fg border border-border shadow-xs group-hover/dl-badge:bg-hover group-focus-visible/dl-badge:focus-ring',
                                  isBadgeDisabled && 'opacity-60',
                                )}
                              >
                                {isBadgeDownloading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                ) : isBadgeSuccess ? (
                                  <Check className="w-3 h-3 text-success-fg" aria-hidden="true" />
                                ) : (
                                  <Download className="w-3 h-3" aria-hidden="true" />
                                )}
                              </span>
                            </button>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ad Copy & Strategy Card */}
            <div className="bg-surface rounded-xl border border-border p-4 sm:p-7 space-y-4 sm:space-y-5 shadow-xs">
              <div className="space-y-1 min-w-0">
                <span className="text-xs font-numeric font-medium text-fg-muted">
                  {item.serial}
                </span>
                <h2 className="text-base font-semibold text-fg break-words">
                  {item.content_concept}
                </h2>
              </div>

              {/* Primary Text (Ad Copy / Caption) */}
              <div className="space-y-1.5 pt-3 border-t border-border">
                <span className="text-xs font-medium text-fg-muted block">
                  Ad copy / Caption
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-fg py-1">
                  {item.primary_text || (item as any).post_copy || (
                    <span className="text-fg-faint italic">No copy written yet.</span>
                  )}
                </p>
              </div>

              {/* Angles & Hooks */}
              {hookLines.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-border">
                  <span className="text-xs font-medium text-fg-muted block">
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
                  <span className="text-xs font-medium text-fg-muted block">
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
                      <span className="text-xs font-medium text-fg-muted block">
                        Promotional offer
                      </span>
                      <p className="text-sm font-semibold text-fg">{item.offer}</p>
                    </div>
                  )}
                  {item.cta && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-fg-muted block">
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
          <div className="lg:col-span-5 space-y-4 sm:space-y-6 lg:sticky lg:top-20 min-w-0">
            {/* Approval Decision Card */}
            <div
              ref={approvalCardRef}
              className="bg-surface rounded-xl border border-border p-4 sm:p-6 space-y-4 shadow-xs scroll-mt-20"
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold text-accent-text">
                  Client review
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-fg">
                  {isPendingReview ? 'Review & decision' : 'Campaign status'}
                </h3>
              </div>

              {/* Current Status */}
              <div className="py-2 px-3 rounded-md bg-subtle border border-border flex items-center justify-between gap-2 text-xs min-w-0">
                <span className="text-fg-muted shrink-0">Current stage:</span>
                <StatusPill status={item.stage} className="max-w-[60%] [&_span:last-child]:truncate" />
              </div>

              {downloadOnly && (
                <div className="p-3 rounded-md bg-success-bg border border-success-bd text-success-fg text-xs flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Approved: you can still download the files</span>
                </div>
              )}

              {item.publish_date && (
                <div className="flex items-center gap-2 text-xs text-fg-muted px-0.5">
                  <Clock className="w-3.5 h-3.5 text-fg-faint" />
                  <span>Scheduled date: <strong className="text-fg font-medium">{item.publish_date}</strong></span>
                </div>
              )}

              {/* Review Decision Controls */}
              {canDecide ? (
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
                      className="min-h-11 md:min-h-8"
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
                      className="min-h-11 md:min-h-8"
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
                        size="md"
                        block
                        className="min-h-11 md:min-h-8"
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
            <div className="p-4 sm:p-5 rounded-xl bg-surface border border-border text-xs space-y-2.5 shadow-xs">
              <span className="text-xs font-medium text-fg-muted block">
                Campaign details
              </span>
              <dl className="space-y-0">
                {[
                  ['Campaign type', item.campaign_type || '—'],
                  ['Content pillar', item.content_pillar || '—'],
                  ['Target audience', 'Public social'],
                  ['Format', item.creative_type || 'Post'],
                ].map(([label, value], idx, list) => (
                  <div
                    key={label}
                    className={cn(
                      'flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-start py-2',
                      idx < list.length - 1 && 'border-b border-border',
                    )}
                  >
                    <dt className="text-fg-muted shrink-0">{label}</dt>
                    <dd className="font-medium text-fg break-words sm:text-right sm:max-w-[60%]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Action Bar at 375px (< 768px) per §13.17 */}
      {canDecide && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur-sm border-t border-border flex items-stretch gap-2 z-40 shadow-lg">
          <Button
            variant="outline"
            size="md"
            block
            className="min-h-11"
            disabled={isSubmitting}
            onClick={openRevisionForm}
            icon={MessageSquare}
          >
            Request changes
          </Button>
          <Button
            variant="primary"
            size="md"
            block
            className="min-h-11"
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
