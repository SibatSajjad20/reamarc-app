import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CreativeAsset } from '../../../types/contentCalendar';
import { CreativeAssetGallery } from '../CreativeAssetGallery';

const addToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

const deleteAsset = vi.fn();
vi.mock('../../../services/contentCalendarService', () => ({
  contentCalendarService: {
    deleteAsset: (...a: unknown[]) => deleteAsset(...a),
    getDrivePickerConfig: vi.fn(),
  },
}));

const openFileAttachment = vi.fn();
const downloadFileAttachment = vi.fn();
vi.mock('../../../utils/fileUrl', async (orig) => {
  const actual = await orig<typeof import('../../../utils/fileUrl')>();
  return {
    ...actual,
    openFileAttachment: (...a: unknown[]) => openFileAttachment(...a),
    downloadFileAttachment: (...a: unknown[]) => downloadFileAttachment(...a),
  };
});

function asset(over: Partial<CreativeAsset>): CreativeAsset {
  return {
    id: 'a1',
    url: 'https://cdn.example.com/reel.mp4',
    filename: 'sardars mall reel v1.mp4',
    size_bytes: 45.3 * 1024 * 1024,
    content_type: 'video/mp4',
    kind: 'video',
    role: 'primary',
    order: 0,
    uploaded_at: '2026-10-22T00:00:00Z',
    thumbnail_url: 'https://cdn.example.com/reel-thumb.jpg',
    ...over,
  };
}

const image = asset({ id: 'i1', kind: 'image', url: 'https://cdn.example.com/facade.jpg', filename: 'facade.jpg', content_type: 'image/jpeg', thumbnail_url: null, width: 1080, height: 1350 });

function openMore() {
  const trigger = screen.getByRole('button', { name: 'More asset actions' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
});

describe('CreativeAssetGallery – Concept A preview', () => {
  it('no longer shows the role pill on the preview, but keeps the role options for uploads', () => {
    render(<CreativeAssetGallery itemId="it" attachments={[asset({})]} />);
    const card = screen.getByTestId('asset-preview-card');
    expect(within(card).queryByText('Primary Deliverable')).toBeNull();
    expect(within(card).getByText('Video · MP4')).toBeTruthy();
    expect(within(card).getByText('sardars mall reel v1.mp4')).toBeTruthy();
  });

  it('copy / open / download call the same handlers with the same args as before', () => {
    const a = asset({});
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[a]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy asset link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(a.url);
    fireEvent.click(screen.getByRole('button', { name: 'Open in new tab' }));
    expect(openFileAttachment).toHaveBeenCalledWith(a.url, a.filename);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloadFileAttachment).toHaveBeenCalledWith(a.url, a.filename);
  });

  it('delete lives in the More menu and still asks for confirmation before deleting', () => {
    render(<CreativeAssetGallery itemId="it" attachments={[asset({})]} />);
    openMore();
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete asset/ }));
    expect(deleteAsset).not.toHaveBeenCalled();
    expect(screen.getByText('Delete Creative Asset?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteAsset).not.toHaveBeenCalled();
  });

  it('read-only users (clients / performance) get no delete and, for videos, no More menu', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[asset({})]} />);
    expect(screen.queryByRole('button', { name: 'More asset actions' })).toBeNull();
    expect(screen.queryByText(/Delete asset/)).toBeNull();
  });

  it('read-only users still get View full screen for images, but not delete', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[image]} />);
    openMore();
    expect(screen.getByRole('menuitem', { name: /View full screen/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Delete asset/ })).toBeNull();
    expect(screen.getByText('Image · JPG')).toBeTruthy();
    expect(screen.getByText(/1080×1350/)).toBeTruthy();
  });

  it('video is not loaded until play is pressed; then plays with controls', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[asset({ duration_seconds: 32 })]} />);
    const v = document.querySelector('video')!;
    expect(v.getAttribute('preload')).toBe('none');
    expect(v.hasAttribute('controls')).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByText('0:32')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Play / }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('video')!.hasAttribute('controls')).toBe(true);
    expect(screen.queryByText('0:32')).toBeNull();
    play.mockRestore();
  });

  it('no duration chip when duration is unknown', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[asset({ duration_seconds: null })]} />);
    expect(screen.queryByText(/^\d+:\d\d$/)).toBeNull();
  });

  it('multi-asset: "1 of N" counter and arrows navigate', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[asset({}), { ...image, order: 1 }]} />);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next asset' }));
    expect(screen.getByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('Image · JPG')).toBeTruthy();
  });
});
