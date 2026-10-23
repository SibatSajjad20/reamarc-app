import { describe, expect, it } from 'vitest';
import { getThumbUrl } from '../fileUrl';
import { prefetchQueue, isPrefetchCandidate, reviewAssetCacheKey } from '../../hooks/useReviewAssetCache';

describe('grid previews never load originals', () => {
  it('maps image uploads to the small thumb route', () => {
    expect(getThumbUrl('/uploads/content_calendar/cc1/a.png', 400)).toMatch(/\/thumbs\/content_calendar\/cc1\/a\.png\?w=400$/);
    expect(getThumbUrl('/uploads/gdrive/ID123/photo.JPG', 200)).toMatch(/\/thumbs\/gdrive\/ID123\/photo\.JPG\?w=200$/);
  });
  it('gives no thumb for videos, PDFs or off-origin URLs', () => {
    expect(getThumbUrl('/uploads/content_calendar/cc1/clip.mp4')).toBe('');
    expect(getThumbUrl('/uploads/content_calendar/cc1/brief.pdf')).toBe('');
    expect(getThumbUrl('https://evil.example/x.png')).toBe('');
    expect(getThumbUrl('')).toBe('');
  });
});

describe('client review prefetch', () => {
  const assets = Array.from({ length: 8 }, (_, i) => ({
    id: `a${i}`,
    url: `/api/v1/content-calendar/public/review/t/assets/a${i}`,
    kind: i % 3 === 2 ? 'video' : 'image',
    size_bytes: 3_000_000,
  }));
  it('prefetches at most the next 2 images and never videos', () => {
    const active = reviewAssetCacheKey(assets[0]);
    const q = prefetchQueue(assets, active);
    expect(q.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(isPrefetchCandidate({ id: 'v', url: '/x', kind: 'video', size_bytes: 1000 }, active)).toBe(false);
  });
});

describe('video cards get a still frame', () => {
  it('maps stored videos (app uploads and Drive) to the small thumb route', async () => {
    const { getVideoStillUrl } = await import('../fileUrl');
    expect(getVideoStillUrl('/uploads/content_calendar/cc1/ast_1_reel.mp4', 400)).toMatch(/\/thumbs\/content_calendar\/cc1\/ast_1_reel\.mp4\?w=400$/);
    expect(getVideoStillUrl('/uploads/gdrive/1kw6Xa/Reel.MOV', 200)).toMatch(/\/thumbs\/gdrive\/1kw6Xa\/Reel\.MOV\?w=200$/);
    expect(getVideoStillUrl('/uploads/content_calendar/cc1/a.png')).toBe('');
    expect(getVideoStillUrl('https://evil.example/x.mp4')).toBe('');
  });
});
