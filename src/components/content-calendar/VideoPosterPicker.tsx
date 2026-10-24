import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

/**
 * Optional: pick a video's thumbnail. Scrub to a frame (starts about 1.5 s in) or upload a picture.
 * Closing without saving keeps the automatic thumbnail, so this can be skipped and done later.
 */
export interface VideoPosterPickerProps {
  open: boolean;
  videoSrc: string;
  filename?: string;
  onClose: () => void;
  onSave: (image: Blob) => Promise<void>;
}

export const DEFAULT_POSTER_SECONDS = 1.5;

export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) throw new Error('Video not ready');
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this frame'))), 'image/jpeg', 0.88);
    } catch (err) {
      reject(err);
    }
  });
}

export default function VideoPosterPicker({ open, videoSrc, filename, onClose, onSave }: VideoPosterPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(DEFAULT_POSTER_SECONDS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setTime(DEFAULT_POSTER_SECONDS);
    }
  }, [open]);

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    const t = Math.min(DEFAULT_POSTER_SECONDS, Math.max(0, (v.duration || 0) - 0.1));
    v.currentTime = t;
    setTime(t);
  };

  const seek = (t: number) => {
    setTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const save = async (blob: Blob) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(blob);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not save the thumbnail.');
    } finally {
      setSaving(false);
    }
  };

  const useFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await save(await captureFrame(v));
    } catch {
      setError("This video's frames can't be read in the browser. Upload a picture instead.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Video thumbnail</DialogTitle>
          <DialogDescription>
            Optional. Pick the frame shown on cards and link previews{filename ? ` for ${filename}` : ''}, or upload a picture. Skip to keep the automatic one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 sm:px-6 py-2">
          <video
            ref={videoRef}
            src={open ? videoSrc : undefined}
            crossOrigin="use-credentials"
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={onLoaded}
            className="w-full max-h-[50vh] rounded-lg bg-black"
            data-testid="poster-video"
          />
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full"
            aria-label="Choose frame"
          />
          <p className="text-xs text-fg-muted">{time.toFixed(1)} s</p>
          {error && <p className="text-xs text-danger-fg">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void save(f);
            }}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Skip
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={saving}>
            Upload picture
          </Button>
          <Button variant="primary" onClick={() => void useFrame()} loading={saving} disabled={saving || !duration}>
            Use this frame
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
