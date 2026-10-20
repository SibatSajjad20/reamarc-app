import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '../ui/button';
import { ClientAvatar } from '../ui/ClientAvatar';
import { workspaceService } from '../../services/workspaceService';
import type { Workspace } from '../../types';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 2 * 1024 * 1024;

export async function padImageFileToSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return URL.createObjectURL(file);
  ctx.clearRect(0, 0, side, side);
  ctx.drawImage(bitmap, (side - bitmap.width) / 2, (side - bitmap.height) / 2);
  return canvas.toDataURL('image/png');
}

interface Props {
  workspaceId?: string | null;
  name: string;
  brandColor?: string;
  initials?: string;
  logoUrl?: string | null;
  canManage: boolean;
  pendingFile: File | null;
  onPendingFile: (file: File | null, previewUrl: string | null) => void;
  onWorkspacePatched?: (ws: Workspace) => void;
  localPreviewUrl?: string | null;
}

export const ClientLogoField: React.FC<Props> = ({
  workspaceId, name, brandColor, initials, logoUrl, canManage,
  onPendingFile, onWorkspacePatched, localPreviewUrl,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [preview, setPreview] = useState<string | null>(localPreviewUrl || null);

  useEffect(() => { setPreview(localPreviewUrl || null); }, [localPreviewUrl]);
  if (!canManage) return null;

  const shownUrl = preview || logoUrl || null;
  const hasLogo = Boolean(shownUrl);

  const handlePick = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError("SVG isn't accepted. Upload a PNG, JPG or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Logo must be 2 MB or smaller.');
      return;
    }
    setError(null);
    const padded = await padImageFileToSquareDataUrl(file);
    setPreview(padded);
    onPendingFile(file, padded);
    if (workspaceId) {
      setUploading(true);
      try {
        const updated = await workspaceService.uploadLogo(workspaceId, file);
        onPendingFile(null, null);
        setPreview(null);
        onWorkspacePatched?.(updated);
      } catch (err: any) {
        setError(err?.message || "Couldn't upload the logo. Try again.");
      } finally {
        setUploading(false);
      }
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setConfirmRemove(false);
    setError(null);
    if (workspaceId && logoUrl) {
      setUploading(true);
      try {
        const updated = await workspaceService.removeLogo(workspaceId);
        onPendingFile(null, null);
        setPreview(null);
        onWorkspacePatched?.(updated);
      } catch (err: any) {
        setError(err?.message || "Couldn't remove the logo. Try again.");
      } finally {
        setUploading(false);
      }
      return;
    }
    onPendingFile(null, null);
    setPreview(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-fg">Client logo</p>
        <p className="text-xs text-fg-muted mt-0.5">PNG, JPG or WebP. Max 2 MB. We pad to a square — nothing is cropped.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <ClientAvatar name={name || 'Client'} logoUrl={shownUrl} brandColor={brandColor} initials={initials} size={96} />
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handlePick(file);
          }} />
          <Button type="button" variant="secondary" size="sm" disabled={uploading} icon={uploading ? Loader2 : UploadCloud} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : hasLogo ? 'Replace logo' : 'Upload logo'}
          </Button>
          {hasLogo && (
            <Button type="button" variant="ghost" size="sm" disabled={uploading} icon={Trash2} onClick={() => void handleRemove()}>
              {confirmRemove ? 'Remove logo? Cards will show initials.' : 'Remove'}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-small text-danger-fg">{error}</p>}
      <div>
        <p className="text-caption text-fg-muted mb-1.5">Preview on cards</p>
        <div className="flex items-center gap-3">
          <ClientAvatar name={name || 'Client'} logoUrl={shownUrl} brandColor={brandColor} initials={initials} size={20} decorative />
          <ClientAvatar name={name || 'Client'} logoUrl={shownUrl} brandColor={brandColor} initials={initials} size={14} decorative />
        </div>
      </div>
    </div>
  );
};
