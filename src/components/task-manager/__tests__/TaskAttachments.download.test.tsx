import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskAttachments } from '../TaskAttachments';
import { TaskAttachmentViewer } from '../TaskAttachmentViewer';
import type { TaskAttachment } from '@/types/task';
import { taskService } from '@/services/taskService';

vi.mock('@/components/ui/DriveAttach', () => ({ DriveAttach: () => null }));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/services/taskService', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/taskService')>();
  return {
    ...mod,
    taskService: {
      ...mod.taskService,
      deleteAttachment: vi.fn(() => new Promise(() => {})),
    },
  };
});

const upload: TaskAttachment = {
  id: 'tat_1',
  task_id: 'tsk_1',
  kind: 'upload',
  name: 'clip.mp4',
  mime_type: 'video/mp4',
  has_thumb: true,
  created_at: '2026-11-10T00:00:00Z',
};

describe('task attachment download URLs', () => {
  it('points the list Download control at file?download=1', () => {
    const { container } = render(
      <TaskAttachments taskId="tsk_1" attachments={[upload]} onChanged={() => undefined} />,
    );
    const download = container.querySelector('a[aria-label="Download clip.mp4"]') as HTMLAnchorElement;
    expect(download).toBeTruthy();
    expect(download.getAttribute('href')).toBe('/api/v1/tasks/tsk_1/attachments/tat_1/file?download=1');
    expect(download.getAttribute('download')).not.toBeNull();
    const nameLink = container.querySelector('a.truncate') as HTMLAnchorElement;
    expect(nameLink.getAttribute('href')).toBe('/api/v1/tasks/tsk_1/attachments/tat_1/file');
  });

  it('uses file?download=1 for a video with a thumb, not /thumb, and keeps preview off download=1', () => {
    const { container } = render(<TaskAttachmentViewer taskId="tsk_1" attachments={[upload]} />);
    const download = container.querySelector('a[href*="download=1"]') as HTMLAnchorElement;
    expect(download).toBeTruthy();
    expect(download.getAttribute('href')).toBe('/api/v1/tasks/tsk_1/attachments/tat_1/file?download=1');
    expect(download.getAttribute('href')).not.toContain('/thumb');
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src') || video.src).not.toContain('download=1');
    const imgs = Array.from(container.querySelectorAll('img'));
    for (const img of imgs) {
      expect(img.getAttribute('src') || '').not.toContain('download=1');
    }
  });
});

const link: TaskAttachment = {
  id: 'tat_link',
  task_id: 'tsk_1',
  kind: 'link',
  name: 'Brief doc',
  url: 'https://example.com/brief',
  mime_type: 'text/uri-list',
  created_at: '2026-11-10T00:00:00Z',
};

describe('task attachment list chrome', () => {
  it('renders links differently from uploaded files', () => {
    const { container } = render(
      <TaskAttachments taskId="tsk_1" attachments={[upload, link]} onChanged={() => undefined} />,
    );
    const linkRow = container.querySelector('[data-kind="link"]') as HTMLElement;
    const fileRow = container.querySelector('[data-kind="upload"]') as HTMLElement;
    expect(linkRow).toBeTruthy();
    expect(fileRow).toBeTruthy();
    expect(linkRow.className).toMatch(/border-dashed/);
    expect(fileRow.className).not.toMatch(/border-dashed/);
    expect(linkRow.textContent).toMatch(/Link/);
    expect(fileRow.querySelector('a[aria-label="Download clip.mp4"]')).toBeTruthy();
    expect(linkRow.querySelector('a[aria-label^="Download"]')).toBeNull();
  });

  it('disables Remove and shows Removing after the first click', () => {
    render(
      <TaskAttachments taskId="tsk_1" attachments={[upload]} onChanged={() => undefined} />,
    );
    const remove = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    expect(screen.getByText('Removing')).toBeTruthy();
    expect(remove).toHaveProperty('disabled', true);
    expect(taskService.deleteAttachment).toHaveBeenCalledWith('tsk_1', 'tat_1');
  });
});
