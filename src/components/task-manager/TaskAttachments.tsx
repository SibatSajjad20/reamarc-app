import React, { useRef } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { DriveAttach } from '@/components/ui/DriveAttach';
import { Button } from '@/components/ui/button';
import { TaskAttachmentViewer } from './TaskAttachmentViewer';
import { taskService } from '@/services/taskService';
import type { TaskAttachment } from '@/types/task';

interface Props {
  taskId: string;
  attachments: TaskAttachment[];
  disabled?: boolean;
  onChanged: () => Promise<void> | void;
}

export const TaskAttachments: React.FC<Props> = ({ taskId, attachments, disabled, onChanged }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <TaskAttachmentViewer taskId={taskId} attachments={attachments} />
      <ul className="space-y-1.5">
        {attachments.map((att) => (
          <li key={att.id} className="flex items-center justify-between gap-2 text-sm">
            <a
              href={att.kind === 'upload' ? taskService.attachmentFileUrl(taskId, att.id) : att.url || '#'}
              target="_blank"
              rel="noreferrer"
              className="truncate text-accent-text hover:underline"
            >
              {att.name}
            </a>
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
                  className="text-micro text-fg-muted hover:text-danger-fg"
                  onClick={async () => {
                    await taskService.deleteAttachment(taskId, att.id);
                    await onChanged();
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await taskService.uploadAttachment(taskId, file);
              await onChanged();
            }}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-3.5 h-3.5 mr-1" />
            Upload
          </Button>
          <DriveAttach
            getConfig={() => taskService.pickerConfig(taskId)}
            onPicked={async (files) => {
              for (const file of files) {
                await taskService.addDrive(taskId, file);
              }
              await onChanged();
            }}
            allowLinks
            onAddLink={async (name, url) => {
              await taskService.addLink(taskId, name, url);
              await onChanged();
            }}
            size="sm"
            variant="secondary"
          />
        </div>
      )}
    </div>
  );
};
