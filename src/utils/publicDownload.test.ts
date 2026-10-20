import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadAllPublicAssets,
  downloadPublicAsset,
  triggerAnchorDownload,
} from './publicDownload';

function desktopNav(): Navigator {
  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    platform: 'Win32',
    maxTouchPoints: 0,
  } as Navigator;
}

function iosNav(overrides: Partial<Navigator> = {}): Navigator {
  return {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    platform: 'iPhone',
    maxTouchPoints: 5,
    ...overrides,
  } as Navigator;
}

describe('publicDownload', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses an anchor with the download attribute on desktop', async () => {
    const created: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') created.push(el as HTMLAnchorElement);
      return el;
    });

    await downloadPublicAsset(
      {
        downloadUrl: '/api/v1/content-calendar/public/review/tok/assets/a1?download=1',
        filename: 'slide-1.png',
        kind: 'image',
      },
      desktopNav(),
    );

    expect(created).toHaveLength(1);
    expect(created[0].getAttribute('download')).toBe('slide-1.png');
    expect(created[0].href).toContain('/assets/a1?download=1');
  });

  it('shares an iOS image when canShare is true', async () => {
    const share = vi.fn(async () => undefined);
    const canShare = vi.fn(() => true);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    const open = vi.fn();

    await downloadPublicAsset(
      {
        downloadUrl: '/dl.png?download=1',
        filename: 'hero.png',
        contentType: 'image/png',
        sizeBytes: 1200,
        kind: 'image',
      },
      iosNav({ canShare, share } as unknown as Navigator),
      { open },
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalled();
    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens an iOS video in a new tab and never fetches it', async () => {
    const fetchImpl = vi.fn();
    const open = vi.fn();
    const share = vi.fn();

    await downloadPublicAsset(
      {
        downloadUrl: '/clip.mp4?download=1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        kind: 'video',
      },
      iosNav({ share } as unknown as Navigator),
      { open },
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('/clip.mp4?download=1', '_blank');
  });

  it('triggers N anchors for download all', async () => {
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = () => {
          clicks.push((el as HTMLAnchorElement).href);
        };
      }
      return el;
    });

    await downloadAllPublicAssets(
      [
        { downloadUrl: '/a?download=1', filename: 'a.png' },
        { downloadUrl: '/b?download=1', filename: 'b.png' },
        { downloadUrl: '/c?download=1', filename: 'c.png' },
      ],
      0,
      async () => undefined,
    );

    expect(clicks).toHaveLength(3);
  });

  it('triggerAnchorDownload sets the download attribute', () => {
    const a = triggerAnchorDownload('/file.png?download=1', 'file.png');
    expect(a.download).toBe('file.png');
  });
});
