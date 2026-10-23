import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { CreativeAsset } from '../../../types/contentCalendar';
import * as Gallery from '../CreativeAssetGallery';

const { CreativeAssetGallery } = Gallery;

vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../../../services/contentCalendarService', () => ({
  contentCalendarService: { deleteAsset: vi.fn(), getDrivePickerConfig: vi.fn() },
}));

function slide(n: number, extra: Partial<CreativeAsset> = {}): CreativeAsset {
  const name = `0${n}.jpg`;
  return {
    id: `s${n}`,
    url: `/uploads/gdrive/FILE${n}/${name}`,
    filename: name,
    size_bytes: 1024 * 1024,
    content_type: 'image/jpeg',
    kind: 'image',
    role: 'carousel_slide',
    order: n,
    uploaded_at: '2026-10-23T00:00:00Z',
    thumbnail_url: `/uploads/gdrive/FILE${n}/${name}`,
    width: 1080,
    height: 1350,
    ...extra,
  };
}
const slides = [1, 2, 3, 4, 5].map((n) => slide(n));

const preloaded: string[] = [];
class FakeImage {
  decoding = '';
  fetchPriority = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) {
    preloaded.push(v);
  }
}

const mainImg = () => screen.getByTestId('asset-preview-image') as HTMLImageElement;
const loader = () => screen.queryByTestId('asset-preview-loading');
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next asset' }));
const prev = () => fireEvent.click(screen.getByRole('button', { name: 'Previous asset' }));

beforeEach(() => {
  (Gallery as unknown as { __resetAssetPreviewCache?: () => void }).__resetAssetPreviewCache?.();
  preloaded.length = 0;
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('CreativeAssetGallery fast switching', () => {
  it('drawer preview uses the cached 800px thumb, not the 1 MB original', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    const src = mainImg().getAttribute('src') || '';
    expect(src).toContain('/thumbs/gdrive/FILE1/01.jpg');
    expect(src).toContain('w=800');
  });

  it('full-screen viewer still shows the original file', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    fireEvent.load(mainImg());
    fireEvent.click(screen.getByRole('button', { name: 'View 01.jpg full screen' }));
    const all = screen.getAllByAltText('01.jpg').map((i) => i.getAttribute('src') || '');
    expect(all.some((s) => s.includes('/uploads/gdrive/FILE1/01.jpg') && !s.includes('/thumbs/'))).toBe(true);
  });

  it('switching shows a loader instead of the previous (stale) image', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    fireEvent.load(mainImg());
    expect(loader()).toBeNull();
    next();
    expect(mainImg().getAttribute('alt')).toBe('02.jpg');
    expect(within(screen.getByTestId('asset-preview-card')).queryByAltText('01.jpg')).toBeNull();
    expect(loader()).not.toBeNull();
    fireEvent.load(mainImg());
    expect(loader()).toBeNull();
  });

  it('going back to an already viewed image is instant (no loader)', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    fireEvent.load(mainImg());
    next();
    fireEvent.load(mainImg());
    prev();
    expect(mainImg().getAttribute('alt')).toBe('01.jpg');
    expect(loader()).toBeNull();
  });

  it('preloads next and previous previews (thumbs) once the current one has loaded', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    expect(preloaded).toHaveLength(0);
    fireEvent.load(mainImg());
    expect(preloaded.some((s) => s.includes('/thumbs/gdrive/FILE2/02.jpg') && s.includes('w=800'))).toBe(true);
    expect(preloaded.some((s) => s.includes('/thumbs/gdrive/FILE5/05.jpg') && s.includes('w=800'))).toBe(true);
    expect(preloaded.some((s) => s.includes('FILE3'))).toBe(false);
  });

  it('never preloads a video file (only its still frame)', () => {
    const vid: CreativeAsset = { ...slide(2), id: 'v2', kind: 'video', filename: 'reel.mp4', url: '/uploads/gdrive/VID/reel.mp4', thumbnail_url: null, content_type: 'video/mp4' };
    render(<CreativeAssetGallery itemId="it" readOnly attachments={[slides[0], vid]} />);
    fireEvent.load(mainImg());
    expect(preloaded.some((s) => /reel\.mp4(\?|$)/.test(s) && !s.includes('/thumbs/'))).toBe(false);
    expect(preloaded.some((s) => s.includes('/thumbs/gdrive/VID/reel.mp4'))).toBe(true);
  });

  it('a late load from an asset the user already left does not reveal the new one early', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    const first = mainImg();
    next();
    next();
    expect(mainImg().getAttribute('alt')).toBe('03.jpg');
    act(() => {
      first.dispatchEvent(new Event('load'));
    });
    expect(loader()).not.toBeNull();
    expect(mainImg().getAttribute('alt')).toBe('03.jpg');
  });

  it('falls back to the original if the thumb fails', () => {
    render(<CreativeAssetGallery itemId="it" readOnly attachments={slides} />);
    fireEvent.error(mainImg());
    expect(mainImg().getAttribute('src')).toContain('/uploads/gdrive/FILE1/01.jpg');
    expect(mainImg().getAttribute('src')).not.toContain('/thumbs/');
  });
});
