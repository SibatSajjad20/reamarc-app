import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TaskAttachments } from '../TaskAttachments';
import { TaskAttachmentViewer } from '../TaskAttachmentViewer';
import type { TaskAttachment } from '@/types/task';

vi.mock('@/components/ui/DriveAttach', () => ({ DriveAttach: () => null }));

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
