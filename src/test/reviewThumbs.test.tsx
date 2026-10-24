import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getMock = vi.fn();
vi.mock('../services/apiClient', () => ({ apiClient: { get: (...a: unknown[]) => getMock(...a) } }));
const proxyDownload = vi.fn();
vi.mock('../utils/fileUrl', async (orig) => ({
  ...(await orig<typeof import('../utils/fileUrl')>()),
  downloadFileAttachment: (...a: unknown[]) => proxyDownload(...a),
}));

const MB = 1024 * 1024;
// Joined path so main (which lacks these modules) fails per-test, not at import time.
const load = (p: string) => import(/* @vite-ignore */ ['..', p].join('/'));

describe('review link at every stage', () => {
  it('team can share the review link at any stage except Rejected, never clients', async () => {
    const { canAccessClientReviewLink } = await load('utils/contentCalendarWorkflow');
    const admin = { role: 'admin' } as any;
    for (const st of ['Content', 'Creative Production', 'Ready to Post', 'Posted', 'Creative Client Review']) {
      expect(canAccessClientReviewLink(st, admin)).toBe(true);
    }
    expect(canAccessClientReviewLink('Rejected', admin)).toBe(false);
    expect(canAccessClientReviewLink('Posted', { role: 'client' } as any)).toBe(false);
  });
});

describe('bulk download plan (local files capped, Drive files free)', () => {
  it('skips big non-Drive files and keeps Drive files of any size', async () => {
    const { planBulkDownload } = await load('utils/publicDownload');
    const { queue, skipped } = planBulkDownload([
      { id: 'a', isDrive: true, sizeBytes: 900 * MB },
      { id: 'b', isDrive: false, sizeBytes: 30 * MB },
      { id: 'c', isDrive: false, sizeBytes: 20 * MB },
      { id: 'd', isDrive: false, sizeBytes: 20 * MB },
    ]);
    expect(queue.map((x: any) => x.id)).toEqual(['a', 'c', 'd']);
    expect(skipped.map((x: any) => x.id)).toEqual(['b']);
  });

  it('caps the local total at 100 MB', async () => {
    const { planBulkDownload } = await load('utils/publicDownload');
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), sizeBytes: 20 * MB }));
    const { queue, skipped } = planBulkDownload(many);
    expect(queue).toHaveLength(5);
    expect(skipped).toHaveLength(1);
  });
});

describe('direct downloads', () => {
  beforeEach(() => {
    getMock.mockReset();
    proxyDownload.mockReset();
  });

  it('Drive file: asks the API for a Google link and never proxies', async () => {
    const { downloadAssetDirect } = await load('utils/directDownload');
    getMock.mockResolvedValue({ url: 'https://drive.usercontent.google.com/download?id=X' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const how = await downloadAssetDirect({ url: '/uploads/gdrive/X/a.mp4', filename: 'a.mp4' });
    expect(how).toBe('direct');
    expect(getMock.mock.calls[0][0]).toContain('/drive/direct-link?path=%2Fuploads%2Fgdrive%2FX%2Fa.mp4');
    expect(proxyDownload).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('falls back to the normal download when the link is refused, and local files never ask', async () => {
    const { downloadAssetDirect } = await load('utils/directDownload');
    getMock.mockRejectedValue(new Error('409'));
    expect(await downloadAssetDirect({ url: '/uploads/gdrive/X/a.mp4' })).toBe('proxy');
    expect(await downloadAssetDirect({ url: '/uploads/content_calendar/i/a.png' })).toBe('proxy');
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(proxyDownload).toHaveBeenCalledTimes(2);
  });

  it('download all goes one by one and reports skipped big local files', async () => {
    const { downloadAllAssets } = await load('utils/directDownload');
    getMock.mockResolvedValue({ url: 'https://drive.usercontent.google.com/download?id=X' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const res = await downloadAllAssets(
      [
        { url: '/uploads/gdrive/X/a.mp4', size_bytes: 500 * MB, kind: 'video' },
        { url: '/uploads/content_calendar/i/b.mov', size_bytes: 60 * MB, kind: 'video' },
        { url: 'https://example.com', kind: 'link' },
        { url: '/uploads/content_calendar/i/c.png', size_bytes: 1 * MB, kind: 'image' },
      ],
      { gapMs: 0 },
    );
    expect(res.downloaded).toBe(2);
    expect(res.skipped.map((a: any) => a.url)).toEqual(['/uploads/content_calendar/i/b.mov']);
    click.mockRestore();
  });
});

describe('optional video thumbnail picker', () => {
  it('shows Skip / Upload picture / Use this frame', async () => {
    const mod = await load('components/content-calendar/VideoPosterPicker');
    const Picker = mod.default;
    render(<Picker open videoSrc="/v.mp4" filename="reel.mp4" onClose={() => {}} onSave={async () => {}} />);
    expect(screen.getByText('Video thumbnail')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Use this frame/ })).toBeTruthy();
    expect(mod.DEFAULT_POSTER_SECONDS).toBeGreaterThan(0);
  });
});
