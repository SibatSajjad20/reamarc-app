import React, { useState, useId, useEffect, useImperativeHandle, forwardRef } from 'react';
import { openGoogleDrivePicker } from '../../services/googlePickerService';
import type { DrivePickerConfig, DrivePickedFile } from '../../types/contentCalendar';
import { useToast } from '../../context/ToastContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { Button } from './button';
import { CustomSelect } from './CustomSelect';
import { Link2, Paperclip, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.28 2.85L1.57 14.5L5 20.45L11.71 8.8L8.28 2.85Z" fill="#3777E3" />
    <path d="M15.72 2.85H8.28L15 14.5H22.43L15.72 2.85Z" fill="#FFCF63" />
    <path d="M11.71 8.8L5 20.45H19L22.43 14.5L11.71 8.8Z" fill="#11A861" />
  </svg>
);

export interface DriveAttachRef {
  openPicker: () => Promise<void>;
  openModal: () => void;
}

export interface DriveAttachFolderOption {
  value: string;
  label: string;
}

export interface DriveAttachProps {
  getConfig: () => Promise<DrivePickerConfig>;
  onPicked: (files: DrivePickedFile[], folder?: string) => Promise<void>;
  allowLinks?: boolean;
  onAddLink?: (name: string, url: string, folder?: string) => Promise<void>;
  disabled?: boolean;
  existingLinks?: string[];
  folders?: DriveAttachFolderOption[];
  defaultFolder?: string;
  trigger?: React.ReactNode;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  directPicker?: boolean;
}

