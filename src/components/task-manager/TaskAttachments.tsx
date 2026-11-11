import React, { useEffect, useRef, useState } from 'react';
import { Download, Link2, Paperclip } from 'lucide-react';
import { DriveAttach } from '@/components/ui/DriveAttach';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TaskAttachmentViewer } from './TaskAttachmentViewer';
import { taskService } from '@/services/taskService';
import { useToast } from '@/context/ToastContext';
import type { TaskAttachment } from '@/types/task';
import { cn } from '@/lib/utils';

interface Props {
  taskId: string;
  attachments: TaskAttachment[];
  disabled?: boolean;
  onChanged: (next?: TaskAttachment[]) => Promise<void> | void;
  onBusy?: (busy: boolean) => void;
}

function formatBytes(n?: number): string {
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const TaskAttachments: React.FC<Props> = ({ taskId, attachments, disabled, onChanged, onBusy }) => {
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const busy = uploading || Boolean(removingId);

  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const apply = (next: TaskAttachment[]) => {
    void onChanged(next);
  };

  const onUpload = async (file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setUploadName(file.name);
    setUploadPct(8);
    try {
      const created = await taskService.uploadAttachment(taskId, file, {
        signal: controller.signal,
        onProgress: (pct) => setUploadPct(Math.max(8, pct)),
      });
      setUploadPct(100);
      apply([...attachments, created]);
    } catch (err: any) {
      if (controller.signal.aborted || err?.status === 499) return;
      addToast('Upload failed', err?.message || 'Could not attach file', 'error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setUploading(false);
      setUploadName('');
      setUploadPct(0);
    }
  };

  const onRemove = async (att: TaskAttachment) => {
    if (removingId) return;
    setRemovingId(att.id);
    try {
      await taskService.deleteAttachment(taskId, att.id);
      apply(attachments.filter((item) => item.id !== att.id));
    } catch (err: any) {
      addToast('Remove failed', err?.message || 'Could not remove file', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <TaskAttachmentViewer taskId={taskId} attachments={attachments} />
      {uploading && (
        <div className="space-y-1.5 rounded-md border border-border bg-subtle px-3 py-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span className="truncate">Uploading {uploadName || 'file'}…</span>
            <span className="font-numeric tabular-nums shrink-0">{uploadPct}%</span>
          </div>
          <Progress value={uploadPct} />
        </div>
      )}
      {removingId && (
        <div className="rounded-md border border-border bg-subtle px-3 py-1.5 text-xs text-fg-muted" role="status" aria-live="polite">
          Removing
        </div>
      )}
      <ul className="space-y-1.5">
        {attachments.map((att) => {
          const isLink = att.kind === 'link';
          const href = att.kind === 'upload' ? taskService.attachmentFileUrl(taskId, att.id) : att.url || '#';
          const sizeLabel = formatBytes(att.size_bytes);
          return (
            <li
              key={att.id}
              data-kind={att.kind}
              className={cn(
                'flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 border',
                isLink
                  ? 'border-dashed border-accent-200 bg-accent-soft/40'
                  : 'border-border bg-surface',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isLink ? (
                  <Link2 className="w-3.5 h-3.5 text-accent-text shrink-0" aria-hidden />
                ) : (
                  <Paperclip className="w-3.5 h-3.5 text-fg-muted shrink-0" aria-hidden />
                )}
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn('truncate hover:underline', isLink ? 'text-accent-text' : 'text-fg')}
                >
                  {att.name}
                </a>
                {isLink && (
                  <span className="shrink-0 text-micro font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-soft text-accent-text">
                    Link
                  </span>
                )}
                {!isLink && sizeLabel && (
                  <span className="shrink-0 text-micro text-fg-muted">{sizeLabel}</span>
                )}
                {att.kind === 'drive' && (
                  <span className="shrink-0 text-micro px-1.5 py-0.5 rounded bg-subtle text-fg-muted">Drive</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {att.kind === 'upload' && (
                  <a
                    href={taskService.attachmentDownloadUrl(taskId, att.id)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download ${att.name}`}
                    className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-hover"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
                {!disabled && (
                  <button
                    type="button"
                    className="text-micro text-fg-muted hover:text-danger-fg disabled:opacity-50 disabled:pointer-events-none"
                    disabled={Boolean(removingId)}
                    onClick={() => void onRemove(att)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!disabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file || uploading) return;
              void onUpload(file);
            }}
          />
          <Button type="button" size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-3.5 h-3.5 mr-1" />
            Upload
          </Button>
          <DriveAttach
            getConfig={() => taskService.pickerConfig(taskId)}
            onPicked={async (files) => {
              const added: TaskAttachment[] = [];
              for (const file of files) {
                added.push(await taskService.addDrive(taskId, file));
              }
              apply([...attachments, ...added]);
            }}
            allowLinks
            onAddLink={async (name, url) => {
              const created = await taskService.addLink(taskId, name, url);
              apply([...attachments, created]);
            }}
            size="sm"
            variant="secondary"
          />
        </div>
      )}
    </div>
  );
};
