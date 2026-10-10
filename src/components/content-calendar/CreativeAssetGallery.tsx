import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import type { CreativeAsset, ContentCalendarItem, AssetRole } from '../../types/contentCalendar';
import { Button } from '../ui/button';
import { CustomSelect } from '../ui/CustomSelect';
import { contentCalendarService } from '../../services/contentCalendarService';
import { openGoogleDrivePicker } from '../../services/googlePickerService';
import { useToast } from '../../context/ToastContext';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { openFileAttachment, downloadFileAttachment, getBackendFileUrl, isRealThumbnailUrl } from '../../utils/fileUrl';
import { cn } from '../../lib/utils';

const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.28 2.85L1.57 14.5L5 20.45L11.71 8.8L8.28 2.85Z" fill="#3777E3" />
    <path d="M15.72 2.85H8.28L15 14.5H22.43L15.72 2.85Z" fill="#FFCF63" />
    <path d="M11.71 8.8L5 20.45H19L22.43 14.5L11.71 8.8Z" fill="#11A861" />
  </svg>
);

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
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Add Link Modal State
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkRole, setLinkRole] = useState<AssetRole>('primary');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAsset: CreativeAsset | undefined = assets[selectedIndex] || assets[0];

  const imageCount = assets.filter((a) => a.kind === 'image').length;
  const videoCount = assets.filter((a) => a.kind === 'video').length;
  const linkCount = assets.filter((a) => a.kind === 'link').length;
  const docCount = assets.filter((a) => a.kind === 'document').length;

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
      const maxSize = isVideo ? 250 * 1024 * 1024 : 50 * 1024 * 1024;
      if (f.size > maxSize) {
        addToast(
          'File too large',
          `"${f.name}" exceeds the maximum allowed size of ${isVideo ? '250MB' : '50MB'}.`,
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
    } catch (err: any) {
      addToast('Upload failed', err.message || 'Could not upload files. Try again.', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenGoogleDrivePicker = async () => {
    if (isUploading || isOpeningPicker) return;
    setIsOpeningPicker(true);
    try {
      const config = await contentCalendarService.getDrivePickerConfig(itemId);
      if (!config.developer_key) {
        addToast(
          'Google API Key Required',
          'Please configure GOOGLE_DRIVE_API_KEY in your server environment.',
          'error',
        );
        return;
      }
      const pickedFiles = await openGoogleDrivePicker({ config });
      if (!pickedFiles || pickedFiles.length === 0) {
        return;
      }

      setIsUploading(true);
      setUploadProgressText(
        `Attaching ${pickedFiles.length} file${pickedFiles.length > 1 ? 's' : ''} from Google Drive...`
      );

      const effectiveRole =
        pickedFiles.length > 1 && uploadRole === 'primary' ? 'carousel_slide' : uploadRole;

      const updatedItem = await contentCalendarService.attachDriveAssets(
        itemId,
        pickedFiles,
        effectiveRole
      );

      addToast(
        'Upload Successful',
        `${pickedFiles.length} asset${pickedFiles.length > 1 ? 's' : ''} attached via Google Drive.`,
        'success'
      );

      if (onAssetsUpdated) {
        onAssetsUpdated(updatedItem);
      }
      if (updatedItem.attachments && updatedItem.attachments.length > 0) {
        setSelectedIndex(updatedItem.attachments.length - 1);
      }
    } catch (err: any) {
      console.error('Google Drive Picker error:', err);
      addToast(
        'Google Drive Error',
        err.message || 'Could not open Google Drive picker dialog.',
        'error'
      );
    } finally {
      setIsOpeningPicker(false);
      setIsUploading(false);
      setUploadProgressText('');
    }
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
            <div className="relative inline-flex items-center rounded-lg shadow-xs">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => void handleOpenGoogleDrivePicker()}
                loading={isUploading || isOpeningPicker}
                loadingText="Uploading…"
                icon={GoogleDriveIcon}
                className="rounded-r-none"
                title="Insert files using Google Drive (Recent, Upload, My Drive, Starred)"
              >
                Upload
              </Button>

              <button
                type="button"
                onClick={() => setShowUploadMenu((prev) => !prev)}
                disabled={isUploading || isOpeningPicker}
                className="px-1 py-1 text-xs font-semibold rounded-r-lg bg-accent text-accent-fg hover:opacity-90 transition border-l border-white/20 cursor-pointer disabled:opacity-50"
                title="More upload options"
              >
                <ChevronDown className="w-3 h-3" />
              </button>

              {showUploadMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowUploadMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-surface border border-border shadow-md py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadMenu(false);
                        void handleOpenGoogleDrivePicker();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <GoogleDriveIcon className="w-3.5 h-3.5" />
                      <span>Google Drive Dialog</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadMenu(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <UploadCloud className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Direct Device Upload</span>
                    </button>
                  </div>
                </>
              )}
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
        <div className="rounded-xl border border-border bg-canvas overflow-hidden relative group">
          {/* Top Bar Overlay: Role & Filename & Controls */}
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2.5 bg-overlay border-b border-white/10 flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded-md text-caption font-semibold bg-accent text-accent-fg shrink-0">
                {getRoleLabel(activeAsset.role)}
              </span>
              <span className="text-xs font-medium truncate opacity-90" title={activeAsset.filename}>
                {activeAsset.filename}
              </span>
              <span className="text-caption opacity-60 shrink-0">
                ({formatBytes(activeAsset.size_bytes)})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Copy URL */}
              <button
                type="button"
                onClick={() => copyAssetUrl(activeAsset.url, activeAsset.id)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Copy asset direct link"
              >
                {copiedId === activeAsset.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Direct Open in new tab */}
              <button
                type="button"
                onClick={() => void openFileAttachment(activeAsset.url, activeAsset.filename)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Open asset file in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              {/* Download */}
              <button
                type="button"
                onClick={() => void downloadFileAttachment(activeAsset.url, activeAsset.filename)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Download asset"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* Fullscreen Lightbox (for images) */}
              {activeAsset.kind === 'image' && (
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title="Expand to Fullscreen Lightbox"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete button (if not readOnly) */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setAssetToDelete(activeAsset)}
                  className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition cursor-pointer"
                  title="Delete asset"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Asset Content Presentation */}
          <div className={`min-h-[220px] ${compact ? 'max-h-[320px]' : 'max-h-[460px]'} flex items-center justify-center bg-black/95`}>
            {activeAsset.kind === 'image' ? (
              <div
                className="w-full h-full flex items-center justify-center cursor-zoom-in p-2"
                onClick={() => setIsLightboxOpen(true)}
              >
                <img
                  src={getBackendFileUrl(activeAsset.url) || activeAsset.url}
                  alt={activeAsset.filename}
                  className={`${compact ? 'max-h-[300px]' : 'max-h-[440px]'} max-w-full object-contain select-none`}
                  loading="lazy"
                />
              </div>
            ) : activeAsset.kind === 'video' ? (
              <div className={`w-full h-full ${compact ? 'max-h-[300px]' : 'max-h-[440px]'} flex items-center justify-center p-2`}>
                <video
                  key={activeAsset.url}
                  src={getBackendFileUrl(activeAsset.url) || activeAsset.url}
                  poster={isRealThumbnailUrl(activeAsset.thumbnail_url) ? (getBackendFileUrl(activeAsset.thumbnail_url!) || activeAsset.thumbnail_url!) : undefined}
                  controls
                  playsInline
                  preload="auto"
                  crossOrigin="use-credentials"
                  className={`${compact ? 'max-h-[280px]' : 'max-h-[420px]'} max-w-full rounded-lg shadow-md`}
                >
                  Your browser does not support HTML5 video streaming.
                </video>
              </div>
            ) : activeAsset.kind === 'link' ? (
              /* Link Presentation */
              <div className="w-full py-12 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-xl bg-subtle text-accent-text border border-border">
                  <Globe className="w-10 h-10" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h4 className="text-sm font-semibold text-white break-all">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition border border-white/10 cursor-pointer"
                  >
                    {copiedId === activeAsset.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy URL</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Document Card Presentation */
              <div className="w-full py-12 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-xl bg-subtle text-accent-text border border-border">
                  <FileText className="w-10 h-10" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h4 className="text-sm font-semibold text-white break-all">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition border border-white/10 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadFileAttachment(activeAsset.url, activeAsset.filename)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Prev / Next Arrows for Multi-assets */}
          {assets.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSelectedIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1))
                }
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                title="Previous Asset"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                title="Next Asset"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Bottom slide index counter */}
              <div className="absolute bottom-2 left-1/2 -translate-y-0 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/70 text-white text-caption font-semibold tracking-wide border border-white/10 pointer-events-none">
                {selectedIndex + 1} of {assets.length}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Thumbnail Navigation Strip & Reordering */}
      {assets.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>
              Carousel & Deliverable Slides ({assets.length})
            </span>
            {!readOnly && (
              <span className="text-caption text-fg-muted">
                Use arrows to reorder slide sequence
              </span>
            )}
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
                        src={getBackendFileUrl(asset.thumbnail_url || asset.url) || asset.thumbnail_url || asset.url}
                        alt={asset.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.opacity = '0.5';
                        }}
                      />
                    ) : asset.kind === 'video' ? (
                      <div className="relative w-full h-full bg-canvas flex items-center justify-center">
                        {isRealThumbnailUrl(asset.thumbnail_url) ? (
                          <img
                            src={getBackendFileUrl(asset.thumbnail_url!) || asset.thumbnail_url!}
                            alt={asset.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={`${getBackendFileUrl(asset.url) || asset.url}#t=0.001`}
                            preload="metadata"
                            muted
                            playsInline
                            className="w-full h-full object-cover pointer-events-none"
                          />
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
                onClick={() => void downloadFileAttachment(activeAsset.url, activeAsset.filename)}
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
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-subtle text-accent-text border border-border">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-fg">
                    Add Deliverable Link
                  </h4>
                  <p className="text-xs text-fg-muted">
                    Attach external Figma, Canva, Drive, Loom, or asset links
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddLinkOpen(false)}
                className="p-1 rounded-md text-fg-muted hover:text-fg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddLinkSubmit} className="space-y-3.5">
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  disabled={isSubmittingLink}
                  onClick={() => setIsAddLinkOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-fg bg-subtle hover:bg-hover border border-border transition cursor-pointer"
                >
                  Cancel
                </button>
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
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
