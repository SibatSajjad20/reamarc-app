import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CreativeAsset } from '../../../types/contentCalendar';
import { CreativeAssetGallery } from '../CreativeAssetGallery';

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../../services/contentCalendarService', () => ({
  contentCalendarService: {
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
}));

function videoAsset(id: string, filename: string, url: string, order: number): CreativeAsset {
  return {
    id,
    url,
    filename,
    size_bytes: 1024,
    content_type: 'video/mp4',
    kind: 'video',
    role: 'primary',
    order,
    uploaded_at: '2026-10-22T00:00:00Z',
    thumbnail_url: `https://cdn.example.com/${id}-thumb.jpg`,
  };
}

describe('CreativeAssetGallery video preload', () => {
  it('renders one video with preload metadata and no strip videos', () => {
    render(
      <CreativeAssetGallery
        itemId="item-1"
        readOnly
        attachments={[
          videoAsset('v1', 'Clip A', 'https://cdn.example.com/a.mp4', 0),
          videoAsset('v2', 'Clip B', 'https://cdn.example.com/b.mp4', 1),
        ]}
      />,
    );

    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('preload')).toBe('metadata');
    expect(videos[0].getAttribute('poster')).toContain('v1-thumb.jpg');

    fireEvent.click(screen.getByAltText('Clip B'));
    const after = document.querySelectorAll('video');
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('preload')).toBe('metadata');
    expect(after[0].getAttribute('src') || '').toContain('b.mp4');
  });
});