export const DriveAttach = forwardRef<DriveAttachRef, DriveAttachProps>(function DriveAttach(
  {
    getConfig,
    onPicked,
    allowLinks = false,
    onAddLink,
    disabled = false,
    existingLinks = [],
    folders,
    defaultFolder,
    trigger,
    label = 'Attach',
    variant = 'secondary',
    size = 'sm',
    className,
    title = 'Attach Deliverables',
    isOpen: controlledIsOpen,
    onClose: controlledOnClose,
    directPicker = false,
  },
  ref
) {
  const { addToast } = useToast();
  const nameInputId = useId();
  const urlInputId = useId();
  const folderInputId = useId();

  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const isModalOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setUncontrolledIsOpen(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'drive' | 'link'>('drive');
  const [driveUnavailable, setDriveUnavailable] = useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>(
    defaultFolder || (folders && folders.length > 0 ? folders[0].value : '')
  );

  useEffect(() => {
    if (defaultFolder) {
      setSelectedFolder(defaultFolder);
    } else if (folders && folders.length > 0 && !selectedFolder) {
      setSelectedFolder(folders[0].value);
    }
  }, [defaultFolder, folders]);

  // Link form state
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNameError, setLinkNameError] = useState<string | null>(null);
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);
  const [linkUrlWarning, setLinkUrlWarning] = useState<string | null>(null);

  // Reset errors when inputs change
  useEffect(() => {
    if (linkNameError) setLinkNameError(null);
  }, [linkName]);

  useEffect(() => {
    if (linkUrlError) setLinkUrlError(null);
    if (linkUrlWarning) setLinkUrlWarning(null);
  }, [linkUrl]);

  const handleOpenDrivePicker = async () => {
    if (disabled || isOpeningPicker || isBusy) return;
    setIsOpeningPicker(true);
    try {
      let config: DrivePickerConfig;
      try {
        config = await getConfig();
      } catch (err: any) {
        if (err?.status === 403 || err?.message?.includes('403') || err?.message?.toLowerCase().includes('forbidden')) {
          addToast('Permission Denied', "You can't add files to this item", 'error');
          return;
        }
        if (err?.status === 503 || err?.message?.includes('503') || err?.message?.toLowerCase().includes('not configured')) {
          setDriveUnavailable(true);
          addToast('Google Drive Unavailable', 'Google Drive integration is not configured on this server.', 'warning');
          return;
        }
        throw err;
      }

      if (!config.developer_key) {
        setDriveUnavailable(true);
        addToast('Drive Not Configured', 'Google Drive developer key is missing on the server.', 'warning');
        return;
      }

      const pickedFiles = await openGoogleDrivePicker({ config });
      if (!pickedFiles || pickedFiles.length === 0) {
        return;
      }

      setIsBusy(true);
      await onPicked(pickedFiles, selectedFolder || undefined);
      addToast(
        'Upload Successful',
        `${pickedFiles.length} file${pickedFiles.length > 1 ? 's' : ''} attached via Google Drive.`,
        'success'
      );
      handleClose();
    } catch (err: any) {
      if (err?.status === 403 || err?.message?.includes('403') || err?.message?.toLowerCase().includes('forbidden')) {
        addToast('Permission Denied', "You can't add files to this item", 'error');
      } else {
        addToast('Drive Error', err?.message || 'Could not complete Google Drive attachment.', 'error');
      }
    } finally {
      setIsOpeningPicker(false);
      setIsBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openPicker: handleOpenDrivePicker,
    openModal: () => {
      setUncontrolledIsOpen(true);
      setActiveTab('drive');
    },
  }));

  const handleAddLinkSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onAddLink || isBusy) return;

    let valid = true;
    const trimmedName = linkName.trim();
    const trimmedUrl = linkUrl.trim();

    if (!trimmedName) {
      setLinkNameError('Name is required');
      valid = false;
    } else if (trimmedName.length > 120) {
      setLinkNameError('Name cannot exceed 120 characters');
      valid = false;
    }

    if (!trimmedUrl) {
      setLinkUrlError('URL is required');
      valid = false;
    } else if (trimmedUrl.length > 2048) {
      setLinkUrlError('URL cannot exceed 2048 characters');
      valid = false;
    } else {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          setLinkUrlError('URL must begin with https:// or http://');
          valid = false;
        } else if (parsed.protocol === 'http:') {
          setLinkUrlWarning('Insecure HTTP link; HTTPS is strongly recommended.');
        }

        if (existingLinks.some((l) => l.trim().toLowerCase() === trimmedUrl.toLowerCase())) {
          setLinkUrlError('This URL has already been attached to this task.');
          valid = false;
        }
      } catch {
        setLinkUrlError('Please enter a valid URL (e.g. https://figma.com/...)');
        valid = false;
      }
    }

    if (!valid) return;

    setIsBusy(true);
    try {
      await onAddLink(trimmedName, trimmedUrl, selectedFolder || undefined);
      addToast('Link Attached', 'External link attached successfully.', 'success');
      setLinkName('');
      setLinkUrl('');
      handleClose();
    } catch (err: any) {
      addToast('Attach Failed', err?.message || 'Could not attach external link.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTriggerClick = () => {
    if (disabled) return;
    if (directPicker && !allowLinks) {
      void handleOpenDrivePicker();
    } else {
      setUncontrolledIsOpen(true);
    }
  };

  return (
    <>
      {/* Trigger Button if rendered unassisted */}
      {trigger !== null && controlledIsOpen === undefined && (
        trigger ? (
          <span onClick={handleTriggerClick} className={cn('inline-flex', className)}>
            {trigger}
          </span>
        ) : (
          <Button
            type="button"
            variant={variant}
            size={size === 'xs' ? 'sm' : size}
            disabled={disabled || isOpeningPicker || isBusy}
            onClick={handleTriggerClick}
            className={className}
            icon={directPicker ? GoogleDriveIcon : Paperclip}
          >
            {label}
          </Button>
        )
      )}

      {/* Modal Dialog */}
      <Dialog open={isModalOpen} onOpenChange={(open: boolean) => { if (!open && !isBusy) handleClose(); }}>
        <DialogContent maxWidth="md" className="p-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Paperclip className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-ui font-semibold text-fg">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-caption text-fg-muted mt-0.5">
                  Attach assets from Google Drive or add external deliverable links
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Tab Selector (Drive vs Link) */}
          {allowLinks && (
            <div className="px-6 pt-4 bg-surface border-b border-border">
              <div className="flex items-center gap-1 border-b border-transparent -mb-px">
                {!driveUnavailable && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('drive')}
                    className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'drive'
                        ? 'border-accent text-accent'
                        : 'border-transparent text-fg-muted hover:text-fg'
                    }`}
                  >
                    <GoogleDriveIcon className="w-3.5 h-3.5" />
                    <span>Google Drive</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'link' || driveUnavailable
                      ? 'border-accent text-accent'
                      : 'border-transparent text-fg-muted hover:text-fg'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Web Link</span>
                </button>
              </div>
            </div>
          )}

          {/* Modal Body */}
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {/* Optional Folder selector shared across both tabs */}
            {folders && folders.length > 0 && (
              <div>
                <label htmlFor={folderInputId} className="block text-label font-medium text-fg mb-1">
                  Folder Category
                </label>
                <CustomSelect
                  id={folderInputId}
                  value={selectedFolder}
                  onChange={(v) => setSelectedFolder(v)}
                  options={folders}
                  size="sm"
                />
              </div>
            )}

            {/* Google Drive Tab */}
            {(activeTab === 'drive' && !driveUnavailable) ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-subtle border border-border flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-surface border border-border flex items-center justify-center shrink-0">
                    <GoogleDriveIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-ui font-medium text-fg">
                      Google Drive Cloud Picker
                    </h4>
                    <p className="text-small text-fg-muted mt-0.5 leading-relaxed">
                      Browse your shared Drives, Starred folders, recent files, or drag & drop files from your device directly into Google Drive storage.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-center">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleOpenDrivePicker}
                    loading={isOpeningPicker || isBusy}
                    loadingText={isBusy ? 'Attaching…' : 'Opening Google Drive…'}
                    icon={GoogleDriveIcon}
                  >
                    Open Google Drive Picker
                  </Button>
                </div>
              </div>
            ) : driveUnavailable ? (
              <div className="p-4 rounded-lg bg-warning-bg/40 border border-warning-bd text-warning-fg text-small flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning-fg" />
                <div>
                  <p className="font-semibold text-fg">Google Drive Not Configured</p>
                  <p className="text-small text-fg-muted mt-0.5">
                    Google Drive cloud integration is not configured on this server. Please use the Web Link tab below to attach public or shared URLs.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Web Link Tab */}
            {(allowLinks && (activeTab === 'link' || driveUnavailable)) && (
              <form onSubmit={handleAddLinkSubmit} className="space-y-4">
                <div>
                  <label htmlFor={nameInputId} className="block text-label font-medium text-fg mb-1">
                    Deliverable Name <span className="text-danger-fg">*</span>
                  </label>
                  <input
                    id={nameInputId}
                    type="text"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="e.g. Figma Design System, Wireframes v2, Loom Walkthrough"
                    maxLength={120}
                    className={cn(
                      'w-full px-3 py-2 text-ui rounded-md bg-surface border text-fg placeholder:text-fg-faint focus:outline-hidden',
                      linkNameError
                        ? 'border-danger-bd ring-1 ring-danger-bd'
                        : 'border-border focus:border-accent'
                    )}
                  />
                  {linkNameError && (
                    <p className="mt-1 text-caption text-danger-fg flex items-center gap-1" role="alert">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{linkNameError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={urlInputId} className="block text-label font-medium text-fg mb-1">
                    Target URL <span className="text-danger-fg">*</span>
                  </label>
                  <input
                    id={urlInputId}
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    maxLength={2048}
                    className={cn(
                      'w-full px-3 py-2 text-ui rounded-md bg-surface border text-fg placeholder:text-fg-faint focus:outline-hidden font-mono text-xs',
                      linkUrlError
                        ? 'border-danger-bd ring-1 ring-danger-bd'
                        : 'border-border focus:border-accent'
                    )}
                  />
                  {linkUrlError && (
                    <p className="mt-1 text-caption text-danger-fg flex items-center gap-1" role="alert">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{linkUrlError}</span>
                    </p>
                  )}
                  {linkUrlWarning && !linkUrlError && (
                    <p className="mt-1 text-caption text-warning-fg flex items-center gap-1" role="alert">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{linkUrlWarning}</span>
                    </p>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClose}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!linkName.trim() || !linkUrl.trim() || isBusy}
                    loading={isBusy}
                    loadingText="Saving…"
                  >
                    Save Link
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
