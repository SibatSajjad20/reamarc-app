import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  UploadCloud,
  FileText,
  Film,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Maximize2,
  X,
  Eye,
  AlertCircle,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Link2,
  Play,
  Globe,
  ChevronDown,
  MoreVertical,
} from 'lucide-react';
import type { CreativeAsset, ContentCalendarItem, AssetRole, DrivePickedFile } from '../../types/contentCalendar';
import { Button } from '../ui/button';
import { CustomSelect } from '../ui/CustomSelect';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { FormDialog, FormDialogHeader, FormDialogBody } from '../ui/FormDialogLayout';
import { FormFooter } from '../ui/FormFooter';
import { contentCalendarService } from '../../services/contentCalendarService';
import { DriveAttach, type DriveAttachRef, GoogleDriveIcon } from '../ui/DriveAttach';
import { useToast } from '../../context/ToastContext';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { openFileAttachment, getBackendFileUrl, getThumbUrl, getVideoStillUrl, isRealThumbnailUrl, fallbackToOriginal } from '../../utils/fileUrl';
import { cn } from '../../lib/utils';
import { downloadAssetDirect, downloadAllAssets } from '../../utils/directDownload';
import VideoPosterPicker from './VideoPosterPicker';

interface CreativeAssetGalleryProps {
  itemId: string;
  attachments?: CreativeAsset[];
  readOnly?: boolean;
  onAssetsUpdated?: (updatedItem: ContentCalendarItem) => void;
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
  compact?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getRoleLabel(role: AssetRole | string): string {
  switch (role) {
    case 'carousel_slide':
      return 'Carousel Slide';
    case 'reference':
      return 'Reference / Brief';
    case 'copy_doc':
      return 'Copy / Blog Doc';
    case 'script':
      return 'Video Script';
    case 'primary':
    default:
      return 'Primary Deliverable';
  }
}

function getKindChipLabel(asset: CreativeAsset): string {
  const kind =
    asset.kind === 'video' ? 'Video' : asset.kind === 'image' ? 'Image' : asset.kind === 'link' ? 'Link' : 'Document';
  if (asset.kind === 'link') return kind;
  const m = /\.([a-z0-9]{1,5})$/i.exec((asset.filename || '').split(/[?#]/)[0]);
  return m ? `${kind} · ${m[1].toUpperCase()}` : kind;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const AssetKindIcon: React.FC<{ kind: CreativeAsset['kind']; className?: string }> = ({ kind, className }) => {
  if (kind === 'video') return <Film className={className} />;
  if (kind === 'image') return <ImageIcon className={className} />;
  if (kind === 'link') return <Link2 className={className} />;
  return <FileText className={className} />;
};

/** Quiet ghost icon button with an accessible label and tooltip (works for keyboard + touch). */
const FooterAction: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({
  label,
  onClick,
  children,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

/* ---------- Fast switching between assets ---------- */

/** Preview URLs this tab has already loaded and decoded (instant on revisit). */
const loadedPreviewSrcs = new Set<string>();
/** Previews whose /thumbs version failed; go straight to the original next time. */
const failedPreviewSrcs = new Set<string>();
/** Keeps preloading Image objects alive until they finish. */
const pendingPreloads = new Map<string, HTMLImageElement>();

function originalSrc(asset: CreativeAsset): string {
  return getBackendFileUrl(asset.url) || asset.url;
}

/** What the drawer preview shows: a cached 800px WebP for images, the original only as a fallback. */
export function previewSrcFor(asset: CreativeAsset): string {
  const thumb = getThumbUrl(asset.url, 800);
  if (thumb && !failedPreviewSrcs.has(thumb)) return thumb;
  return originalSrc(asset);
}

function posterSrcFor(asset: CreativeAsset): string {
  return isRealThumbnailUrl(asset.thumbnail_url)
    ? getBackendFileUrl(asset.thumbnail_url!) || asset.thumbnail_url!
    : getVideoStillUrl(asset.url, 800);
}

/** Low-priority background fetch + decode of a still image (never a video file). */
function preloadStill(src: string): void {
  if (!src || loadedPreviewSrcs.has(src) || pendingPreloads.has(src) || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  try {
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
  } catch {
    /* older browsers */
  }
  pendingPreloads.set(src, img);
  img.onload = () => {
    loadedPreviewSrcs.add(src);
    pendingPreloads.delete(src);
  };
  img.onerror = () => {
    pendingPreloads.delete(src);
  };
  img.src = src;
}

/** Test helper: forget what this tab has loaded. */
export function __resetAssetPreviewCache(): void {
  loadedPreviewSrcs.clear();
  failedPreviewSrcs.clear();
  pendingPreloads.clear();
}

const ImageStage: React.FC<{ asset: CreativeAsset; onOpen: () => void; onDisplayed: (assetId: string) => void }> = ({
  asset,
  onOpen,
  onDisplayed,
}) => {
  const original = originalSrc(asset);
  const [src] = useState(() => previewSrcFor(asset));
  const [loaded, setLoaded] = useState(() => loadedPreviewSrcs.has(src));
  const imgRef = useRef<HTMLImageElement>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Browser cache hit: the image may already be complete before React attaches onLoad.
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!loaded && el && el.complete && el.naturalWidth > 0) {
      loadedPreviewSrcs.add(src);
      setLoaded(true);
    }
  }, [loaded, src]);

  useEffect(() => {
    if (loaded) onDisplayed(asset.id);
  }, [loaded, asset.id, onDisplayed]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!aliveRef.current) return; // late load from an asset that is no longer shown
    const shown = e.currentTarget.getAttribute('src') || src;
    loadedPreviewSrcs.add(shown);
    if (shown !== src) loadedPreviewSrcs.add(src);
    setLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (src !== original) failedPreviewSrcs.add(src);
    fallbackToOriginal(original)(e);
  };

  return (
    <button
      type="button"
      className="absolute inset-0 w-full h-full cursor-zoom-in"
      onClick={onOpen}
      aria-label={`View ${asset.filename} full screen`}
      aria-busy={!loaded}
    >
      {loaded && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 select-none"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={asset.filename}
        data-testid="asset-preview-image"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={cn('relative w-full h-full object-contain select-none transition-opacity duration-150', loaded ? 'opacity-100' : 'opacity-0')}
      />
      {!loaded && (
        <div
          data-testid="asset-preview-loading"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900 animate-pulse"
        >
          <Loader2 className="w-6 h-6 animate-spin text-white/70" aria-hidden="true" />
          <span className="px-2 py-px rounded-full bg-white/10 text-white/80 text-caption font-semibold">
            {getKindChipLabel(asset)}
          </span>
          <span className="sr-only">Loading preview</span>
        </div>
      )}
    </button>
  );
};

/**
 * Video stage: poster frame fills the stage; nothing is fetched from the video
 * file until the user presses play (preload="none" is kept).
 */
const VideoStage: React.FC<{ asset: CreativeAsset }> = ({ asset }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const src = getBackendFileUrl(asset.url) || asset.url;
  const poster = posterSrcFor(asset) || undefined;
  const duration = asset.duration_seconds && asset.duration_seconds > 0 ? asset.duration_seconds : null;

  const start = () => {
    setStarted(true);
    const v = videoRef.current;
    if (v) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  };

  return (
    <div className="absolute inset-0">
      {poster && !started && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 select-none pointer-events-none"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      )}
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={poster}
        controls={started}
        playsInline
        preload="none"
        data-active-video="true"
        className="relative w-full h-full object-contain"
      >
        Your browser does not support HTML5 video streaming.
      </video>
      {!started && (
        <>
          <button
            type="button"
            onClick={start}
            aria-label={`Play ${asset.filename}`}
            className="absolute inset-0 flex items-center justify-center cursor-pointer focus-visible:outline-none group/play"
          >
            <span className="w-16 h-16 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition-transform group-hover/play:scale-105 group-focus-visible/play:ring-4 group-focus-visible/play:ring-accent/60">
              <Play className="w-6 h-6 ml-1 fill-accent text-accent" />
            </span>
          </button>
          {duration !== null && (
            <span className="absolute right-3 bottom-3 px-2 py-0.5 rounded-md bg-black/70 text-white text-caption font-semibold tabular-nums pointer-events-none">
              {formatDuration(duration)}
            </span>
          )}
        </>
      )}
    </div>
  );
};

export const CreativeAssetGallery: React.FC<CreativeAssetGalleryProps> = ({
  itemId,
  attachments = [],
  readOnly = false,
  onAssetsUpdated,
  onUploadingChange,
  className = '',
  compact = false,
}) => {
  const { addToast } = useToast();
  const [posterAsset, setPosterAsset] = useState<CreativeAsset | null>(null);
  const [localAssets, setLocalAssets] = useState<CreativeAsset[]>(() =>
    [...attachments].sort((a, b) => a.order - b.order)
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [rawSelectedIndex, setRawSelectedIndex] = useState<number>(0);
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  const isReorderingRef = useRef(false);

  useEffect(() => {
    setLocalAssets([...attachments].sort((a, b) => a.order - b.order));
  }, [attachments]);

  const assets = localAssets;

  const selectedIndex = useMemo(() => {
    if (selectedAssetId) {
      const idx = assets.findIndex((a) => a.id === selectedAssetId);
      if (idx !== -1) return idx;
    }
    return Math.min(Math.max(0, rawSelectedIndex), Math.max(0, assets.length - 1));
  }, [assets, selectedAssetId, rawSelectedIndex]);

  const setSelectedIndex = useCallback((indexOrUpdater: number | ((prev: number) => number)) => {
    setRawSelectedIndex((prev) => {
      const newIdx = typeof indexOrUpdater === 'function' ? indexOrUpdater(prev) : indexOrUpdater;
      const target = assets[newIdx];
      if (target) {
        setSelectedAssetId(target.id);
      }
      return newIdx;
    });
  }, [assets]);

  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  const [uploadProgressText, setUploadProgressText] = useState('');
  const [uploadRole, setUploadRole] = useState<AssetRole>('primary');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<CreativeAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isOpeningPicker] = useState(false);

  // Add Link Modal State
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkRole, setLinkRole] = useState<AssetRole>('primary');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const driveAttachRef = useRef<DriveAttachRef>(null);

  const activeAsset: CreativeAsset | undefined = assets[selectedIndex] || assets[0];

  // After the shown asset is on screen, quietly fetch its neighbours' previews (never video files).
  const handleActiveDisplayed = useCallback(
    (assetId: string) => {
      const idx = assets.findIndex((a) => a.id === assetId);
      if (idx === -1 || assets.length < 2) return;
      const neighbours = [assets[(idx + 1) % assets.length], assets[(idx - 1 + assets.length) % assets.length]];
      for (const n of neighbours) {
        if (!n || n.id === assetId) continue;
        if (n.kind === 'image') preloadStill(previewSrcFor(n));
        else if (n.kind === 'video') preloadStill(posterSrcFor(n));
      }
    },
    [assets],
  );

  useEffect(() => {
    // Videos never download until Play, so their neighbours can be prefetched right away.
    if (activeAsset && activeAsset.kind !== 'image') handleActiveDisplayed(activeAsset.id);
  }, [activeAsset, handleActiveDisplayed]);

  const imageCount = assets.filter((a) => a.kind === 'image').length;
  const videoCount = assets.filter((a) => a.kind === 'video').length;
  const linkCount = assets.filter((a) => a.kind === 'link').length;
  const docCount = assets.filter((a) => a.kind === 'document').length;
  const downloadableCount = assets.filter((a) => a.kind !== 'link' && a.url).length;
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const handleDownloadAll = async () => {
    if (bulkProgress) return;
    setBulkProgress({ done: 0, total: downloadableCount });
    try {
      const { downloaded, skipped } = await downloadAllAssets(assets, {
        onProgress: (done, total) => setBulkProgress({ done, total }),
      });
      if (skipped.length) {
        addToast(
          'Some files skipped',
          `Downloaded ${downloaded}. ${skipped.length} large file${skipped.length > 1 ? 's' : ''} not in Google Drive ${skipped.length > 1 ? 'were' : 'was'} skipped: download ${skipped.length > 1 ? 'them' : 'it'} one at a time.`,
          'info',
        );
      } else if (downloaded) {
        addToast('Download started', `${downloaded} file${downloaded > 1 ? 's' : ''}`, 'success');
      }
    } catch {
      addToast('Download failed', 'Try again.', 'error');
    } finally {
      setBulkProgress(null);
    }
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
      if (e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setSelectedIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, assets.length]);

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    // Check individual file sizes
    for (const f of rawFiles) {
      const isVideo = f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
      const maxSize = isVideo ? 100 * 1024 * 1024 : 50 * 1024 * 1024; // must match backend MAX_VIDEO_SIZE / MAX_IMAGE_DOC_SIZE
      if (f.size > maxSize) {
        addToast(
          'File too large',
          `"${f.name}" exceeds the maximum allowed size of ${isVideo ? '100MB' : '50MB'}.`,
          'error',
        );
        return;
      }
    }

    setIsUploading(true);
    setUploadProgressText(`Uploading ${rawFiles.length} file${rawFiles.length > 1 ? 's' : ''}...`);

    try {
      // Determine role: if multi-images and uploadRole is primary, suggest carousel_slide
      const effectiveRole =
        rawFiles.length > 1 && uploadRole === 'primary' ? 'carousel_slide' : uploadRole;

      const updatedItem = await contentCalendarService.uploadAssets(
        itemId,
        rawFiles,
        effectiveRole,
      );

      addToast(
        'Upload Successful',
        `${rawFiles.length} asset${rawFiles.length > 1 ? 's' : ''} uploaded and linked.`,
        'success',
      );

      if (onAssetsUpdated) {
        onAssetsUpdated(updatedItem);
      }
      // Select the newly added asset (last item)
      if (updatedItem.attachments && updatedItem.attachments.length > 0) {
        setSelectedIndex(updatedItem.attachments.length - 1);
      }
      // One new video: offer to pick its thumbnail. Skippable; can be set later from the asset menu.
      const before = new Set(assets.map((a) => a.id));
      const newVideos = (updatedItem.attachments || []).filter((a) => a.kind === 'video' && !before.has(a.id));
      if (newVideos.length === 1) setPosterAsset(newVideos[0]);
    } catch (err: any) {
      addToast('Upload failed', err.message || 'Could not upload files. Try again.', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePickedFromDrive = async (pickedFiles: DrivePickedFile[]) => {
    setIsUploading(true);
    setUploadProgressText(
      `Attaching ${pickedFiles.length} file${pickedFiles.length > 1 ? 's' : ''} from Google Drive...`
    );
    try {
      const effectiveRole =
        pickedFiles.length > 1 && uploadRole === 'primary' ? 'carousel_slide' : uploadRole;

      const updatedItem = await contentCalendarService.attachDriveAssets(
        itemId,
        pickedFiles,
        effectiveRole
      );

      if (onAssetsUpdated) {
        onAssetsUpdated(updatedItem);
      }
      if (updatedItem.attachments && updatedItem.attachments.length > 0) {
        setSelectedIndex(updatedItem.attachments.length - 1);
      }
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  const handleOpenGoogleDrivePicker = async () => {
    if (isUploading || isOpeningPicker) return;
    await driveAttachRef.current?.openPicker();
  };

  const handleSavePoster = async (image: Blob) => {
    if (!posterAsset) return;
    const updated = await contentCalendarService.setAssetPoster(itemId, posterAsset.id, image);
    addToast('Thumbnail updated', 'Cards and link previews now use it.', 'success');
    onAssetsUpdated?.(updated);
  };

  const handleDeleteConfirmed = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    try {
      const updated = await contentCalendarService.deleteAsset(itemId, assetToDelete.id);
      addToast('Asset deleted', `"${assetToDelete.filename}" was removed.`, 'info');
      setAssetToDelete(null);
      if (onAssetsUpdated) {
        onAssetsUpdated(updated);
      }
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      addToast('Deletion failed', err.message || 'Could not remove asset.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const performReorder = async (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= assets.length ||
      toIndex >= assets.length
    ) {
      return;
    }

    const currentActiveId = activeAsset?.id;
    const newOrder = [...assets];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    const updatedWithOrder = newOrder.map((a, i) => ({ ...a, order: i + 1 }));

    // Instant optimistic update
    setLocalAssets(updatedWithOrder);
    if (currentActiveId) {
      setSelectedAssetId(currentActiveId);
    }

    const assetIds = updatedWithOrder.map((a) => a.id);
    try {
      isReorderingRef.current = true;
      const updated = await contentCalendarService.reorderAssets(itemId, assetIds);
      if (onAssetsUpdated) {
        onAssetsUpdated(updated);
      }
    } catch (err: any) {
      setLocalAssets([...attachments].sort((a, b) => a.order - b.order));
      addToast('Reorder failed', err.message || 'Could not reorder slides.', 'error');
    } finally {
      isReorderingRef.current = false;
    }
  };

  const handleMoveSlide = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    await performReorder(index, targetIndex);
  };

  const handleSlideDragStart = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    setDraggedSlideIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSlideDragOver = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlideIndex !== index) {
      setDragOverSlideIndex(index);
    }
  };

  const handleSlideDrop = (e: React.DragEvent, targetIndex: number) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOverSlideIndex(null);
    if (draggedSlideIndex !== null && draggedSlideIndex !== targetIndex) {
      void performReorder(draggedSlideIndex, targetIndex);
    }
    setDraggedSlideIndex(null);
  };

  const handleSlideDragEnd = () => {
    setDraggedSlideIndex(null);
    setDragOverSlideIndex(null);
  };

  const copyAssetUrl = (url: string, id: string) => {
    const fullUrl = safeHttpUrl(url) || `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    addToast('Link copied', 'Asset URL copied to clipboard.', 'success');
  };

  const handleAddLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    const clean = linkUrl.trim();
    if (!clean) {
      setLinkError('Please provide a valid web URL.');
      if (linkInputRef.current) linkInputRef.current.focus();
      return;
    }
    if (!safeHttpUrl(clean)) {
      setLinkError('Link must start with http:// or https://');
      if (linkInputRef.current) linkInputRef.current.focus();
      return;
    }
    setIsSubmittingLink(true);
    try {
      const updated = await contentCalendarService.addLinkAsset(itemId, {
        url: clean,
        title: linkTitle.trim() || clean,
        role: linkRole,
      });
      addToast('Link added', 'Deliverable link successfully attached.', 'success');
      if (onAssetsUpdated) {
        onAssetsUpdated(updated);
      }
      setIsAddLinkOpen(false);
      setLinkUrl('');
      setLinkTitle('');
      setLinkError(null);
      if (updated.attachments && updated.attachments.length > 0) {
        setSelectedIndex(updated.attachments.length - 1);
      }
    } catch (err: any) {
      setLinkError(err?.message || 'Could not attach link.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) setIsDraggingOver(true);
  }, [readOnly]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      if (readOnly) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleFilesUpload(e.dataTransfer.files);
      }
    },
    [readOnly],
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Gallery Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-accent-text" />
            <span>Creative Assets</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-caption font-semibold bg-subtle text-fg border border-border">
            Total: {assets.length}
          </span>
          {imageCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-caption font-medium bg-subtle text-fg-muted border border-border flex items-center gap-1">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>{imageCount} {imageCount === 1 ? 'image' : 'images'}</span>
            </span>
          )}
          {videoCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-caption font-medium bg-subtle text-fg-muted border border-border flex items-center gap-1">
              <Film className="w-2.5 h-2.5" />
              <span>{videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>
            </span>
          )}
          {linkCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-caption font-medium bg-subtle text-fg-muted border border-border flex items-center gap-1">
              <Link2 className="w-2.5 h-2.5" />
              <span>{linkCount} {linkCount === 1 ? 'link' : 'links'}</span>
            </span>
          )}
          {docCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-caption font-medium bg-subtle text-fg-muted border border-border flex items-center gap-1">
              <FileText className="w-2.5 h-2.5" />
              <span>{docCount} {docCount === 1 ? 'doc' : 'docs'}</span>
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <div className="w-44">
              <CustomSelect
                value={uploadRole}
                onChange={(val) => setUploadRole(val as AssetRole)}
                options={[
                  { value: 'primary', label: 'Primary Deliverable' },
                  { value: 'carousel_slide', label: 'Carousel Slide' },
                  { value: 'reference', label: 'Reference / Brief' },
                  { value: 'copy_doc', label: 'Blog / Copy Doc' },
                  { value: 'script', label: 'Video Script' },
                ]}
                size="sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddLinkOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-subtle hover:bg-hover text-fg transition cursor-pointer border border-border"
              title="Add deliverable link (Figma, Canva, Drive, Loom, etc.)"
            >
              <Link2 className="w-3.5 h-3.5 text-accent-text" />
              <span>Add Link</span>
            </button>

            {/* Upload Button Group: Primary Google Drive, Secondary Local Device Fallback */}
            <div className="relative inline-flex h-7 items-stretch overflow-hidden rounded-md shadow-xs">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => void handleOpenGoogleDrivePicker()}
                loading={isUploading || isOpeningPicker}
                loadingText="Uploading…"
                icon={GoogleDriveIcon}
                className="h-7 rounded-none shadow-none"
                title="Insert files using Google Drive (Recent, Upload, My Drive, Starred)"
              >
                Upload
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isUploading || isOpeningPicker}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center bg-accent text-accent-fg hover:bg-accent-hover transition-colors border-l border-white/20 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    title="More upload options"
                    aria-label="More upload options"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => void handleOpenGoogleDrivePicker()}>
                    <GoogleDriveIcon className="w-3.5 h-3.5 mr-2" />
                    <span>Google Drive Dialog</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <UploadCloud className="w-3.5 h-3.5 mr-2 text-fg-muted" />
                    <span>Direct Device Upload</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFilesUpload(e.target.files);
              }}
            />
          </div>
        )}
      </div>

      {/* Main Asset Viewer Stage */}
      {assets.length > 0 && activeAsset ? (
        <div
          className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs"
          data-testid="asset-preview-card"
        >
          {/* Media area: poster/frame fills the stage edge-to-edge */}
          <div
            className={cn(
              'relative group overflow-hidden',
              activeAsset.kind === 'image' || activeAsset.kind === 'video'
                ? cn('bg-black', compact ? 'h-[260px] sm:h-[300px]' : 'h-[260px] sm:h-[380px]')
                : 'bg-subtle',
            )}
          >
            {activeAsset.kind === 'image' ? (
              <ImageStage
                key={activeAsset.id}
                asset={activeAsset}
                onOpen={() => setIsLightboxOpen(true)}
                onDisplayed={handleActiveDisplayed}
              />
            ) : activeAsset.kind === 'video' ? (
              <VideoStage key={activeAsset.id} asset={activeAsset} />
            ) : activeAsset.kind === 'link' ? (
              /* Link Presentation */
              <div className="w-full py-10 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-xl bg-surface text-accent-text border border-border">
                  <Globe className="w-10 h-10" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h4 className="text-sm font-semibold text-fg break-all">
                    {activeAsset.filename}
                  </h4>
                  <a
                    href={safeHttpUrl(activeAsset.url) || undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-accent-text hover:underline break-all inline-flex items-center gap-1"
                  >
                    <span>{activeAsset.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href={safeHttpUrl(activeAsset.url) || undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyAssetUrl(activeAsset.url, activeAsset.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-hover text-fg transition border border-border cursor-pointer"
                  >
                    {copiedId === activeAsset.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy URL</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Document Card Presentation */
              <div className="w-full py-10 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-xl bg-surface text-accent-text border border-border">
                  <FileText className="w-10 h-10" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h4 className="text-sm font-semibold text-fg break-all">
                    {activeAsset.filename}
                  </h4>
                  <p className="text-xs text-fg-muted">
                    Document deliverable • {formatBytes(activeAsset.size_bytes)}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void openFileAttachment(activeAsset.url, activeAsset.filename)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-hover text-fg transition border border-border cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadAssetDirect(activeAsset)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            )}

            {/* Prev / Next + "N of M" for multi-assets (always visible on touch, hover on desktop) */}
            {assets.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1))
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 text-[#17151F] shadow-md flex items-center justify-center cursor-pointer transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                  title="Previous Asset"
                  aria-label="Previous asset"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 text-[#17151F] shadow-md flex items-center justify-center cursor-pointer transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                  title="Next Asset"
                  aria-label="Next asset"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-caption font-semibold tracking-wide pointer-events-none">
                  {selectedIndex + 1} of {assets.length}
                </div>
              </>
            )}
          </div>

          {/* Footer: file identity + quiet actions */}
          <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-t border-border">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-accent-soft text-accent-text flex items-center justify-center" aria-hidden="true">
              <AssetKindIcon kind={activeAsset.kind} className="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg truncate" title={activeAsset.filename}>
                {activeAsset.filename}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-caption text-fg-muted min-w-0">
                <span className="px-2 py-px rounded-full bg-accent-soft text-accent-text font-semibold shrink-0">
                  {getKindChipLabel(activeAsset)}
                </span>
                <span className="truncate">
                  {formatBytes(activeAsset.size_bytes)}
                  {activeAsset.width && activeAsset.height ? ` · ${activeAsset.width}×${activeAsset.height}` : ''}
                </span>
              </div>
            </div>

            <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-0.5 shrink-0">
              <FooterAction
                label={copiedId === activeAsset.id ? 'Copied' : 'Copy asset link'}
                onClick={() => copyAssetUrl(activeAsset.url, activeAsset.id)}
              >
                {copiedId === activeAsset.id ? (
                  <Check className="w-[18px] h-[18px] text-emerald-500" />
                ) : (
                  <Link2 className="w-[18px] h-[18px]" />
                )}
              </FooterAction>
              <FooterAction
                label="Open in new tab"
                onClick={() => void openFileAttachment(activeAsset.url, activeAsset.filename)}
              >
                <ExternalLink className="w-[18px] h-[18px]" />
              </FooterAction>
              <FooterAction
                label="Download"
                onClick={() => void downloadAssetDirect(activeAsset)}
              >
                <Download className="w-[18px] h-[18px]" />
              </FooterAction>

              {(activeAsset.kind === 'image' || !readOnly) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover data-[state=open]:bg-hover data-[state=open]:text-fg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label="More asset actions"
                      title="More"
                    >
                      <MoreVertical className="w-[18px] h-[18px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {activeAsset.kind === 'image' && (
                      <DropdownMenuItem onClick={() => setIsLightboxOpen(true)}>
                        <Maximize2 className="w-3.5 h-3.5 mr-2 text-fg-muted" />
                        <span>View full screen</span>
                      </DropdownMenuItem>
                    )}
                    {!readOnly && activeAsset.kind === 'video' && (
                      <DropdownMenuItem onClick={() => setPosterAsset(activeAsset)}>
                        <ImageIcon className="w-3.5 h-3.5 mr-2 text-fg-muted" />
                        <span>Set thumbnail</span>
                      </DropdownMenuItem>
                    )}
                    {!readOnly && (
                      <DropdownMenuItem
                        onClick={() => setAssetToDelete(activeAsset)}
                        className="text-danger-fg focus:text-danger-fg"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        <span>Delete asset</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            </TooltipProvider>
          </div>
        </div>
      ) : null}

      {/* Thumbnail Navigation Strip & Reordering */}
      {assets.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>
              Carousel & Deliverable Slides ({assets.length})
            </span>
            <span className="flex items-center gap-3">
              {!readOnly && (
                <span className="text-caption text-fg-muted">
                  Use arrows to reorder slide sequence
                </span>
              )}
              {downloadableCount > 1 && (
                <button
                  type="button"
                  onClick={() => void handleDownloadAll()}
                  disabled={bulkProgress !== null}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-hover disabled:opacity-60 cursor-pointer"
                  aria-label="Download all files"
                >
                  <Download className="w-3.5 h-3.5" />
                  {bulkProgress ? `Downloading ${bulkProgress.done}/${bulkProgress.total}` : `Download all (${downloadableCount})`}
                </button>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
            {assets.map((asset, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={asset.id}
                  draggable={!readOnly}
                  onDragStart={(e) => handleSlideDragStart(e, idx)}
                  onDragOver={(e) => handleSlideDragOver(e, idx)}
                  onDrop={(e) => handleSlideDrop(e, idx)}
                  onDragEnd={handleSlideDragEnd}
                  className={`relative group shrink-0 rounded-md overflow-hidden border transition-all duration-200 cursor-pointer select-none ${
                    draggedSlideIndex === idx
                      ? 'opacity-40 scale-95 border-accent ring-2 ring-accent/40'
                      : dragOverSlideIndex === idx
                      ? 'scale-105 border-accent ring-2 ring-accent shadow-md'
                      : isSelected
                      ? 'border-accent ring-2 ring-accent/40 shadow-xs'
                      : 'border-border opacity-80 hover:opacity-100 hover:border-border-strong'
                  }`}
                  onClick={() => {
                    setSelectedIndex(idx);
                    setSelectedAssetId(asset.id);
                  }}
                >
                  <div className="w-24 h-24 bg-subtle flex items-center justify-center overflow-hidden">
                    {asset.kind === 'image' ? (
                      <img
                        src={getThumbUrl(asset.thumbnail_url || asset.url, 200) || getBackendFileUrl(asset.thumbnail_url || asset.url) || asset.thumbnail_url || asset.url}
                        alt={asset.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.opacity = '0.5';
                        }}
                      />
                    ) : asset.kind === 'video' ? (
                      <div className="relative w-full h-full bg-canvas flex items-center justify-center">
                        {isRealThumbnailUrl(asset.thumbnail_url) || getVideoStillUrl(asset.url, 200) ? (
                          <img
                            src={
                              isRealThumbnailUrl(asset.thumbnail_url)
                                ? getThumbUrl(asset.thumbnail_url!, 200) || getBackendFileUrl(asset.thumbnail_url!) || asset.thumbnail_url!
                                : getVideoStillUrl(asset.url, 200)
                            }
                            alt={asset.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-black flex items-center justify-center" />
                        )}
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                          <Play className="w-4 h-4 fill-white text-white drop-shadow-xs" />
                        </div>
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/75 text-white text-micro font-semibold">
                          Video
                        </span>
                      </div>
                    ) : asset.kind === 'link' ? (
                      <div className="flex flex-col items-center justify-center text-fg-muted p-1 w-full h-full bg-subtle">
                        <Link2 className="w-5 h-5 text-accent" />
                        <span className="text-caption font-semibold mt-0.5 text-center truncate max-w-[80px]">
                          {asset.filename || 'Link'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-fg-muted">
                        <FileText className="w-5 h-5 text-accent" />
                        <span className="text-caption font-semibold mt-0.5">Doc</span>
                      </div>
                    )}
                  </div>

                  {/* Slide index number tag */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded-md text-caption font-semibold bg-overlay text-white pointer-events-none">
                    {idx + 1}
                  </span>

                  {/* Non-intrusive reorder controls on hover */}
                  {!readOnly && assets.length > 1 && (
                    <div className="absolute inset-x-0 bottom-0 h-6 bg-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-between px-1 z-10">
                      {idx > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleMoveSlide(idx, 'left');
                          }}
                          className="p-0.5 rounded text-white/90 hover:text-white hover:bg-white/20 transition cursor-pointer"
                          title="Move Left"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      ) : <span className="w-3.5" />}

                      <span className="text-micro font-medium text-white/70 select-none">
                        drag
                      </span>

                      {idx < assets.length - 1 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleMoveSlide(idx, 'right');
                          }}
                          className="p-0.5 rounded text-white/90 hover:text-white hover:bg-white/20 transition cursor-pointer"
                          title="Move Right"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : <span className="w-3.5" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drag & Drop Upload Zone (when allowed and either empty or additional assets) */}
      {!readOnly && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => void handleOpenGoogleDrivePicker()}
          className={`rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            isDraggingOver
              ? 'border-accent bg-accent-soft/30'
              : 'border-border-strong hover:border-accent hover:bg-subtle/50 bg-subtle/30'
          }`}
        >
          <div className="p-2.5 rounded-lg bg-surface text-fg border border-border mb-2 shadow-xs">
            {isUploading || isOpeningPicker ? (
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            ) : (
              <GoogleDriveIcon className="w-5 h-5" />
            )}
          </div>
          <p className="text-xs font-semibold text-fg">
            {isUploading || isOpeningPicker
              ? uploadProgressText || 'Opening Google Drive...'
              : isDraggingOver
              ? 'Drop creative assets here'
              : 'Insert files using Google Drive or drop files here'}
          </p>
          <p className="text-xs text-fg-muted mt-0.5">
            Google Drive (Recent, Upload, My Drive, Starred) • Videos up to 250MB • Images & Docs up to 50MB
          </p>
        </div>
      )}

      {/* Empty State when readOnly and no assets */}
      {readOnly && assets.length === 0 && (
        <div className="p-6 rounded-lg border border-dashed border-border bg-subtle/30 text-center space-y-1">
          <ImageIcon className="w-8 h-8 text-fg-muted mx-auto mb-1.5" />
          <h4 className="text-xs font-semibold text-fg">
            No creative deliverables attached
          </h4>
          <p className="text-xs text-fg-muted">
            The creative team has not uploaded visual assets for this campaign yet.
          </p>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isLightboxOpen && activeAsset && activeAsset.kind === 'image' && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-accent-text">
                {getRoleLabel(activeAsset.role)}
              </span>
              <span className="text-sm font-semibold truncate max-w-md">
                {activeAsset.filename}
              </span>
              <span className="text-xs text-fg-muted">
                ({selectedIndex + 1} of {assets.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadAssetDirect(activeAsset)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Download image"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Close Lightbox (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 relative">
            <img
              src={getBackendFileUrl(activeAsset.url) || activeAsset.url}
              alt={activeAsset.filename}
              className="max-h-full max-w-full object-contain select-none"
            />

            {/* Navigation inside Lightbox */}
            {assets.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1))
                  }
                  className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer"
                  title="Previous (Left Arrow)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer"
                  title="Next (Right Arrow)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {assetToDelete && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface border border-border p-5 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-danger-bg text-danger-fg">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-fg">
                  Delete Creative Asset?
                </h4>
                <p className="text-xs text-fg-muted leading-relaxed">
                  Are you sure you want to remove <strong className="text-fg">"{assetToDelete.filename}"</strong>? This file will be permanently deleted from storage.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAssetToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-fg bg-subtle hover:bg-hover border border-border transition cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                loading={isDeleting}
                loadingText="Deleting…"
                onClick={() => void handleDeleteConfirmed()}
              >
                Delete Asset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Deliverable Link Modal */}
      {isAddLinkOpen && (
        <FormDialog
          isOpen={isAddLinkOpen}
          onClose={() => setIsAddLinkOpen(false)}
          maxWidth="md"
        >
          <FormDialogHeader
            title="Add Deliverable Link"
            subtitle="Attach external Figma, Canva, Drive, Loom, or asset links"
            icon={<Link2 className="w-5 h-5 text-accent-text" />}
            onClose={() => setIsAddLinkOpen(false)}
          />
          <form onSubmit={handleAddLinkSubmit} className="flex flex-col flex-1 min-h-0">
            <FormDialogBody className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-fg mb-1">
                  URL / Web Address <span className="text-danger-fg">*</span>
                </label>
                <input
                  ref={linkInputRef}
                  type="url"
                  required
                  aria-invalid={!!linkError}
                  placeholder="https://www.figma.com/file/... or https://drive.google.com/..."
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    if (linkError) setLinkError(null);
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-accent',
                    linkError ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border'
                  )}
                />
                {linkError && (
                  <p className="mt-1 text-xs text-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{linkError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1">
                  Title / Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Figma Prototype, Final Video Asset, Copy Doc"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1">
                  Deliverable Role
                </label>
                <CustomSelect
                  value={linkRole}
                  onChange={(val) => setLinkRole(val as AssetRole)}
                  options={[
                    { value: 'primary', label: 'Primary Deliverable' },
                    { value: 'reference', label: 'Reference / Brief' },
                    { value: 'copy_doc', label: 'Blog / Copy Doc' },
                    { value: 'script', label: 'Video Script' },
                    { value: 'carousel_slide', label: 'Carousel Slide' },
                  ]}
                  size="sm"
                />
              </div>
            </FormDialogBody>

            <FormFooter serverError={linkError}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmittingLink}
                onClick={() => setIsAddLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmittingLink}
                loadingText="Adding link…"
                disabled={!linkUrl.trim() || isUploading}
              >
                Add Link
              </Button>
            </FormFooter>
          </form>
        </FormDialog>
      )}

      <DriveAttach
        ref={driveAttachRef}
        trigger={null}
        getConfig={() => contentCalendarService.getDrivePickerConfig(itemId)}
        onPicked={handlePickedFromDrive}
        disabled={readOnly}
      />
      <VideoPosterPicker
        open={posterAsset !== null}
        videoSrc={posterAsset ? getBackendFileUrl(posterAsset.url) || posterAsset.url : ''}
        filename={posterAsset?.filename}
        onClose={() => setPosterAsset(null)}
        onSave={handleSavePoster}
      />
    </div>
  );
};
