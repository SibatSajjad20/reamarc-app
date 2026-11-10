import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskAttachment } from '@/types/task';
import { taskService } from '@/services/taskService';

function srcOf(att: TaskAttachment, taskId: string): string {
  if (att.kind === 'upload') {
    if (att.has_thumb) return taskService.attachmentThumbUrl(taskId, att.id);
    return taskService.attachmentFileUrl(taskId, att.id);
  }
  return att.url || '';
}

function thumbOf(att: TaskAttachment, taskId: string): string {
  if (att.kind === 'upload' && att.has_thumb) return taskService.attachmentThumbUrl(taskId, att.id);
  if (att.kind === 'upload') return taskService.attachmentFileUrl(taskId, att.id);
  return att.url || '';
}

function isImage(att: TaskAttachment): boolean {
  return Boolean(att.mime_type?.startsWith('image/'));
}

function isVideo(att: TaskAttachment): boolean {
  return Boolean(att.mime_type?.startsWith('video/'));
}

interface Props {
  taskId: string;
  attachments: TaskAttachment[];
}

export const TaskAttachmentViewer: React.FC<Props> = ({ taskId, attachments }) => {
  const media = attachments.filter((a) => isImage(a) || isVideo(a) || a.has_thumb);
  const [activeId, setActiveId] = useState(media[0]?.id);
  const [lightbox, setLightbox] = useState(false);
  const active = media.find((a) => a.id === activeId) || media[0];

  if (!media.length) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs" data-testid="task-asset-preview">
        {active && (
          <div
            className={cn(
              'relative group overflow-hidden',
              isImage(active) || isVideo(active) ? 'bg-black h-[220px] sm:h-[280px]' : 'bg-subtle h-[120px]',
            )}
            onClick={() => isImage(active) && setLightbox(true)}
          >
            {isVideo(active) ? (
              <video src={srcOf(active, taskId)} controls className="w-full h-full object-contain" />
            ) : (
              <img src={srcOf(active, taskId)} alt={active.name} className="w-full h-full object-contain" />
            )}
            {active.kind === 'upload' && (
              <a
                href={taskService.attachmentDownloadUrl(taskId, active.id)}
                download
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${active.name}`}
                className="absolute top-2 right-2 p-2 rounded-full bg-white/10 border border-white/20 text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
        {media.length > 1 && (
          <div className="flex gap-2 p-2 overflow-x-auto">
            {media.map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => setActiveId(att.id)}
                className={cn(
                  'w-16 h-16 rounded-md border overflow-hidden shrink-0',
                  att.id === active?.id ? 'border-accent ring-2 ring-accent/40' : 'border-border',
                )}
              >
                <img src={thumbOf(att, taskId)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      {lightbox && active && isImage(active) && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in duration-200">
          <div className="px-6 py-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
            <span className="text-sm truncate">{active.name}</span>
            <div className="flex items-center gap-2">
              <a
                href={active.kind === 'upload' ? taskService.attachmentDownloadUrl(taskId, active.id) : srcOf(active, taskId)}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-white/10 border border-white/20"
              >
                <Download className="w-4 h-4" />
              </a>
              <button type="button" onClick={() => setLightbox(false)} className="p-2 rounded-full bg-white/10 border border-white/20">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <img src={srcOf(active, taskId)} alt={active.name} className="max-h-full max-w-full object-contain select-none" />
          </div>
        </div>
      )}
    </>
  );
};
